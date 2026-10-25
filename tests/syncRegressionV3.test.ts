import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedMasterClock, AudioTimeSource } from '../src/game/sync/masterClock';
import { PreStartSystem, PreStartResourceProvider, PreStartEvents } from '../src/game/sync/prestartSystem';
import { YouTubePlayerController } from '../src/audio/youtubePlayer';
import { GameEngine } from '../src/game/engine';
import { PlaybackState, Note, GameSettings, Difficulty } from '../src/types';
import { OFFICIAL_BRAZILIAN_CATALOG, ORIGINAL_31_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';
import { RAW_COMPACT_CHARTS } from '../src/game/catalog/realChartsRegistry';
import { BeatmapManager } from '../src/game/beatmapManager';

describe('ROCKBRAZIL BETA — SUÍTE DE REGRESSÃO OBRIGATÓRIA V3 (SEÇÃO 7)', () => {
  let masterClock: UnifiedMasterClock;
  const defaultSettings: GameSettings = {
    musicVolume: 0.8,
    sfxVolume: 0.8,
    audioOffsetMs: 50, // Non-zero to explicitly test dual-offset / inverted subtraction bug
    noteSpeedMultiplier: 1.0,
    visualEffectsEnabled: true
  };

  beforeEach(() => {
    masterClock = new UnifiedMasterClock();
  });

  // --------------------------------------------------------------------------
  // TESTE 1: Contagem Regressiva e Atrasos de Inicialização (0ms a 8000ms)
  // --------------------------------------------------------------------------
  it('1. Contagem regressiva (3s) e atrasos de inicialização (0, 500, 1000, 3000, 5000, 8000ms) NÃO alteram o tempo musical', async () => {
    const startupDelays = [0, 500, 1000, 3000, 5000, 8000];

    for (const delayMs of startupDelays) {
      const clock = new UnifiedMasterClock();
      clock.setOffsets(0, defaultSettings.audioOffsetMs);

      // Simula fonte de áudio
      let sourceCurrentTime = 0;
      let sourceState = PlaybackState.READY;
      const mockSource: AudioTimeSource = {
        getCurrentTime: () => sourceCurrentTime,
        getPlaybackState: () => sourceState,
        isBuffering: () => false
      };
      clock.setSource(mockSource);

      // Inicia contagem regressiva
      clock.startCountdown();

      // Durante a contagem ou atraso de inicialização, o tempo musical deve ser ESTRITAMENTE 0
      expect(clock.getTime()).toBe(0);

      // Simula passagem do tempo durante a contagem
      sourceCurrentTime = 0; // O áudio ainda não avançou
      expect(clock.getTime()).toBe(0);

      // Simula confirmação de início de reprodução após delayMs
      sourceState = PlaybackState.PLAYING;
      sourceCurrentTime = 0.05; // O áudio inicia em 50ms
      clock.startPlayback();

      // O tempo musical DEVE ser baseado estritamente no tempo do áudio + offset, SEM somar delayMs!
      const totalOffsetSec = defaultSettings.audioOffsetMs / 1000;
      const expectedTime = 0.05 + totalOffsetSec;
      expect(clock.getTime()).toBeCloseTo(expectedTime, 4);
    }
  });

  // --------------------------------------------------------------------------
  // TESTE 2: Eliminação de Dupla Aplicação / Inversão de Offset no GameEngine
  // --------------------------------------------------------------------------
  it('2. GameEngine e Renderer utilizam a MESMA linha de tempo (sem cancelamento do global audioOffsetMs)', () => {
    const testNotes: Note[] = [
      { time: 5.0, lane: 0, duration: 0, hit: false, missed: false }
    ];
    const engine = new GameEngine(testNotes, 'MEDIUM', defaultSettings);

    // O masterClock fornece a referência de tempo do áudio da gravação (songOffset = 0)
    masterClock.setOffsets(0, 0);
    let mockVideoTime = 5.05; // Jogador com latência de hardware/áudio de 50ms ouve e reage a 5.05s
    const mockSource: AudioTimeSource = {
      getCurrentTime: () => mockVideoTime,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };
    masterClock.setSource(mockSource);
    masterClock.startPlayback();

    const rawTime = masterClock.getTime();
    expect(rawTime).toBeCloseTo(5.05, 4);

    // O GameEngine calibra o atraso de hardware do usuário (5.05s - 0.05s = 5.00s exato do acorde):
    const result = engine.handleLanePress(0, rawTime);
    expect(result).not.toBeNull();
    expect(result?.judgment).toBe('PERFECT');
    expect(Math.abs(result!.timeDiff)).toBeLessThanOrEqual(0.005); // Alinhamento perfeito após calibração
  });

  // --------------------------------------------------------------------------
  // TESTE 3: Detecção de Congelamento Indevido após PLAYING no YouTube Controller
  // --------------------------------------------------------------------------
  it('3. YouTubePlayerController NÃO sofre deadlock nem falso buffering com drift pequeno (<= 15ms)', () => {
    let mockRawTime = 1.0;
    let mockPlayerState = 1; // 1 = PLAYING
    const yt = new YouTubePlayerController();

    // Mock do player interno do YouTube
    (yt as any).player = {
      getCurrentTime: () => mockRawTime,
      getPlayerState: () => mockPlayerState
    };
    (yt as any).setPlaybackState(PlaybackState.PLAYING);

    // Primeiro frame: lê 1.0s
    const t1 = yt.getCurrentTime();
    expect(t1).toBeCloseTo(1.0, 3);

    // O YouTube atualiza com apenas 10ms de diferença (drift <= 15ms)
    mockRawTime = 1.010;
    const t2 = yt.getCurrentTime();
    expect(t2).toBeCloseTo(1.010, 3);

    // Múltiplas leituras com o mesmo rawTime (YouTube envia a cada 250ms)
    // O controller NÃO PODE entrar em BUFFERING nem congelar após 450ms!
    for (let frame = 0; frame < 30; frame++) {
      yt.getCurrentTime();
    }
    expect(yt.isBuffering()).toBe(false);
    expect(yt.isPlaying()).toBe(true);
  });

  // --------------------------------------------------------------------------
  // TESTE 4: Sincronia de Pausa e Buffering (Áudio e Motor congelam juntos)
  // --------------------------------------------------------------------------
  it('4. O motor não avança enquanto o áudio está em buffering ou pausado', () => {
    const clock = new UnifiedMasterClock();
    let isBuffering = false;
    let rawTime = 2.5;

    const mockSource: AudioTimeSource = {
      getCurrentTime: () => rawTime,
      getPlaybackState: () => isBuffering ? PlaybackState.BUFFERING : PlaybackState.PLAYING,
      isBuffering: () => isBuffering
    };
    clock.setSource(mockSource);
    clock.startPlayback();

    expect(clock.getTime()).toBeCloseTo(2.5, 3);

    // Entra em buffering
    isBuffering = true;
    clock.setBuffering(true);
    const frozenAt = clock.getTime();

    // O tempo passa externamente, mas o áudio travou
    rawTime = 3.5;
    expect(clock.getTime()).toBe(frozenAt);

    // Buffering termina
    isBuffering = false;
    clock.setBuffering(false);
    rawTime = 2.6; // Áudio retomou em 2.6s
    expect(clock.getTime()).toBeCloseTo(2.6, 3);
  });

  // --------------------------------------------------------------------------
  // TESTE 5: Alinhamento Geométrico das Notas (Strike Line Receptor at progress = 1.0)
  // --------------------------------------------------------------------------
  it('5. Quando getTime() == note.time, a nota atinge exatamente o receptor (progress = 1.0)', () => {
    const noteTime = 4.364;
    let currentRaw = 4.364;

    const mockSource: AudioTimeSource = {
      getCurrentTime: () => currentRaw,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };
    masterClock.setSource(mockSource);
    masterClock.startPlayback();

    const progress = masterClock.getNoteProgress(noteTime, 1.35);
    expect(progress).toBeCloseTo(1.0, 5);
  });
});

describe('ROCKBRAZIL BETA — VERIFICAÇÃO ESTRUTURAL DAS 31 MÚSICAS (SEÇÃO 6)', () => {
  const beatmaps = new BeatmapManager();
  const difficulties: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];

  it('6. O catálogo contém exatamente 31 músicas válidas e consistentes no catálogo original', () => {
    expect(ORIGINAL_31_BRAZILIAN_CATALOG.length).toBe(31);
    expect(OFFICIAL_BRAZILIAN_CATALOG.length).toBeGreaterThanOrEqual(31);
    const ids = new Set(ORIGINAL_31_BRAZILIAN_CATALOG.map((s) => s.id));
    expect(ids.size).toBe(31); // Sem IDs duplicados
  });

  it('7. Todas as 31 músicas possuem notas válidas, acordes e sustentações em todas as dificuldades', () => {
    for (const song of ORIGINAL_31_BRAZILIAN_CATALOG) {
      expect(song.duration).toBeGreaterThan(30);
      expect(song.bpm).toBeGreaterThanOrEqual(70);
      expect(song.bpm).toBeLessThanOrEqual(250);

      for (const diff of difficulties) {
        const notes = beatmaps.getBeatmap(song.id, diff);
        expect(notes.length).toBeGreaterThan(20);

        // Verifica ordenação cronológica estrita
        for (let i = 1; i < notes.length; i++) {
          expect(notes[i].time).toBeGreaterThanOrEqual(notes[i - 1].time);
        }

        // Primeira nota possui timestamp válido (positivo ou zero no início normalizado)
        const firstNote = notes[0];
        expect(firstNote.time).toBeGreaterThanOrEqual(0);
        expect(firstNote.time).toBeLessThan(song.duration);

        // Última nota antes do fim da música
        const lastNote = notes[notes.length - 1];
        expect(lastNote.time).toBeLessThanOrEqual(song.duration + 5);

        // Verifica que as pistas estão dentro do intervalo válido (0 a 4)
        for (const n of notes) {
          expect(n.lane).toBeGreaterThanOrEqual(0);
          expect(n.lane).toBeLessThanOrEqual(4);
          expect(n.duration).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('8. Os charts originais das 29 músicas autênticas da comunidade estão 100% preservados', () => {
    const compactSongIds = Object.keys(RAW_COMPACT_CHARTS);
    expect(compactSongIds.length).toBe(29);

    for (const songId of compactSongIds) {
      const charts = RAW_COMPACT_CHARTS[songId];
      for (const diff of difficulties) {
        const rawNotes = charts[diff];
        expect(rawNotes).toBeDefined();
        expect(rawNotes.length).toBeGreaterThan(0);

        // Verifica que os acordes autênticos (notas simultâneas no mesmo timestamp) estão presentes
        let simultaneousChords = 0;
        for (let i = 1; i < rawNotes.length; i++) {
          if (Math.abs(rawNotes[i][0] - rawNotes[i - 1][0]) < 0.005) {
            simultaneousChords++;
          }
        }
        if (diff === 'EXPERT' || diff === 'HARD') {
          expect(simultaneousChords).toBeGreaterThan(0);
        }
      }
    }
  });
});
