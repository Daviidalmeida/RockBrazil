import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { FirestoreService, SyncState } from '../src/firebase/firestoreService';
import { PlayerProfile, GameSettings } from '../src/types';
import { NOTE_VISUAL_THEME, GameRenderer } from '../src/render/renderer';
import { INITIAL_UNLOCKED_SONG_IDS } from '../src/game/profileManager';
import { INTERNATIONAL_SONGS_CATALOG } from '../src/game/catalog/internationalCatalog';
import { OFFICIAL_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';

// Mock localStorage para ambiente Vitest/Node
const mockStorage: Record<string, string> = {};
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = {
    getItem: vi.fn((key: string) => mockStorage[key] || null),
    setItem: vi.fn((key: string, val: string) => { mockStorage[key] = String(val); }),
    removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
    clear: vi.fn(() => { for (const k in mockStorage) delete mockStorage[k]; })
  };
}

const defaultTestSettings: GameSettings = {
  musicVolume: 0.85,
  sfxVolume: 0.9,
  audioOffsetMs: 0,
  noteSpeedMultiplier: 1.0,
  visualEffectsEnabled: true,
  visualEffectsMode: 'NORMAL',
  muteOnMiss: true
};

function createMockCanvas() {
  return {
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
      ellipse: vi.fn(),
      createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn()
    }),
    width: 480,
    height: 800
  } as any;
}

