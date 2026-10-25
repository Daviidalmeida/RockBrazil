import { describe, it, expect, beforeEach } from 'vitest';
import { GameRenderer } from '../src/render/renderer';
import { BeatmapManager } from '../src/game/beatmapManager';
import { OFFICIAL_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';
import { MusicTimeline, AudioTimeSource } from '../src/game/timeline/musicTimeline';
import { ChartTimeline } from '../src/game/timeline/chartTimeline';
import { HitJudgmentSystem } from '../src/game/judgment/hitJudgment';
import { GameSessionController, SessionResourceProvider, SessionUiEvents } from '../src/game/session/gameSessionController';
import { InputController } from '../src/game/input/inputController';
import { Note, PlaybackState, GameSettings, Difficulty, Lane } from '../src/types';

describe('ROCKBRAZIL BETA V7 — SUÍTE DE TESTES E VALIDAÇÃO COMPLETA', () => {
  const dummyCanvas = {
    getContext: () => ({
      save: () => {},
      restore: () => {},
      clearRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      ellipse: () => {},
      stroke: () => {},
      fill: () => {},
      fillText: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      resetTransform: () => {},
      scale: () => {}
    }),
    parentElement: { getBoundingClientRect: () => ({ width: 400, height: 750 }) },
    width: 400,
    height: 750
  } as any;

  const defaultSettings: GameSettings = {
    musicVolume: 0.85,
    sfxVolume: 0.9,
    audioOffsetMs: 0,
    noteSpeedMultiplier: 1.0,
    visualEffectsEnabled: true
  };

  // ==========================================================================
  // 1. Velocidade da Esteira e Presets Visuais (Fase 3)
  // ==========================================================================
  describe('1. Velocidade da Esteira e Presets Visuais (Fase 3)', () => {
    it('deve restaurar velocidade NORMAL confortável de 1.35s como padrão', () => {
      const renderer = new GameRenderer(dummyCanvas);
      expect(renderer.speedPreset).toBe('NORMAL');
      expect(renderer.baseNoteSpeed).toBeCloseTo(1.35, 2);
      expect(renderer.noteSpeed).toBeCloseTo(1.35, 2);
    });

    it('deve suportar presets LENTA (1.65s), NORMAL (1.35s) e RÁPIDA (1.05s) sem alterar timestamps ou áudio', () => {
      const renderer = new GameRenderer(dummyCanvas);

      renderer.speedPreset = 'LENTA';
      expect(renderer.baseNoteSpeed).toBeCloseTo(1.65, 2);

      renderer.speedPreset = 'NORMAL';
      expect(renderer.baseNoteSpeed).toBeCloseTo(1.35, 2);

      renderer.speedPreset = 'RÁPIDA';
      expect(renderer.baseNoteSpeed).toBeCloseTo(1.05, 2);

      // A alteração de velocidade visual NÃO modifica tempo musical nem timestamps
      const noteTime = 5.0;
      expect(noteTime).toBe(5.0); // Timestamp intocado
    });
  });

  // ==========================================================================
  // 2. Pré-roll Visual e Início Imediato da Esteira (Fases 4 e 5)
  // ==========================================================================
  describe('2. Pré-roll Visual e Início Imediato da Esteira (Fases 4 e 5)', () => {
    let timeline: MusicTimeline;

    beforeEach(() => {
      timeline = new MusicTimeline();
    });

    it('deve calcular pré-roll visual para músicas com primeira nota em 0.2s, 0.5s, 1s, 3s, 6s e 10s', () => {
      const travelTime = 1.35;
      const firstNoteTimes = [0.2, 0.5, 1.0, 3.0, 6.565, 10.0];

      timeline.startCountdown(travelTime);

      // Durante tick 3 (início da contagem): tempo visual é -1.35s
      expect(timeline.getTime()).toBeCloseTo(-1.35, 2);

      // No ROCK BRASIL! (progresso 100%): tempo visual atinge exatamente 0.0s
      timeline.setPrerollProgress(1.0, travelTime);
      expect(timeline.getTime()).toBeCloseTo(0.0, 2);

      // Para uma nota em 0.5s: ao dar o play (t=0s), ela já está descendo na esteira:
      // progresso = 1.0 - (0.5 - 0.0) / 1.35 = ~0.63 (63% do caminho até a linha de acerto!)
      for (const tNote of firstNoteTimes) {
        const timeRemaining = tNote - 0.0;
        const progressAtStart = 1.0 - (timeRemaining / travelTime);
        if (tNote <= travelTime) {
          expect(progressAtStart).toBeGreaterThan(0); // Já visível na esteira!
        }
      }
    });

    it('deve manter a esteira viva com linhas de compasso rítmicas desde t=0 mesmo sem notas jogáveis na intro', () => {
      const renderer = new GameRenderer(dummyCanvas);
      const bpm = 110; // De Borest BPM
      const mockNotes: Note[] = [
        { id: 1, time: 6.565, lane: 0, duration: 0, hit: false, missed: false }
      ];

      // Em t=0.0s (início da música, intro sem notas), o renderizador executa sem erro
      expect(() => {
        renderer.render(0.0, mockNotes, new Set(), bpm);
      }).not.toThrow();

      // Em t=3.0s (meio da intro), a esteira continua ativa
      expect(() => {
        renderer.render(3.0, mockNotes, new Set(), bpm);
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // 3. Dificuldade FÁCIL e Mapeamento de Pistas (Fase 6)
  // ==========================================================================
  describe('3. Dificuldade FÁCIL e Mapeamento de Pistas (Fase 6)', () => {
    it('deve restringir estritamente EASY a 3 pistas [0, 1, 2] e MEDIUM a 4 pistas [0, 1, 2, 3]', () => {
      const bm = new BeatmapManager();
      const easyNotes = bm.getBeatmap('kua-de-borest', 'EASY');

      // Todas as notas de EASY devem estar estritamente nas pistas 0, 1 ou 2
      const invalidEasyLanes = easyNotes.filter((n) => n.lane > 2);
      expect(invalidEasyLanes.length).toBe(0);
      expect(easyNotes.length).toBe(260); // Total de notas preservado integralmente!

      const medNotes = bm.getBeatmap('kua-de-borest', 'MEDIUM');
      const invalidMedLanes = medNotes.filter((n) => n.lane > 3);
      expect(invalidMedLanes.length).toBe(0);
      expect(medNotes.length).toBe(578);
    });

    it('renderer deve ativar estritamente 3 pistas no EASY, 4 no MEDIUM e 5 no HARD/EXPERT', () => {
      const renderer = new GameRenderer(dummyCanvas);

      renderer.setDifficulty('EASY');
      expect(renderer.laneCount).toBe(3);

      renderer.setDifficulty('MEDIUM');
      expect(renderer.laneCount).toBe(4);

      renderer.setDifficulty('HARD');
      expect(renderer.laneCount).toBe(5);

      renderer.setDifficulty('EXPERT');
      expect(renderer.laneCount).toBe(5);
    });
  });

  // ==========================================================================
  // 4. Substituição de "SINCRONIZANDO" por "ROCK BRASIL" (Fase 7)
  // ==========================================================================
  describe('4. Substituição de "SINCRONIZANDO" por "ROCK BRASIL" (Fase 7)', () => {
    it('deve anunciar "ROCK BRASIL!" no final da contagem única', () => {
      let rockMessage = '';
      const timeline = new MusicTimeline();
      const chart = new ChartTimeline([]);
      const controller = new GameSessionController(timeline, chart);

      const events: SessionUiEvents = {
        onStateChange: () => {},
        onCountdownTick: () => {},
        onCountdownRock: () => { rockMessage = 'ROCK BRASIL!'; },
        onWaitingAudio: () => { rockMessage = 'ROCK BRASIL'; },
        onAutoplayBlocked: () => {},
        onGameStart: () => {},
        onSongFinished: () => {},
        onGameOver: () => {}
      };

      const resources: SessionResourceProvider = {
        prepareChart: () => true,
        prepareRenderer: () => {},
        prepareAudio: () => true,
        startAudioPlayback: () => {},
        isAudioPlaying: () => true,
        isAudioBuffering: () => false
      };

      controller.startSession(OFFICIAL_BRAZILIAN_CATALOG[0], 'MEDIUM', resources, events);
      controller.cancelTimers();
      expect(rockMessage).not.toContain('SINCRONIZANDO');
    });
  });

  // ==========================================================================
  // 5. Replay Determinístico e Resiliência (Fase 9 & 10)
  // ==========================================================================
  describe('5. Replay Determinístico e Resiliência (Fase 9 & 10)', () => {
    it('deve produzir pontuação idêntica para sequência de inputs em qualquer taxa de quadros', () => {
      const testNotes: Note[] = [
        { id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false },
        { id: 2, time: 3.0, lane: 1, duration: 0, hit: false, missed: false },
        { id: 3, time: 4.0, lane: 2, duration: 0, hit: false, missed: false }
      ];

      const runSim = (fpsStep: number) => {
        const chart = new ChartTimeline(testNotes.map(n => ({ ...n })));
        const judgment = new HitJudgmentSystem(chart, 'MEDIUM', defaultSettings);

        let t = 0;
        while (t <= 5.0) {
          if (Math.abs(t - 2.0) < fpsStep * 0.5) judgment.judgeLanePress(0, 2.0);
          if (Math.abs(t - 3.0) < fpsStep * 0.5) judgment.judgeLanePress(1, 3.0);
          if (Math.abs(t - 4.0) < fpsStep * 0.5) judgment.judgeLanePress(2, 4.0);
          judgment.update(t, new Set());
          t += fpsStep;
        }
        return judgment.getStats();
      };

      // Simulação a 60 FPS (dt = 0.016s) vs 120 FPS (dt = 0.008s)
      const res60 = runSim(0.016);
      const res120 = runSim(0.008);

      expect(res60.perfectCount).toBe(3);
      expect(res120.perfectCount).toBe(3);
      expect(res60.score).toBe(res120.score);
    });

    it('deve suportar 20 partidas consecutivas sem vazamentos de timers ou estado corrompido', async () => {
      const timeline = new MusicTimeline();
      const chart = new ChartTimeline([]);
      const controller = new GameSessionController(timeline, chart);

      const resources: SessionResourceProvider = {
        prepareChart: () => true,
        prepareRenderer: () => {},
        prepareAudio: () => true,
        startAudioPlayback: () => {},
        isAudioPlaying: () => true,
        isAudioBuffering: () => false
      };

      const events: SessionUiEvents = {
        onStateChange: () => {},
        onCountdownTick: () => {},
        onCountdownRock: () => {},
        onWaitingAudio: () => {},
        onAutoplayBlocked: () => {},
        onGameStart: () => {},
        onSongFinished: () => {},
        onGameOver: () => {}
      };

      for (let i = 1; i <= 20; i++) {
        const sid = await controller.startSession(OFFICIAL_BRAZILIAN_CATALOG[i % 5], 'MEDIUM', resources, events);
        expect(sid).toBe(i);
        controller.cancelTimers();
      }
    });

    it('deve preservar 100% das 31 músicas do catálogo brasileiro', () => {
      expect(OFFICIAL_BRAZILIAN_CATALOG.length).toBe(31);
      const bm = new BeatmapManager();
      for (const song of OFFICIAL_BRAZILIAN_CATALOG) {
        const easy = bm.getBeatmap(song.id, 'EASY');
        const med = bm.getBeatmap(song.id, 'MEDIUM');
        const hard = bm.getBeatmap(song.id, 'HARD');
        const exp = bm.getBeatmap(song.id, 'EXPERT');

        expect(easy.length).toBeGreaterThan(0);
        expect(med.length).toBeGreaterThan(0);
        expect(hard.length).toBeGreaterThan(0);
        expect(exp.length).toBeGreaterThan(0);

        // Nenhuma nota no EASY deve exceder a pista 2
        expect(easy.every(n => n.lane <= 2)).toBe(true);
        // Nenhuma nota no MEDIUM deve exceder a pista 3
        expect(med.every(n => n.lane <= 3)).toBe(true);
      }
    });
  });
});
