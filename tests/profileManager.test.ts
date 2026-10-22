import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileManager } from '../src/game/profileManager';
import { GameStats } from '../src/types';

// In-memory polyfill for node test environment
if (typeof localStorage === 'undefined') {
  let store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

describe('Fase 5 - Sistema de Perfis e Progresso', () => {
  let manager: ProfileManager;

  beforeEach(() => {
    localStorage.clear();
    manager = new ProfileManager();
  });

  it('deve criar novo perfil com nome e avatar selecionados', async () => {
    const profile = await manager.createProfile('Slash BR', '⚡');
    expect(profile.name).toBe('Slash BR');
    expect(profile.avatar).toBe('⚡');
    expect(profile.id).toBeDefined();
    expect(manager.getActiveProfile()?.id).toBe(profile.id);
  });

  it('deve registrar pontuação de partida e atualizar recordes', async () => {
    await manager.createProfile('Angus Young', '🎸');

    const stats: GameStats = {
      score: 45000,
      combo: 65,
      maxCombo: 65,
      multiplier: 4,
      rockMeter: 85,
      perfectCount: 40,
      greatCount: 10,
      goodCount: 0,
      missCount: 0,
      totalNotes: 50,
      stars: 5,
      accuracy: 98
    };

    await manager.recordMatch('furia-tropical', 'Fúria Tropical', 'HARD', stats, true);

    const active = manager.getActiveProfile();
    const record = active?.records['furia-tropical']?.['HARD'];
    expect(record).toBeDefined();
    expect(record?.score).toBe(45000);
    expect(record?.stars).toBe(5);
    expect(active?.history.length).toBe(1);
    expect(active?.history[0].cleared).toBe(true);
  });

  it('deve exportar e importar dados em JSON corretamente', async () => {
    await manager.createProfile('Ozzy BR', '💀');
    const jsonStr = await manager.exportJSON();
    expect(jsonStr).toContain('Ozzy BR');
    expect(jsonStr).toContain('RockBrazil_V4');

    const newManager = new ProfileManager();
    const importResult = await newManager.importJSON(jsonStr);
    expect(importResult.success).toBe(true);
    expect(importResult.importedCount).toBeGreaterThan(0);
  });
});
