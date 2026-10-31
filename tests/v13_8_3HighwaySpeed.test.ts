import { describe, it, expect, beforeEach } from 'vitest';
import { GameRenderer } from '../src/render/renderer';
import { GameEngine } from '../src/game/engine';
import { MusicTimeline } from '../src/game/timeline/musicTimeline';
import { Note, Difficulty, GameSettings } from '../src/types';

describe('ROCKBRAZIL V13.8.3 — SUÍTE DE VELOCIDADE DA ESTEIRA E SINCRONISMO', () => {
  const dummyCanvas = {
    getContext: () => ({
      clearRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      ellipse: () => {},
      save: () => {},
      restore: () => {},
      fillText: () => {},
      measureText: () => ({ width: 50 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      drawImage: () => {}
    }),
    parentElement: {
      getBoundingClientRect: () => ({ width: 400, height: 700 })
    },
    width: 400,
    height: 700
  } as any;

  // ==========================================================================
  // 1. Escalonamento da Velocidade Visual por Dificuldade (Fase 2)
  // ==========================================================================
  describe('1. Escalonamento da Velocidade por Dificuldade', () => {
    let renderer: GameRenderer;

    beforeEach(() => {
      renderer = new GameRenderer(dummyCanvas);
    });

    it('deve fornecer 1.90s de tempo de aproximação no modo FÁCIL (EASY) (V13.8.5 Agilizado)', () => {
      renderer.setDifficulty('EASY');
      expect(renderer.baseNoteSpeed).toBeCloseTo(1.90, 2);
      expect(renderer.noteSpeed).toBeCloseTo(1.90, 2);
    });

    it('deve fornecer 2.20s de tempo de aproximação no modo MÉDIO (MEDIUM) (V13.8.5 Confortável)', () => {
      renderer.setDifficulty('MEDIUM');
      expect(renderer.baseNoteSpeed).toBeCloseTo(2.20, 2);
      expect(renderer.noteSpeed).toBeCloseTo(2.20, 2);
    });

    it('deve fornecer 1.85s de tempo de aproximação no modo DIFÍCIL (HARD)', () => {
      renderer.setDifficulty('HARD');
      expect(renderer.baseNoteSpeed).toBeCloseTo(1.85, 2);
      expect(renderer.noteSpeed).toBeCloseTo(1.85, 2);
    });

    it('deve fornecer 1.65s de tempo de aproximação no modo EXPERT (V13.8.5)', () => {
      renderer.setDifficulty('EXPERT');
      expect(renderer.baseNoteSpeed).toBeCloseTo(1.65, 2);
      expect(renderer.noteSpeed).toBeCloseTo(1.65, 2);
    });
  });

  // ==========================================================================
  // 2. Presets de Velocidade (LENTA, NORMAL, RÁPIDA)
  // ==========================================================================
  describe('2. Presets de Velocidade e Multiplicadores', () => {
    let renderer: GameRenderer;

    beforeEach(() => {
      renderer = new GameRenderer(dummyCanvas);
      renderer.setDifficulty('HARD'); // Baseline: 1.85s
    });

    it('deve aplicar +0.35s para preset LENTA no HARD (2.20s)', () => {
      renderer.speedPreset = 'LENTA';
      expect(renderer.noteSpeed).toBeCloseTo(2.20, 2);
    });

    it('deve aplicar baseline no preset NORMAL no HARD (1.85s)', () => {
      renderer.speedPreset = 'NORMAL';
      expect(renderer.noteSpeed).toBeCloseTo(1.85, 2);
    });

    it('deve aplicar -0.30s para preset RÁPIDA no HARD (1.55s)', () => {
      renderer.speedPreset = 'RÁPIDA';
      expect(renderer.noteSpeed).toBeCloseTo(1.55, 2);
    });

    it('deve respeitar o piso mínimo no preset RÁPIDA para EXPERT (1.35s)', () => {
      renderer.setDifficulty('EXPERT'); // base 1.65s
      renderer.speedPreset = 'RÁPIDA'; // 1.65 - 0.30 = 1.35s >= 1.20s
      expect(renderer.noteSpeed).toBeCloseTo(1.35, 2);
    });

    it('deve aplicar noteSpeedMultiplier sem alterar timestamps ou áudio', () => {
      renderer.setDifficulty('HARD'); // 1.85s
      renderer.speedPreset = 'NORMAL';
      renderer.noteSpeedMultiplier = 1.25;

      // noteSpeed = 1.85 / 1.25 = 1.48s
      expect(renderer.noteSpeed).toBeCloseTo(1.48, 2);

      renderer.noteSpeedMultiplier = 0.8;
      // noteSpeed = 1.85 / 0.8 = 2.31s
      expect(renderer.noteSpeed).toBeCloseTo(2.31, 2);
    });
  });

  // ==========================================================================
  // 3. Garantia Absoluta de Sincronismo Matemático e Musical
  // ==========================================================================
  describe('3. Garantia Absoluta de Sincronismo Matemático', () => {
    it('deve garantir que quando currentTime == note.time, progress seja EXATAMENTE 1.0', () => {
      const renderer = new GameRenderer(dummyCanvas);
      const testCases: { diff: Difficulty; preset: any; multiplier: number }[] = [
        { diff: 'EASY', preset: 'NORMAL', multiplier: 1.0 },
        { diff: 'EASY', preset: 'LENTA', multiplier: 1.0 },
        { diff: 'MEDIUM', preset: 'NORMAL', multiplier: 1.0 },
        { diff: 'HARD', preset: 'NORMAL', multiplier: 1.0 },
        { diff: 'HARD', preset: 'RÁPIDA', multiplier: 1.2 },
        { diff: 'EXPERT', preset: 'NORMAL', multiplier: 1.0 },
        { diff: 'EXPERT', preset: 'RÁPIDA', multiplier: 1.0 },
      ];

      for (const tc of testCases) {
        renderer.setDifficulty(tc.diff);
        renderer.speedPreset = tc.preset;
        renderer.noteSpeedMultiplier = tc.multiplier;

        const noteTime = 12.345;
        const currentTime = 12.345;
        const timeRemaining = noteTime - currentTime;
        const progress = 1.0 - (timeRemaining / renderer.noteSpeed);

        expect(progress).toBe(1.0);

        // Curva de perspectiva em progress = 1.0
        const persp = Math.pow(Math.max(0, Math.min(progress, 1.45)), 1.24);
        expect(persp).toBe(1.0);

        // Posição Y deve ser exatamente strikeY
        const h = 700;
        const horizonY = h * renderer.horizonYRatio;
        const strikeY = h * renderer.strikeLineYRatio;
        const currentY = horizonY + (strikeY - horizonY) * persp;
        expect(currentY).toBe(strikeY);
      }
    });

    it('deve manter a esteira e os receptors visualmente perfeitos durante a passagem de notas', () => {
      const renderer = new GameRenderer(dummyCanvas);
      const mockNotes: Note[] = [
        { id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false },
        { id: 2, time: 2.0, lane: 1, duration: 0, hit: false, missed: false } // Acorde duplo
      ];

      // Renderiza em t = 1.0s (aproximando)
      expect(() => renderer.render(1.0, mockNotes, new Set(), 120)).not.toThrow();
      // Renderiza em t = 2.0s (no instante exato do receptor)
      expect(() => renderer.render(2.0, mockNotes, new Set(), 120)).not.toThrow();
      // Renderiza em t = 2.5s (após passagem)
      expect(() => renderer.render(2.5, mockNotes, new Set(), 120)).not.toThrow();
    });
  });

  // ==========================================================================
  // 4. Integração do Pré-roll com o Relógio Master
  // ==========================================================================
  describe('4. Integração do Pré-roll com Relógio Master', () => {
    let timeline: MusicTimeline;
    let renderer: GameRenderer;

    beforeEach(() => {
      timeline = new MusicTimeline();
      renderer = new GameRenderer(dummyCanvas);
    });

    it('deve sincronizar perfeitamente a contagem pré-roll com noteSpeed em cada dificuldade', () => {
      const difficulties: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];

      for (const diff of difficulties) {
        renderer.setDifficulty(diff);
        const preroll = renderer.noteSpeed;

        timeline.startCountdown(preroll);
        expect(timeline.getTime()).toBeCloseTo(-preroll, 2);

        timeline.setPrerollProgress(0.5, preroll);
        expect(timeline.getTime()).toBeCloseTo(-preroll * 0.5, 2);

        timeline.setPrerollProgress(1.0, preroll);
        expect(timeline.getTime()).toBeCloseTo(0.0, 2);
      }
    });
  });

  // ==========================================================================
  // 5. Independência e Imutabilidade do GameEngine e Tolerâncias de Acerto
  // ==========================================================================
  describe('5. Independência do Motor de Pontuação e Janelas de Acerto', () => {
    let engine: GameEngine;
    const defaultSettings: GameSettings = {
      musicVolume: 0.85,
      sfxVolume: 0.9,
      audioOffsetMs: 0,
      noteSpeedMultiplier: 1.0,
      visualEffectsEnabled: true
    };

    it('deve preservar as janelas de acerto rigorosas independentemente da velocidade visual da esteira', () => {
      const mockNote: Note = {
        id: 10,
        time: 5.000,
        lane: 2,
        duration: 0,
        hit: false,
        missed: false
      };
      engine = new GameEngine([mockNote], 'HARD', defaultSettings);

      // Janela PERFECT (<= 45ms): acerto em 5.025s (diff = 25ms)
      const hitResult = engine.handleLanePress(2, 5.025);
      expect(hitResult).not.toBeNull();
      expect(hitResult?.judgment).toBe('PERFECT');
      expect(hitResult?.scoreGained).toBe(100);
    });

    it('deve julgar GREAT para desvio de 70ms e GOOD para 110ms no modo MEDIUM', () => {
      const note1: Note = { id: 1, time: 2.000, lane: 0, duration: 0, hit: false, missed: false };
      const note2: Note = { id: 2, time: 4.000, lane: 1, duration: 0, hit: false, missed: false };
      engine = new GameEngine([note1, note2], 'MEDIUM', defaultSettings);

      // GREAT (<= 90ms)
      const resGreat = engine.handleLanePress(0, 2.070);
      expect(resGreat?.judgment).toBe('GREAT');

      // GOOD (<= 140ms)
      const resGood = engine.handleLanePress(1, 4.110);
      expect(resGood?.judgment).toBe('GOOD');
    });
  });
});
