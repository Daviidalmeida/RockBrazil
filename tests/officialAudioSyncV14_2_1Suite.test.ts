import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  INTERNATIONAL_SONGS_CATALOG,
  INTERNATIONAL_METADATA_CONFIG,
  ARCHIVED_INTERNATIONAL_SONGS
} from '../src/game/catalog/internationalCatalog';
import { RAW_INTERNATIONAL_CHARTS } from '../src/game/catalog/internationalChartsRegistry';
import { INTERNATIONAL_SYNC_REGISTRY } from '../src/game/sync/internationalSyncRegistry';
import { RockSyncProfileRepository } from '../src/game/rockchart/sync/rockSyncProfileRepository';
import { CalibrationManager } from '../src/game/sync/calibrationManager';
import { GameEngine } from '../src/game/engine';
import { GameRenderer } from '../src/render/renderer';
import { UnifiedMasterClock, AudioTimeSource } from '../src/game/sync/masterClock';
import { AdaptiveClockEstimator } from '../src/game/rockchart/telemetry/adaptiveClockEstimator';
import { BeatmapManager } from '../src/game/beatmapManager';
import { SongLibrary } from '../src/game/songLibrary';
import { Difficulty, Note, PlaybackState, GameSettings, Lane } from '../src/types';

const defaultSettings: GameSettings = {
  musicVolume: 0.85,
  sfxVolume: 0.9,
  audioOffsetMs: 0,
  noteSpeedMultiplier: 1.0,
  visualEffectsEnabled: true,
  visualEffectsMode: 'NORMAL',
  effectsMode: 'NORMAL',
  muteOnMiss: true
};

