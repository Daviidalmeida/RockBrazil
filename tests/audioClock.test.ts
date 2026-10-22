import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { Note, GameSettings } from '../src/types';

describe('GameEngine - Sincronização e Julgamento de Notas', () => {
  let settings: GameSettings;

  beforeEach(() => {
    settings = {
      musicVolume: 1.0,
      sfxVolume: 1.0,
      audioOffsetMs: 0,
      noteSpeedMultiplier: 1.0,
      visualEffectsEnabled: true
    };
  });

  it('deve julgar PERFECT dentro da janela de precisão (< 45ms em MEDIUM)', () => {
    const notes: Note[] = [
      { id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];
    const engine = new GameEngine(notes, 'MEDIUM', settings);

    // Toque aos 2.02s (diff = 20ms <= 45ms)
    const result = engine.handleLanePress(0, 2.02);
    expect(result).not.toBeNull();
    expect(result?.judgment).toBe('PERFECT');
    expect(result?.scoreGained).toBe(100);
    expect(engine.getNotes()[0].hit).toBe(true);
  });

  it('deve julgar GREAT entre 45ms e 90ms em MEDIUM', () => {
    const notes: Note[] = [
      { id: 1, time: 2.0, lane: 1, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];
    const engine = new GameEngine(notes, 'MEDIUM', settings);

    // Toque aos 2.06s (diff = 60ms)
    const result = engine.handleLanePress(1, 2.06);
    expect(result).not.toBeNull();
    expect(result?.judgment).toBe('GREAT');
    expect(result?.scoreGained).toBe(75);
  });

  it('deve julgar GOOD entre 90ms e 140ms em MEDIUM', () => {
    const notes: Note[] = [
      { id: 1, time: 2.0, lane: 2, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];
    const engine = new GameEngine(notes, 'MEDIUM', settings);

    // Toque aos 2.11s (diff = 110ms)
    const result = engine.handleLanePress(2, 2.11);
    expect(result).not.toBeNull();
    expect(result?.judgment).toBe('GOOD');
    expect(result?.scoreGained).toBe(50);
  });

  it('deve marcar MISS automaticamente se a nota passar sem toque', () => {
    const notes: Note[] = [
      { id: 1, time: 1.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];
    let missedNote: Note | null = null;
    const engine = new GameEngine(notes, 'MEDIUM', settings);
    engine.onMiss = (_lane, n) => { missedNote = n; };

    // Tempo avança para 1.20s (> 1.0 + 0.14s)
    engine.update(1.20);
    expect(engine.getNotes()[0].missed).toBe(true);
    expect(engine.getNotes()[0].judgment).toBe('MISS');
    expect(missedNote).not.toBeNull();
    expect(engine.getStats().combo).toBe(0);
  });

  it('não deve permitir pontuação duplicada da mesma nota', () => {
    const notes: Note[] = [
      { id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];
    const engine = new GameEngine(notes, 'MEDIUM', settings);

    const hit1 = engine.handleLanePress(0, 2.0);
    expect(hit1).not.toBeNull();
    expect(engine.getStats().score).toBe(100);

    // Segundo toque imediato não deve re-pontuar a mesma nota
    const hit2 = engine.handleLanePress(0, 2.01);
    expect(hit2).toBeNull();
    expect(engine.getStats().score).toBe(100);
  });

  it('deve aplicar calibração de offset de áudio corretamente', () => {
    settings.audioOffsetMs = 50; // Som 50ms atrasado
    const notes: Note[] = [
      { id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];
    const engine = new GameEngine(notes, 'MEDIUM', settings);

    // Se o offset é +50ms, o tempo corrigido para um toque em 2.05s é 2.05 - 0.05 = 2.00s (PERFECT!)
    const result = engine.handleLanePress(0, 2.05);
    expect(result?.judgment).toBe('PERFECT');
  });

  it('deve encerrar a partida quando o medidor de vida atingir 0%', () => {
    const notes: Note[] = [
      { id: 1, time: 1.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
      { id: 2, time: 1.5, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
      { id: 3, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
      { id: 4, time: 2.5, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];
    let gameOverFired = false;
    const engine = new GameEngine(notes, 'EXPERT', settings); // Expert perde -15% por miss
    engine.onGameOver = () => { gameOverFired = true; };

    // Começa em 50%. 4 erros em Expert perdem 4 * 15 = 60% -> Vida chega a 0%
    engine.update(1.2);
    engine.update(1.7);
    engine.update(2.2);
    engine.update(2.7);

    expect(gameOverFired).toBe(true);
    expect(engine.getStats().rockMeter).toBe(0);
  });
});
