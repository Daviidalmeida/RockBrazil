import { GameState, Lane, HitResult, SongMetadata, Difficulty, Note, PlaybackState } from './types';
import { AudioManager } from './audio/audioManager';
import { BeatmapManager } from './game/beatmapManager';
import { SongLibrary } from './game/songLibrary';
import { SettingsManager } from './game/settingsManager';
import { ProfileManager } from './game/profileManager';
import { GameEngine } from './game/engine';
import { GameRenderer } from './render/renderer';
import { UIManager } from './ui/uiManager';
import { GuitarPipeline } from './audio/analysis/guitarPipeline';
import { VisualEditor } from './editor/visualEditor';
import { ZipChartLoader } from './audio/zipChartLoader';
import { UniversalChartImporter } from './audio/universalChartImporter';
import { YouTubePlayerController } from './audio/youtubePlayer';
import { AutoMusicFinder } from './game/catalog/musicFinder';
import { CalibrationManager } from './game/sync/calibrationManager';

class RockBrazilGame {
  private settingsManager: SettingsManager;
  private profileManager: ProfileManager;
  private audio: AudioManager;
  private ytPlayer: YouTubePlayerController;
  private musicFinder: AutoMusicFinder;
  private beatmaps: BeatmapManager;
  private library: SongLibrary;
  private engine: GameEngine;
  private renderer: GameRenderer;
  private ui: UIManager;
  private editor: VisualEditor;

  private state: GameState = GameState.MENU;
  private currentSong: SongMetadata;
  private currentDifficulty: Difficulty = 'MEDIUM';

  private activeLanes: Set<Lane> = new Set();
  private pointerLaneMap: Map<number, Lane> = new Map();
  private currentMatchSessionId = 0;
  private countdownTimer: number | null = null;

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
    this.library = new SongLibrary();
    this.musicFinder = new AutoMusicFinder(this.library.getSongs());

    this.ytPlayer = new YouTubePlayerController({
      onBuffering: (_buffering) => {
        // Buffering congelado de forma estável no relógio sem tremedeira nem penalização
      },
      onPlaybackConfirmed: (_videoTime) => {
        // Áudio confirmado em avanço real: transição imediata para PLAYING
        if (this.state === GameState.COUNTDOWN || (this.state as any) === 'WAITING_FOR_AUDIO') {
          this.clearCountdown();
          this.state = GameState.PLAYING;
          this.ui.showAutoplayUnblockPrompt(false);
          this.ui.showScreen(GameState.PLAYING);
        }
      },
      onAutoplayBlocked: () => {
        // Navegador bloqueou reprodução automática: exibe prompt amigável
        if (this.state === GameState.COUNTDOWN || (this.state as any) === 'WAITING_FOR_AUDIO') {
          this.ui.showAutoplayUnblockPrompt(true);
        }
      },
      onEnded: () => {
        if (this.state === GameState.PLAYING) {
          this.finishSong();
        }
      }
    });
    this.ytPlayer.init().catch(() => {});

    this.beatmaps = new BeatmapManager();
    this.currentSong = this.library.getActiveSongs()[0];

    const initialNotes = this.beatmaps.getBeatmap(this.currentSong.id, this.currentDifficulty);
    this.engine = new GameEngine(initialNotes, this.currentDifficulty, settings);

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new GameRenderer(canvas);
    this.renderer.noteSpeedMultiplier = settings.noteSpeedMultiplier;
    this.renderer.visualEffectsEnabled = settings.visualEffectsEnabled;

    this.ui = new UIManager();
    this.ui.initSettingsValues(settings);

    const editorCanvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
    this.editor = new VisualEditor(
      document.getElementById('screen-editor')!,
      editorCanvas,
      this.beatmaps,
      this.audio
    );

    this.setupEngineCallbacks();
    this.setupUICallbacks();
    this.setupEditorControls();
    this.setupInputHandlers();
    this.setupWindowResize();

    // Expose instance for testing and automation
    (window as any).rockBrazilGame = this;

    // Start continuous render/game loop
    requestAnimationFrame(this.gameLoop);