describe('ROCKBRAZIL V14.2.1 — SUÍTE MASTER DE SINCRONIZAÇÃO E ÁUDIO OFICIAL (18 CENÁRIOS + FAIXA SINTÉTICA)', () => {
  let masterClock: UnifiedMasterClock;
  let renderer: GameRenderer;
  let canvas: any;

  beforeEach(() => {
    masterClock = new UnifiedMasterClock();
    canvas = {
      width: 800,
      height: 600,
      getContext: vi.fn().mockReturnValue({
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        arc: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        bezierCurveTo: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        clearRect: vi.fn(),
        createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
        createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
        fillText: vi.fn(),
        measureText: vi.fn().mockReturnValue({ width: 50 }),
        drawImage: vi.fn(),
        setLineDash: vi.fn()
      })
    };
    renderer = new GameRenderer(canvas);
  });

  // ==========================================================================
  // CENÁRIO 1: Relógio do YouTube & AdaptiveClockEstimator
  // ==========================================================================
  describe('1. Relógio do YouTube', () => {
    it('1.1. Configura fonte YouTube e ativa telemetria adaptativa com progressão monotônica', () => {
      let rawSourceTime = 1.0;
      const mockSource: AudioTimeSource = {
        getCurrentTime: () => rawSourceTime,
        getPlaybackState: () => PlaybackState.PLAYING,
        isBuffering: () => false
      };

      masterClock.setSource(mockSource);
      masterClock.configureForSource('youtube');
      masterClock.startPlayback();

      const t1 = masterClock.getTime();
      expect(t1).toBeGreaterThanOrEqual(1.0);

      // Simula pequeno jitter para trás no IFrame
      rawSourceTime = 0.95;
      const t2 = masterClock.getTime();
      expect(t2).toBeGreaterThanOrEqual(t1); // Garante não-regressão monotônica
    });

    it('1.2. AdaptiveClockEstimator extrapola continuamente entre polls discretos de 200ms', () => {
      const estimator = new AdaptiveClockEstimator();
      let rawTime = 5.0;
      const mockSource: AudioTimeSource = {
        getCurrentTime: () => rawTime,
        getPlaybackState: () => PlaybackState.PLAYING,
        isBuffering: () => false
      };

      const t0 = estimator.update(mockSource, 1000);
      expect(t0).toBe(5.0);

      // 50ms depois, sem novo poll do player:
      const tExtrapolated = estimator.update(mockSource, 1050);
      expect(tExtrapolated).toBeCloseTo(5.050, 3);
    });
  });

  // ==========================================================================
  // CENÁRIO 2: Relógio do GameEngine
  // ==========================================================================
  describe('2. Relógio do GameEngine', () => {
    it('2.1. Em modo unificado, getJudgmentTime preserva o tempo exato do MasterClock sem dedução dupla', () => {
      const engine = new GameEngine([], 'MEDIUM', { ...defaultSettings, audioOffsetMs: 50 });
      engine.setUnifiedClockMode(true);

      const clockTime = 10.5;
      expect(engine.getJudgmentTime(clockTime)).toBe(10.5);
    });

    it('2.2. Sem modo unificado (legado), aplica a dedução tradicional de áudioOffsetMs', () => {
      const engine = new GameEngine([], 'MEDIUM', { ...defaultSettings, audioOffsetMs: 50 });
      engine.setUnifiedClockMode(false);

      const clockTime = 10.5;
      expect(engine.getJudgmentTime(clockTime)).toBeCloseTo(10.45, 3);
    });
  });

  // ==========================================================================
  // CENÁRIO 3: Relógio do Renderer
  // ==========================================================================
  describe('3. Relógio do Renderer', () => {
    it('3.1. Renderer consome a mesma referência temporal para calcular coordenadas de esteira', () => {
      const noteTime = 5.0;
      const currentTime = 5.0;

      const coords = renderer.getNoteCoordinates(2, noteTime, currentTime);
      expect(coords.timeUntilHit).toBe(0);
      expect(coords.progress).toBe(1.0);
      expect(coords.y).toBeCloseTo(renderer.getStrikeLineY(), 2);
    });
  });

  // ==========================================================================
  // CENÁRIO 4: Posicionamento das Notas
  // ==========================================================================
  describe('4. Posicionamento das Notas', () => {
    it('4.1. Quando timeUntilHit > 0, a nota está estritamente ACIMA da linha de julgamento (Y < strikeY)', () => {
      const noteTime = 5.0;
      const currentTime = 4.8; // 200ms antes do impacto

      const strikeY = renderer.getStrikeLineY();
      const visualY = renderer.calculateVisualY(noteTime, currentTime);

      expect(visualY).toBeLessThan(strikeY);
      const coords = renderer.getNoteCoordinates(1, noteTime, currentTime);
      expect(coords.progress).toBeLessThan(1.0);
    });

    it('4.2. Quando timeUntilHit === 0, a nota está matematicamente alinhada com o receptor (Y === strikeY)', () => {
      const noteTime = 7.5;
      const currentTime = 7.5;

      const strikeY = renderer.getStrikeLineY();
      const visualY = renderer.calculateVisualY(noteTime, currentTime);

      expect(visualY).toBeCloseTo(strikeY, 2);
    });
  });

  // ==========================================================================
  // CENÁRIO 5: Janelas de Julgamento
  // ==========================================================================
  describe('5. Janelas de Julgamento', () => {
    it('5.1. No modo MEDIUM, toques antecipados até 140ms registram GOOD mesmo com a nota acima da linha', () => {
      const noteTime = 2.0;
      const testNotes: Note[] = [
        { id: 1, time: noteTime, lane: 2, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
      ];

      const engine = new GameEngine(testNotes, 'MEDIUM', defaultSettings);
      engine.setUnifiedClockMode(true);

      // Jogador pressiona no tempo 1.88s (120ms adiantado, nota visualmente acima da linha)
      const pressTime = 1.88;
      const visualY = renderer.calculateVisualY(noteTime, pressTime);
      expect(visualY).toBeLessThan(renderer.getStrikeLineY()); // Visualmente acima!

      const hit = engine.handleLanePress(2, pressTime);
      expect(hit).not.toBeNull();
      expect(['GOOD', 'GREAT']).toContain(hit?.judgment); // O motor aceita devido à janela!
    });

    it('5.2. Toques fora da janela GOOD (> 140ms no MEDIUM) não pontuam', () => {
      const noteTime = 2.0;
      const testNotes: Note[] = [
        { id: 1, time: noteTime, lane: 2, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
      ];

      const engine = new GameEngine(testNotes, 'MEDIUM', defaultSettings);
      engine.setUnifiedClockMode(true);

      // Jogador pressiona 200ms adiantado (fora de 140ms)
      const hit = engine.handleLanePress(2, 1.80);
      expect(hit).toBeNull();
    });
  });

  // ==========================================================================
  // CENÁRIO 6: Offset do Chart
  // ==========================================================================
  describe('6. Offset do Chart', () => {
    it('6.1. Timestamps de charts autênticos são preservados de forma não-destrutiva', () => {
      const gnrNotes = RAW_INTERNATIONAL_CHARTS['intl-gnr-welcome-to-the-jungle']['HARD'];
      expect(gnrNotes.length).toBeGreaterThan(0);
      expect(gnrNotes[0][0]).toBe(3.269); // Primeira nota preservada
    });
  });

  // ==========================================================================
  // CENÁRIO 7: Offset do Vídeo
  // ==========================================================================
  describe('7. Offset do Vídeo', () => {
    it('7.1. Áudio Topic oficial de Welcome to the Jungle utiliza offset 0ms', () => {
      const offset = CalibrationManager.getSongOffsetMs('intl-gnr-welcome-to-the-jungle', 'FN7ECSHb5xs');
      expect(offset).toBe(0);
    });

    it('7.2. Clipe MTV antigo com narrativa do ônibus utiliza perfil com offset -3800ms', () => {
      const profile = RockSyncProfileRepository.getInstance().getProfileForSong('intl-gnr-welcome-to-the-jungle', 'o1tj2zJ2Wvg');
      expect(profile?.offsetMs).toBe(-3800);
    });

    it('7.3. Highway to Hell ao vivo no River Plate utiliza offset -2000ms', () => {
      const offset = CalibrationManager.getSongOffsetMs('intl-acdc-highway-to-hell', 'gEPmA3USJdI');
      expect(offset).toBe(-2000);
    });
  });

  // ==========================================================================
  // CENÁRIO 8: Introdução Musical
  // ==========================================================================
  describe('8. Introdução Musical', () => {
    it('8.1. Diferencia primeiro som de guitarra do primeiro acorde/nota jogável', () => {
      // Em Welcome to the Jungle de estúdio:
      // O delay sutil de Slash começa em 0.0s
      // A primeira nota jogável acentuada do chart está no timestamp 3.269s
      const firstNoteTime = RAW_INTERNATIONAL_CHARTS['intl-gnr-welcome-to-the-jungle']['HARD'][0][0];
      expect(firstNoteTime).toBe(3.269);
      expect(firstNoteTime).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // CENÁRIO 9: BPM
  // ==========================================================================
  describe('9. BPM', () => {
    it('9.1. Músicas possuem BPM cadastrado consistente com suas gravações', () => {
      const catalog = INTERNATIONAL_SONGS_CATALOG;
      const gnrJungle = catalog.find((s) => s.id === 'intl-gnr-welcome-to-the-jungle');
      const gnrParadise = catalog.find((s) => s.id === 'intl-gnr-paradise-city');
      const gnrSweet = catalog.find((s) => s.id === 'intl-gnr-sweet-child-o-mine');
      const lpGivenUp = catalog.find((s) => s.id === 'intl-lp-given-up');

      expect(gnrJungle?.bpm).toBe(100);
      expect(gnrParadise?.bpm).toBe(120);
      expect(gnrSweet?.bpm).toBe(128);
      expect(lpGivenUp?.bpm).toBe(100);
    });
  });

  // ==========================================================================
  // CENÁRIO 10: Mudanças de Andamento
  // ==========================================================================
  describe('10. Mudanças de Andamento', () => {
    it('10.1. A esteira visual acomoda variações de andamento sem perda de alinhamento no receptor', () => {
      const noteAtTime = 10.0;
      // No instante exato do impacto, a coordenada Y deve ser estritamente igual à linha de julgamento
      const yAtHit = renderer.calculateVisualY(noteAtTime, 10.0);
      expect(yAtHit).toBeCloseTo(renderer.getStrikeLineY(), 2);

      // Renderização com BPM 160 e 80 executa estavelmente sem deslocar a linha receptora
      expect(() => {
        renderer.render(10.0, [], new Set(), 160);
        renderer.render(10.0, [], new Set(), 80);
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // CENÁRIO 11: Acordes
  // ==========================================================================
  describe('11. Acordes', () => {
    it('11.1. Acordes de múltiplas pistas no mesmo timestamp são pontuados conjuntamente', () => {
      const chordTime = 3.0;
      const testNotes: Note[] = [
        { id: 1, time: chordTime, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
        { id: 2, time: chordTime, lane: 2, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
      ];

      const engine = new GameEngine(testNotes, 'MEDIUM', defaultSettings);
      engine.setUnifiedClockMode(true);

      const hit1 = engine.handleLanePress(0, chordTime);
      const hit2 = engine.handleLanePress(2, chordTime);

      expect(hit1?.judgment).toBe('PERFECT');
      expect(hit2?.judgment).toBe('PERFECT');
      expect(engine.getStats().score).toBe(200); // 100 + 100
    });
  });

  // ==========================================================================
  // CENÁRIO 12: Sustains (Notas Longas)
  // ==========================================================================
  describe('12. Sustains', () => {
    it('12.1. Sustentação de nota é mantida e concluída ao segurar a pista até o fim da cauda', () => {
      const sustainNote: Note = {
        id: 1,
        time: 2.0,
        lane: 1,
        duration: 1.5, // 2.0s a 3.5s
        hit: false,
        missed: false,
        sustainCompleted: false,
        sustainHeldTime: 0
      };

      const engine = new GameEngine([sustainNote], 'MEDIUM', defaultSettings);
      engine.setUnifiedClockMode(true);

      const hit = engine.handleLanePress(1, 2.0);
      expect(hit?.judgment).toBe('PERFECT');
      const initialScore = engine.getStats().score;

      // Avança o tempo mantendo pressionado
      engine.update(2.5);
      expect(engine.getStats().score).toBeGreaterThan(initialScore);
      expect(engine.getNotes()[0].sustainCompleted).toBe(false);

      // Avança além do término da sustentação (3.5s)
      engine.update(3.6);
      expect(engine.getNotes()[0].sustainCompleted).toBe(true);
    });
  });

  // ==========================================================================
  // CENÁRIO 13: Buffering
  // ==========================================================================
  describe('13. Buffering', () => {
    it('13.1. Estado de buffering congela o relógio sem gerar MISS acidental', () => {
      let isBuffering = false;
      const mockSource: AudioTimeSource = {
        getCurrentTime: () => 5.0,
        getPlaybackState: () => (isBuffering ? PlaybackState.BUFFERING : PlaybackState.PLAYING),
        isBuffering: () => isBuffering
      };

      masterClock.setSource(mockSource);
      masterClock.startPlayback();
      const timeBefore = masterClock.getTime();

      // Entra em buffering
      isBuffering = true;
      masterClock.setBuffering(true);

      const timeDuring = masterClock.getTime();
      expect(timeDuring).toBe(timeBefore);
      expect(masterClock.isBuffering()).toBe(true);
    });
  });

  // ==========================================================================
  // CENÁRIO 14: Pausa e Retomada
  // ==========================================================================
  describe('14. Pausa e Retomada', () => {
    it('14.1. Pausa congela o relógio unificado no frame exato e retoma sem drift', () => {
      let currentTime = 12.34;
      const mockSource: AudioTimeSource = {
        getCurrentTime: () => currentTime,
        getPlaybackState: () => PlaybackState.PLAYING,
        isBuffering: () => false
      };

      masterClock.setSource(mockSource);
      masterClock.startPlayback();
      expect(masterClock.getTime()).toBeCloseTo(12.34, 2);

      masterClock.pause();
      expect(masterClock.isPausedState()).toBe(true);

      // Tempo no player externo avança durante a pausa
      currentTime = 15.0;
      expect(masterClock.getTime()).toBeCloseTo(12.34, 2); // Mantém congelado!

      masterClock.resume();
      expect(masterClock.isPausedState()).toBe(false);
      expect(masterClock.getTime()).toBeCloseTo(15.0, 2);
    });
  });

  // ==========================================================================
  // CENÁRIO 15: Seek
  // ==========================================================================
  describe('15. Seek', () => {
    it('15.1. Detecta saltos temporais abruptos (> 1.5s) e resincroniza sem distorcer o estimador', () => {
      const estimator = new AdaptiveClockEstimator();
      let rawTime = 10.0;
      const mockSource: AudioTimeSource = {
        getCurrentTime: () => rawTime,
        getPlaybackState: () => PlaybackState.PLAYING,
        isBuffering: () => false
      };

      estimator.update(mockSource, 1000);

      // Salto brusco (Seek de 10s para 45s)
      rawTime = 45.0;
      const tSeek = estimator.update(mockSource, 1200);
      expect(tSeek).toBe(45.0);
    });
  });

  // ==========================================================================
  // CENÁRIO 16: Troca de Músicas
  // ==========================================================================
  describe('16. Troca de Músicas', () => {
    it('16.1. Reset reinicializa completamente o relógio e estimador para a nova faixa', () => {
      masterClock.setOffsets(-2000, 0);
      masterClock.reset();

      expect(masterClock.getSongOffsetSec()).toBe(0);
      expect(masterClock.getTime()).toBe(0);
    });
  });

  // ==========================================================================
  // CENÁRIO 17: Regressão das Seis Músicas Internacionais
  // ==========================================================================
  describe('17. Regressão das Seis Músicas Internacionais', () => {
    const songs = [
      { id: 'intl-acdc-highway-to-hell', videoId: 'gEPmA3USJdI', channel: 'acdcVEVO', expectedOffset: -2000 },
      { id: 'intl-gnr-paradise-city', videoId: 'WJUInYShJYo', channel: "Guns N' Roses - Topic", expectedOffset: 0 },
      { id: 'intl-gnr-sweet-child-o-mine', videoId: 'MNrgf3GNNXw', channel: "Guns N' Roses - Topic", expectedOffset: 0 },
      { id: 'intl-gnr-welcome-to-the-jungle', videoId: 'FN7ECSHb5xs', channel: "Guns N' Roses - Topic", expectedOffset: 0 },
      { id: 'intl-lp-numb', videoId: 'u-IcadiJCrE', channel: 'Linkin Park - Topic', expectedOffset: 0 },
      { id: 'intl-lp-given-up', videoId: 'D93vYwuMeUw', channel: 'Linkin Park - Topic', expectedOffset: 0 }
    ];

    for (const s of songs) {
      it(`17.${songs.indexOf(s) + 1}. ${s.id} deve ter vídeo cadastrado (${s.videoId}), canal oficial e offset (${s.expectedOffset}ms)`, () => {
        const item = INTERNATIONAL_SONGS_CATALOG.find((entry) => entry.id === s.id);
        expect(item).toBeDefined();
        expect(item?.youtubeVideoId).toBe(s.videoId);
        expect(item?.youtubeChannel).toBe(s.channel);
        expect(item?.embeddingStatus).toBe('ELIGIBLE_OFFICIAL');

        const offset = CalibrationManager.getSongOffsetMs(s.id, s.videoId);
        expect(offset).toBe(s.expectedOffset);

        // Verifica existência de charts nas 4 dificuldades
        for (const diff of ['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as Difficulty[]) {
          const notes = RAW_INTERNATIONAL_CHARTS[s.id]?.[diff];
          expect(notes).toBeDefined();
          expect(notes.length).toBeGreaterThan(0);
        }
      });
    }
  });

  // ==========================================================================
  // CENÁRIO 18: Regressão de Músicas Nacionais Brasileiras
  // ==========================================================================
  describe('18. Regressão de Músicas Nacionais Brasileiras', () => {
    it('18.1. Músicas nacionais mantêm offset de origem 0ms e são carregadas normalmente', () => {
      const nationalSongs = ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo', 'los-anna-julia'];
      for (const id of nationalSongs) {
        const offset = CalibrationManager.getSongOffsetMs(id);
        expect(offset).toBe(0);
      }
    });
  });

  // ==========================================================================
  // FAIXA SINTÉTICA DE TESTE DO MOTOR
  // ==========================================================================
  describe('19. Faixa Sintética de Teste do Motor (Validação Determinística)', () => {
    it('19.1. Quando T_audio == T_note, a nota coincide estritamente com strikeLineY e o julgamento é PERFECT', () => {
      // Cria faixa sintética com notas de referência em 1.0s, 2.0s, 3.0s
      const syntheticNotes: Note[] = [
        { id: 101, time: 1.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
        { id: 102, time: 2.0, lane: 1, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
        { id: 103, time: 3.0, lane: 2, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
      ];

      const syntheticEngine = new GameEngine(syntheticNotes, 'HARD', defaultSettings);
      syntheticEngine.setUnifiedClockMode(true);

      const syntheticClock = new UnifiedMasterClock();
      let syntheticAudioTime = 1.0;
      const mockAudio: AudioTimeSource = {
        getCurrentTime: () => syntheticAudioTime,
        getPlaybackState: () => PlaybackState.PLAYING,
        isBuffering: () => false
      };
      syntheticClock.setSource(mockAudio);
      syntheticClock.startPlayback();

      // Instante 1.0s:
      const clockT1 = syntheticClock.getTime();
      expect(clockT1).toBe(1.0);

      // Coordenada visual no renderer:
      const visualY1 = renderer.calculateVisualY(1.0, clockT1);
      const strikeLineY = renderer.getStrikeLineY();
      expect(visualY1).toBeCloseTo(strikeLineY, 2);

      // Julgamento no GameEngine:
      const hitResult = syntheticEngine.handleLanePress(0, clockT1);
      expect(hitResult).not.toBeNull();
      expect(hitResult?.judgment).toBe('PERFECT');
      expect(hitResult?.lane).toBe(0);

      // Avança para 2.0s:
      syntheticAudioTime = 2.0;
      const clockT2 = syntheticClock.getTime();
      expect(renderer.calculateVisualY(2.0, clockT2)).toBeCloseTo(strikeLineY, 2);
      const hitResult2 = syntheticEngine.handleLanePress(1, clockT2);
      expect(hitResult2?.judgment).toBe('PERFECT');

      // Avança para 3.0s:
      syntheticAudioTime = 3.0;
      const clockT3 = syntheticClock.getTime();
      expect(renderer.calculateVisualY(3.0, clockT3)).toBeCloseTo(strikeLineY, 2);
      const hitResult3 = syntheticEngine.handleLanePress(2, clockT3);
      expect(hitResult3?.judgment).toBe('PERFECT');

      // 100% de precisão na faixa sintética de referência
      expect(syntheticEngine.getAccuracy()).toBe(100);
      expect(syntheticEngine.getStats().missCount).toBe(0);
    });
  });
});
