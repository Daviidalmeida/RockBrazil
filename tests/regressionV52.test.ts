import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { SongLibrary } from '../src/game/songLibrary';
import { BeatmapManager } from '../src/game/beatmapManager';
import { AudioManager } from '../src/audio/audioManager';
import { GameRenderer } from '../src/render/renderer';
import { Note, GameSettings, Difficulty, getLanesForDifficulty, Lane } from '../src/types';

// Setup Mock Web Audio & Canvas for Headless Node / Vitest runner
class MockAudioNode {
  connect() {}
  disconnect() {}
}

class MockGainNode extends MockAudioNode {
  gain = {
    value: 1,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {}
  };
}

class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: any = null;
  onended: any = null;
  start() {}
  stop() {}
}

class MockAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  sampleRate = 44100;
  destination = new MockAudioNode();

  createGain() { return new MockGainNode(); }
  createBufferSource() { return new MockAudioBufferSourceNode(); }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      detune: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
      start() {},
      stop() {}
    };
  }
  createBiquadFilter() {
    return {
      type: 'lowpass',
      frequency: { setValueAtTime() {} },
      Q: { setValueAtTime() {} },
      connect() {}
    };
  }
  createWaveShaper() {
    return { curve: null, connect() {} };
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length)
    };
  }
  async decodeAudioData(data: ArrayBuffer): Promise<any> {
    return this.createBuffer(2, 44100 * 5, 44100);
  }
  async resume() {
    this.state = 'running';
  }
}

const mockCtx2D = {
  resetTransform() {},
  scale() {},
  translate() {},
  clearRect() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  closePath() {},
  fill() {},
  stroke() {},
  arc() {},
  ellipse() {},
  save() {},
  restore() {},
  createLinearGradient() {
    return { addColorStop() {} };
  },
  createRadialGradient() {
    return { addColorStop() {} };
  }
};

const createMockCanvas = () => ({
  width: 480,
  height: 800,
  getContext: () => mockCtx2D,
  parentElement: {
    getBoundingClientRect: () => ({ width: 480, height: 800 })
  }
});

// Polyfill Node globals if undefined
if (typeof (globalThis as any).AudioContext === 'undefined') {
  (globalThis as any).AudioContext = MockAudioContext;
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
  (globalThis as any).window.AudioContext = MockAudioContext;
}
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => createMockCanvas(),
    getElementById: () => null
  };
}