describe('ROCKBRAZIL V13.8.2 — SUÍTE DE TESTES: SINCRONIZAÇÃO EM NUVEM E PLAYER COMPACTO', () => {
  const rootDir = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'src/style.css'), 'utf-8');

  // ========================================================
  // FASE 1: PLAYER COMPACTO DO YOUTUBE (WIDESCREEN 16:9 DISCRETO V13.8.5)
  // ========================================================
  describe('Fase 1: Player Compacto do YouTube (Widescreen 16:9 Discreto V13.8.5)', () => {
    it('deve definir .yt-miniplayer-box com proporção widescreen 16:9 sem corte', () => {
      expect(styleCss).toContain('.yt-miniplayer-box');
      expect(styleCss).toMatch(/clamp\(140px,\s*36vw,\s*175px\)/);
      expect(styleCss).toContain('aspect-ratio: 16 / 9;');
    });

    it('NÃO deve aplicar transform: scale() no container do miniplayer ou iframe', () => {
      const miniplayerRuleMatch = styleCss.match(/\.yt-miniplayer-box\s*\{[^}]+\}/);
      expect(miniplayerRuleMatch).not.toBeNull();
      expect(miniplayerRuleMatch![0]).not.toContain('transform: scale');
      expect(miniplayerRuleMatch![0]).not.toContain('transform:scale');
    });

    it('deve posicionar o miniplayer no topo esquerdo com suporte a safe-area-inset', () => {
      expect(styleCss).toContain('top: max(8px, env(safe-area-inset-top));');
      expect(styleCss).toContain('left: max(8px, env(safe-area-inset-left));');
    });

    it('deve manter o painel HUD esquerdo posicionado abaixo do player quando ativo', () => {
      expect(styleCss).toContain('.youtube-active .hud-left-panel');
      expect(styleCss).toContain('calc(max(8px, env(safe-area-inset-top)) + clamp(140px, 36vw, 175px) * 9 / 16 + 8px)');
    });

    it('deve manter o botão de pausa no canto superior direito com z-index elevado', () => {
      expect(styleCss).toMatch(/\.hud-top-right\s*\{[^}]*z-index:\s*9999/);
    });

    it('deve garantir que o iframe preencha 100% do container sem corte', () => {
      expect(styleCss).toContain('#yt-player-frame iframe');
      expect(styleCss).toMatch(/width:\s*100%\s*!important/);
      expect(styleCss).toMatch(/height:\s*100%\s*!important/);
    });
  });

  // ========================================================
  // FASE 2: SINCRONIZAÇÃO EM NUVEM COMPLETA (PC E CELULAR)
  // ========================================================
  describe('Fase 2: Sincronização em Nuvem Completa (PC e Celular)', () => {
    const pcProfile: PlayerProfile = {
      id: 'google-user-123',
      name: 'Davi Rock',
      avatar: 'rockbrazil-avatar-05',
      createdAt: 1700000000000,
      lastPlayedAt: 1700005000000,
      updatedAt: 1700005000000,
      rockCoins: 25,
      totalCoinsEarned: 35,
      totalCoinsSpent: 10,
      unlockedSongIds: ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo', 'leg-tempo-perdido', 'tit-policia'],
      achievements: {
        first_show: { unlockedAt: 1700001000000 },
        collector_10: { unlockedAt: 1700003000000 }
      },
      records: {
        'mam-1406': {
          HARD: {
            score: 185000,
            bestScore: 185000,
            lastScore: 185000,
            stars: 5,
            bestStars: 5,
            lastStars: 5,
            accuracy: 98,
            bestAccuracy: 98,
            lastAccuracy: 98,
            maxCombo: 240,
            bestMaxCombo: 240,
            lastMaxCombo: 240,
            playCount: 4,
            bestDate: 1700002000000,
            lastDate: 1700002000000
          }
        }
      },
      settings: defaultTestSettings,
      history: [],
      accountType: 'google',
      migrationVersion: 14.0
    };

    it('deve realizar a união perfeita de músicas desbloqueadas entre PC e celular', () => {
      const androidProfile: Partial<PlayerProfile> = {
        unlockedSongIds: ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo', 'par-alugase', 'ira-nucleo'],
        migrationVersion: 14.0
      };

      const merged = FirestoreService.mergeProfiles(pcProfile, androidProfile);
      expect(merged.unlockedSongIds).toContain('leg-tempo-perdido');
      expect(merged.unlockedSongIds).toContain('tit-policia');
      expect(merged.unlockedSongIds).toContain('par-alugase');
      expect(merged.unlockedSongIds).toContain('ira-nucleo');
      expect(merged.unlockedSongIds?.length).toBe(7);
    });

    it('deve realizar a união das conquistas preservando a data mais antiga de conquista', () => {
      const androidProfile: Partial<PlayerProfile> = {
        achievements: {
          first_show: { unlockedAt: 1700000500000 }, // Data anterior à do PC
          rookie_5_songs: { unlockedAt: 1700006000000 } // Nova conquista obtida no celular
        },
        migrationVersion: 14.0
      };

      const merged = FirestoreService.mergeProfiles(pcProfile, androidProfile);
      expect(merged.achievements).toBeDefined();
      expect(merged.achievements!['first_show'].unlockedAt).toBe(1700000500000);
      expect(merged.achievements!['collector_10'].unlockedAt).toBe(1700003000000);
      expect(merged.achievements!['rookie_5_songs'].unlockedAt).toBe(1700006000000);
    });

    it('deve preservar os melhores recordes por música e dificuldade', () => {
      const androidProfile: Partial<PlayerProfile> = {
        records: {
          'mam-1406': {
            HARD: {
              score: 195000,
              bestScore: 195000,
              lastScore: 195000,
              stars: 5,
              bestStars: 5,
              lastStars: 5,
              accuracy: 99,
              bestAccuracy: 99,
              lastAccuracy: 99,
              maxCombo: 260,
              bestMaxCombo: 260,
              lastMaxCombo: 260,
              playCount: 6,
              bestDate: 1700006000000,
              lastDate: 1700006000000
            }
          }
        },
        migrationVersion: 14.0
      };

      const merged = FirestoreService.mergeProfiles(pcProfile, androidProfile);
      const hardRec = merged.records['mam-1406']!.HARD!;
      expect(hardRec.bestScore).toBe(195000);
      expect(hardRec.bestAccuracy).toBe(99);
      expect(hardRec.bestMaxCombo).toBe(260);
      expect(hardRec.playCount).toBe(6);
    });

    it('deve reconciliar RockCoins com base em timestamp recente evitando duplicação e perda', () => {
      const androidProfile: Partial<PlayerProfile> = {
        rockCoins: 20,
        totalCoinsEarned: 35,
        totalCoinsSpent: 15,
        updatedAt: 1700008000000,
        migrationVersion: 14.0
      };

      const merged = FirestoreService.mergeProfiles(pcProfile, androidProfile);
      expect(merged.rockCoins).toBe(20);
      expect(merged.totalCoinsSpent).toBe(15);
    });

    it('deve garantir que novo login no celular herde dados completos da nuvem sem sobrescrever', () => {
      const freshAndroidProfile: PlayerProfile = {
        id: 'google-user-123',
        name: 'Rockeiro',
        avatar: 'rockbrazil-avatar-01',
        createdAt: 1700009000000,
        lastPlayedAt: 0,
        updatedAt: 0,
        rockCoins: 0,
        totalCoinsEarned: 0,
        totalCoinsSpent: 0,
        unlockedSongIds: [...INITIAL_UNLOCKED_SONG_IDS],
        achievements: {},
        records: {},
        settings: defaultTestSettings,
        history: [],
        accountType: 'google',
        migrationVersion: 14.0
      };

      const merged = FirestoreService.mergeProfiles(freshAndroidProfile, pcProfile);
      expect(merged.rockCoins).toBe(25);
      expect(merged.unlockedSongIds?.length).toBe(5);
      expect(merged.achievements!['first_show']).toBeDefined();
      expect(merged.avatar).toBe('rockbrazil-avatar-05');
      expect(merged.name).toBe('Davi Rock');
    });

    it('deve ignorar e não restaurar dados antigos de teste anteriores à Temporada 1 (< 14.0)', () => {
      const legacyTestCloudData: Partial<PlayerProfile> = {
        migrationVersion: 13.3,
        rockCoins: 9999,
        records: { 'mam-1406': { HARD: { bestScore: 999999 } as any } }
      };

      const freshProfile: PlayerProfile = {
        ...pcProfile,
        rockCoins: 10,
        records: {},
        migrationVersion: 14.0
      };

      const merged = FirestoreService.mergeProfiles(freshProfile, legacyTestCloudData);
      expect(merged.rockCoins).toBe(10);
      expect(merged.migrationVersion).toBe(14.0);
    });
  });

  // ========================================================
  // FASE 3: RESILIÊNCIA OFFLINE E FILA DE SINCRONIZAÇÃO
  // ========================================================
  describe('Fase 3: Resiliência Offline e Fila de Sincronização', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('deve enfileirar, recuperar e limpar sincronização pendente no localStorage', () => {
      const testProfile: PlayerProfile = {
        id: 'user-pending-test',
        name: 'Offline Rocker',
        avatar: 'rockbrazil-avatar-02',
        createdAt: Date.now(),
        lastPlayedAt: Date.now(),
        updatedAt: Date.now(),
        rockCoins: 15,
        settings: defaultTestSettings,
        records: {},
        history: [],
        accountType: 'google',
        migrationVersion: 14.0
      };

      FirestoreService.queuePendingSync('user-pending-test', testProfile);

      const pending = FirestoreService.getPendingSync();
      expect(pending).not.toBeNull();
      expect(pending!.uid).toBe('user-pending-test');
      expect(pending!.profile.rockCoins).toBe(15);

      FirestoreService.clearPendingSync('user-pending-test');
      expect(FirestoreService.getPendingSync()).toBeNull();
    });

    it('deve notificar ouvintes sobre alterações no estado de sincronização', () => {
      const receivedStates: SyncState[] = [];
      const unsub = FirestoreService.onSyncStateChange((state) => {
        receivedStates.push(state);
      });

      FirestoreService.setSyncState('syncing');
      FirestoreService.setSyncState('synced');

      expect(receivedStates).toContain('syncing');
      expect(receivedStates).toContain('synced');

      unsub();
    });

    it('deve conter o badge de status de sincronização no HTML do perfil e menu', () => {
      expect(indexHtml).toContain('id="sync-status-indicator"');
      expect(indexHtml).toContain('id="active-profile-sync-badge"');
    });
  });

  // ========================================================
  // FASE 4 E 5: NOTAS DINÂMICAS, 3D VIBRANTE E SINCRONIZAÇÃO DE ACORDES
  // ========================================================
  describe('Fase 4 e 5: Notas Dinâmicas 3D e Sincronização de Acordes', () => {
    it('deve conter paleta oficial de 5 pistas neon com cores de alto contraste', () => {
      expect(NOTE_VISUAL_THEME.laneColors.length).toBe(5);
      const lanes = NOTE_VISUAL_THEME.laneColors;
      expect(lanes[0].core).toBe('#10b981'); // Verde
      expect(lanes[1].core).toBe('#ff2a5f'); // Vermelho
      expect(lanes[2].core).toBe('#fbbf24'); // Amarelo
      expect(lanes[3].core).toBe('#06b6d4'); // Ciano
      expect(lanes[4].core).toBe('#ff6b00'); // Laranja
    });

    it('deve renderizar notas com dimensões proporcionais e reflexo de vidro', () => {
      const canvas = createMockCanvas();
      const renderer = new GameRenderer(canvas);
      renderer.setDifficulty('EXPERT');

      const mockNotes = [
        { lane: 0 as any, time: 1.0, duration: 0, hit: false, missed: false },
        { lane: 2 as any, time: 1.0, duration: 0, hit: false, missed: false } // Acorde no tempo 1.0
      ];

      expect(() => {
        renderer.render(1.0, mockNotes, new Set(), 120);
      }).not.toThrow();

      const ctx = canvas.getContext('2d');
      expect(ctx.ellipse).toHaveBeenCalled();
      expect(ctx.createRadialGradient).toHaveBeenCalled();
    });

    it('deve renderizar em modo REDUZIDO com performance leve sem erros', () => {
      const canvas = createMockCanvas();
      const renderer = new GameRenderer(canvas);
      renderer.visualEffectsMode = 'REDUZIDO';

      const mockNotes = [
        { lane: 1 as any, time: 2.0, duration: 0, hit: false, missed: false }
      ];

      expect(() => {
        renderer.render(1.8, mockNotes, new Set(), 120);
      }).not.toThrow();
    });
  });

  // ========================================================
  // FASE 6: PRESERVAÇÃO INTEGRAL DO CATÁLOGO E REGRAS
  // ========================================================
  describe('Fase 6: Preservação Integral do Catálogo e Segurança', () => {
    it('deve manter as 162 faixas nacionais no OFFICIAL_BRAZILIAN_CATALOG', () => {
      expect(OFFICIAL_BRAZILIAN_CATALOG.length).toBe(162);
    });

    it('deve preservar as 5 músicas internacionais gratuitas de teste no INTERNATIONAL_SONGS_CATALOG', () => {
      expect(INTERNATIONAL_SONGS_CATALOG.length).toBe(5);
      const intlIds = INTERNATIONAL_SONGS_CATALOG.map((s) => s.id);
      expect(intlIds).toContain('intl-acdc-highway-to-hell');
      expect(intlIds).toContain('intl-gnr-paradise-city');
      expect(intlIds).toContain('intl-gnr-sweet-child-o-mine');
      expect(intlIds).toContain('intl-gnr-welcome-to-the-jungle');
      expect(intlIds).toContain('intl-lp-numb');
    });

    it('deve manter as regras de segurança do Firestore exigindo autenticação para escrita de perfil', () => {
      const rulesFile = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf-8');
      expect(rulesFile).toContain('match /users/{userId}');
      expect(rulesFile).toContain('request.auth.uid == userId');
    });
  });
});
