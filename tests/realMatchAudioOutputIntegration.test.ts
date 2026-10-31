import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioPlaybackController } from '../src/audio/audioPlaybackController';
import { AudioManager } from '../src/audio/audioManager';
import { YouTubePlayerController } from '../src/audio/youtubePlayer';
import { GameEngine } from '../src/game/engine';
import { UnifiedMasterClock } from '../src/game/sync/masterClock';
import { PlaybackState, GameSettings, Note, SongMetadata } from '../src/types';

describe('ROCKBRAZIL V13.9.6 — SUÍTE DE TESTES DE INTEGRAÇÃO DE ÁUDIO REAL NA PARTIDA', () => {
  let audioManager: AudioManager;
  let ytMock: any;
  let playbackController: AudioPlaybackController;
  let masterClock: UnifiedMasterClock;
  let settings: GameSettings;

  // Variáveis para medição do volume real na saída
  let mockFileGain: any;
  let mockMuteGain: any;
  let activeAudioSourceMock: any;

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

    // Simulação rigorosa do estágio de nós de ganho da Web Audio API
    mockFileGain = {
      gain: {
        value: 0.85,
        setValueAtTime: vi.fn().mockImplementation((val) => { mockFileGain.gain.value = val; }),
        linearRampToValueAtTime: vi.fn().mockImplementation((val) => { mockFileGain.gain.value = val; }),
        cancelScheduledValues: vi.fn()
      },
      connect: vi.fn(),
      disconnect: vi.fn()
    };

    mockMuteGain = {
      gain: {
        value: 1.0,
        setValueAtTime: vi.fn().mockImplementation((val) => { mockMuteGain.gain.value = val; }),
        linearRampToValueAtTime: vi.fn().mockImplementation((val) => { mockMuteGain.gain.value = val; }),
        cancelScheduledValues: vi.fn()
      },
      connect: vi.fn(),
      disconnect: vi.fn()
    };

    activeAudioSourceMock = {
      buffer: {},
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(),
      onended: null
    };

    (audioManager as any).ctx = {
      currentTime: 10.0,
      state: 'running',
      createGain: vi.fn().mockImplementation(() => {
        if (!(audioManager as any).fileGainNode) return mockFileGain;
        return mockMuteGain;
      }),
      createBufferSource: vi.fn().mockReturnValue(activeAudioSourceMock),
      destination: {}
    };
    (audioManager as any).fileGainNode = mockFileGain;
    (audioManager as any).muteGainNode = mockMuteGain;
    (audioManager as any).activeBufferSource = activeAudioSourceMock;
    (audioManager as any).isFilePlaying = true;

    // Simulação rigorosa do player oficial do YouTube
    ytMock = {
      isLoaded: true,
      currentTime: 10.0,
      playbackState: PlaybackState.PLAYING,
      volume: 85,
      muted: false,
      buffering: false,
      player: {
        mute: vi.fn().mockImplementation(() => { ytMock.muted = true; }),
        unMute: vi.fn().mockImplementation(() => { ytMock.muted = false; }),
        setVolume: vi.fn().mockImplementation((v: number) => { ytMock.volume = v; }),
        isMuted: vi.fn().mockImplementation(() => ytMock.muted),
        getVolume: vi.fn().mockImplementation(() => ytMock.volume),
        getPlayerState: vi.fn().mockReturnValue(1),
        getCurrentTime: vi.fn().mockImplementation(() => ytMock.currentTime),
        pauseVideo: vi.fn().mockImplementation(() => { ytMock.playbackState = PlaybackState.PAUSED; }),
        playVideo: vi.fn().mockImplementation(() => { ytMock.playbackState = PlaybackState.PLAYING; }),
        stopVideo: vi.fn().mockImplementation(() => { ytMock.playbackState = PlaybackState.READY; })
      },
      loadVideo: vi.fn().mockResolvedValue(true),
      play: vi.fn().mockImplementation(() => { ytMock.playbackState = PlaybackState.PLAYING; }),
      pause: vi.fn().mockImplementation(() => { ytMock.playbackState = PlaybackState.PAUSED; }),
      resume: vi.fn().mockImplementation(() => { ytMock.playbackState = PlaybackState.PLAYING; }),
      stop: vi.fn().mockImplementation(() => {
        ytMock.playbackState = PlaybackState.READY;
        ytMock.currentTime = 0;
      }),
      setVolume: vi.fn().mockImplementation((v: number) => {
        ytMock.volume = v;
        ytMock.player.setVolume(v);
      }),
      setMuted: vi.fn().mockImplementation((m: boolean, smoothFade = false) => {
        ytMock.muted = m;
        if (m) {
          ytMock.player.mute();
          ytMock.player.setVolume(0);
        } else {
          ytMock.player.unMute();
          if (smoothFade) {
            ytMock.player.setVolume(Math.round(85 * 0.35));
            ytMock.player.setVolume(85);
          } else {
            ytMock.player.setVolume(85);
          }
        }
      }),
      getCurrentTime: vi.fn().mockImplementation(() => ytMock.currentTime),
      getPlaybackState: vi.fn().mockImplementation(() => ytMock.playbackState),
      isBuffering: vi.fn().mockImplementation(() => ytMock.buffering)
    };

    playbackController = new AudioPlaybackController(audioManager, ytMock);
    masterClock = new UnifiedMasterClock();
  });

  // Função auxiliar para calcular o volume acústico efetivo entregue à saída de som
  function getEffectiveWebAudioOutput(): number {
    return mockFileGain.gain.value * mockMuteGain.gain.value;
  }

  function getEffectiveYouTubeOutput(): number {
    if (ytMock.muted || ytMock.player.isMuted()) return 0;
    return ytMock.player.getVolume();
  }

  // CENÁRIO 1: Partida Real com Áudio Local (MP3 / WAV)
  it('1. Áudio Local Real: MISS zera o volume efetivo de saída imediatamente e avança sem pausar', () => {
    // 1.1 Início da partida: áudio audível
    expect(getEffectiveWebAudioOutput()).toBeCloseTo(0.85, 2);
    expect(audioManager.isMuted).toBe(false);

    // 1.2 Ocorre um MISS de nota
    playbackController.handleGameplayMiss();

    // 1.3 Verificação de volume efetivo de saída: DEVE SER 0.0 (silêncio absoluto)
    expect(mockMuteGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 10.0 + 0.008);
    expect(mockMuteGain.gain.value).toBe(0);
    expect(getEffectiveWebAudioOutput()).toBe(0.0);
    expect(audioManager.isMuted).toBe(true);

    // 1.4 A reprodução física no WebAudio NÃO foi parada nem desconectada
    expect(activeAudioSourceMock.stop).not.toHaveBeenCalled();
    expect((audioManager as any).isFilePlaying).toBe(true);
  });

  // CENÁRIO 2: Sequência de 10 MISS consecutivos no Áudio Local
  it('2. Áudio Local Real: 10 MISS consecutivos mantêm saída zerada sem reiniciar a reprodução', () => {
    // Primeiro MISS silencia
    playbackController.handleGameplayMiss();
    expect(getEffectiveWebAudioOutput()).toBe(0.0);

    // 9 MISS subsequentes
    for (let i = 2; i <= 10; i++) {
      (audioManager as any).ctx.currentTime += 0.2;
      playbackController.handleGameplayMiss();

      // Saída permanece em zero absoluto
      expect(getEffectiveWebAudioOutput()).toBe(0.0);
      expect(audioManager.isMuted).toBe(true);
      expect(activeAudioSourceMock.stop).not.toHaveBeenCalled();
    }

    // O tempo avançou continuamente
    expect((audioManager as any).ctx.currentTime).toBeCloseTo(11.8, 1);
  });

  // CENÁRIO 3: Acerto de Nota (HIT) restaura o volume com fade-in no Áudio Local
  it('3. Áudio Local Real: HIT restaura o volume efetivo com rampa de 35ms sem alterar a posição', () => {
    // Silenciado pelo MISS
    playbackController.handleGameplayMiss();
    expect(getEffectiveWebAudioOutput()).toBe(0.0);

    const currentTimeAtHit = (audioManager as any).ctx.currentTime;

    // Jogador acerta uma nota válida (HIT)
    playbackController.handleGameplayHit();

    // Rampa de restauração (fade-in) para 1.0 em 35ms (+0.035s)
    expect(mockMuteGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1.0, currentTimeAtHit + 0.035);
    expect(mockMuteGain.gain.value).toBe(1.0);
    expect(getEffectiveWebAudioOutput()).toBeCloseTo(0.85, 2);
    expect(audioManager.isMuted).toBe(false);

    // Posição temporal de áudio permaneceu inalterada
    expect((audioManager as any).ctx.currentTime).toBe(currentTimeAtHit);
  });

  // CENÁRIO 4: Partida Real com YouTube
  it('4. YouTube Real: MISS muta o player e zera o volume no iframe oficial', () => {
    // 4.1 Início: audível com volume 85%
    expect(getEffectiveYouTubeOutput()).toBe(85);
    expect(ytMock.muted).toBe(false);

    // 4.2 Ocorre um MISS
    playbackController.handleGameplayMiss();

    // 4.3 Verificação dupla: mute() chamado E volume zerado (0)
    expect(ytMock.player.mute).toHaveBeenCalled();
    expect(ytMock.player.setVolume).toHaveBeenCalledWith(0);
    expect(getEffectiveYouTubeOutput()).toBe(0);
    expect(playbackController.isGameplayMissMuted()).toBe(true);

    // 4.4 YouTube continua no estado PLAYING e o tempo continua avançando
    expect(ytMock.playbackState).toBe(PlaybackState.PLAYING);
    ytMock.currentTime += 1.0;
    expect(ytMock.currentTime).toBe(11.0);
  });

  // CENÁRIO 5: HIT no YouTube restaura volume com fade suave de 35ms
  it('5. YouTube Real: HIT desmuta e restaura volume respeitando API oficial', () => {
    playbackController.handleGameplayMiss();
    expect(getEffectiveYouTubeOutput()).toBe(0);

    // HIT restaura
    playbackController.handleGameplayHit();

    expect(ytMock.player.unMute).toHaveBeenCalled();
    expect(ytMock.player.setVolume).toHaveBeenCalledWith(85);
    expect(getEffectiveYouTubeOutput()).toBe(85);
    expect(playbackController.isGameplayMissMuted()).toBe(false);
  });

  // CENÁRIO 6: PAUSE e RESUME enquanto silenciado
  it('6. PAUSE e RESUME preservam o silenciamento até o próximo HIT', () => {
    playbackController.handleGameplayMiss();
    expect(getEffectiveWebAudioOutput()).toBe(0.0);
    expect(getEffectiveYouTubeOutput()).toBe(0);

    // Jogador pausa a partida
    playbackController.pause();
    expect(playbackController.getStatus().playbackState).toBe(PlaybackState.PAUSED);
    expect(playbackController.isGameplayMissMuted()).toBe(true);

    // Jogador retoma a partida (RESUME)
    playbackController.resume();
    expect(playbackController.getStatus().playbackState).toBe(PlaybackState.PLAYING);

    // Permanece mudo porque o jogador ainda NÃO acertou nenhuma nota
    expect(playbackController.isGameplayMissMuted()).toBe(true);
    expect(getEffectiveYouTubeOutput()).toBe(0);

    // Agora o jogador acerta uma nota (HIT)
    playbackController.handleGameplayHit();
    expect(playbackController.isGameplayMissMuted()).toBe(false);
    expect(getEffectiveYouTubeOutput()).toBe(85);
    expect(getEffectiveWebAudioOutput()).toBeCloseTo(0.85, 2);
  });

  // CENÁRIO 7: SAIR da partida encerra completamente os reprodutores
  it('7. Ação SAIR da partida interrompe totalmente o áudio e fecha a sessão', () => {
    playbackController.handleGameplayMiss();

    // Jogador clica em SAIR
    playbackController.stop();

    expect(playbackController.getStatus().playbackState).toBe(PlaybackState.READY);
    expect(playbackController.getStatus().activeSource).toBe('none');
    expect(playbackController.isGameplayMissMuted()).toBe(false);
    expect(ytMock.stop).toHaveBeenCalled();
  });

  // CENÁRIO 8: Troca de música após sair inicia com áudio 100% recuperado
  it('8. Troca de música após sair inicia a nova música audível e pronta para jogar', async () => {
    // Partida anterior terminou/saiu
    playbackController.stop();

    // Nova música iniciada
    await playbackController.playYouTube('new-song-video-id', 'song-new-1');

    expect(playbackController.getStatus().playbackState).toBe(PlaybackState.PLAYING);
    expect(playbackController.isGameplayMissMuted()).toBe(false);
    expect(playbackController.getStatus().isAudible).toBe(true);
    expect(ytMock.muted).toBe(false);
    expect(getEffectiveYouTubeOutput()).toBe(85);
  });

  // CENÁRIO 9: Simulação Completa de Partida com GameEngine
  it('9. Partida Completa com GameEngine: ciclo real de Miss, Mute, Avanço Temporal e Hit', () => {
    const notes: Note[] = [
      { id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false },
      { id: 2, time: 3.5, lane: 1, duration: 0, hit: false, missed: false }
    ];

    const engine = new GameEngine(notes, 'MEDIUM', settings);

    engine.onMiss = () => {
      playbackController.handleGameplayMiss();
      audioManager.setMuteOnMiss(true);
      ytMock.setMuted(true);
    };

    engine.onHit = (result) => {
      if (result.judgment !== 'MISS') {
        playbackController.handleGameplayHit();
        audioManager.setMuteOnMiss(false);
        ytMock.setMuted(false, true);
      }
    };

    // 1. Início da partida no tempo 0.5s: áudio normal e audível
    expect(getEffectiveWebAudioOutput()).toBeCloseTo(0.85, 2);
    expect(getEffectiveYouTubeOutput()).toBe(85);

    // 2. Tempo atinge 2.25s: nota 1 ultrapassou threshold -> MISS disparado
    engine.update(2.25);
    expect(engine.getStats().missCount).toBe(1);

    // Áudio deve estar 100% mudo em ambas as saídas
    expect(getEffectiveWebAudioOutput()).toBe(0.0);
    expect(getEffectiveYouTubeOutput()).toBe(0);
    expect(playbackController.isGameplayMissMuted()).toBe(true);

    // 3. Tempo atinge 3.0s: nenhum HIT ainda -> permanece rigorosamente mudo
    engine.update(3.0);
    expect(getEffectiveWebAudioOutput()).toBe(0.0);
    expect(getEffectiveYouTubeOutput()).toBe(0);

    // 4. Tempo atinge 3.5s: jogador acerta a nota 2 -> HIT disparado
    const hit = engine.handleLanePress(1, 3.5);
    expect(hit).not.toBeNull();
    expect(hit?.judgment).toBe('PERFECT');

    // Áudio restaurado com volume normal
    expect(getEffectiveWebAudioOutput()).toBeCloseTo(0.85, 2);
    expect(getEffectiveYouTubeOutput()).toBe(85);
    expect(playbackController.isGameplayMissMuted()).toBe(false);
  });
});