    this.initGame();
  }

  private async initGame(): Promise<void> {
    // 1. Initialize Profile System (Boot direct to menu as guest or active profile)
    const { activeProfile } = await this.profileManager.init();
    this.ui.setProfileHeader(activeProfile);

    // 2. Check for local TNT files (AutoChart package or TNT.mp3)
    await this.autoDetectTNTFile();

    // 3. Render initial Song Library & Dropdowns
    this.ui.renderSongLibrary(this.library.getActiveSongs(), this.profileManager.getActiveProfile());
    this.ui.initRankingDropdowns(this.library.getActiveSongs());

    // 4. Open directly on the Main Menu!
    this.renderer.setDifficulty(this.currentDifficulty);
    this.ui.setDifficultyLanes(this.currentDifficulty);
    this.ui.showScreen(GameState.MENU);

    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('testGameplay') === 'true') {
      const song = this.library.getActiveSongs()[2]; // Pitty - Admirável Chip Novo
      setTimeout(() => {
        this.startNewMatch(song, 'MEDIUM');
      }, 150);
    }
  }

  private async autoDetectTNTFile(): Promise<void> {
    try {
      const base = import.meta.env.BASE_URL;
      const resMidi = await fetch(`${base}custom-songs/acdc_tnt/ACDC - T.N.T/notes.mid`, { method: 'HEAD' });
      const resMp3 = await fetch(`${base}custom-songs/TNT.mp3`, { method: 'HEAD' });

      if (resMidi.ok || resMp3.ok) {
        const song = this.library.getSongById('tnt-acdc');
        if (song) {
          song.isAvailable = true;
          song.style = resMidi.ok ? '💣 AC/DC Multi-track (AutoChart)' : '💣 Classic Hard Rock';
        }
        this.ui.renderSongLibrary(this.library.getSongs(), this.profileManager.getActiveProfile());
        console.log('⚡ T.N.T. detectado e pronto para jogar!');
      }
    } catch {
      // Ignore
    }
  }

  private setupEngineCallbacks(): void {
    this.engine.onHit = (result: HitResult) => {
      // Partículas visuais e faíscas sem alterar a geometria ou causar tremedeira na pista
      this.renderer.spawnHitParticles(result.lane);
    };

    this.engine.onMiss = () => {
      // Falhas geram feedback auditivo/visual sem tremer o Canvas
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
      this.ui.renderSongLibrary(this.library.getActiveSongs(), this.profileManager.getActiveProfile());
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
      this.ytPlayer.stop();
      this.state = GameState.MENU;
      this.ui.showScreen(GameState.MENU);
    };

    this.ui.onRefreshLinksClicked = async () => {
      this.ui.showAnalysisProgress(true, 'Verificando catálogo oficial de 31 músicas no YouTube...');
      try {
        await this.musicFinder.refreshAllLinks((current, total, song) => {
          this.ui.showAnalysisProgress(true, `[${current}/${total}] Verificando "${song.title}" (${song.artist})...`);
        });
        this.ui.renderSongLibrary(this.library.getActiveSongs(), this.profileManager.getActiveProfile());
        alert('⚡ Todos os links do YouTube foram validados e atualizados com sucesso!');
      } catch (err: any) {
        alert('Erro ao verificar links: ' + (err.message || err));
      } finally {
        this.ui.showAnalysisProgress(false);
      }
    };

    // Profiles
    this.ui.onCreateProfileConfirmed = async (name, avatar) => {
      const created = await this.profileManager.createProfile(name, avatar);
      this.ui.setProfileHeader(created);
      this.ui.renderSongLibrary(this.library.getActiveSongs(), created);
    };

    this.ui.onSwitchProfileRequested = async (id) => {
      const switched = await this.profileManager.switchProfile(id);
      if (switched) {
        this.ui.setProfileHeader(switched);
        this.ui.renderSongLibrary(this.library.getActiveSongs(), switched);
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
    this.ui.onPlayGameRequested = async (song, diff) => {
      await this.startNewMatch(song, diff);
    };

    this.ui.onPlayAsGuestClicked = () => {
      const guest = this.profileManager.setGuestMode();
      this.ui.setProfileHeader(guest);
      this.ui.renderSongLibrary(this.library.getActiveSongs(), guest);
    };

    this.ui.onOpenEditorClicked = () => {
      this.state = GameState.NOTE_EDITOR;
      this.ui.showScreen(GameState.NOTE_EDITOR);
      this.editor.open(this.currentSong, this.currentDifficulty);
    };

    this.ui.onImportZipFile = async (file: File) => {
      try {
        await this.audio.init();
        const ctx = this.audio.audioContext;
        if (!ctx) throw new Error('AudioContext indisponível.');

        this.ui.showAnalysisProgress(true, `Importando arquivo "${file.name}"...`);

        const lowerName = file.name.toLowerCase();

        if (lowerName.endsWith('.chart') || lowerName.endsWith('.mid') || lowerName.endsWith('.midi') || lowerName.endsWith('.sng')) {
          const buffer = await file.arrayBuffer();
          const parsed = await UniversalChartImporter.importFromRawData(buffer, file.name);

          // Create a custom song entry with silent audio buffer matching the chart duration
          const duration = Math.max(30, parsed.validation.durationSec + 5);
          const silentBuffer = ctx.createBuffer(2, Math.round(ctx.sampleRate * duration), ctx.sampleRate);

          const newSong = this.library.addCustomSong({
            title: parsed.metadata.name || file.name.replace(/\.[^/.]+$/, ''),
            artist: parsed.metadata.artist || 'Artista Importado',
            duration,
            bpm: 120,
            buffer: silentBuffer
          });

          (['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as Difficulty[]).forEach((d) => {
            this.beatmaps.saveBeatmap(newSong.id, d, parsed.charts[d]);
          });

          this.ui.renderSongLibrary(this.library.getActiveSongs(), this.profileManager.getActiveProfile());
          alert(`⚡ Chart "${newSong.title}" importado com sucesso!\nFormato: ${parsed.metadata.sourceFormat} | Instrumento: ${parsed.metadata.instrumentTrack}\nNotas: Fácil ${parsed.validation.noteCounts.EASY} | Médio ${parsed.validation.noteCounts.MEDIUM} | Difícil ${parsed.validation.noteCounts.HARD} | Expert ${parsed.validation.noteCounts.EXPERT}`);
          this.ui.openDifficultyModal(newSong, this.profileManager.getActiveProfile());
        } else {
          // Standard .zip pack with audio stems or chart
          const pkg = await ZipChartLoader.loadFromZipFile(file, ctx);

          const newSong = this.library.addCustomSong({
            title: pkg.title,
            artist: pkg.artist,
            duration: pkg.duration,
            bpm: pkg.bpm,
            buffer: pkg.audioBuffer
          });

          (['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as Difficulty[]).forEach((d) => {
            this.beatmaps.saveBeatmap(newSong.id, d, pkg.charts[d]);
          });

          this.ui.renderSongLibrary(this.library.getActiveSongs(), this.profileManager.getActiveProfile());
          alert(`⚡ Pacote "${pkg.title}" importado com sucesso!\nNotas: Fácil ${pkg.notesCount.EASY} | Médio ${pkg.notesCount.MEDIUM} | Difícil ${pkg.notesCount.HARD} | Expert ${pkg.notesCount.EXPERT}`);
          this.ui.openDifficultyModal(newSong, this.profileManager.getActiveProfile());
        }
      } catch (err: any) {
        alert('Erro ao importar arquivo: ' + (err.message || err));
      } finally {
        this.ui.showAnalysisProgress(false);
      }
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
      this.ytPlayer.setVolume(updated.musicVolume * 100);
      this.engine.updateSettings(updated);
      this.renderer.noteSpeedMultiplier = updated.noteSpeedMultiplier;
      this.renderer.visualEffectsEnabled = updated.visualEffectsEnabled;
      const active = this.profileManager.getActiveProfile();
      if (active) {
        this.profileManager.updateActiveProfile({ settings: updated });
      }
    };

    this.ui.onCalibrationOffsetChange = (deltaMs: number, reset?: boolean) => {
      if (!this.currentSong) return;
      if (reset) {
        CalibrationManager.resetOffsetMs(this.currentSong.id);
      } else {
        CalibrationManager.adjustOffsetMs(this.currentSong.id, deltaMs, this.currentSong.youtubeVideoId);
      }
      const updated = CalibrationManager.getSongOffsetMs(this.currentSong.id);
      this.ui.setPauseCalibrationOffset(updated);
    };

    this.ui.onUnblockAudioClicked = () => {
      if (this.currentSong?.type === 'youtube' && this.currentSong?.youtubeVideoId) {
        this.ytPlayer.play();
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

      this.ui.renderSongLibrary(this.library.getActiveSongs(), this.profileManager.getActiveProfile());
    } catch (err: any) {
      alert('Erro na análise de áudio: ' + (err.message || err));
    } finally {
      this.ui.showAnalysisProgress(false);
    }
  }

  private setupEditorControls(): void {
    const songSelect = document.getElementById('editor-song-select') as HTMLSelectElement;
    const diffSelect = document.getElementById('editor-diff-select') as HTMLSelectElement;
    const snapSelect = document.getElementById('editor-snap-select') as HTMLSelectElement;

    if (songSelect) {
      songSelect.innerHTML = this.library.getSongs().map((s) => `<option value="${s.id}">${s.title}</option>`).join('');
      songSelect.addEventListener('change', () => {
        const song = this.library.getSongById(songSelect.value);
        if (song) {
          this.currentSong = song;
          this.editor.open(song, this.currentDifficulty);
        }
      });
    }

    if (diffSelect) {
      diffSelect.addEventListener('change', () => {
        this.currentDifficulty = diffSelect.value as Difficulty;
        this.editor.open(this.currentSong, this.currentDifficulty);
      });
    }

    if (snapSelect) {
      snapSelect.addEventListener('change', () => {
        this.editor.setSnapDivision(Number(snapSelect.value));
      });
    }

    document.getElementById('btn-editor-back')?.addEventListener('click', () => {
      this.editor.close();
      this.state = GameState.SONG_SELECT;
      this.ui.showScreen(GameState.SONG_SELECT);
    });

    document.getElementById('btn-editor-play')?.addEventListener('click', () => {
      this.editor.togglePlayback();
    });

    document.getElementById('btn-editor-stop')?.addEventListener('click', () => {
      this.editor.stopPlayback();
      this.editor.seek(0);
    });

    document.getElementById('btn-editor-save')?.addEventListener('click', () => {
      this.editor.saveToGame();
    });

    document.getElementById('btn-editor-delete-note')?.addEventListener('click', () => {
      this.editor.deleteSelectedNote();
    });

    document.getElementById('btn-editor-clear-all')?.addEventListener('click', () => {
      this.editor.clearAllNotes();
    });

    document.getElementById('btn-editor-export-json')?.addEventListener('click', () => {
      this.editor.exportJSON();
    });

    const importInput = document.getElementById('editor-import-input') as HTMLInputElement;
    importInput?.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files[0]) {
        const text = await files[0].text();
        this.editor.importJSON(text);
      }
    });

    const scrubber = document.getElementById('editor-time-scrubber') as HTMLInputElement;
    scrubber?.addEventListener('input', () => {
      this.editor.seek(Number(scrubber.value));
    });

    document.getElementById('btn-editor-test-play')?.addEventListener('click', () => {
      this.editor.close();
      this.startNewMatch(this.currentSong, this.currentDifficulty);
    });

    this.editor.onTestPlayRequested = (song, diff, notes) => {
      this.editor.close();
      this.startNewMatch(song, diff, notes);
    };
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
    // Unlock Web Audio context on the first touch or keypress
    const unlockAudio = () => {
      this.audio.init().catch(() => {});
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

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

      // Keyboard navigation on main menu (1-6 or P)
      if (this.state === GameState.MENU) {
        if (e.key === '1') {
          document.getElementById('hotspot-jogar')?.click();
          return;
        } else if (e.key === '2') {
          document.getElementById('hotspot-musicas')?.click();
          return;
        } else if (e.key === '3') {
          document.getElementById('hotspot-config')?.click();
          return;
        } else if (e.key === '4') {
          document.getElementById('hotspot-ranking')?.click();
          return;
        } else if (e.key === '5') {
          document.getElementById('hotspot-tutorial')?.click();
          return;
        } else if (e.key === '6') {
          document.getElementById('hotspot-sair')?.click();
          return;
        } else if (e.key === 'p' || e.key === 'P') {
          document.getElementById('btn-menu-profile')?.click();
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

  private getSongOffsetSec(): number {
    if (!this.currentSong) return 0;
    const songCalib = CalibrationManager.getSongOffsetMs(this.currentSong.id);
    return songCalib / 1000;
  }

  private getEffectiveVisualTime(chartTime: number): number {
    const globalOffsetSec = (this.settingsManager.getSettings().audioOffsetMs || 0) / 1000;
    return chartTime - globalOffsetSec;
  }

  private getChartTime(): number {
    if (!this.currentSong) return 0;
    // As notas ficam estáticas e o relógio NÃO avança antes do áudio genuinamente avançar
    if (this.state !== GameState.PLAYING && this.state !== GameState.PAUSED) {
      return 0;
    }
    if (this.currentSong.type === 'youtube' && this.currentSong.youtubeVideoId) {
      if (this.ytPlayer.getPlaybackState() !== PlaybackState.PLAYING && this.ytPlayer.getPlaybackState() !== PlaybackState.PAUSED) {
        return 0;
      }
      return Math.max(0, this.ytPlayer.getCurrentTime() + this.getSongOffsetSec());
    }
    return Math.max(0, this.audio.getCurrentTime() + this.getSongOffsetSec());
  }

  private getGameplayCurrentTime(): number {
    return this.getChartTime();
  }

  private pressLane(lane: Lane): void {
    this.activeLanes.add(lane);
    this.ui.setLaneVisualActive(lane, true);

    if (this.state === GameState.PLAYING) {
      const chartTime = this.getChartTime();
      this.engine.handleLanePress(lane, chartTime);
    }
  }

  private releaseLane(lane: Lane): void {
    this.activeLanes.delete(lane);
    this.ui.setLaneVisualActive(lane, false);

    if (this.state === GameState.PLAYING) {
      const chartTime = this.getChartTime();
      this.engine.handleLaneRelease(lane, chartTime);
    }
  }

  private clearCountdown(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private async startNewMatch(song: SongMetadata, difficulty: Difficulty, customNotes?: Note[]): Promise<void> {
    const sessionId = ++this.currentMatchSessionId;
    this.clearCountdown();
    this.audio.stop();
    this.ytPlayer.stop();
    this.ui.showAutoplayUnblockPrompt(false);

    // Garante que o AudioContext seja desbloqueado imediatamente no clique do usuário
    this.audio.ensureResumed().catch(() => {});

    this.currentSong = song;
    this.currentDifficulty = difficulty;

    // Obtém notas autênticas do chart sem descartar notas legítimas
    const rawNotes = customNotes || this.beatmaps.getBeatmap(this.currentSong.id, this.currentDifficulty);
    const maxLaneInNotes = rawNotes.reduce((max, n) => Math.max(max, n.lane), 0);

    // Configura pistas ativas por dificuldade e acomoda pistas reais do chart
    this.renderer.setDifficulty(this.currentDifficulty, maxLaneInNotes);
    this.ui.setDifficultyLanes(this.currentDifficulty, maxLaneInNotes);

    // Reinicializa o motor preservando 100% das notas autênticas
    const notes = rawNotes.map((n) => ({
      ...n,
      hit: false,
      missed: false,
      sustainCompleted: false,
      sustainHeldTime: 0
    }));
    this.engine.reset(notes, this.currentDifficulty);

    // Reinicializa completamente o HUD e as entradas de toque
    this.ui.resetHUD();
    this.activeLanes.clear();
    this.pointerLaneMap.clear();

    // Se for música baseada em arquivo e ainda não carregou o áudio
    if (song.type === 'audio-file' && !song.audioBuffer) {
      if (song.id === 'tnt-acdc') {
        try {
          this.ui.showAnalysisProgress(true, 'Carregando áudio e mapa oficial de T.N.T. (AC/DC)...');
          await this.audio.init();
          const ctx = this.audio.audioContext;
          if (!ctx) throw new Error('AudioContext não disponível.');

          const pkg = await ZipChartLoader.loadLocalTNT(ctx);
          if (sessionId !== this.currentMatchSessionId) return;

          this.library.attachAudioBuffer('tnt-acdc', pkg.audioBuffer, pkg.duration);
          song.audioBuffer = pkg.audioBuffer;
          song.duration = pkg.duration;
          song.bpm = pkg.bpm;

          // Salva as 4 dificuldades reais do MIDI (161, 305, 409, 599 notas)
          (['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as Difficulty[]).forEach((d) => {
            this.beatmaps.saveBeatmap('tnt-acdc', d, pkg.charts[d]);
          });
          console.log(`⚡ T.N.T. carregado com sucesso (${pkg.notesCount[difficulty]} notas em ${difficulty})!`);
        } catch (err: any) {
          console.warn('Falha ao carregar pacote AutoChart, tentando fallback MP3:', err);
          try {
            const buffer = await this.audio.decodeAudioUrl('custom-songs/TNT.mp3');
            if (sessionId !== this.currentMatchSessionId) return;
            this.library.attachAudioBuffer('tnt-acdc', buffer, buffer.duration);
            song.audioBuffer = buffer;
          } catch (err2: any) {
            this.ui.showAnalysisProgress(false);
            alert(`O arquivo de áudio de "${song.title}" não está presente no servidor (áudios protegidos são excluídos por segurança).\n\nUtilize o botão "VINCULAR ${song.requiresFile || 'ÁUDIO'}" ou "IMPORTAR MÚSICA" para selecionar seu arquivo MP3 ou ZIP local.`);
            return;
          }
        } finally {
          this.ui.showAnalysisProgress(false);
        }
      } else {
        alert(`O arquivo de áudio para "${song.title}" ainda não foi carregado. Por favor, importe ou vincule o arquivo de áudio (.mp3, .ogg ou .zip) para jogar.`);
        return;
      }
    }

    if (song.type === 'youtube' && song.youtubeVideoId) {
      await this.ytPlayer.loadVideo(song.youtubeVideoId);
      this.ytPlayer.setVolume(this.settingsManager.getSettings().musicVolume * 100);
    }

    if (sessionId !== this.currentMatchSessionId) return;
    await this.startCountdown(sessionId);
  }

  private async startCountdown(sessionId: number): Promise<void> {
    this.clearCountdown();
    this.audio.stop();

    await this.audio.init();
    await this.audio.ensureResumed();
    if (sessionId !== this.currentMatchSessionId) return;

    this.state = GameState.COUNTDOWN;
    this.ui.showScreen(GameState.COUNTDOWN);

    let count = 3;
    this.ui.setCountdown(count.toString());
    this.audio.playSfxCountdown();

    this.countdownTimer = window.setInterval(async () => {
      if (sessionId !== this.currentMatchSessionId) {
        this.clearCountdown();
        return;
      }

      count--;
      if (count > 0) {
        this.ui.setCountdown(count.toString());
        this.audio.playSfxCountdown();
      } else if (count === 0) {
        this.ui.setCountdown('ROCK!');
        this.audio.playSfxRockStart();

        // Solicita início do áudio:
        if (this.currentSong.type === 'youtube' && this.currentSong.youtubeVideoId) {
          this.ytPlayer.play();
          // As notas só começam a se mover quando onPlaybackConfirmed confirmar progresso real!
        } else if (this.currentSong.type === 'procedural' && this.currentSong.proceduralTrackId) {
          await this.audio.playProceduralTrack(this.currentSong.proceduralTrackId, 0);
          this.state = GameState.PLAYING;
          this.ui.showScreen(GameState.PLAYING);
        } else if (this.currentSong.audioBuffer) {
          await this.audio.playAudioBuffer(this.currentSong.audioBuffer, 0);
          this.state = GameState.PLAYING;
          this.ui.showScreen(GameState.PLAYING);
        }
      } else {
        this.clearCountdown();
        if (sessionId !== this.currentMatchSessionId) return;

        if (this.currentSong.type === 'youtube') {
          // Se o áudio já confirmou avanço, transita para PLAYING
          if (this.ytPlayer.getPlaybackState() === PlaybackState.PLAYING) {
            this.state = GameState.PLAYING;
            this.ui.showScreen(GameState.PLAYING);
          } else {
            // Continua aguardando o áudio avançar sem queimar notas antecipadas
            this.ui.setCountdown('SINCRONIZANDO...');
          }
        }
      }
    }, 850);
  }

  private pauseGame(): void {
    if (this.state !== GameState.PLAYING && this.state !== GameState.COUNTDOWN) return;
    this.state = GameState.PAUSED;
    this.audio.pause();
    this.ytPlayer.pause();
    if (this.currentSong) {
      this.ui.setPauseCalibrationOffset(CalibrationManager.getSongOffsetMs(this.currentSong.id));
    }
    this.ui.showScreen(GameState.PAUSED);
  }

  private resumeGame(): void {
    if (this.state !== GameState.PAUSED) return;
    this.state = GameState.PLAYING;
    this.ui.showScreen(GameState.PLAYING);
    if (this.currentSong.type === 'youtube' && this.currentSong.youtubeVideoId) {
      this.ytPlayer.resume();
    } else {
      this.audio.resume();
    }
  }

  private restartGame(): void {
    this.startNewMatch(this.currentSong, this.currentDifficulty);
  }

  private async handleGameOver(stats: any): Promise<void> {
    this.clearCountdown();
    this.audio.stop();
    this.ytPlayer.stop();
    this.audio.playSfxGameOver();
    this.state = GameState.GAME_OVER;
    this.ui.showGameOver(stats);

    // Record defeat in profile history (cleared = false)
    await this.profileManager.recordMatch(
      this.currentSong.id,
      this.currentSong.title,
      this.currentDifficulty,
      stats,
      false
    );
  }

  private playNextSong(): void {
    const all = this.library.getSongs().filter((s) => s.isAvailable);
    if (all.length === 0) return;
    const idx = all.findIndex((s) => s.id === this.currentSong.id);
    const nextIdx = (idx + 1) % all.length;
    const nextSong = all[nextIdx];
    this.startNewMatch(nextSong, this.currentDifficulty);
  }

  private gameLoop = (): void => {
    if (this.state === GameState.PLAYING) {
      // Se o YouTube estiver em buffering, congela as notas e o progresso sem penalização
      if (this.currentSong.type === 'youtube' && this.ytPlayer.isBuffering()) {
        const visualTime = this.getEffectiveVisualTime(this.getChartTime());
        this.renderer.render(
          visualTime,
          this.engine.getNotes(),
          this.activeLanes,
          this.currentSong.bpm
        );
        requestAnimationFrame(this.gameLoop);
        return;
      }

      const chartTime = this.getChartTime();
      const visualTime = this.getEffectiveVisualTime(chartTime);

      // Finaliza apenas quando atingir a duração total do áudio E não houver notas pendentes
      if (chartTime >= this.currentSong.duration && !this.engine.hasPendingNotes(chartTime)) {
        this.finishSong();
      } else {
        this.engine.update(chartTime);
        this.renderer.render(
          visualTime,
          this.engine.getNotes(),
          this.activeLanes,
          this.currentSong.bpm
        );
        this.ui.updateHUD(this.engine.getStats(), chartTime, this.currentSong.duration);
      }
    } else if (this.state === GameState.PAUSED) {
      const visualTime = this.getEffectiveVisualTime(this.getChartTime());
      this.renderer.render(
        visualTime,
        this.engine.getNotes(),
        this.activeLanes,
        this.currentSong.bpm
      );
    } else {
      // MENU, COUNTDOWN: renderiza notas estáticas em t=0 sem avançar a esteira
      this.renderer.render(
        0,
        this.engine.getNotes(),
        this.activeLanes,
        this.currentSong.bpm
      );
    }

    // O loop continua executando continuamente sem travar em partidas consecutivas
    requestAnimationFrame(this.gameLoop);
  };

  private async finishSong(): Promise<void> {
    this.clearCountdown();
    this.audio.stop();
    this.ytPlayer.stop();
    this.audio.playSfxVictory();

    const stats = this.engine.getStats();

    // Salva recordes isolados para esta partida no perfil
    const recordResult = await this.profileManager.recordMatch(
      this.currentSong.id,
      this.currentSong.title,
      this.currentDifficulty,
      stats,
      true
    );

    this.library.saveSongRecord(this.currentSong.id, this.currentDifficulty, recordResult.record);

    // Encerramento Especial "AQUI É ROCKBRAZIL!" com celebração antes do resultado
    this.ui.showCelebration(() => {
      this.state = GameState.RESULTS;
      this.ui.showResults(this.currentSong, stats, recordResult);
    });
  }
}

function bootApp(): void {
  try {
    new RockBrazilGame();
  } catch (err) {
    console.error('Falha ao inicializar RockBrazil:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}
