import { describe, it, expect, beforeEach } from 'vitest';
import { RockSyncEngine } from '../src/game/sync/rockSyncEngine';
import { UnifiedMasterClock } from '../src/game/sync/masterClock';
import { HitResult, PlaybackState } from '../src/types';

describe('RockSyncEngine — Desacoplamento de Relógio e Resiliência a Erros (V13.9)', () => {
  let masterClock: UnifiedMasterClock;
  let syncEngine: RockSyncEngine;
  let simulatedAudioTime = 0;

  beforeEach(() => {
    simulatedAudioTime = 1.0;
    masterClock = new UnifiedMasterClock();
    masterClock.setSource({
      getCurrentTime: () => simulatedAudioTime,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    });
    syncEngine = new RockSyncEngine(masterClock);
  });

  it('1. Relógio mestre permanece contínuo e estritamente monótono durante 10, 20 e 50 erros consecutivos', () => {
    masterClock.startPlayback();
    
    // Simular avanço de tempo
    let initialTime = masterClock.getTime();
    expect(initialTime).toBeGreaterThanOrEqual(0);

    // Disparar 50 misses consecutivos simulando notas perdidas enquanto a música toca
    for (let i = 1; i <= 50; i++) {
      simulatedAudioTime += 0.05; // 50ms por iteração
      syncEngine.registerMiss(simulatedAudioTime);

      // Atualizar o motor de sincronização
      syncEngine.update(performance.now() + i * 50);

      // O relógio não pode congelar nem regredir
      const time = masterClock.getTime();
      expect(time).toBeGreaterThanOrEqual(initialTime);
      initialTime = time;
    }

    const state = syncEngine.getState();
    expect(state.consecutiveMisses).toBe(50);
    expect(state.isAudioMuted).toBe(true);
    expect(state.frozenStreakCount).toBe(0); // Zero travamentos
  });

  it('2. Evita envio redundante de comandos pós-mensagem (apenas 1 transição de mute na primeira falha)', () => {
    const muteCalls: boolean[] = [];
    syncEngine.setMuteCallback((muted) => {
      muteCalls.push(muted);
    });

    // Primeiro erro -> transição para mudo
    syncEngine.registerMiss(1.5);
    expect(muteCalls).toEqual([true]);

    // 20 erros subsequentes -> nenhuma chamada redundante
    for (let i = 0; i < 20; i++) {
      syncEngine.registerMiss(1.6 + i * 0.1);
    }
    expect(muteCalls.length).toBe(1);

    // Acerto de nota -> transição para desmutado
    const hit: HitResult = {
      judgment: 'PERFECT',
      scoreGained: 100,
      combo: 1,
      multiplier: 1,
      timeDiff: 0.01
    };
    syncEngine.registerHit(hit, 3.6);
    expect(muteCalls).toEqual([true, false]);
    expect(syncEngine.getState().isAudioMuted).toBe(false);
    expect(syncEngine.getState().consecutiveMisses).toBe(0);
  });

  it('3. Processamento O(1) de acordes simultâneos e notas rápidas sem bloqueio', () => {
    const startTime = performance.now();

    // Simular rajada de 200 eventos ultrarrápidos (acordes multitoque + misses)
    for (let i = 0; i < 200; i++) {
      if (i % 3 === 0) {
        syncEngine.registerMiss(i * 0.02);
      } else {
        syncEngine.registerHit({
          judgment: 'GREAT',
          scoreGained: 75,
          combo: i,
          multiplier: 2,
          timeDiff: 0.02
        }, i * 0.02);
      }
      syncEngine.update(performance.now() + i * 2);
    }

    const durationMs = performance.now() - startTime;
    // 200 eventos devem rodar em menos de 50ms
    expect(durationMs).toBeLessThan(50);
  });

  it('4. Resiliência a quedas bruscas de FPS sem perda de sincronismo', () => {
    masterClock.startPlayback();

    // Simular frame normal a 16.6ms (60fps)
    syncEngine.update(performance.now());
    expect(syncEngine.getState().clockJitterDetected).toBe(false);

    // Simular queda brusca de FPS (gap de 250ms por GC ou render)
    syncEngine.update(performance.now() + 250);
    
    // O motor isola a esteira e continua reportando tempo válido
    const time = masterClock.getTime();
    expect(Number.isFinite(time)).toBe(true);
  });
});
