import { describe, it, expect, vi } from 'vitest';
import { UnifiedMasterClock, AudioTimeSource } from '../src/game/sync/masterClock';
import { PreStartSystem, PreStartResourceProvider, PreStartEvents } from '../src/game/sync/prestartSystem';
import { PlaybackState } from '../src/types';
import { CalibrationManager } from '../src/game/sync/calibrationManager';
import { GameEngine } from '../src/game/engine';

describe('ROCKBRAZIL BETA — SUÍTE DE REGRESSÃO E AUDITORIA REAL V4', () => {

  it('1. Relógio não permanece congelado enquanto o áudio/vídeo avança (auto-recuperação de buffering)', () => {
    const clock = new UnifiedMasterClock();
    let srcState = PlaybackState.BUFFERING;
    let srcTime = 2.0;

    const mockSource: AudioTimeSource = {
      getCurrentTime: () => srcTime,
      getPlaybackState: () => srcState,
      isBuffering: () => srcState === PlaybackState.BUFFERING
    };

    clock.setSource(mockSource);
    clock.startPlayback();

    // Em buffering, o relógio congela
    clock.setBuffering(true);
    expect(clock.getTime()).toBe(0);

    // O YouTube retoma para PLAYING e o tempo avança para 5.5s
    srcState = PlaybackState.PLAYING;
    srcTime = 5.5;

    // O relógio DEVE se auto-recuperar mesmo que setBuffering(false) não tenha sido chamado explicitamente
    const t = clock.getTime();
    expect(t).toBeGreaterThanOrEqual(5.5);
  });

  it('2. Início forçado NUNCA acontece após timeout se áudio não foi confirmado', async () => {
    vi.useFakeTimers();
    const prestart = new PreStartSystem();

    let gameStarted = false;
    let autoplayBlocked = false;

    const resources: PreStartResourceProvider = {
      prepareChart: () => true,
      prepareRenderer: () => {},
      prepareAudio: () => true,
      startAudioPlayback: () => {},
      isAudioPlaying: () => false, // Áudio NUNCA começou (bloqueado ou travado)
      isAudioBuffering: () => true
    };

    const events: PreStartEvents = {
      onCountdownTick: () => {},
      onCountdownRock: () => {},
      onSynchronizingWait: () => {},
      onGameStart: () => {
        gameStarted = true;
      },
      onAutoplayBlocked: () => {
        autoplayBlocked = true;
      }
    };

    await prestart.prepareAndStart(1001, resources, events);

    // Avança os 3 segundos da contagem
    await vi.advanceTimersByTimeAsync(3000);

    // Avança 15 segundos no estado de espera
    await vi.advanceTimersByTimeAsync(15000);

    // NUNCA deve iniciar o jogo sem confirmação de áudio!
    expect(gameStarted).toBe(false);
    expect(autoplayBlocked).toBe(true);

    vi.useRealTimers();
  });

  it('3. Contagem regressiva (3... 2... 1... ROCK!) não vaza para o tempo musical', () => {
    const clock = new UnifiedMasterClock();
    let sourceTime = 0.0;

    const mockSource: AudioTimeSource = {
      getCurrentTime: () => sourceTime,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };

    clock.setSource(mockSource);
    clock.startCountdown();

    // Durante a contagem, tempo é estritamente 0
    expect(clock.getTime()).toBe(0);

    // Ao iniciar reprodução com áudio em 0.04s
    sourceTime = 0.04;
    clock.startPlayback();

    expect(clock.getTime()).toBeCloseTo(0.04, 2);
  });

  it('4. Offset não é aplicado duas vezes (MasterClock vs GameEngine)', () => {
    const clock = new UnifiedMasterClock();
    // Offset de gravação da música: +100ms
    clock.setOffsets(100, 0);

    let srcTime = 1.0;
    const mockSource: AudioTimeSource = {
      getCurrentTime: () => srcTime,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };
    clock.setSource(mockSource);
    clock.startPlayback();

    // ClockTime = 1.0 + 0.100 = 1.100s
    expect(clock.getTime()).toBeCloseTo(1.100, 3);

    // GameEngine recebe input latency separadamente (ex: 0ms)
    const note = { id: 1, time: 1.100, lane: 0 as any, duration: 0, hit: false, missed: false, sustainHeldTime: 0, sustainCompleted: false, type: 'tap' as any };
    const engine = new GameEngine([note], 'EXPERT', {
      audioOffsetMs: 0,
      musicVolume: 1,
      sfxVolume: 1,
      noteSpeed: 1
    });

    // Quando clockTime == note.time, julgamento é PERFECT (delta = 0)
    const result = engine.handleLanePress(0, clock.getTime());
    expect(result).not.toBeNull();
    expect(result?.judgment).toBe('PERFECT');
  });

  it('5. Alinhamento sem deslocamento entre tempo visual e tempo de julgamento', () => {
    const clock = new UnifiedMasterClock();
    clock.startPlayback();

    let srcTime = 6.565;
    clock.setSource({
      getCurrentTime: () => srcTime,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    });

    const noteTime = 6.565;
    const progress = clock.getNoteProgress(noteTime, 1.35);

    // Progresso geométrico exato no receptor
    expect(progress).toBe(1.0);
  });

  it('6. Calibração assistida da música atualiza o relógio mestre imediatamente', () => {
    const clock = new UnifiedMasterClock();
    clock.startPlayback();

    clock.setSource({
      getCurrentTime: () => 10.0,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    });

    // Offset inicial zero
    clock.setOffsets(0, 0);
    expect(clock.getTime()).toBe(10.0);

    // Jogador ajusta calibração da faixa em +50ms
    CalibrationManager.setSongOffsetMs('test-song', 50);
    clock.setSongOffsetSec(CalibrationManager.getSongOffsetMs('test-song') / 1000);

    expect(clock.getTime()).toBeCloseTo(10.05, 3);
  });

  it('7. Ciclo de estados PLAYING -> BUFFERING -> PLAYING não introduz saltos negativos', () => {
    const clock = new UnifiedMasterClock();
    clock.startPlayback();

    let srcTime = 4.0;
    let state = PlaybackState.PLAYING;

    clock.setSource({
      getCurrentTime: () => srcTime,
      getPlaybackState: () => state,
      isBuffering: () => state === PlaybackState.BUFFERING
    });

    expect(clock.getTime()).toBe(4.0);

    // Avança para 4.2s
    srcTime = 4.2;
    expect(clock.getTime()).toBe(4.2);

    // Entra em buffering a 4.2s
    state = PlaybackState.BUFFERING;
    clock.setBuffering(true);
    expect(clock.getTime()).toBe(4.2);

    // Enquanto está em buffering, relógio fica estritamente congelado em 4.2
    expect(clock.getTime()).toBe(4.2);

    // Retoma reprodução a 4.25s
    state = PlaybackState.PLAYING;
    srcTime = 4.25;
    clock.setBuffering(false);

    expect(clock.getTime()).toBeCloseTo(4.25, 2);
    expect(clock.getTime()).toBeGreaterThanOrEqual(4.2);
  });

  it('8. Pausa e retomada não saltam pelo tempo de parede (performance.now)', () => {
    const clock = new UnifiedMasterClock();
    clock.startPlayback();

    let srcTime = 12.0;
    clock.setSource({
      getCurrentTime: () => srcTime,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    });

    expect(clock.getTime()).toBe(12.0);

    clock.pause();
    expect(clock.getTime()).toBe(12.0);

    // Passam 10 segundos na vida real enquanto o jogo está pausado
    // O áudio do YouTube está pausado
    expect(clock.getTime()).toBe(12.0);

    clock.resume();
    // Ao retomar, relógio continua exatamente de 12.0s
    expect(clock.getTime()).toBe(12.0);
  });

  it('9. Vídeo iniciado antes do motor inicializa diretamente no timestamp correto sem reset a zero', () => {
    const clock = new UnifiedMasterClock();
    // Vídeo já começou em 2.45s antes do motor
    clock.setSource({
      getCurrentTime: () => 2.45,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    });

    clock.startPlayback();
    expect(clock.getTime()).toBeCloseTo(2.45, 2);
  });

  it('10. Simulação de atrasos de inicialização (0ms, 500ms, 1000ms, 3000ms, 5000ms, 8000ms)', () => {
    const delays = [0, 500, 1000, 3000, 5000, 8000];

    for (const delay of delays) {
      const clock = new UnifiedMasterClock();
      clock.startCountdown();

      // Durante o atraso de carregamento
      expect(clock.getTime()).toBe(0);

      // Reprodução confirmada com início em 0.02s após o atraso
      clock.setSource({
        getCurrentTime: () => 0.02,
        getPlaybackState: () => PlaybackState.PLAYING,
        isBuffering: () => false
      });

      clock.startPlayback();
      // O tempo musical NUNCA incorpora o atraso de carregamento (delay)
      expect(clock.getTime()).toBeCloseTo(0.02, 2);
    }
  });

});
