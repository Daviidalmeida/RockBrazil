import { describe, it, expect, beforeEach } from 'vitest';
import { RockSyncEngine } from '../src/game/sync/rockSyncEngine';
import { UnifiedMasterClock } from '../src/game/sync/masterClock';
import { HitResult, PlaybackState, Note } from '../src/types';

describe('ROCKBRAZIL V13.9.1 — SUÍTE DE TESTES DE TRAVAMENTO E ESTABILIDADE DO ROCKSYNC', () => {
  let masterClock: UnifiedMasterClock;
  let syncEngine: RockSyncEngine;
  let simulatedAudioTime: number;
  let muteCommandLog: boolean[];

  beforeEach(() => {
    simulatedAudioTime = 1.0;
    muteCommandLog = [];

    masterClock = new UnifiedMasterClock();
    masterClock.setSource({
      getCurrentTime: () => simulatedAudioTime,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    });

    syncEngine = new RockSyncEngine(masterClock);
    syncEngine.setMuteCallback((muted) => {
      muteCommandLog.push(muted);
    });
  });

  // TESTE A: 10 erros consecutivos
  it('TESTE A: 10 erros consecutivos mantêm relógio estritamente monótono e enviam apenas 1 mute', () => {
    masterClock.startPlayback();
    const initialTime = masterClock.getTime();

    for (let i = 1; i <= 10; i++) {
      simulatedAudioTime += 0.05;
      syncEngine.registerMiss(simulatedAudioTime);
      syncEngine.update(performance.now() + i * 50);

      expect(masterClock.getTime()).toBeGreaterThanOrEqual(initialTime);
    }

    const state = syncEngine.getState();
    expect(state.consecutiveMisses).toBe(10);
    expect(state.isAudioMuted).toBe(true);
    expect(muteCommandLog).toEqual([true]); // Exatamente 1 chamada postMessage
    expect(state.frozenStreakCount).toBe(0);
  });

  // TESTE B: 20 erros consecutivos
  it('TESTE B: 20 erros consecutivos sem acúmulo de mensagens nem congelamento', () => {
    masterClock.startPlayback();

    for (let i = 1; i <= 20; i++) {
      simulatedAudioTime += 0.04;
      syncEngine.registerMiss(simulatedAudioTime);
      syncEngine.update(performance.now() + i * 40);
    }

    expect(syncEngine.getState().consecutiveMisses).toBe(20);
    expect(muteCommandLog.length).toBe(1); // Continua sendo 1 única chamada
    expect(syncEngine.getState().frozenStreakCount).toBe(0);
  });

  // TESTE C: 50 erros consecutivos
  it('TESTE C: 50 erros consecutivos preservam fluidez a 60 FPS com O(1)', () => {
    masterClock.startPlayback();
    const startPerf = performance.now();

    for (let i = 1; i <= 50; i++) {
      simulatedAudioTime += 0.03;
      syncEngine.registerMiss(simulatedAudioTime);
      const res = syncEngine.update(performance.now() + i * 30);
      expect(res.shouldRender).toBe(true);
    }

    const elapsed = performance.now() - startPerf;
    expect(elapsed).toBeLessThan(50); // 50 eventos processados em menos de 50ms
    expect(muteCommandLog.length).toBe(1);
    expect(syncEngine.getState().consecutiveMisses).toBe(50);
  });

  // TESTE D: 100 erros consecutivos
  it('TESTE D: 100 erros consecutivos sob tempestade extrema de misses sem estouro de buffer', () => {
    masterClock.startPlayback();

    for (let i = 1; i <= 100; i++) {
      simulatedAudioTime += 0.02;
      syncEngine.registerMiss(simulatedAudioTime);
      syncEngine.update(performance.now() + i * 20);
    }

    const report = syncEngine.getHealthReport();
    expect(report.consecutiveMissCount).toBe(100);
    expect(report.totalMissesProcessed).toBe(100);
    expect(report.isClockStalled).toBe(false);
    expect(muteCommandLog.length).toBe(1); // Zero spam de postMessage
  });

  // TESTE E: Alternar PERFECT e MISS
  it('TESTE E: Alternância rítmica rápida entre PERFECT e MISS sem jitter', () => {
    masterClock.startPlayback();

    const hitSample: HitResult = {
      judgment: 'PERFECT',
      scoreGained: 100,
      combo: 1,
      multiplier: 1,
      timeDiff: 0.01
    };

    // Alternar 10 vezes: MISS -> HIT -> MISS -> HIT...
    for (let i = 1; i <= 10; i++) {
      simulatedAudioTime += 0.05;
      syncEngine.registerMiss(simulatedAudioTime); // Deve mutar
      simulatedAudioTime += 0.05;
      syncEngine.registerHit(hitSample, simulatedAudioTime); // Deve desmutar
      syncEngine.update(performance.now() + i * 100);
    }

    // Cada par gera 1 mute e 1 unmute
    expect(muteCommandLog.length).toBe(20);
    expect(syncEngine.getState().consecutiveMisses).toBe(0);
    expect(syncEngine.getState().isAudioMuted).toBe(false);
  });

  // TESTE F: Errar acordes
  it('TESTE F: Erro simultâneo em acorde multitoque de 3 notas não duplica comandos', () => {
    masterClock.startPlayback();

    // Simular que 3 notas de um acorde desceram juntas no mesmo instante t=2.5s e foram perdidas
    const chordTime = 2.5;
    syncEngine.registerMiss(0, { id: 10, time: chordTime, lane: 0 } as Note);
    syncEngine.registerMiss(1, { id: 11, time: chordTime, lane: 1 } as Note);
    syncEngine.registerMiss(2, { id: 12, time: chordTime, lane: 2 } as Note);

    syncEngine.update(performance.now());

    expect(syncEngine.getState().consecutiveMisses).toBe(3);
    expect(muteCommandLog).toEqual([true]); // Apenas 1 comando enviado!
  });

  // TESTE G: Simular queda para 20 FPS
  it('TESTE G: Queda acentuada para 20 FPS (frame delta 50ms) mantém renderização suave', () => {
    masterClock.startPlayback();

    // 20 FPS = 50ms por frame
    let perfTime = performance.now();
    for (let frame = 1; frame <= 20; frame++) {
      perfTime += 50;
      simulatedAudioTime += 0.050;

      const updateRes = syncEngine.update(perfTime);
      expect(updateRes.shouldRender).toBe(true);
      expect(Number.isFinite(updateRes.clockTime)).toBe(true);
    }

    expect(syncEngine.getHealthReport().isClockStalled).toBe(false);
  });

  // TESTE H: Simular buffering do YouTube
  it('TESTE H: Buffering do YouTube congela o relógio sem registrar falha de frame', () => {
    masterClock.startPlayback();
    masterClock.setBuffering(true);

    const timeAtBuffer = masterClock.getTime();

    // Durante buffering, tempo não avança
    syncEngine.update(performance.now() + 100);
    syncEngine.update(performance.now() + 200);

    expect(masterClock.getTime()).toBe(timeAtBuffer);

    // Ao sair do buffering, relógio retoma sem saltos abruptos
    masterClock.setBuffering(false);
    simulatedAudioTime += 0.1;
    syncEngine.update(performance.now() + 300);

    expect(masterClock.getTime()).toBeGreaterThan(timeAtBuffer);
  });

  // TESTE I: Pausar e retomar
  it('TESTE I: Pausa do jogo congela tempo musical e retomada não perde coordenadas', () => {
    masterClock.startPlayback();
    simulatedAudioTime = 10.0;
    syncEngine.update(performance.now());

    // Pausar
    masterClock.pause();
    const pausedTime = masterClock.getTime();

    // Vários frames durante a pausa
    syncEngine.update(performance.now() + 1000);
    syncEngine.update(performance.now() + 2000);
    expect(masterClock.getTime()).toBe(pausedTime);

    // Retomar
    masterClock.resume();
    simulatedAudioTime = 10.05;
    const res = syncEngine.update(performance.now() + 2050);

    expect(res.clockTime).toBeGreaterThanOrEqual(pausedTime);
  });

  // TESTE J: Trocar de aba e retornar
  it('TESTE J: Background tab e retorno não causam descontinuidade nem travamento permanente', () => {
    masterClock.startPlayback();
    simulatedAudioTime = 5.0;
    syncEngine.update(performance.now());

    // Simular que o usuário mudou de aba por 3 segundos (3000ms)
    simulatedAudioTime = 8.0;
    const res = syncEngine.update(performance.now() + 3000);

    expect(res.isFrameDrop).toBe(true); // Detectou salto legítimo de aba
    expect(res.shouldRender).toBe(true);
    expect(masterClock.getTime()).toBe(8.0);
    expect(syncEngine.getHealthReport().isClockStalled).toBe(false);
  });
});
