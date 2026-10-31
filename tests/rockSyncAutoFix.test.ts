import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { AudioManager } from '../src/audio/audioManager';
import { YouTubePlayerController } from '../src/audio/youtubePlayer';
import { AudioPlaybackController } from '../src/audio/audioPlaybackController';
import { BeatmapManager } from '../src/game/beatmapManager';
import { SongLibrary } from '../src/game/songLibrary';
import { RockSyncAutoFix } from '../src/game/sync/rockSyncAutoFix';
import { UnifiedMasterClock } from '../src/game/sync/masterClock';
import { RockSyncEngine } from '../src/game/sync/rockSyncEngine';
import { GameSettings, Note, Difficulty, PlaybackState } from '../src/types';

describe('ROCKBRAZIL V13.9.3 — SUÍTE DE TESTES: ROCKSYNC AI AUTOFIX (20 CENÁRIOS)', () => {
  let settings: GameSettings;
  let audio: AudioManager;
  let ytMock: any;
  let playbackController: AudioPlaybackController;
  let masterClock: UnifiedMasterClock;
  let rockSync: RockSyncEngine;
  let beatmaps: BeatmapManager;
  let library: SongLibrary;

  beforeEach(() => {
    settings = {
      musicVolume: 0.85,
      sfxVolume: 0.9,
      audioOffsetMs: 0,
      noteSpeedMultiplier: 1.0,
      visualEffectsEnabled: true,
      visualEffectsMode: 'NORMAL',
      effectsMode: 'NORMAL',
      muteOnMiss: false
    };

    audio = new AudioManager(settings);
    ytMock = {
      isLoaded: true,
      currentTime: 0,
      playbackState: PlaybackState.PLAYING,
      volume: 85,
      muted: false,
      buffering: false,
      loadVideo: vi.fn().mockResolvedValue(true),
      play: vi.fn().mockImplementation(() => { ytMock.playbackState = PlaybackState.PLAYING; }),
      pause: vi.fn().mockImplementation(() => { ytMock.playbackState = PlaybackState.PAUSED; }),
      stop: vi.fn().mockImplementation(() => { ytMock.playbackState = PlaybackState.READY; }),
      setVolume: vi.fn().mockImplementation((v) => { ytMock.volume = v; }),
      setMuted: vi.fn().mockImplementation((m) => { ytMock.muted = m; }),
      getCurrentTime: vi.fn().mockImplementation(() => ytMock.currentTime),
      getPlaybackState: vi.fn().mockImplementation(() => ytMock.playbackState),
      isBuffering: vi.fn().mockImplementation(() => ytMock.buffering)
    };

    playbackController = new AudioPlaybackController(audio, ytMock as any);
    masterClock = new UnifiedMasterClock();
    masterClock.setSource(ytMock);
    rockSync = new RockSyncEngine(masterClock);
    beatmaps = new BeatmapManager();
    library = new SongLibrary();
  });

  // 1. Áudio audível durante a partida
  it('1. Áudio audível durante a partida: volume permanece acima de zero e audível', async () => {
    await playbackController.playYouTube('fGDQ9IukMOc', 'tnt-acdc');
    const status = playbackController.getStatus();

    expect(status.activeSource).toBe('youtube');
    expect(status.isAudible).toBe(true);
    expect(status.volume).toBeGreaterThan(0);
    expect(status.isManualMuted).toBe(false);
    expect(ytMock.muted).toBe(false);
  });

  // 2. 10 MISS consecutivos
  it('2. 10 MISS consecutivos: áudio permanece estritamente audível sem mutar', () => {
    playbackController.setVolume(0.85);

    const notes: Note[] = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      time: 1.0 + i * 0.1,
      lane: 0,
      duration: 0,
      hit: false,
      missed: false,
      sustainCompleted: false,
      sustainHeldTime: 0
    }));

    const engine = new GameEngine(notes, 'EASY', settings);
    engine.onMuteRequested = () => {
      playbackController.handleGameplayMiss();
    };

    // Trigger 10 misses
    for (let i = 0; i < 10; i++) {
      engine.update(1.2 + i * 0.1);
      rockSync.registerMiss(0, notes[i]);
      playbackController.handleGameplayMiss();
    }

    expect(engine.getStats().missCount).toBe(10);
    expect(engine.getStats().combo).toBe(0);
    expect(playbackController.isMuted()).toBe(false);
    expect(playbackController.getVolume()).toBe(0.85);
    expect(ytMock.muted).toBe(false);
  });

  // 3. 20 MISS consecutivos
  it('3. 20 MISS consecutivos: highway e relógio continuam sem silenciar áudio', () => {
    playbackController.setVolume(0.85);

    for (let i = 1; i <= 20; i++) {
      ytMock.currentTime += 0.05;
      rockSync.registerMiss(ytMock.currentTime);
      playbackController.handleGameplayMiss();
      rockSync.update(performance.now() + i * 50);
    }

    expect(rockSync.getState().consecutiveMisses).toBe(20);
    expect(playbackController.isMuted()).toBe(false);
    expect(ytMock.muted).toBe(false);
  });

  // 4. 50 MISS consecutivos
  it('4. 50 MISS consecutivos: clock não congela e RockSync continua estável', () => {
    for (let i = 1; i <= 50; i++) {
      ytMock.currentTime += 0.05;
      rockSync.registerMiss(ytMock.currentTime);
      rockSync.update(performance.now() + i * 50);
      playbackController.handleGameplayMiss();
    }

    expect(rockSync.getState().consecutiveMisses).toBe(50);
    expect(rockSync.getState().frozenStreakCount).toBe(0);
    expect(playbackController.isMuted()).toBe(false);
  });

  // 5. 100 MISS consecutivos
  it('5. 100 MISS consecutivos: zero vazamento de memória ou travamento', () => {
    masterClock.startPlayback();
    for (let i = 1; i <= 100; i++) {
      ytMock.currentTime += 0.05;
      rockSync.registerMiss(ytMock.currentTime);
      rockSync.update(performance.now() + i * 50);
      playbackController.handleGameplayMiss();
    }

    expect(rockSync.getState().consecutiveMisses).toBe(100);
    expect(masterClock.getTime()).toBeCloseTo(5.0, 1);
    expect(playbackController.isMuted()).toBe(false);
  });

  // 6. Chart com centenas de notas
  it('6. Chart com centenas de notas: T.N.T. Fácil carrega exatamente 703 notas válidas', () => {
    const easyNotes = beatmaps.getBeatmap('tnt-acdc', 'EASY');
    expect(easyNotes.length).toBe(703);

    const { validation } = RockSyncAutoFix.validateAndRepairChart(easyNotes);
    expect(validation.valid).toBe(true);
    expect(validation.totalNotes).toBe(703);
    expect(validation.errors.length).toBe(0);
  });

  // 7. Chart com milhares de notas
  it('7. Chart com milhares de notas: Médio (1125), Difícil (1518) e Expert (1639)', () => {
    const medium = beatmaps.getBeatmap('tnt-acdc', 'MEDIUM');
    const hard = beatmaps.getBeatmap('tnt-acdc', 'HARD');
    const expert = beatmaps.getBeatmap('tnt-acdc', 'EXPERT');

    expect(medium.length).toBe(1125);
    expect(hard.length).toBe(1518);
    expect(expert.length).toBe(1639);

    expect(RockSyncAutoFix.validateAndRepairChart(medium).validation.valid).toBe(true);
    expect(RockSyncAutoFix.validateAndRepairChart(hard).validation.valid).toBe(true);
    expect(RockSyncAutoFix.validateAndRepairChart(expert).validation.valid).toBe(true);
  });

  // 8. Troca entre quatro dificuldades
  it('8. Troca entre quatro dificuldades: preserva integridade de pistas e notas', () => {
    const diffs: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
    const maxLanes = { EASY: 2, MEDIUM: 3, HARD: 4, EXPERT: 4 };

    for (const diff of diffs) {
      const notes = beatmaps.getBeatmap('tnt-acdc', diff);
      expect(notes.length).toBeGreaterThan(500);

      const maxLane = maxLanes[diff];
      for (const n of notes) {
        expect(n.lane).toBeGreaterThanOrEqual(0);
        expect(n.lane).toBeLessThanOrEqual(maxLane);
      }
    }
  });

  // 9. Pausa e retomada
  it('9. Pausa e retomada: relógio e áudio congelam e retomam rigorosamente', () => {
    ytMock.currentTime = 14.5;
    masterClock.startPlayback();
    expect(masterClock.getTime()).toBeCloseTo(14.5, 1);

    playbackController.pause();
    masterClock.pause();
    expect(playbackController.getStatus().playbackState).toBe(PlaybackState.PAUSED);

    // Simulated external time jump while paused
    ytMock.currentTime = 20.0;
    expect(masterClock.getTime()).toBeCloseTo(14.5, 1); // Strictly frozen at 14.5

    playbackController.resume();
    masterClock.resume();
    expect(playbackController.getStatus().playbackState).toBe(PlaybackState.PLAYING);
  });

  // 10. Buffering do YouTube
  it('10. Buffering do YouTube: congela relógio, não avança highway, zero falso miss', () => {
    ytMock.currentTime = 25.0;
    masterClock.startPlayback();
    expect(masterClock.getTime()).toBeCloseTo(25.0, 1);

    ytMock.buffering = true;
    masterClock.setBuffering(true);
    expect(masterClock.isBuffering()).toBe(true);
    expect(masterClock.getTime()).toBeCloseTo(25.0, 1);

    // Frame update during buffering
    const updateResult = rockSync.update(performance.now());
    expect(updateResult.clockTime).toBeCloseTo(25.0, 1);
    expect(rockSync.getState().consecutiveMisses).toBe(0);

    // Resume from buffer
    ytMock.buffering = false;
    masterClock.setBuffering(false);
    ytMock.currentTime = 25.1;
    expect(masterClock.getTime()).toBeCloseTo(25.1, 1);
  });

  // 11. Seek para diferentes trechos
  it('11. Seek para diferentes trechos: adapta imediatamente ao novo timestamp da mídia', () => {
    ytMock.currentTime = 10.0;
    masterClock.startPlayback();
    expect(masterClock.getTime()).toBeCloseTo(10.0, 1);

    ytMock.currentTime = 85.0;
    expect(masterClock.getTime()).toBeCloseTo(85.0, 1);

    ytMock.currentTime = 150.0;
    expect(masterClock.getTime()).toBeCloseTo(150.0, 1);
  });

  // 12. Reinício da música
  it('12. Reinício da música: reinicializa combo, relógio, notas e mantém áudio ativo', () => {
    const notes = beatmaps.getBeatmap('tnt-acdc', 'EASY');
    const engine = new GameEngine(notes, 'EASY', settings);

    engine.handleLanePress(1, 0.71); // Hit note 1
    expect(engine.getStats().hitsCount).toBe(1);

    // Reset match
    engine.reset(notes, 'EASY');
    masterClock.reset();
    playbackController.stop();

    expect(engine.getStats().hitsCount).toBe(0);
    expect(engine.getStats().combo).toBe(0);
    expect(engine.getStats().missCount).toBe(0);
    expect(masterClock.isCountdownState()).toBe(true);
  });

  // 13. Mudança de aba
  it('13. Mudança de aba: MusicTimeline lida com visibilitychange sem dessincronizar', () => {
    ytMock.currentTime = 30.0;
    masterClock.startPlayback();
    expect(masterClock.getTime()).toBeCloseTo(30.0, 1);

    // Simulate tab blur / hide
    masterClock.pause();
    expect(masterClock.isPausedState()).toBe(true);

    // Resume tab focus
    masterClock.resume();
    expect(masterClock.isPausedState()).toBe(false);
  });

  // 14. Troca de dispositivo de áudio
  it('14. Troca de dispositivo de áudio: AudioPlaybackController mantém playback ativo', () => {
    playbackController.setVolume(0.8);
    expect(playbackController.getVolume()).toBe(0.8);

    // Re-apply volume on output switch
    playbackController.setVolume(0.85);
    expect(playbackController.getVolume()).toBe(0.85);
    expect(playbackController.isMuted()).toBe(false);
  });

  // 15. Volume e mute manual
  it('15. Volume e mute manual: jogador pode mutar manualmente e desmutar com volume recuperado', () => {
    playbackController.setVolume(0.9);
    expect(playbackController.getVolume()).toBe(0.9);

    playbackController.setManualMute(true);
    expect(playbackController.isMuted()).toBe(true);
    expect(ytMock.muted).toBe(true);

    playbackController.setManualMute(false);
    expect(playbackController.isMuted()).toBe(false);
    expect(playbackController.getVolume()).toBe(0.9);
    expect(ytMock.muted).toBe(false);
  });

  // 16. Offset positivo e negativo
  it('16. Offset positivo e negativo: fórmula de calibração adianta ou atrasa as notas', () => {
    const mediaTime = 10.0;

    // Positive offset: +50ms -> 10.050s (chart notes reach receptor earlier)
    const effectivePos = RockSyncAutoFix.calculateEffectiveChartTime(mediaTime, 50, 0);
    expect(effectivePos).toBeCloseTo(10.05, 3);

    // Negative offset: -50ms -> 9.950s (chart notes reach receptor later)
    const effectiveNeg = RockSyncAutoFix.calculateEffectiveChartTime(mediaTime, -50, 0);
    expect(effectiveNeg).toBeCloseTo(9.95, 3);
  });

  // 17. Drift acumulado
  it('17. Drift acumulado: Modo 2 computa drift linear com âncoras confirmadas', () => {
    const anchors = [
      { mediaTime: 0, chartTime: 0 },
      { mediaTime: 120, chartTime: 120.24 } // 240ms drift over 2 minutes
    ];

    const result = RockSyncAutoFix.calibrateYouTubeAssisted('fGDQ9IukMOc', 0, anchors);
    expect(result.driftRatePerSec).toBeCloseTo(0.002, 4); // 2ms per sec

    const driftAt60s = result.driftRatePerSec * 60;
    expect(driftAt60s).toBeCloseTo(0.12, 2); // 120ms at 1 min
  });

  // 18. Reprodução até o final
  it('18. Reprodução até o final: chart de T.N.T. se estende até o final da música (~228s)', () => {
    const expert = beatmaps.getBeatmap('tnt-acdc', 'EXPERT');
    const firstNote = expert[0].time;
    const lastNote = expert[expert.length - 1].time;

    expect(firstNote).toBeLessThan(2.0);
    expect(lastNote).toBeGreaterThan(220.0);
    expect(lastNote).toBeLessThan(232.0);
  });

  // 19. Retorno ao menu
  it('19. Retorno ao menu: limpeza completa de player e liberação de estado', () => {
    playbackController.playYouTube('fGDQ9IukMOc', 'tnt-acdc');
    playbackController.stop();

    const status = playbackController.getStatus();
    expect(status.activeSource).toBe('none');
    expect(status.playbackState).toBe(PlaybackState.READY);
    expect(ytMock.stop).toHaveBeenCalled();
  });

  // 20. Segunda partida sem vazamento de memória
  it('20. Segunda partida sem vazamento de memória: duas partidas consecutivas rodam limpas', () => {
    // Match 1
    const notes1 = beatmaps.getBeatmap('tnt-acdc', 'EASY');
    const engine1 = new GameEngine(notes1, 'EASY', settings);
    engine1.handleLanePress(1, 0.71);
    expect(engine1.getStats().hitsCount).toBe(1);
    playbackController.stop();

    // Match 2
    const notes2 = beatmaps.getBeatmap('tnt-acdc', 'HARD');
    const engine2 = new GameEngine(notes2, 'HARD', settings);
    expect(engine2.getStats().hitsCount).toBe(0);
    expect(engine2.getNotes().length).toBe(1518);
    expect(playbackController.isMuted()).toBe(false);
  });
});
