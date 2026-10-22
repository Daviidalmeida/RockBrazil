import { GameState, Lane, HitResult, SongMetadata, Difficulty, Note } from './types';
import { AudioManager } from './audio/audioManager';
import { BeatmapManager } from './game/beatmapManager';
import { SongLibrary } from './game/songLibrary';
import { SettingsManager } from './game/settingsManager';
import { ProfileManager } from './game/profileManager';
import { GameEngine } from './game/engine';
import { GameRenderer } from './render/renderer';
import { UIManager } from './ui/uiManager';
import { GuitarPipeline } from './audio/analysis/guitarPipeline';

class RockBrazilGame {
  private settingsManager: SettingsManager;
  private profileManager: ProfileManager;
  private audio: AudioManager;
  private beatmaps: BeatmapManager;
  private library: SongLibrary;
  private engine: GameEngine;
  private renderer: GameRenderer;
  private ui: UIManager;

  private state: GameState = GameState.MENU;
  private currentSong: SongMetadata;
  private currentDifficulty: Difficulty = 'MEDIUM';

  private activeLanes: Set<Lane> = new Set();
  private pointerLaneMap: Map<number, Lane> = new Map();
  private isLoopRunning = false;

  private keyLaneMap: Record<string, Lane> = {
    'a': 0, 'A': 0, '1': 0, 'd': 0, 'D': 0,
    's': 1, 'S': 1, '2': 1, 'f': 1, 'F': 1,
    'j': 2, 'J': 2, '3': 2,
    'k': 3, 'K': 3, '4': 3,
    'l': 4, 'L': 4, '5': 4, 'ç': 4, 'Ç': 4
  };

  constructor() {
    this.settingsManager = new SettingsManager();
    const settings = this.settingsManager.getSettings();

    this.profileManager = new ProfileManager();
    this.audio = new AudioManager(settings);
    this.beatmaps = new BeatmapManager();
    this.library = new SongLibrary();
    this.currentSong = this.library.getSongs()[0];

    const initialNotes = this.beatmaps.getBeatmap(this.currentSong.id, this.currentDifficulty);
    this.engine = new GameEngine(initialNotes, this.currentDifficulty, settings);

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new GameRenderer(canvas);
    this.renderer.noteSpeedMultiplier = settings.noteSpeedMultiplier;
    this.renderer.visualEffectsEnabled = settings.visualEffectsEnabled;

    this.ui = new UIManager();
    this.ui.initSettingsValues(settings);

    this.setupEngineCallbacks();
    this.setupUICallbacks();
    this.setupInputHandlers();
    this.setupWindowResize();

    this.initGame();
  }

  private async initGame(): Promise<void> {
    // 1. Initialize Profile System
    const { isFirstRun, activeProfile } = await this.profileManager.init();
    if (isFirstRun || !activeProfile) {
      this.ui.showProfileCreateModal();
    } else {
      this.ui.setProfileHeader(activeProfile);
    }

    // 2. Check for local TNT.mp3
    await this.autoDetectTNTFile();

    // 3. Render initial Song Library & Dropdowns
    this.ui.renderSongLibrary(this.library.getSongs(), this.profileManager.getActiveProfile());
    this.ui.initRankingDropdowns(this.library.getSongs());
    this.ui.showScreen(GameState.MENU);
  }

  private async autoDetectTNTFile(): Promise<void> {
    try {
      const response = await fetch('/custom-songs/TNT.mp3', { method: 'HEAD' });
      if (response.ok) {
        const buffer = await this.audio.decodeAudioUrl('/custom-songs/TNT.mp3');
        this.library.attachAudioBuffer('tnt-acdc', buffer, buffer.duration);
        this.ui.renderSongLibrary(this.library.getSongs(), this.profileManager.getActiveProfile());
        console.log('⚡ TNT.mp3 detectado e vinculado com sucesso!');
      }
    } catch {
      // Ignore
    }
  }