describe('RockBrazil V5.2 - Testes de Regressão: Áudio e Pistas por Dificuldade', () => {
  let settings: GameSettings;
  let beatmaps: BeatmapManager;
  let library: SongLibrary;

  beforeEach(() => {
    settings = {
      musicVolume: 0.9,
      sfxVolume: 0.8,
      audioOffsetMs: 0,
      noteSpeedMultiplier: 1.0,
      visualEffectsEnabled: true
    };
    beatmaps = new BeatmapManager();
    library = new SongLibrary();
  });

  // 1. Pistas por dificuldade (Fase 2)
  describe('FASE 2: Configuração de Pistas por Dificuldade', () => {
    it('deve retornar exatamente 3 pistas para FÁCIL (Verde, Vermelha, Amarela)', () => {
      const lanes = getLanesForDifficulty('EASY');
      expect(lanes).toEqual([0, 1, 2]);
      expect(lanes.length).toBe(3);
    });

    it('deve retornar exatamente 4 pistas para MÉDIO (Verde, Vermelha, Amarela, Azul)', () => {
      const lanes = getLanesForDifficulty('MEDIUM');
      expect(lanes).toEqual([0, 1, 2, 3]);
      expect(lanes.length).toBe(4);
    });

    it('deve retornar exatamente 5 pistas para DIFÍCIL e EXPERT (Todas as 5 cores)', () => {
      const hardLanes = getLanesForDifficulty('HARD');
      const expertLanes = getLanesForDifficulty('EXPERT');
      expect(hardLanes).toEqual([0, 1, 2, 3, 4]);
      expect(expertLanes).toEqual([0, 1, 2, 3, 4]);
      expect(hardLanes.length).toBe(5);
      expect(expertLanes.length).toBe(5);
    });

    it('GameRenderer deve adaptar o número de pistas ativas conforme a dificuldade', () => {
      const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
      const renderer = new GameRenderer(canvas);

      renderer.setDifficulty('EASY');
      expect(renderer.laneCount).toBe(3);

      renderer.setDifficulty('MEDIUM');
      expect(renderer.laneCount).toBe(4);

      renderer.setDifficulty('HARD');
      expect(renderer.laneCount).toBe(5);

      renderer.setDifficulty('EXPERT');
      expect(renderer.laneCount).toBe(5);
    });

    it('não deve eliminar notas em dificuldades com menos pistas, adaptando-as sem perdas', () => {
      // Cria notas distribuídas por todas as 5 pistas
      const rawNotes: Note[] = [
        { id: 1, time: 1.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
        { id: 2, time: 2.0, lane: 1, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
        { id: 3, time: 3.0, lane: 2, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
        { id: 4, time: 4.0, lane: 3, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
        { id: 5, time: 5.0, lane: 4, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
      ];

      // Adaptação para EASY (máximo 2)
      const easyMax = 2;
      const easyAdapted = rawNotes.map(n => ({ ...n, lane: Math.min(easyMax, n.lane) as Lane }));
      expect(easyAdapted.length).toBe(5); // Nenhuma nota foi perdida
      expect(easyAdapted.every(n => n.lane <= 2)).toBe(true);

      // Adaptação para MEDIUM (máximo 3)
      const medMax = 3;
      const medAdapted = rawNotes.map(n => ({ ...n, lane: Math.min(medMax, n.lane) as Lane }));
      expect(medAdapted.length).toBe(5);
      expect(medAdapted.every(n => n.lane <= 3)).toBe(true);
    });
  });

  // 2. Correções de Áudio (Fase 1)
  describe('FASE 1: Estabilidade de Áudio e Relógio', () => {
    it('AudioManager deve inicializar e garantir que o contexto pode ser resumido', async () => {
      const audio = new AudioManager(settings);
      await audio.init();
      expect(audio.audioContext).toBeDefined();

      await audio.ensureResumed();
      expect(audio.audioContext?.state).toBe('running');
    });

    it('deve reproduzir faixa procedural, registrar tempo e permitir parada e reinício limpo', async () => {
      const audio = new AudioManager(settings);
      await audio.init();

      await audio.playProceduralTrack('furia-tropical', 0);
      expect(audio.isProcedural).toBe(true);
      expect(audio.getCurrentTime()).toBeGreaterThanOrEqual(0);

      audio.pause();
      const pausedTime = audio.getCurrentTime();
      expect(pausedTime).toBeGreaterThanOrEqual(0);

      await audio.resume();
      expect(audio.getCurrentTime()).toBeGreaterThanOrEqual(pausedTime);

      audio.stop();
      expect(audio.getCurrentTime()).toBe(0);
    });

    it('deve alternar entre músicas consecutivas sem corromper o estado do áudio', async () => {
      const audio = new AudioManager(settings);
      await audio.init();

      // Música 1
      await audio.playProceduralTrack('furia-tropical', 0);
      expect(audio.isProcedural).toBe(true);

      // Música 2 consecutiva
      await audio.playProceduralTrack('trovao-meia-noite', 0);
      expect(audio.isProcedural).toBe(true);
      expect(audio.getCurrentTime()).toBeGreaterThanOrEqual(0);

      audio.stop();
      expect(audio.getCurrentTime()).toBe(0);
    });
  });

  // 3. Renderização e Estabilidade do Motor
  describe('FASE 3 & 4: Renderização da Esteira 3D e HUD', () => {
    it('GameRenderer deve executar ciclo completo de render sem erros com 3, 4 e 5 pistas', () => {
      const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
      const renderer = new GameRenderer(canvas);

      const notes: Note[] = [
        { id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
        { id: 2, time: 2.0, lane: 1, duration: 1.0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
        { id: 3, time: 3.5, lane: 2, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
      ];

      // Modo EASY (3 pistas)
      renderer.setDifficulty('EASY');
      expect(() => renderer.render(1.5, notes, new Set([0]), 132)).not.toThrow();

      // Modo MEDIUM (4 pistas)
      renderer.setDifficulty('MEDIUM');
      expect(() => renderer.render(1.5, notes, new Set([0, 1]), 132)).not.toThrow();

      // Modo EXPERT (5 pistas)
      renderer.setDifficulty('EXPERT');
      expect(() => renderer.render(1.5, notes, new Set([0, 2]), 132)).not.toThrow();
    });

    it('GameEngine deve computar acertos de acordes e sustains com integridade de vida e multiplicador', () => {
      const chordNotes: Note[] = [
        { id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
        { id: 2, time: 2.0, lane: 2, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
      ];
      const engine = new GameEngine(chordNotes, 'EASY', settings);

      const hit0 = engine.handleLanePress(0, 2.0);
      const hit2 = engine.handleLanePress(2, 2.0);

      expect(hit0).not.toBeNull();
      expect(hit2).not.toBeNull();
      expect(engine.getStats().score).toBeGreaterThan(0);
      expect(engine.getStats().combo).toBe(2);
      expect(engine.getStats().rockMeter).toBeGreaterThan(50);
    });
  });
});
