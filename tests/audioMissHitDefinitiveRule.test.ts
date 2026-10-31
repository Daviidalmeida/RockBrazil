import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioPlaybackController } from '../src/audio/audioPlaybackController';
import { AudioManager } from '../src/audio/audioManager';
import { GameEngine } from '../src/game/engine';
import { UnifiedMasterClock } from '../src/game/sync/masterClock';
import { PlaybackState, GameSettings, Note } from '../src/types';

describe('ROCKBRAZIL — REGRA DEFINITIVA DE ÁUDIO NO MISS / HIT (V13.9.5)', () => {
  let audioManager: AudioManager;
  let ytMock: any;
  let playbackController: AudioPlaybackController;
  let masterClock: UnifiedMasterClock;
  let settings: GameSettings;

  beforeEach(() => {
    settings = {
      musicVolume: 0.85,
      sfxVolume: 0.9,
      audioOffsetMs: 0,
      noteSpeedMultiplier: 1.0,
      visualEffectsEnabled: true,
      visualEffectsMode: 'NORMAL',
      effectsMode: 'NORMAL',
      muteOnMiss: true
    };

    audioManager = new AudioManager(settings);

    ytMock = {
      isLoaded: true,
      currentTime: 10.0,
      playbackState: PlaybackState.PLAYING,
      volume: 85,
      muted: false,
      buffering: false,
      loadVideo: vi.fn().mockResolvedValue(true),
      play: vi.fn().mockImplementation(() => { ytMock.playbackState = PlaybackState.PLAYING; }),
      pause: vi.fn().mockImplementation(() => { ytMock.playbackState = PlaybackState.PAUSED; }),
      resume: vi.fn().mockImplementation(() => { ytMock.playbackState = PlaybackState.PLAYING; }),
      stop: vi.fn().mockImplementation(() => {
        ytMock.playbackState = PlaybackState.READY;
        ytMock.currentTime = 0;
      }),
      setVolume: vi.fn().mockImplementation((v: number) => { ytMock.volume = v; }),
      setMuted: vi.fn().mockImplementation((m: boolean, smoothFade = false) => {
        ytMock.muted = m;
        if (!m && smoothFade) {
          ytMock.volume = 85;
        }
      }),
      getCurrentTime: vi.fn().mockImplementation(() => ytMock.currentTime),
      getPlaybackState: vi.fn().mockImplementation(() => ytMock.playbackState),
      isBuffering: vi.fn().mockImplementation(() => ytMock.buffering)
    };

    playbackController = new AudioPlaybackController(audioManager, ytMock);
    masterClock = new UnifiedMasterClock();
  });

  // 1. MISS silencia imediatamente no YouTube
  it('1. MISS no YouTube: silencia áudio imediatamente mantendo reprodução e relógio ativos', async () => {
    await playbackController.playYouTube('video-test-123', 'song-1');
    expect(playbackController.getStatus().isAudible).toBe(true);
    expect(playbackController.isGameplayMissMuted()).toBe(false);
    expect(ytMock.muted).toBe(false);

    // Ocorre um MISS
    playbackController.handleGameplayMiss();

    expect(playbackController.isGameplayMissMuted()).toBe(true);
    expect(playbackController.getStatus().isAudible).toBe(false);
    expect(ytMock.muted).toBe(true);

    // A reprodução continua PLAYING e o tempo continua avançando internamente
    expect(playbackController.getStatus().playbackState).toBe(PlaybackState.PLAYING);
    ytMock.currentTime += 0.5;
    expect(playbackController.getCurrentMediaTime()).toBe(10.5);
  });

  // 2. MISS silencia no áudio local (Web Audio API)
  it('2. MISS no áudio local: aplica silenciamento sem interromper o tempo de áudio', () => {
    const gainValues: number[] = [];
    const mockGainNode: any = {
      gain: {
        value: 1.0,
        setValueAtTime: vi.fn().mockImplementation((val) => { gainValues.push(val); }),
        cancelScheduledValues: vi.fn(),
        linearRampToValueAtTime: vi.fn().mockImplementation((val) => { gainValues.push(val); })
      },
      connect: vi.fn(),
      disconnect: vi.fn()
    };

    (audioManager as any).ctx = {
      currentTime: 15.0,
      state: 'running',
      createGain: vi.fn().mockReturnValue(mockGainNode)
    };
    (audioManager as any).muteGainNode = mockGainNode;

    // Dispara MISS
    audioManager.setMuteOnMiss(true);

    expect(audioManager.isMuted).toBe(true);
    expect(mockGainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 15.0 + 0.008);
  });

  // 3. Enquanto o jogador continuar errando: mantém mudo sem reset nem pause
  it('3. Múltiplos MISS consecutivos: música permanece muda sem pausar ou reiniciar reprodução', async () => {
    await playbackController.playYouTube('video-test-123', 'song-1');

    for (let miss = 1; miss <= 50; miss++) {
      ytMock.currentTime += 0.1;
      playbackController.handleGameplayMiss();

      // Em cada erro consecutivo:
      expect(playbackController.isGameplayMissMuted()).toBe(true);
      expect(playbackController.getStatus().isAudible).toBe(false);
      expect(ytMock.muted).toBe(true);
      expect(playbackController.getStatus().playbackState).toBe(PlaybackState.PLAYING);
    }

    // Tempo avançou 5 segundos sem parar
    expect(playbackController.getCurrentMediaTime()).toBeCloseTo(15.0, 1);
  });

  // 4. Nenhum temporizador restaura o volume por conta própria
  it('4. Ausência de temporizador: sem acerto de nota (HIT), o volume NÃO é restaurado automaticamente', async () => {
    vi.useFakeTimers();
    await playbackController.playYouTube('video-test-123', 'song-1');

    playbackController.handleGameplayMiss();
    expect(playbackController.isGameplayMissMuted()).toBe(true);

    // Avança 1 segundo, 5 segundos, 30 segundos no tempo virtual
    vi.advanceTimersByTime(1000);
    expect(playbackController.isGameplayMissMuted()).toBe(true);
    expect(playbackController.getStatus().isAudible).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(playbackController.isGameplayMissMuted()).toBe(true);

    vi.advanceTimersByTime(30000);
    expect(playbackController.isGameplayMissMuted()).toBe(true);
    expect(playbackController.getStatus().isAudible).toBe(false);

    vi.useRealTimers();
  });

  // 5. SOMENTE quando o jogador acertar uma nota válida (HIT): restaura o volume com fade-in
  it('5. HIT válido: restaura volume com fade-in de 20 a 50ms sem reiniciar a música', async () => {
    await playbackController.playYouTube('video-test-123', 'song-1');

    // MISS inicial
    playbackController.handleGameplayMiss();
    expect(playbackController.isGameplayMissMuted()).toBe(true);
    expect(playbackController.getStatus().isAudible).toBe(false);

    const currentTimeBeforeHit = playbackController.getCurrentMediaTime();

    // HIT válido
    playbackController.handleGameplayHit();

    expect(playbackController.isGameplayMissMuted()).toBe(false);
    expect(playbackController.getStatus().isAudible).toBe(true);
    expect(ytMock.muted).toBe(false);
    // Posição permanece inalterada
    expect(playbackController.getCurrentMediaTime()).toBe(currentTimeBeforeHit);
  });

  // 6. Teste de fade-in no Web Audio (rampa de 35ms)
  it('6. Web Audio API fade-in: linearRampToValueAtTime entre 20ms e 50ms (35ms)', () => {
    const mockGainNode: any = {
      gain: {
        value: 0.0001,
        setValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        linearRampToValueAtTime: vi.fn()
      },
      connect: vi.fn(),
      disconnect: vi.fn()
    };

    (audioManager as any).ctx = {
      currentTime: 22.0,
      state: 'running',
      createGain: vi.fn().mockReturnValue(mockGainNode)
    };
    (audioManager as any).muteGainNode = mockGainNode;
    (audioManager as any).isMissMuted = true;

    // Dispara HIT (desmutar)
    audioManager.setMuteOnMiss(false);

    expect(audioManager.isMuted).toBe(false);
    // Target 1.0 com rampa de 35ms (+0.035s)
    expect(mockGainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1.0, 22.0 + 0.035);
  });

  // 7. Se o jogador não acertar mais nenhuma nota: permanece mudo até terminar ou sair
  it('7. Sem novos acertos: a música permanece muda até o encerramento da partida', async () => {
    await playbackController.playYouTube('video-test-123', 'song-1');
    playbackController.handleGameplayMiss();

    // Simula 20 segundos de gameplay sem acerto
    for (let sec = 1; sec <= 20; sec++) {
      ytMock.currentTime += 1.0;
      expect(playbackController.isGameplayMissMuted()).toBe(true);
      expect(playbackController.getStatus().isAudible).toBe(false);
    }

    expect(playbackController.getCurrentMediaTime()).toBe(30.0);
    expect(playbackController.getStatus().isAudible).toBe(false);
  });

  // 8. O MISS não congela a esteira, não modifica o offset nem interrompe o relógio musical
  it('8. MISS não congela a esteira nem o relógio musical', () => {
    masterClock.setSource(ytMock);
    masterClock.setOffsets(0, 0);
    masterClock.startPlayback();

    const initialOffset = masterClock.getTotalOffsetSec();
    ytMock.currentTime = 5.0;

    const time1 = masterClock.getTime();
    expect(time1).toBe(5.0);

    // MISS ocorre
    playbackController.handleGameplayMiss();

    // Relógio continua avançando normalmente
    ytMock.currentTime = 5.05;
    const time2 = masterClock.getTime();
    expect(time2).toBe(5.05);
    expect(masterClock.getTotalOffsetSec()).toBe(initialOffset);

    // Progresso das notas na esteira continua calculado corretamente
    const progress = masterClock.getNoteProgress(6.0, 1.0);
    expect(progress).toBeCloseTo(0.05, 2);
  });

  // 9. Ao clicar em SAIR: parar completamente o áudio, encerrar a sessão e impedir música no menu
  it('9. Ação SAIR: para completamente o áudio e reseta o estado da sessão', async () => {
    await playbackController.playYouTube('video-test-123', 'song-1');
    playbackController.handleGameplayMiss();

    // Jogador clica em SAIR
    playbackController.stop();

    expect(playbackController.getStatus().activeSource).toBe('none');
    expect(playbackController.getStatus().playbackState).toBe(PlaybackState.READY);
    expect(playbackController.isGameplayMissMuted()).toBe(false);
    expect(playbackController.getStatus().isAudible).toBe(false);
    expect(ytMock.stop).toHaveBeenCalled();
  });

  // 10. Diferença estrita entre MISS, HIT, PAUSE e SAIR
  it('10. Distinção inequívoca: MISS silencia tempo correndo; HIT desmuta; PAUSE pausa tempo; SAIR desliga', async () => {
    await playbackController.playYouTube('video-test-123', 'song-1');

    // Estado inicial: Tocando e audível
    expect(playbackController.getStatus().playbackState).toBe(PlaybackState.PLAYING);
    expect(playbackController.getStatus().isAudible).toBe(true);

    // A) MISS: Silencia MAS mantém estado PLAYING e tempo correndo
    playbackController.handleGameplayMiss();
    expect(playbackController.getStatus().playbackState).toBe(PlaybackState.PLAYING);
    expect(playbackController.getStatus().isAudible).toBe(false);
    expect(playbackController.isGameplayMissMuted()).toBe(true);

    // B) PAUSE: Pausa o player (estado PAUSED), preservando estado de miss
    playbackController.pause();
    expect(playbackController.getStatus().playbackState).toBe(PlaybackState.PAUSED);
    expect(playbackController.isGameplayMissMuted()).toBe(true);

    // C) RESUME: Retoma sem desmutar prematuramente
    playbackController.resume();
    expect(playbackController.getStatus().playbackState).toBe(PlaybackState.PLAYING);
    expect(playbackController.getStatus().isAudible).toBe(false);
    expect(playbackController.isGameplayMissMuted()).toBe(true);

    // D) HIT: Restaura o volume enquanto PLAYING
    playbackController.handleGameplayHit();
    expect(playbackController.getStatus().playbackState).toBe(PlaybackState.PLAYING);
    expect(playbackController.getStatus().isAudible).toBe(true);
    expect(playbackController.isGameplayMissMuted()).toBe(false);

    // E) SAIR: Encerra tudo
    playbackController.stop();
    expect(playbackController.getStatus().playbackState).toBe(PlaybackState.READY);
    expect(playbackController.getStatus().activeSource).toBe('none');
    expect(playbackController.getStatus().isAudible).toBe(false);
  });

  // 11. Integração com GameEngine: MISS na passagem da nota silencia via callback
  it('11. Integração GameEngine: nota perdida no threshold dispara onMuteRequested(true)', () => {
    const notes: Note[] = [
      { id: 1, time: 1.0, lane: 0, duration: 0, hit: false, missed: false },
      { id: 2, time: 2.0, lane: 1, duration: 0, hit: false, missed: false }
    ];

    const engine = new GameEngine(notes, 'MEDIUM', settings);
    const muteCalls: boolean[] = [];

    engine.onMuteRequested = (muted: boolean) => {
      muteCalls.push(muted);
      if (muted) playbackController.handleGameplayMiss();
      else playbackController.handleGameplayHit();
    };

    // Reseta engine (inicia desmutado)
    engine.reset(notes, 'MEDIUM');
    expect(muteCalls[muteCalls.length - 1]).toBe(false);

    // Avança tempo além do threshold da primeira nota (tempo 1.0 + window good 0.18 = 1.18s)
    engine.update(1.25);

    expect(engine.getStats().missCount).toBe(1);
    expect(muteCalls).toContain(true);
    expect(playbackController.isGameplayMissMuted()).toBe(true);
  });

  // 12. Integração GameEngine: toque extra (sem nota) dispara onMuteRequested(true)
  it('12. Integração GameEngine: toque extra (lane press em vazio) silencia como erro', () => {
    const notes: Note[] = [
      { id: 1, time: 5.0, lane: 0, duration: 0, hit: false, missed: false }
    ];

    const engine = new GameEngine(notes, 'MEDIUM', settings);
    let lastMuteState: boolean | null = null;

    engine.onMuteRequested = (muted: boolean) => {
      lastMuteState = muted;
      if (muted) playbackController.handleGameplayMiss();
      else playbackController.handleGameplayHit();
    };

    // Pressiona lane no tempo 1.0 (a 4 segundos da nota mais próxima: toque extra)
    const result = engine.handleLanePress(2, 1.0);

    expect(result).toBeNull();
    expect(engine.getStats().extraPressCount).toBe(1);
    expect(lastMuteState).toBe(true);
    expect(playbackController.isGameplayMissMuted()).toBe(true);
  });

  // 13. Integração GameEngine: acerto de nota após erro restaura volume
  it('13. Integração GameEngine: acerto de nota (HIT) após erro dispara onMuteRequested(false)', () => {
    const notes: Note[] = [
      { id: 1, time: 1.0, lane: 0, duration: 0, hit: false, missed: false },
      { id: 2, time: 2.0, lane: 1, duration: 0, hit: false, missed: false }
    ];

    const engine = new GameEngine(notes, 'MEDIUM', settings);
    let currentMute = false;

    engine.onMuteRequested = (muted: boolean) => {
      currentMute = muted;
      if (muted) playbackController.handleGameplayMiss();
      else playbackController.handleGameplayHit();
    };

    // Erra nota 1
    engine.update(1.25);
    expect(engine.getStats().missCount).toBe(1);
    expect(currentMute).toBe(true);
    expect(playbackController.isGameplayMissMuted()).toBe(true);

    // Acerta nota 2 perfeitamente no tempo 2.0
    const hitResult = engine.handleLanePress(1, 2.0);
    expect(hitResult).not.toBeNull();
    expect(hitResult?.judgment).toBe('PERFECT');
    expect(currentMute).toBe(false);
    expect(playbackController.isGameplayMissMuted()).toBe(false);
  });
});
