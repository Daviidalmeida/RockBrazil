import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { GameState, Difficulty, GameStats, Note, PlayerProfile } from '../src/types';
import { ProfileManager, INITIAL_UNLOCKED_SONG_IDS, UNLOCK_COST_ROCKCOINS } from '../src/game/profileManager';
import { RockCoinsManager } from '../src/game/economy/rockCoinsManager';
import { SongLibrary } from '../src/game/songLibrary';
import { ORIGINAL_31_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';
import { LISARB2_NEW_SONGS } from '../src/game/catalog/lisarb2CatalogData';

// Polyfill localStorage in test environment if needed
if (typeof localStorage === 'undefined' || !(globalThis as any).localStorage?.getItem) {
  let store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

describe('ROCKBRAZIL V13.3 — Resultados Premium, Perfis de Jogadores e Desbloqueio por RockCoins', () => {
  let profileManager: ProfileManager;
  let songLibrary: SongLibrary;

  beforeEach(() => {
    localStorage.clear();
    profileManager = new ProfileManager();
    songLibrary = new SongLibrary();
  });

  // =========================================================================
  // FASE 9: LIMITE INICIAL DE TRÊS MÚSICAS
  // =========================================================================
  describe('Fase 9: Limite Inicial de Três Músicas para Novos Jogadores', () => {
    it('1. Novo perfil inicia estritamente com apenas 3 músicas desbloqueadas', async () => {
      const newProfile = await profileManager.createProfile('Novo Rockeiro', '🎸');
      expect(newProfile.unlockedSongIds).toBeDefined();
      expect(newProfile.unlockedSongIds?.length).toBe(3);
      expect(newProfile.unlockedSongIds).toEqual(INITIAL_UNLOCKED_SONG_IDS);

      // As 3 primeiras músicas oficiais devem estar liberadas
      expect(profileManager.isSongUnlocked('mam-1406')).toBe(true);
      expect(profileManager.isSongUnlocked('cap-sua-maneira')).toBe(true);
      expect(profileManager.isSongUnlocked('pit-chip-novo')).toBe(true);

      // Qualquer outra música deve estar bloqueada
      expect(profileManager.isSongUnlocked('los-anna-julia')).toBe(false);
      expect(profileManager.isSongUnlocked('cpm-irreversivel')).toBe(false);
    });

    it('2. Perfil antigo mantém integralmente todo o seu progresso anterior (migração segura)', () => {
      const allCatalogIds = songLibrary.getActiveSongs().map((s) => s.id);

      // Perfil legado sem migrationVersion e sem unlockedSongIds
      const legacyProfile: PlayerProfile = {
        id: 'legacy_user_1',
        name: 'Rockeiro Veterano',
        avatar: '⚡',
        createdAt: 1600000000000,
        lastPlayedAt: 1600000500000,
        settings: {
          musicVolume: 0.8,
          sfxVolume: 0.8,
          audioOffsetMs: 0,
          noteSpeedMultiplier: 1.0,
          visualEffectsEnabled: true,
          muteOnMiss: false
        },
        records: {
          'mam-1406': {
            EASY: {
              score: 50000,
              stars: 5,
              accuracy: 99,
              maxCombo: 120,
              bestScore: 50000,
              lastScore: 50000,
              bestStars: 5,
              lastStars: 5,
              bestMaxCombo: 120,
              lastMaxCombo: 120,
              bestAccuracy: 99,
              lastAccuracy: 99,
              bestDate: 1600000500000,
              lastDate: 1600000500000,
              playCount: 3
            }
          }
        },
        history: [],
        rockCoins: 12
      };

      const migrated = profileManager.migrateProfile(legacyProfile, allCatalogIds);
      expect(migrated.migrationVersion).toBe(13.3);
      expect(migrated.rockCoins).toBe(12);
      // Jogadores veteranos preservam acesso a todas as músicas do catálogo
      expect(migrated.unlockedSongIds?.length).toBe(allCatalogIds.length);
      expect(migrated.records['mam-1406']?.EASY?.bestScore).toBe(50000);
    });

    it('3. Músicas bloqueadas continuam visíveis no catálogo com identificador de cadeado', () => {
      const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
      const css = fs.readFileSync(path.resolve(process.cwd(), 'src/style.css'), 'utf-8');

      // CSS possui classes de suporte a cadeado e layout de música bloqueada
      expect(css).toContain('.song-locked');
      expect(css).toContain('.row-lock-badge');

      // HTML contém modais de confirmação de desbloqueio e celebração
      expect(html).toContain('id="modal-unlock-song"');
      expect(html).toContain('id="modal-unlock-celebration"');
    });

    it('4. Música bloqueada não pode ser iniciada diretamente', () => {
      profileManager.setGuestMode();
      const lockedId = 'los-anna-julia';
      expect(profileManager.isSongUnlocked(lockedId)).toBe(false);
    });
  });

  // =========================================================================
  // FASE 10: SISTEMA DE DESBLOQUEIO POR 5 ROCKCOINS
  // =========================================================================
  describe('Fase 10: Fluxo de Desbloqueio e Transações', () => {
    it('5. Saldo insuficiente impede desbloqueio e não altera saldo', async () => {
      await profileManager.createProfile('Sem Moedas', '💀');
      expect(profileManager.getRockCoins()).toBe(0);

      const res = await profileManager.unlockSong('los-anna-julia', 'Anna Júlia');
      expect(res.success).toBe(false);
      expect(res.error).toBe('ROCKCOINS_INSUFFICIENT');
      expect(profileManager.getRockCoins()).toBe(0);
      expect(profileManager.isSongUnlocked('los-anna-julia')).toBe(false);
    });

    it('6. Cinco moedas desbloqueiam com sucesso e descontam exatamente 5 RockCoins', async () => {
      const p = await profileManager.createProfile('Guitar Hero BR', '🔥');
      await profileManager.addRockCoins(10);
      expect(profileManager.getRockCoins()).toBe(10);

      const res = await profileManager.unlockSong('los-anna-julia', 'Anna Júlia');
      expect(res.success).toBe(true);
      expect(res.remainingCoins).toBe(5);
      expect(profileManager.getRockCoins()).toBe(5);
      expect(profileManager.isSongUnlocked('los-anna-julia')).toBe(true);

      const active = profileManager.getActiveProfile();
      expect(active.totalCoinsSpent).toBe(5);
      expect(active.transactions?.length).toBe(1);
      expect(active.transactions?.[0].type).toBe('SPEND');
      expect(active.transactions?.[0].amount).toBe(5);
    });

    it('7. Clique duplo ou tentativa duplicada não cobra duas vezes pela mesma música', async () => {
      await profileManager.createProfile('Comprador Atento', '👑');
      await profileManager.addRockCoins(10);

      const res1 = await profileManager.unlockSong('los-anna-julia', 'Anna Júlia');
      expect(res1.success).toBe(true);
      expect(profileManager.getRockCoins()).toBe(5);

      // Segunda chamada para a mesma música
      const res2 = await profileManager.unlockSong('los-anna-julia', 'Anna Júlia');
      expect(res2.success).toBe(true); // Já estava desbloqueada
      // Não desconta moedas novamente
      expect(profileManager.getRockCoins()).toBe(5);
    });

    it('8. Música adquirida permanece liberada após nova instância e persistência', async () => {
      const profile = await profileManager.createProfile('Persistência Player', '⚡');
      await profileManager.addRockCoins(5);
      await profileManager.unlockSong('cpm-irreversivel', 'Irreversível');
      expect(profileManager.isSongUnlocked('cpm-irreversivel')).toBe(true);

      // Simula recarregamento
      const newManager = new ProfileManager();
      await newManager.init();
      await newManager.switchProfile(profile.id);
      expect(newManager.isSongUnlocked('cpm-irreversivel')).toBe(true);
    });
  });

  // =========================================================================
  // FASE 8: ECONOMIA DE ROCKCOINS E IDEMPOTÊNCIA
  // =========================================================================
  describe('Fase 8: Economia de RockCoins e Concessões em Partidas', () => {
    it('9. Partida concluída concede a recompensa correta e registra transação idempotente', async () => {
      await profileManager.createProfile('Tocou Fácil', '🎸');
      const stats: GameStats = {
        score: 30000,
        combo: 40,
        maxCombo: 40,
        multiplier: 4,
        rockMeter: 80,
        perfectCount: 30,
        greatCount: 10,
        goodCount: 0,
        missCount: 2,
        totalNotes: 42,
        stars: 4,
        accuracy: 95
      };

      const result = await profileManager.recordMatch('mam-1406', '1406', 'EASY', stats, true);
      expect(result.earnedCoins).toBe(1);
      expect(result.totalCoins).toBe(1);
      expect(profileManager.getRockCoins()).toBe(1);

      const active = profileManager.getActiveProfile();
      expect(active.totalCoinsEarned).toBe(1);
      expect(active.history[0].earnedCoins).toBe(1);
    });

    it('10. Expert sem erros concede exatamente 5 RockCoins no total', async () => {
      await profileManager.createProfile('Expert Master', '🤘');
      const stats: GameStats = {
        score: 120000,
        combo: 250,
        maxCombo: 250,
        multiplier: 4,
        rockMeter: 100,
        perfectCount: 200,
        greatCount: 50,
        goodCount: 0,
        missCount: 0,
        totalNotes: 250,
        stars: 5,
        accuracy: 100
      };

      const result = await profileManager.recordMatch('mam-1406', '1406', 'EXPERT', stats, true);
      expect(result.earnedCoins).toBe(5);
      expect(result.totalCoins).toBe(5);
      expect(profileManager.getRockCoins()).toBe(5);
    });

    it('11. Partida abandonada concede 0 RockCoins', async () => {
      await profileManager.createProfile('Desistente', '💀');
      const stats: GameStats = {
        score: 10000,
        combo: 15,
        maxCombo: 15,
        multiplier: 2,
        rockMeter: 30,
        perfectCount: 10,
        greatCount: 5,
        goodCount: 0,
        missCount: 1,
        totalNotes: 50
      };

      const result = await profileManager.recordMatch('mam-1406', '1406', 'HARD', stats, false);
      expect(result.earnedCoins).toBe(0);
      expect(profileManager.getRockCoins()).toBe(0);
    });

    it('12. Perfis distintos possuem isolamento estrito de saldos e transações', async () => {
      const p1 = await profileManager.createProfile('Jogador A', '🎸');
      await profileManager.addRockCoins(15);
      expect(profileManager.getRockCoins()).toBe(15);

      const p2 = await profileManager.createProfile('Jogador B', '⚡');
      expect(profileManager.getRockCoins()).toBe(0);

      // Volta para Jogador A
      await profileManager.switchProfile(p1.id);
      expect(profileManager.getRockCoins()).toBe(15);
    });
  });

  // =========================================================================
  // FASE 5 A 7: INTERFACE DE PERFIS E ESTATÍSTICAS
  // =========================================================================
  describe('Fase 5 a 7: Nova Interface de Perfis de Jogadores e Estatísticas Ponderadas', () => {
    it('13. index.html contém o título exato "PERFIS DE JOGADORES"', () => {
      const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
      expect(html).toContain('PERFIS DE JOGADORES');
      expect(html).not.toContain('ENTRAR / PERFIS DE JOGADOR');
      expect(html).toContain('id="modal-player-profiles"');
    });

    it('14. getProfileStats calcula métricas reais e precisão ponderada sem dados falsos', async () => {
      const profile = await profileManager.createProfile('Analítico', '👑');

      // Partida 1: 100 notas, 90 acertos, 10 erros
      await profileManager.recordMatch('mam-1406', '1406', 'MEDIUM', {
        score: 60000,
        stars: 4,
        maxCombo: 50,
        accuracy: 90,
        hitsCount: 90,
        missCount: 10,
        playableNotesCount: 100,
        perfectCount: 80,
        greatCount: 10,
        goodCount: 0,
        multiplier: 4,
        rockMeter: 80,
        combo: 50,
        totalNotes: 100
      }, true, 'Mamonas Assassinas');

      // Partida 2: 200 notas, 200 acertos, 0 erros
      await profileManager.recordMatch('cap-sua-maneira', 'À Sua Maneira', 'HARD', {
        score: 150000,
        stars: 5,
        maxCombo: 200,
        accuracy: 100,
        hitsCount: 200,
        missCount: 0,
        playableNotesCount: 200,
        perfectCount: 180,
        greatCount: 20,
        goodCount: 0,
        multiplier: 4,
        rockMeter: 100,
        combo: 200,
        totalNotes: 200
      }, true, 'Capital Inicial');

      const stats = profileManager.getProfileStats(profile);
      expect(stats.songsPlayed).toBe(2);
      expect(stats.completedMatches).toBe(2);
      expect(stats.totalHits).toBe(290);
      expect(stats.totalMisses).toBe(10);
      // Precisão ponderada: 290 / 300 = 96.666... -> 96.7%
      expect(stats.avgAccuracy).toBe(96.7);
      expect(stats.maxCombo).toBe(200);

      // Melhor música tocada deve ser "À Sua Maneira" com 150.000 pts
      expect(stats.bestSong).not.toBeNull();
      expect(stats.bestSong?.songId).toBe('cap-sua-maneira');
      expect(stats.bestSong?.score).toBe(150000);
      expect(stats.bestSong?.difficulty).toBe('HARD');
    });

    it('15. Perfil sem partidas exibe estatísticas zeradas e melhor música nula', async () => {
      const profile = await profileManager.createProfile('Novo Sem Jogos', '🎸');
      const stats = profileManager.getProfileStats(profile);
      expect(stats.songsPlayed).toBe(0);
      expect(stats.completedMatches).toBe(0);
      expect(stats.totalHits).toBe(0);
      expect(stats.totalMisses).toBe(0);
      expect(stats.avgAccuracy).toBe(0);
      expect(stats.maxCombo).toBe(0);
      expect(stats.bestSong).toBeNull();
    });
  });

  // =========================================================================
  // FASE 1 A 4: TELA OFICIAL DE RESULTADOS E BOTÕES
  // =========================================================================
  describe('Fase 1 a 4: Tela Oficial de Resultados', () => {
    it('16. index.html e style.css utilizam results-bg.jpg sem caderno de fundo', () => {
      const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
      const css = fs.readFileSync(path.resolve(process.cwd(), 'src/style.css'), 'utf-8');

      expect(html).toContain('id="screen-result"');
      expect(html).toContain('class="results-art-wrapper"');
      expect(css).toContain('images/results-bg.jpg');
      expect(css).toContain('.results-screen-container');
      expect(css).toContain('.results-header-overlay');
      expect(css).toContain('.results-central-panel');
      expect(css).toContain('.results-stats-quad');
      expect(css).toContain('.results-buttons-overlay');
    });

    it('17. A imagem results-bg.jpg existe no diretório public/images com proporção 572x1024', () => {
      const imgPath = path.resolve(process.cwd(), 'public/images/results-bg.jpg');
      expect(fs.existsSync(imgPath)).toBe(true);
      const buf = fs.readFileSync(imgPath);
      let width = 0;
      let height = 0;
      for (let i = 0; i < buf.length - 8; i++) {
        if (buf[i] === 0xFF && (buf[i + 1] === 0xC0 || buf[i + 1] === 0xC2)) {
          height = buf.readUInt16BE(i + 5);
          width = buf.readUInt16BE(i + 7);
          break;
        }
      }
      expect(width).toBe(572);
      expect(height).toBe(1024);
    });

    it('18. A imagem profiles-bg.jpg existe no diretório public/images com proporção 1024x1024', () => {
      const imgPath = path.resolve(process.cwd(), 'public/images/profiles-bg.jpg');
      expect(fs.existsSync(imgPath)).toBe(true);
      const buf = fs.readFileSync(imgPath);
      let width = 0;
      let height = 0;
      for (let i = 0; i < buf.length - 8; i++) {
        if (buf[i] === 0xFF && (buf[i + 1] === 0xC0 || buf[i + 1] === 0xC2)) {
          height = buf.readUInt16BE(i + 5);
          width = buf.readUInt16BE(i + 7);
          break;
        }
      }
      expect(width).toBe(1024);
      expect(height).toBe(1024);
    });

    it('19. Botões de ação dos resultados possuem textos conforme arte e diretrizes', () => {
      const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
      expect(html).toContain('JOGAR NOVAMENTE');
      expect(html).toContain('PRÓXIMA MÚSICA');
      expect(html).toContain('SELEÇÃO DE MÚSICAS');
    });
  });

  // =========================================================================
  // INTEGRIDADE DO CATÁLOGO DE 162 MÚSICAS E CHARTS
  // =========================================================================
  describe('Integridade Geral do RockBrazil', () => {
    it('20. Todas as 162 músicas do catálogo oficial continuam cadastradas e intactas', () => {
      const originalCount = ORIGINAL_31_BRAZILIAN_CATALOG.length; // 31
      const lisarbCount = LISARB2_NEW_SONGS.length; // 131
      const totalCatalog = originalCount + lisarbCount;
      expect(totalCatalog).toBe(162);

      const allSongs = songLibrary.getSongs();
      expect(allSongs.length).toBeGreaterThanOrEqual(162);
    });
  });
});
