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
import { UnifiedMasterClock } from './game/sync/masterClock';
import { PreStartSystem, PreStartResourceProvider, PreStartEvents } from './game/sync/prestartSystem';
import { SyncDiagnostics } from './game/sync/syncDiagnostics';
import { InputController } from './game/input/inputController';
import { GameSessionController } from './game/session/gameSessionController';
import { SessionState } from './game/session/sessionState';
import { ChartTimeline } from './game/timeline/chartTimeline';

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
  private masterClock: UnifiedMasterClock;
  private prestartSystem: PreStartSystem;
  private inputController: InputController;
  private sessionController: GameSessionController;

  private state: GameState = GameState.MENU;
  private currentSong: SongMetadata;
  private currentDifficulty: Difficulty = 'MEDIUM';

  private activeLanes: Set<Lane> = new Set();
  private pointerLaneMap: Map<number, Lane> = new Map();
  private currentMatchSessionId = 0;
  private isFinishing = false;
  private isResumingCountdown = false;
  private resumeCountdownTimer: any = null;
  private ytInitialized = false;
  private countdownTimer: number | null = null;
  private activePreStartResources: PreStartResourceProvider | null = null;
  private activePreStartEvents: PreStartEvents | null = null;

  private keyLaneMap: Record<string, Lane> = {
    'a': 0, 'A': 0, '1': 0, 'd': 0, 'D': 0,
    's': 1, 'S': 1, '2': 1, 'f': 1, 'F': 1,
    'j': 2, 'J': 2, '3': 2,
    'k': 3, 'K': 3, '4': 3,
    'l': 4, 'L': 4, '5': 4, 'ç': 4, 'Ç': 4
  };

  private codeLaneMap: Record<string, Lane> = {
    'KeyA': 0, 'Digit1': 0, 'KeyD': 0,
    'KeyS': 1, 'Digit2': 1, 'KeyF': 1,
    'KeyJ': 2, 'Digit3': 2,
    'KeyK': 3, 'Digit4': 3,
    'KeyL': 4, 'Digit5': 4, 'Semicolon': 4
  };

  constructor() {
    this.settingsManager = new SettingsManager();
    const settings = this.settingsManager.getSettings();

    this.profileManager = new ProfileManager();
    this.audio = new AudioManager(settings);
    this.audio.setOnEnded(() => {
      if (this.state === GameState.PLAYING && !this.isFinishing) {
        this.handleSongEnded();
      }
    });
    this.library = new SongLibrary();
    this.musicFinder = new AutoMusicFinder(this.library.getSongs());

    this.masterClock = new UnifiedMasterClock();
    this.prestartSystem = new PreStartSystem();

    this.ytPlayer = new YouTubePlayerController({
      onBuffering: (buffering) => {
        this.masterClock.setBuffering(buffering);
      },
      onPlaybackConfirmed: (_videoTime) => {
        // Áudio confirmado em avanço real: transição imediata para PLAYING no Unified Master Clock
        SyncDiagnostics.get().recordPlayingEvent(_videoTime);
        this.masterClock.startPlayback();
        this.clearCountdown();
        if (this.state === GameState.COUNTDOWN || (this.state as any) === 'WAITING_FOR_AUDIO') {
          this.state = GameState.PLAYING;
          this.ui.showAutoplayUnblockPrompt(false);
          this.ui.showScreen(GameState.PLAYING);
        }
      },
      onAutoplayBlocked: () => {
        if (this.state === GameState.COUNTDOWN || (this.state as any) === 'WAITING_FOR_AUDIO') {
          this.ui.showAutoplayUnblockPrompt(true);
        }
      },
      onEnded: () => {
        if (this.state === GameState.PLAYING && !this.isFinishing) {
          this.handleSongEnded();
        }
      }
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this.isResumingCountdown) {
            this.clearResumeCountdown();
            this.pauseGame();
          } else if (this.state === GameState.PLAYING) {
            this.pauseGame();
          }
        }
      });
    }
    // V10: Inicialização preguiçosa (lazy) do YouTube apenas sob demanda quando uma música não possui áudio local

    this.beatmaps = new BeatmapManager();
    this.currentSong = this.library.getActiveSongs()[0];

    const initialNotes = this.beatmaps.getBeatmap(this.currentSong.id, this.currentDifficulty);
    this.engine = new GameEngine(initialNotes, this.currentDifficulty, settings);

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new GameRenderer(canvas);
    this.renderer.noteSpeedMultiplier = settings.noteSpeedMultiplier;
    this.renderer.visualEffectsEnabled = settings.visualEffectsEnabled;

    this.sessionController = new GameSessionController(
      this.masterClock,
      this.engine.getChartTimeline()
    );

    this.inputController = new InputController({
      onLanePress: (lane) => this.pressLane(lane),
      onLaneRelease: (lane) => this.releaseLane(lane),
      onPauseToggle: () => {
        if (this.state === GameState.PLAYING) {
          this.pauseGame();
        } else if (this.state === GameState.PAUSED) {
          this.resumeGame();
        }
      }
    });

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
    (window as any).__ROCKBRAZIL_GAME__ = this;

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
      if (updated.noteSpeedMultiplier <= 0.85) {
        this.renderer.speedPreset = 'LENTA';
      } else if (updated.noteSpeedMultiplier >= 1.25) {
        this.renderer.speedPreset = 'RÁPIDA';
      } else {
        this.renderer.speedPreset = 'NORMAL';
      }
      this.renderer.visualEffectsEnabled = updated.visualEffectsEnabled;
      if (this.currentSong) {
        this.masterClock.setOffsets(
          CalibrationManager.getSongOffsetMs(this.currentSong.id),
          updated.audioOffsetMs || 0
        );
      }
      const active = this.profileManager.getActiveProfile();
      if (active) {
        this.profileManager.updateActiveProfile({ settings: updated });
      }
    };

    this.ui.onUnblockAudioClicked = async () => {
      try {
        await this.audio.ensureResumed();
      } catch (e) {
        console.warn('[Audio] Falha ao desbloquear AudioContext com gesto do usuário:', e);
      }

      const hasLocal = this.currentSong?.type === 'audio-file' || Boolean(this.currentSong?.audioUrl) || Boolean(this.currentSong?.audioBuffer);
      if (hasLocal && this.currentSong?.audioBuffer) {
        this.ytPlayer.stop();
        await this.audio.playAudioBuffer(this.currentSong.audioBuffer, 0);
        this.masterClock.startPlayback();
        this.state = GameState.PLAYING;
        this.ui.showAutoplayUnblockPrompt(false);
        this.ui.showScreen(GameState.PLAYING);
      } else if (!hasLocal && this.currentSong?.type === 'youtube' && this.currentSong?.youtubeVideoId) {
        SyncDiagnostics.get().recordPlayVideoCommand(this.currentSong.youtubeVideoId || '');
        this.ytPlayer.play();
      }

      if (this.activePreStartResources && this.activePreStartEvents) {
        this.prestartSystem.retryAudio(
          this.currentMatchSessionId,
          this.activePreStartResources,
          this.activePreStartEvents
        );
      }
    };

    this.ui.onUnblockCancelClicked = () => {
      this.prestartSystem.cancel();
      this.audio.stop();
      this.ytPlayer.stop();
      this.masterClock.pause();
      this.ui.showAutoplayUnblockPrompt(false);
      this.state = GameState.SONG_SELECT;
      this.ui.showScreen(GameState.SONG_SELECT);
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
    // Unlock Web Audio context on user gesture (iOS Safari / WebKit audio unlocking)
    const unlockAudio = () => {
      this.audio.unlockAudioContext().catch(() => {});
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('touchend', unlockAudio, { passive: true });
    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });

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
        let stillPressedByOther = false;
        for (const l of this.pointerLaneMap.values()) {
          if (l === lane) {
            stillPressedByOther = true;
            break;
          }
        }
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

      const lane = this.keyLaneMap[e.key] !== undefined ? this.keyLaneMap[e.key] : this.codeLaneMap[e.code];
      if (lane !== undefined && this.state === GameState.PLAYING) {
        e.preventDefault();
        this.pressLane(lane);
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      const lane = this.keyLaneMap[e.key] !== undefined ? this.keyLaneMap[e.key] : this.codeLaneMap[e.code];
      if (lane !== undefined) {
        e.preventDefault();
        this.releaseLane(lane);
      }
    });
  }

  private getSongOffsetSec(): number {
    return this.masterClock.getSongOffsetSec();
  }

  private getEffectiveVisualTime(chartTime: number): number {
    return chartTime;
  }

  private getChartTime(): number {
    return this.masterClock.getTime();
  }

  private getGameplayCurrentTime(): number {
    return this.masterClock.getTime();
  }

  private pressLane(lane: Lane): void {
    if (this.isResumingCountdown || this.state !== GameState.PLAYING || this.isFinishing) return;
    this.activeLanes.add(lane);
    this.ui.setLaneVisualActive(lane, true);

    if (this.state === GameState.PLAYING) {
      const chartTime = this.getChartTime();
      this.engine.handleLanePress(lane, chartTime);
    }
  }

  private releaseLane(lane: Lane): void {
    if (this.isResumingCountdown || this.state !== GameState.PLAYING || this.isFinishing) return;
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
    this.prestartSystem.cancel();
  }

  private async startNewMatch(song: SongMetadata, difficulty: Difficulty, customNotes?: Note[]): Promise<void> {
    const sessionId = ++this.currentMatchSessionId;
    this.isFinishing = false;
    this.clearResumeCountdown();
    this.clearCountdown();
    this.audio.stop();
    this.ytPlayer.stop();
    this.ui.showAutoplayUnblockPrompt(false);

    // Garante que o AudioContext seja desbloqueado imediatamente no clique do usuário
    this.audio.ensureResumed().catch(() => {});

    this.currentSong = song;
    this.currentDifficulty = difficulty;

    // Configura o Master Clock com a fonte correspondente e offsets verificados
    this.masterClock.reset();
    const hasLocalAudio = song.type === 'audio-file' || Boolean(song.audioUrl) || Boolean(song.audioBuffer);
    if (!hasLocalAudio && song.type === 'youtube' && song.youtubeVideoId) {
      await this.ensureYouTubePlayerReady();
      this.masterClock.setSource(this.ytPlayer);
      this.ui.setYouTubePlayerVisibility(true);
    } else {
      this.masterClock.setSource(this.audio);
      this.ytPlayer.stop();
      this.ui.setYouTubePlayerVisibility(false);
    }
    // V8 Single Source of Truth: GameEngine applies settings.audioOffsetMs.
    // Master clock sets song calibration offset (0ms for normalized charts), avoiding double offset.
    this.masterClock.setOffsets(
      CalibrationManager.getSongOffsetMs(song.id),
      0
    );

    // Obtém notas autênticas do chart com garantia estrita de pistas por dificuldade
    const rawNotes = customNotes || this.beatmaps.getBeatmap(this.currentSong.id, this.currentDifficulty);

    // V7: Configura pistas ativas estritamente por dificuldade (3 no EASY, 4 no MEDIUM, 5 no HARD/EXPERT)
    this.renderer.setDifficulty(this.currentDifficulty);
    this.renderer.setSongCover(song.coverUrl);
    this.ui.setDifficultyLanes(this.currentDifficulty);

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
      if (song.audioUrl) {
        try {
          this.ui.showAnalysisProgress(true, `Carregando áudio de "${song.title}"...`);
          await this.audio.init();
          const buffer = await this.audio.decodeAudioUrl(song.audioUrl);
          if (sessionId !== this.currentMatchSessionId) return;

          this.library.attachAudioBuffer(song.id, buffer, buffer.duration);
          song.audioBuffer = buffer;
          if (buffer.duration) song.duration = Math.round(buffer.duration);
        } catch (err: any) {
          console.error(`Falha ao carregar áudio de ${song.title}:`, err);
          this.ui.showAnalysisProgress(false);
          alert(`Erro ao carregar o áudio de "${song.title}". Verifique a conexão com o servidor.`);
          return;
        } finally {
          this.ui.showAnalysisProgress(false);
        }
      } else if (song.id === 'tnt-acdc') {
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

    if (sessionId !== this.currentMatchSessionId) return;
    await this.startCountdown(sessionId);
  }

  private async startCountdown(sessionId: number): Promise<void> {
    this.clearCountdown();
    this.audio.stop();

    await this.audio.init();
    await this.audio.ensureResumed();
    if (sessionId !== this.currentMatchSessionId) return;

    const prerollSec = this.renderer.noteSpeed;
    this.masterClock.startCountdown(prerollSec);
    this.masterClock.setPrerollProgress(0.0, prerollSec);
    SyncDiagnostics.get().reset();
    const firstNoteT = this.engine.getNotes()[0]?.time || 0;
    SyncDiagnostics.get().recordChartFirstTimestamp(firstNoteT, this.engine.getNotes().length);
    SyncDiagnostics.get().record('START_COUNTDOWN_INVOKED', {
      songId: this.currentSong.id,
      videoId: this.currentSong.youtubeVideoId,
      bpm: this.currentSong.bpm,
      songOffsetMs: CalibrationManager.getSongOffsetMs(this.currentSong.id),
      globalOffsetMs: this.settingsManager.getSettings().audioOffsetMs || 0
    });

    const resources: PreStartResourceProvider = {
      prepareChart: () => {
        if (!this.currentSong) return false;
        let notes = this.engine.getNotes();
        if (!notes || notes.length === 0) {
          const freshNotes = this.beatmaps.getBeatmap(this.currentSong.id, this.currentDifficulty);
          if (!freshNotes || freshNotes.length === 0) {
            console.warn('[PreStart] Chart notes could not be prepared for', this.currentSong.id);
            return false;
          }
          this.engine = new GameEngine(freshNotes, this.currentDifficulty, this.settingsManager.getSettings());
          notes = this.engine.getNotes();
        }
        // Validate and ensure chronological note ordering
        for (let i = 1; i < notes.length; i++) {
          if (notes[i].time < notes[i - 1].time) {
            notes.sort((a, b) => a.time - b.time);
            break;
          }
        }
        return true;
      },
      prepareRenderer: () => {
        this.renderer.resize();
        this.renderer.render(
          -prerollSec,
          this.engine.getNotes(),
          this.activeLanes,
          this.currentSong?.bpm || 132
        );
      },
      prepareAudio: async () => {
        const hasLocal = this.currentSong.type === 'audio-file' || Boolean(this.currentSong.audioUrl) || Boolean(this.currentSong.audioBuffer);
        if (!hasLocal && this.currentSong.type === 'youtube' && this.currentSong.youtubeVideoId) {
          this.ui.setYouTubePlayerVisibility(true);
          await this.ytPlayer.loadVideo(this.currentSong.youtubeVideoId);
          this.ytPlayer.setVolume(this.settingsManager.getSettings().musicVolume * 100);
        } else {
          this.ytPlayer.stop();
          this.ui.setYouTubePlayerVisibility(false);
        }
        return true;
      },
      startAudioPlayback: async () => {
        const hasLocal = this.currentSong.type === 'audio-file' || Boolean(this.currentSong.audioUrl) || Boolean(this.currentSong.audioBuffer);
        if (!hasLocal && this.currentSong.type === 'youtube' && this.currentSong.youtubeVideoId) {
          this.ytPlayer.play();
        } else if (this.currentSong.type === 'procedural' && this.currentSong.proceduralTrackId) {
          this.ytPlayer.stop();
          await this.audio.playProceduralTrack(this.currentSong.proceduralTrackId, 0);
          this.masterClock.startPlayback();
          this.state = GameState.PLAYING;
          this.ui.showScreen(GameState.PLAYING);
        } else if (this.currentSong.audioBuffer) {
          this.ytPlayer.stop();
          await this.audio.playAudioBuffer(this.currentSong.audioBuffer, 0);
          this.masterClock.startPlayback();
          this.state = GameState.PLAYING;
          this.ui.showScreen(GameState.PLAYING);
        }
      },
      isAudioPlaying: () => {
        const hasLocal = this.currentSong.type === 'audio-file' || Boolean(this.currentSong.audioUrl) || Boolean(this.currentSong.audioBuffer);
        if (!hasLocal && this.currentSong.type === 'youtube') {
          return this.ytPlayer.getPlaybackState() === PlaybackState.PLAYING;
        }
        return this.audio.isPlaying();
      },
      isAudioBuffering: () => {
        const hasLocal = this.currentSong.type === 'audio-file' || Boolean(this.currentSong.audioUrl) || Boolean(this.currentSong.audioBuffer);
        if (!hasLocal && this.currentSong.type === 'youtube') {
          return this.ytPlayer.isBuffering();
        }
        return false;
      }
    };

    const events: PreStartEvents = {
      onCountdownTick: (count) => {
        this.state = GameState.COUNTDOWN;
        this.ui.showScreen(GameState.COUNTDOWN);
        this.ui.setCountdown(count.toString());
        this.audio.playSfxCountdown();
        const progress = (3 - count) / 3.0;
        this.masterClock.setPrerollProgress(progress, prerollSec);
        SyncDiagnostics.get().recordCountdownTick(count);
      },
      onCountdownRock: () => {
        this.ui.setCountdown('ROCK BRASIL!');
        this.audio.playSfxRockStart();
        this.masterClock.setPrerollProgress(1.0, prerollSec);
        SyncDiagnostics.get().recordCountdownEnd();
      },
      onSynchronizingWait: () => {
        this.ui.setCountdown('ROCK BRASIL');
      },
      onAutoplayBlocked: () => {
        this.state = GameState.COUNTDOWN;
        this.ui.showAutoplayUnblockPrompt(true);
      },
      onGameStart: () => {
        this.masterClock.startPlayback();
        this.state = GameState.PLAYING;
        this.ui.showAutoplayUnblockPrompt(false);
        this.ui.showScreen(GameState.PLAYING);
      }
    };

    this.activePreStartResources = resources;
    this.activePreStartEvents = events;

    await this.prestartSystem.prepareAndStart(sessionId, resources, events);
  }

  private clearResumeCountdown(): void {
    this.isResumingCountdown = false;
    if (this.resumeCountdownTimer !== null) {
      clearTimeout(this.resumeCountdownTimer);
      this.resumeCountdownTimer = null;
    }
  }

  private async ensureYouTubePlayerReady(): Promise<void> {
    if (this.ytInitialized) return;
    this.ytInitialized = true;
    try {
      await this.ytPlayer.init();
    } catch (err) {
      console.warn('[YouTube] Falha ao inicializar API do YouTube:', err);
    }
  }

  private pauseGame(): void {
    if (this.isFinishing) return;
    if (this.state !== GameState.PLAYING && this.state !== GameState.COUNTDOWN) return;
    this.clearResumeCountdown();
    this.state = GameState.PAUSED;
    this.masterClock.pause();
    this.audio.pause();
    this.ytPlayer.pause();
    this.ui.showScreen(GameState.PAUSED);
  }

  private resumeGame(): void {
    if (this.state !== GameState.PAUSED || this.isResumingCountdown || this.isFinishing) return;

    this.isResumingCountdown = true;
    this.ui.hidePauseModal();
    this.ui.showScreen(GameState.COUNTDOWN);

    // V10: Contagem regressiva de 3 segundos (3 -> 2 -> 1 -> JÁ!)
    const ticks = [
      { text: '3', sfx: () => this.audio.playSfxCountdown() },
      { text: '2', sfx: () => this.audio.playSfxCountdown() },
      { text: '1', sfx: () => this.audio.playSfxCountdown() },
      { text: 'JÁ!', sfx: () => this.audio.playSfxRockStart() }
    ];

    this.ui.setCountdown(ticks[0].text);
    ticks[0].sfx();

    const runResumeStep = (stepIdx: number) => {
      this.resumeCountdownTimer = setTimeout(() => {
        if (!this.isResumingCountdown || (this.state !== GameState.PAUSED && this.state !== GameState.COUNTDOWN)) return;

        if (stepIdx < ticks.length) {
          this.ui.setCountdown(ticks[stepIdx].text);
          ticks[stepIdx].sfx();

          if (stepIdx + 1 < ticks.length) {
            runResumeStep(stepIdx + 1);
          } else {
            // Exibição breve de 'JÁ!' antes da retomada síncrona
            this.resumeCountdownTimer = setTimeout(() => {
              if (!this.isResumingCountdown) return;
              this.isResumingCountdown = false;
              this.state = GameState.PLAYING;
              this.ui.showScreen(GameState.PLAYING);
              this.masterClock.resume();

              const hasLocal = this.currentSong.type === 'audio-file' || Boolean(this.currentSong.audioUrl) || Boolean(this.currentSong.audioBuffer);
              if (!hasLocal && this.currentSong.type === 'youtube' && this.currentSong.youtubeVideoId) {
                this.ytPlayer.resume();
              } else {
                this.audio.resume();
              }
            }, 300);
          }
        }
      }, 1000);
    };

    runResumeStep(1);
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

  private handleSongEnded(): void {
    if (this.isFinishing || (this.state !== GameState.PLAYING && this.state !== GameState.COUNTDOWN)) return;
    const clockTime = this.masterClock.getTime();
    this.engine.forceCompleteAllPendingNotes(clockTime);
    this.finishSong();
  }

  private gameLoop = (): void => {
    if (this.state === GameState.PLAYING && !this.isFinishing) {
      const hasLocal = this.currentSong.type === 'audio-file' || Boolean(this.currentSong.audioUrl) || Boolean(this.currentSong.audioBuffer);
      const isBuffering = !hasLocal && this.currentSong.type === 'youtube' && this.ytPlayer.isBuffering();
      this.masterClock.setBuffering(isBuffering);

      const clockTime = this.masterClock.getTime();
      const songDuration = this.currentSong.duration;
      const lastNoteEnd = this.engine.getLastNoteEndTime();

      // V10: Verificação robusta de encerramento
      // 1. Áudio local terminou
      const localEnded = hasLocal && !this.audio.isPlaying() && clockTime > 1.0;
      // 2. Relógio atingiu duração e não restam notas
      const normalEnd = clockTime >= songDuration && !this.engine.hasPendingNotes(clockTime);
      // 3. Grace period de segurança: ultrapassou fim da última nota e duração com folga
      const graceEnd = clockTime >= Math.max(songDuration, lastNoteEnd) + 0.5;

      if (localEnded || normalEnd || graceEnd) {
        this.handleSongEnded();
      } else {
        if (!isBuffering) {
          SyncDiagnostics.get().recordFirstEngineFrame(clockTime);
          this.engine.update(clockTime);
        }
        SyncDiagnostics.get().recordFirstRendererFrame(clockTime);
        this.renderer.render(
          clockTime,
          this.engine.getNotes(),
          this.activeLanes,
          this.currentSong.bpm
        );
        this.ui.updateHUD(this.engine.getStats(), clockTime, this.currentSong.duration);
      }
    } else if (this.state === GameState.PAUSED || this.isResumingCountdown) {
      // Congela notas exatamente no instante pausado
      const clockTime = this.masterClock.getTime();
      this.renderer.render(
        clockTime,
        this.engine.getNotes(),
        this.activeLanes,
        this.currentSong.bpm
      );
    } else if (this.state === GameState.COUNTDOWN) {
      const visualTime = this.masterClock.getTime();
      this.renderer.render(
        visualTime,
        this.engine.getNotes(),
        this.activeLanes,
        this.currentSong.bpm
      );
    } else {
      this.renderer.render(
        0,
        this.engine.getNotes(),
        this.activeLanes,
        this.currentSong.bpm
      );
    }

    requestAnimationFrame(this.gameLoop);
  };

  private async finishSong(): Promise<void> {
    if (this.isFinishing) return;
    this.isFinishing = true;
    this.state = GameState.RESULTS;

    this.clearCountdown();
    this.clearResumeCountdown();

    try {
      this.audio.stop();
      this.ytPlayer.stop();
      this.audio.playSfxVictory();
    } catch (err) {
      console.warn('[finishSong] Erro ao parar reprodutores ou tocar SFX:', err);
    }

    const stats = this.engine.getStats();

    let recordResult: any = undefined;
    try {
      recordResult = await this.profileManager.recordMatch(
        this.currentSong.id,
        this.currentSong.title,
        this.currentDifficulty,
        stats,
        true
      );
      this.library.saveSongRecord(this.currentSong.id, this.currentDifficulty, recordResult.record);
    } catch (recErr) {
      console.error('[finishSong] Erro ao gravar recorde da partida:', recErr);
    }

    try {
      this.ui.showCelebration(() => {
        this.ui.showResults(this.currentSong, stats, recordResult);
      });
    } catch (uiErr) {
      console.error('[finishSong] Erro na interface ao exibir resultados:', uiErr);
      this.ui.showResults(this.currentSong, stats, recordResult);
    }
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
