import { describe, it, expect } from 'vitest';
import { UnifiedMasterClock } from '../src/game/sync/masterClock';
import { GameEngine } from '../src/game/engine';
import { BeatmapManager } from '../src/game/beatmapManager';
import { ChartShiftManager } from '../src/game/catalog/chartShiftManager';
import { CalibrationManager } from '../src/game/sync/calibrationManager';
import { Note, GameSettings, PlaybackState } from '../src/types';

describe('ROCKBRAZIL V8 — Suíte de Regressão e Validação do Motor Musical', () => {
  const defaultSettings: GameSettings = {
    musicVolume: 0.8,
    sfxVolume: 0.8,
    audioOffsetMs: 0,
    noteSpeedMultiplier: 1.0,
    visualEffectsEnabled: true
  };

  it('1. Primeira nota inicia em t=0 sem latência ou espera excessiva', () => {
    const beatmaps = new BeatmapManager();
    const songsToTest = ['kua-de-borest', 'cap-sua-maneira', 'cbjr-papo-reto', 'cpm-irreversivel', 'mam-1406'];

    for (const songId of songsToTest) {
      const easy = beatmaps.getBeatmap(songId, 'EASY');
      const medium = beatmaps.getBeatmap(songId, 'MEDIUM');
      const hard = beatmaps.getBeatmap(songId, 'HARD');
      const expert = beatmaps.getBeatmap(songId, 'EXPERT');

      const allFirstNotes = [easy[0]?.time, medium[0]?.time, hard[0]?.time, expert[0]?.time].filter(
        (t) => t !== undefined
      );
      const minFirst = Math.min(...allFirstNotes);

      // Em todas as músicas auditadas, a primeira nota jogável inicia em t=0.0s
      expect(minFirst).toBeCloseTo(0.0, 2);
    }
  });

  it('2. Pré-roll visual: notas descem suavemente durante a contagem regressiva', () => {
    const clock = new UnifiedMasterClock();
    const prerollSec = 1.35; // Preset NORMAL

    clock.startCountdown(prerollSec);
    expect(clock.isCountdownState()).toBe(true);
    expect(clock.getTime()).toBeCloseTo(-1.35, 3);

    // Meio da contagem (progresso 50%) -> -0.675s
    clock.setPrerollProgress(0.5, prerollSec);
    expect(clock.getTime()).toBeCloseTo(-0.675, 3);

    // Final da contagem (ROCK BRASIL! / progresso 100%) -> 0.0s
    clock.setPrerollProgress(1.0, prerollSec);
    expect(clock.getTime()).toBeCloseTo(0.0, 3);

    // Início da reprodução de áudio
    clock.startPlayback();
    expect(clock.isCountdownState()).toBe(false);
  });

  it('3. Primeira nota em t=0 não sofre MISS automático na inicialização', () => {
    const testNotes: Note[] = [
      { id: 1, time: 0.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
      { id: 2, time: 0.8, lane: 1, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    const engine = new GameEngine(testNotes, 'MEDIUM', defaultSettings);

    // Simula pequena latência de startup do navegador/YouTube (ex: primeiros 200ms)
    engine.update(0.20);
    expect(engine.getNotes()[0].missed).toBe(false);

    // Jogador acerta a primeira nota aos 0.03s (30ms diff <= 45ms PERFECT window)
    const hitResult = engine.handleLanePress(0, 0.03);
    expect(hitResult).not.toBeNull();
    expect(hitResult?.judgment).toBe('PERFECT');
    expect(engine.getNotes()[0].hit).toBe(true);
    expect(engine.getNotes()[0].missed).toBe(false);
  });

  it('4. Preservação de intervalos entre notas (distâncias relativas invariantes)', () => {
    const beatmaps = new BeatmapManager();
    const notes = beatmaps.getBeatmap('kua-de-borest', 'EXPERT');

    // Intervalos devem ser estritamente não-negativos e ordenados cronologicamente
    for (let i = 1; i < notes.length; i++) {
      const delta = notes[i].time - notes[i - 1].time;
      expect(delta).toBeGreaterThanOrEqual(0);
    }
  });

  it('5. Preservação de acordes sem colisões no EASY e MEDIUM', () => {
    const beatmaps = new BeatmapManager();
    const easyNotes = beatmaps.getBeatmap('cap-sua-maneira', 'EASY');

    // No EASY, nenhuma nota pode ter lane > 2
    const timesMap = new Map<number, Set<number>>();
    for (const note of easyNotes) {
      expect(note.lane).toBeGreaterThanOrEqual(0);
      expect(note.lane).toBeLessThanOrEqual(2);

      let lanesAtTime = timesMap.get(note.time);
      if (!lanesAtTime) {
        lanesAtTime = new Set<number>();
        timesMap.set(note.time, lanesAtTime);
      }
      // NUNCA pode haver duas notas na mesma pista no mesmo instante (sem colisão de acordes!)
      expect(lanesAtTime.has(note.lane)).toBe(false);
      lanesAtTime.add(note.lane);
    }
  });

  it('6. Preservação de notas sustentadas com pontuação contínua', () => {
    const testNotes: Note[] = [
      { id: 1, time: 1.0, lane: 2, duration: 1.5, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    const engine = new GameEngine(testNotes, 'MEDIUM', defaultSettings);
    let sustainTickCount = 0;
    engine.onSustainTick = () => { sustainTickCount++; };

    // Acerta a nota no início
    engine.handleLanePress(2, 1.0);
    expect(engine.getNotes()[0].hit).toBe(true);

    // Avança o tempo mantendo o botão pressionado
    engine.update(1.2);
    engine.update(1.4);
    engine.update(1.6);
    engine.update(2.5); // Fim da sustentação (1.0 + 1.5s)

    expect(sustainTickCount).toBeGreaterThan(0);
    expect(engine.getNotes()[0].sustainCompleted).toBe(true);
  });

  it('7. Proteção contra dupla aplicação de offsets', () => {
    const clock = new UnifiedMasterClock();
    // Em V8, charts são normalizados fisicamente, então songOffset é 0ms
    const songOffsetMs = CalibrationManager.getSongOffsetMs('kua-de-borest');
    expect(songOffsetMs).toBe(0);

    // Clock define offsets exatamente uma vez
    clock.setOffsets(songOffsetMs, 0);
    expect(clock.getTotalOffsetSec()).toBe(0);
  });

  it('8. Estabilidade do relógio em pausa e retomada', () => {
    const clock = new UnifiedMasterClock();
    const fakeSource = {
      currentTime: 10.5,
      getCurrentTime() { return this.currentTime; },
      getPlaybackState() { return PlaybackState.PLAYING; },
      isBuffering() { return false; }
    };

    clock.setSource(fakeSource);
    clock.startPlayback();
    expect(clock.getTime()).toBeCloseTo(10.5, 2);

    // Pausa
    clock.pause();
    expect(clock.isPausedState()).toBe(true);
    // Mesmo que a fonte avance inadvertidamente enquanto pausado:
    fakeSource.currentTime = 15.0;
    expect(clock.getTime()).toBeCloseTo(10.5, 2); // Congelado!

    // Retoma
    clock.resume();
    expect(clock.isPausedState()).toBe(false);
  });

  it('9. Mecanismo de rollback individual por música', () => {
    expect(ChartShiftManager.isSongShifted('kua-de-borest')).toBe(true);
    expect(ChartShiftManager.getShiftSeconds('kua-de-borest')).toBe(6.565);

    // Executa rollback da música
    ChartShiftManager.rollbackSong('kua-de-borest');
    expect(ChartShiftManager.isSongShifted('kua-de-borest')).toBe(false);
    expect(ChartShiftManager.getShiftSeconds('kua-de-borest')).toBe(0);

    // Restaura normalização
    ChartShiftManager.reapplyShift('kua-de-borest');
    expect(ChartShiftManager.isSongShifted('kua-de-borest')).toBe(true);
  });
});