  private setupEngineCallbacks(): void {
    this.engine.onHit = (result: HitResult) => {
      this.ui.showHitFeedback(result.judgment);
      this.renderer.spawnHitParticles(result.lane);
      // Áudio artificial removido conforme regra: o som principal é a música!

      if (result.multiplier >= 3) {
        this.renderer.triggerShake(result.multiplier * 2);
      }
    };

    this.engine.onMiss = () => {
      this.ui.showHitFeedback('MISS');
      this.renderer.triggerShake(4);
    };

    this.engine.onSustainTick = (lane: Lane) => {
      this.renderer.spawnSustainSparks(lane);
    };

    this.engine.onGameOver = (stats) => {
      this.handleGameOver(stats);
    };
  }

  private setupUICallbacks(): void {
    // Navigation
    this.ui.onOpenSongSelectClicked = (filter) => {
      this.state = GameState.SONG_SELECT;
      this.ui.renderSongLibrary(this.library.getSongs(), this.profileManager.getActiveProfile());
      this.ui.showScreen(GameState.SONG_SELECT);
    };

    this.ui.onOpenSettingsClicked = () => {
      this.state = GameState.SETTINGS;
      this.ui.showScreen(GameState.SETTINGS);
    };

    this.ui.onOpenHowToPlayClicked = () => {
      this.state = GameState.HOW_TO_PLAY;
      this.ui.showScreen(GameState.HOW_TO_PLAY);
    };

    this.ui.onOpenRankingClicked = async () => {
      this.state = 'RANKING' as any;
      this.ui.showScreen('RANKING' as any);
      await this.refreshLeaderboard();
    };

    this.ui.onReturnToMenuClicked = () => {
      this.audio.stop();
      this.state = GameState.MENU;
      this.ui.showScreen(GameState.MENU);
    };

    // Profiles
    this.ui.onCreateProfileConfirmed = async (name, avatar) => {
      const created = await this.profileManager.createProfile(name, avatar);
      this.ui.setProfileHeader(created);
      this.ui.renderSongLibrary(this.library.getSongs(), created);
    };

    this.ui.onSwitchProfileRequested = async (id) => {
      const switched = await this.profileManager.switchProfile(id);
      if (switched) {
        this.ui.setProfileHeader(switched);
        this.ui.renderSongLibrary(this.library.getSongs(), switched);
      }
    };

    this.ui.onExportDataRequested = async () => {
      const json = await this.profileManager.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rockbrazil_backup_${Date.now()}.json`;
      a.click();
    };

    this.ui.onRankingFilterChanged = async () => {
      await this.refreshLeaderboard();
    };

    // Gameplay
    this.ui.onPlayGameRequested = (song, diff) => {
      this.currentSong = song;
      this.currentDifficulty = diff;
      this.startCountdown();
    };

    this.ui.onPauseClicked = () => this.pauseGame();
    this.ui.onResumeClicked = () => this.resumeGame();
    this.ui.onRestartClicked = () => this.restartGame();
    this.ui.onNextSongClicked = () => this.playNextSong();

    // Import MP3 Pipeline
    this.ui.onImportMp3File = async (file: File) => {
      await this.processImportedFile(file);
    };

    this.ui.onLinkTNTFile = async (file: File) => {
      await this.processImportedFile(file, true);
    };

    // Settings
    this.ui.onSettingsChanged = (newSettings) => {
      const updated = this.settingsManager.saveSettings(newSettings);
      this.audio.updateSettings(updated);
      this.engine.updateSettings(updated);
      this.renderer.noteSpeedMultiplier = updated.noteSpeedMultiplier;
      this.renderer.visualEffectsEnabled = updated.visualEffectsEnabled;
      const active = this.profileManager.getActiveProfile();
      if (active) {
        this.profileManager.updateActiveProfile({ settings: updated });
      }
    };

    this.ui.onTestBeepClicked = () => {
      this.audio.playSfxCountdown();
    };
  }

  private async refreshLeaderboard(): Promise<void> {
    const songSelect = document.getElementById('ranking-song-select') as HTMLSelectElement;
    const diffSelect = document.getElementById('ranking-diff-select') as HTMLSelectElement;
    if (songSelect && diffSelect) {
      const songId = songSelect.value || this.currentSong.id;
      const diff = (diffSelect.value as Difficulty) || 'MEDIUM';
      const entries = await this.profileManager.getLeaderboard(songId, diff);
      this.ui.renderLeaderboard(entries);
    }
  }

  /**
   * Automatic Guitar Analysis Pipeline
   */
  private async processImportedFile(file: File, forceTNT = false): Promise<void> {
    try {
      await this.audio.init();
      const ctx = this.audio.audioContext;
      if (!ctx) throw new Error('AudioContext indisponível.');

      this.ui.showAnalysisProgress(true, `Decodificando e analisando "${file.name}"...`);

      // Run modular Guitar Pipeline
      const result = await GuitarPipeline.process(file, ctx);

      const isTNT = forceTNT || file.name.toLowerCase().includes('tnt') || file.name.toLowerCase().includes('t.n.t');
      if (isTNT) {
        this.library.attachAudioBuffer('tnt-acdc', result.buffer, result.duration);
        // Save generated charts for TNT
        (['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as Difficulty[]).forEach((diff) => {
          this.beatmaps.saveBeatmap('tnt-acdc', diff, result.charts[diff]);
        });
        alert(`⚡ T.N.T. analisado com sucesso! ${result.eventsCount} eventos de guitarra detectados.`);
      } else {
        const songName = file.name.replace(/\.[^/.]+$/, '');
        const newSong = this.library.addCustomSong({
          title: songName,
          artist: 'Música Importada',
          duration: result.duration,
          bpm: 120,
          buffer: result.buffer
        });
        (['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as Difficulty[]).forEach((diff) => {
          this.beatmaps.saveBeatmap(newSong.id, diff, result.charts[diff]);
        });
        alert(`Música "${songName}" analisada com sucesso! ${result.eventsCount} eventos de guitarra detectados.`);
        this.ui.openDifficultyModal(newSong, this.profileManager.getActiveProfile());
      }

      this.ui.renderSongLibrary(this.library.getSongs(), this.profileManager.getActiveProfile());
    } catch (err: any) {
      alert('Erro na análise de áudio: ' + (err.message || err));
    } finally {
      this.ui.showAnalysisProgress(false);
    }
  }

  private setupWindowResize(): void {
    window.addEventListener('resize', () => {
      this.renderer.resize();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === GameState.PLAYING) {
        this.pauseGame();
      }
    });

    window.addEventListener('blur', () => {
      if (this.state === GameState.PLAYING) {
        this.pauseGame();
      }
    });
  }

  private setupInputHandlers(): void {
    const fretBoard = document.getElementById('fret-board');
    if (!fretBoard) return;

    // Multitouch touchstart/pointerdown
    fretBoard.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      const target = (e.target as HTMLElement).closest('.fret-button') as HTMLElement;
      if (!target) return;

      const lane = Number(target.dataset.lane) as Lane;
      this.pointerLaneMap.set(e.pointerId, lane);
      this.pressLane(lane);
    }, { passive: false });

    const handlePointerUp = (e: PointerEvent) => {
      const lane = this.pointerLaneMap.get(e.pointerId);
      if (lane !== undefined) {
        this.pointerLaneMap.delete(e.pointerId);
        const stillPressedByOther = Array.from(this.pointerLaneMap.values()).includes(lane);
        if (!stillPressedByOther) {
          this.releaseLane(lane);
        }
      }
    };

    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    // Keyboard on PC
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (e.code === 'Space' || e.code === 'Escape') {
        if (this.state === GameState.PLAYING) {
          this.pauseGame();
          return;
        } else if (this.state === GameState.PAUSED) {
          this.resumeGame();
          return;
        }
      }

      const lane = this.keyLaneMap[e.key];
      if (lane !== undefined && this.state === GameState.PLAYING) {
        e.preventDefault();
        this.pressLane(lane);
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      const lane = this.keyLaneMap[e.key];
      if (lane !== undefined) {
        e.preventDefault();
        this.releaseLane(lane);
      }
    });
  }

  private pressLane(lane: Lane): void {
    this.activeLanes.add(lane);
    this.ui.setLaneVisualActive(lane, true);

    if (this.state === GameState.PLAYING) {
      const currentTime = this.audio.getCurrentTime();
      this.engine.handleLanePress(lane, currentTime);
    }
  }

  private releaseLane(lane: Lane): void {
    this.activeLanes.delete(lane);
    this.ui.setLaneVisualActive(lane, false);

    if (this.state === GameState.PLAYING) {
      const currentTime = this.audio.getCurrentTime();
      this.engine.handleLaneRelease(lane, currentTime);
    }
  }

  private async startCountdown(customNotes?: Note[]): Promise<void> {
    await this.audio.init();

    const notes = customNotes || this.beatmaps.getBeatmap(this.currentSong.id, this.currentDifficulty);
    this.engine.reset(notes, this.currentDifficulty);

    this.state = GameState.COUNTDOWN;
    this.ui.showScreen(GameState.COUNTDOWN);

    let count = 3;
    this.ui.setCountdown(count.toString());
    this.audio.playSfxCountdown();

    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        this.ui.setCountdown(count.toString());
        this.audio.playSfxCountdown();
      } else if (count === 0) {
        this.ui.setCountdown('ROCK!');
        this.audio.playSfxRockStart();
      } else {
        clearInterval(timer);
        this.startGameplay();
      }
    }, 850);
  }

  private startGameplay(): void {
    this.state = GameState.PLAYING;
    this.ui.showScreen(GameState.PLAYING);

    if (this.currentSong.type === 'procedural' && this.currentSong.proceduralTrackId) {
      this.audio.playProceduralTrack(this.currentSong.proceduralTrackId, 0);
    } else if (this.currentSong.audioBuffer) {
      this.audio.playAudioBuffer(this.currentSong.audioBuffer, 0);
    }

    if (!this.isLoopRunning) {
      this.isLoopRunning = true;
      requestAnimationFrame(this.gameLoop);
    }
  }

  private pauseGame(): void {
    if (this.state !== GameState.PLAYING) return;
    this.state = GameState.PAUSED;
    this.audio.pause();
    this.ui.showScreen(GameState.PAUSED);
  }

  private resumeGame(): void {
    if (this.state !== GameState.PAUSED) return;
    this.audio.resume();
    this.state = GameState.PLAYING;
    this.ui.showScreen(GameState.PLAYING);
  }

  private restartGame(): void {
    this.audio.stop();
    this.startCountdown();
  }

  private handleGameOver(stats: any): void {
    this.audio.stop();
    this.audio.playSfxGameOver();
    this.state = GameState.GAME_OVER;
    this.ui.showGameOver(stats);

    // Record defeat in profile history
    this.profileManager.recordMatch(
      this.currentSong.id,
      this.currentSong.title,
      this.currentDifficulty,
      stats,
      false
    );
  }

  private playNextSong(): void {
    const all = this.library.getSongs().filter((s) => s.isAvailable);
    const idx = all.findIndex((s) => s.id === this.currentSong.id);
    const nextIdx = (idx + 1) % all.length;
    this.currentSong = all[nextIdx];
    this.startCountdown();
  }

  private gameLoop = (): void => {
    if (this.state === GameState.PLAYING) {
      const currentTime = this.audio.getCurrentTime();

      if (currentTime >= this.currentSong.duration) {
        this.finishSong();
        return;
      }

      this.engine.update(currentTime);

      this.renderer.render(
        currentTime,
        this.engine.getNotes(),
        this.activeLanes,
        this.currentSong.bpm
      );

      this.ui.updateHUD(this.engine.getStats(), currentTime, this.currentSong.duration);
    } else if (this.state === GameState.COUNTDOWN || this.state === GameState.PAUSED || this.state === GameState.MENU) {
      const currentTime = this.audio.getCurrentTime();
      this.renderer.render(
        currentTime,
        this.engine.getNotes(),
        this.activeLanes,
        this.currentSong.bpm
      );
    }

    requestAnimationFrame(this.gameLoop);
  };

  private finishSong(): void {
    this.audio.stop();
    this.audio.playSfxVictory();
    this.state = GameState.RESULTS;

    const stats = this.engine.getStats();

    // Save record in ProfileManager & SongLibrary
    this.profileManager.recordMatch(
      this.currentSong.id,
      this.currentSong.title,
      this.currentDifficulty,
      stats,
      true
    );

    this.library.saveSongRecord(this.currentSong.id, this.currentDifficulty, {
      score: stats.score,
      stars: stats.stars || 1,
      accuracy: stats.accuracy || 0,
      maxCombo: stats.maxCombo
    });

    this.ui.showResults(this.currentSong, stats);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new RockBrazilGame();
});
