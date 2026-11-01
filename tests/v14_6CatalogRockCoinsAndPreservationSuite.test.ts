import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SongLibrary } from '../src/game/songLibrary';
import { ProfileManager } from '../src/game/profileManager';
import { PersistentCatalogService } from '../src/game/catalog/persistentCatalogService';
import { RockChartStudio } from '../src/game/rockchart/studio/rockChartStudio';
import { RankingService } from '../src/firebase/rankingService';
import { SongMetadata, GameStats, Difficulty } from '../src/types';

// Polyfill in-memory localStorage e sessionStorage para testes Node
if (typeof localStorage === 'undefined' || !(globalThis as any).localStorage?.getItem) {
  let store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

if (typeof sessionStorage === 'undefined' || !(globalThis as any).sessionStorage?.getItem) {
  let sessStore: Record<string, string> = {};
  (globalThis as any).sessionStorage = {
    getItem: (key: string) => sessStore[key] || null,
    setItem: (key: string, val: string) => { sessStore[key] = val; },
    removeItem: (key: string) => { delete sessStore[key]; },
    clear: () => { sessStore = {}; }
  };
}

describe('ROCKBRAZIL V14.6 — TESTES OBRIGATÓRIOS: CATEGORIAS, ROCKCOINS, PRESERVAÇÃO E TELA FINAL', () => {
  let profileManager: ProfileManager;
  let songLibrary: SongLibrary;
  let persistentCatalog: PersistentCatalogService;
  let studio: RockChartStudio;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    PersistentCatalogService.resetInstance();
    persistentCatalog = PersistentCatalogService.getInstance();
    studio = RockChartStudio.getInstance();
    profileManager = new ProfileManager();
    songLibrary = new SongLibrary();
    profileManager.setAdminTestMode(false);
  });

  afterEach(() => {
    profileManager.setAdminTestMode(false);
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. TESTE DE CATEGORIAS (FASE 1 & 10)
  // =========================================================================
  describe('1. Seletor e Troca de Categorias', () => {
    it('1.1. Deve cadastrar música em "Minhas Músicas" e exibi-la na aba correta', () => {
      const songId = 'test-song-cat-1';
      const dummyCompact = PersistentCatalogService.convertBeatmapToCompact({
        EASY: [{ time: 1, lane: 0, duration: 0.1 }],
        MEDIUM: [{ time: 1, lane: 0, duration: 0.1 }],
        HARD: [{ time: 1, lane: 0, duration: 0.1 }],
        EXPERT: [{ time: 1, lane: 0, duration: 0.1 }]
      });

      persistentCatalog.saveDraft({
        songId,
        metadata: {
          id: songId,
          title: 'Meu Rock Nacional',
          artist: 'Banda BR',
          duration: 180,
          bpm: 130,
          style: 'Rock Nacional',
          type: 'youtube',
          youtubeVideoId: 'videoBr123',
          isAvailable: true,
          records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
        },
        charter: 'Admin RockBrazil',
        sourceProvider: 'CHORUS_ENCORE',
        compactCharts: dummyCompact,
        noteCounts: { EASY: 1, MEDIUM: 1, HARD: 1, EXPERT: 1 },
        bpm: 130,
        durationSec: 180,
        offsetMs: 0,
        youtubeVideoId: 'videoBr123',
        category: 'MINHAS_MUSICAS'
      });

      const published = persistentCatalog.publishSong(songId);
      expect(published.success).toBe(true);

      songLibrary.refreshPublishedSongs();

      const minhasMusicas = songLibrary.getActiveSongs('all');
      const internacionais = songLibrary.getActiveSongs('international');

      expect(minhasMusicas.some((s) => s.id === songId)).toBe(true);
      expect(internacionais.some((s) => s.id === songId)).toBe(false);
    });

    it('1.2. Deve alterar categoria para "Músicas Internacionais" preservando songId e refletindo na aba internacional', () => {
      const songId = 'test-song-cat-switch';
      const dummyCompact = PersistentCatalogService.convertBeatmapToCompact({
        EASY: [{ time: 1, lane: 0, duration: 0.1 }],
        MEDIUM: [],
        HARD: [{ time: 1, lane: 0, duration: 0.1 }],
        EXPERT: []
      });

      persistentCatalog.saveDraft({
        songId,
        metadata: {
          id: songId,
          title: 'Transição Categoria',
          artist: 'Artista Teste',
          duration: 200,
          bpm: 120,
          style: 'Rock',
          type: 'youtube',
          youtubeVideoId: 'ytSwitch123',
          isAvailable: true,
          records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
        },
        charter: 'Charter Test',
        sourceProvider: 'CHORUS_ENCORE',
        compactCharts: dummyCompact,
        noteCounts: { EASY: 1, MEDIUM: 0, HARD: 1, EXPERT: 0 },
        bpm: 120,
        durationSec: 200,
        offsetMs: 0,
        youtubeVideoId: 'ytSwitch123',
        category: 'MINHAS_MUSICAS'
      });
      persistentCatalog.publishSong(songId);
      songLibrary.refreshPublishedSongs();

      expect(songLibrary.getActiveSongs('all').some((s) => s.id === songId)).toBe(true);

      // Troca para Internacional
      const updated = persistentCatalog.updateSongCategory(songId, 'INTERNACIONAL');
      expect(updated.songId).toBe(songId);
      expect(updated.category).toBe('INTERNACIONAL');
      expect(updated.metadata.category).toBe('INTERNACIONAL');
      expect(updated.metadata.isInternational).toBe(true);

      songLibrary.refreshPublishedSongs();

      // Agora deve estar na aba de Internacionais e NÃO mais na de Minhas Músicas
      expect(songLibrary.getActiveSongs('international').some((s) => s.id === songId)).toBe(true);
      expect(songLibrary.getActiveSongs('all').some((s) => s.id === songId)).toBe(false);

      // Troca de volta para Minhas Músicas
      persistentCatalog.updateSongCategory(songId, 'MINHAS_MUSICAS');
      songLibrary.refreshPublishedSongs();
      expect(songLibrary.getActiveSongs('all').some((s) => s.id === songId)).toBe(true);
      expect(songLibrary.getActiveSongs('international').some((s) => s.id === songId)).toBe(false);
      expect(updated.songId).toBe(songId); // ID intacto!
    });
  });

  // =========================================================================
  // 2. TESTE DE LIBERAÇÃO E BLOQUEIO POR ROCKCOINS (FASE 2 & 10)
  // =========================================================================
  describe('2. Liberação e Bloqueio por RockCoins', () => {
    it('2.1. Música liberada gratuitamente deve ser jogável sem moedas', async () => {
      const { activeProfile } = await profileManager.init();
      expect(activeProfile.rockCoins).toBe(0);

      const song: SongMetadata = {
        id: 'song-free-test',
        title: 'Música Grátis',
        artist: 'Banda Livre',
        duration: 120,
        bpm: 120,
        style: 'Rock',
        type: 'youtube',
        isAvailable: true,
        isFree: true,
        unlockCost: 0,
        records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
      };

      expect(profileManager.isSongUnlocked(song.id, song)).toBe(true);
    });

    it('2.2. Música bloqueada por 500 RockCoins impede acesso quando saldo insuficiente', async () => {
      const { activeProfile } = await profileManager.init();
      activeProfile.rockCoins = 100; // Saldo de 100, inferior aos 500 necessários

      const lockedSong: SongMetadata = {
        id: 'song-locked-500',
        title: 'Faixa Premium',
        artist: 'Super Rock',
        duration: 150,
        bpm: 140,
        style: 'Hard Rock',
        type: 'youtube',
        isAvailable: true,
        isFree: false,
        unlockCost: 500,
        records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
      };

      expect(profileManager.isSongUnlocked(lockedSong.id, lockedSong)).toBe(false);

      const unlockRes = await profileManager.unlockSong(lockedSong.id, lockedSong.title, lockedSong.unlockCost);
      expect(unlockRes.success).toBe(false);
      expect(unlockRes.error).toBe('ROCKCOINS_INSUFFICIENT');
      expect(activeProfile.rockCoins).toBe(100); // Saldo inalterado, não deduz
      expect(profileManager.isSongUnlocked(lockedSong.id, lockedSong)).toBe(false);
    });

    it('2.3. Jogador com saldo suficiente desbloqueia com débito exato e liberação imediata', async () => {
      const { activeProfile } = await profileManager.init();
      activeProfile.rockCoins = 1000;

      const lockedSong: SongMetadata = {
        id: 'song-locked-500-buy',
        title: 'Faixa Desbloqueável',
        artist: 'Banda Ouro',
        duration: 150,
        bpm: 140,
        style: 'Hard Rock',
        type: 'youtube',
        isAvailable: true,
        isFree: false,
        unlockCost: 500,
        records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
      };

      expect(profileManager.isSongUnlocked(lockedSong.id, lockedSong)).toBe(false);

      const unlockRes = await profileManager.unlockSong(lockedSong.id, lockedSong.title, lockedSong.unlockCost);
      expect(unlockRes.success).toBe(true);
      expect(activeProfile.rockCoins).toBe(500); // 1000 - 500 = 500
      expect(activeProfile.unlockedSongIds).toContain(lockedSong.id);
      expect(profileManager.isSongUnlocked(lockedSong.id, lockedSong)).toBe(true);

      // Tentativa de compra duplicada NÃO cobra novamente
      const duplicateRes = await profileManager.unlockSong(lockedSong.id, lockedSong.title, lockedSong.unlockCost);
      expect(duplicateRes.success).toBe(true);
      expect(activeProfile.rockCoins).toBe(500); // Sem cobrança dupla!
    });
  });

  // =========================================================================
  // 3. TESTE DE DESBLOQUEIO PERMANENTE (FASE 3 & 10)
  // =========================================================================
  describe('3. Desbloqueio Permanente (Imunidade a Mudanças Administrativas)', () => {
    it('3.1. Música comprada por 500 RC continua desbloqueada mesmo se admin aumentar preço para 1000 RC', async () => {
      const { activeProfile } = await profileManager.init();
      activeProfile.rockCoins = 600;

      const songId = 'perm-unlock-song-1';
      await profileManager.unlockSong(songId, 'Faixa Permanente', 500);
      expect(activeProfile.rockCoins).toBe(100);
      expect(profileManager.isSongUnlocked(songId)).toBe(true);

      // Admin aumenta preço para 1000 RC
      const songAfterPriceIncrease: SongMetadata = {
        id: songId,
        title: 'Faixa Permanente',
        artist: 'Banda',
        duration: 180,
        bpm: 120,
        style: 'Rock',
        type: 'youtube',
        isAvailable: true,
        isFree: false,
        unlockCost: 1000,
        records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
      };

      expect(profileManager.isSongUnlocked(songId, songAfterPriceIncrease)).toBe(true);
      expect(activeProfile.rockCoins).toBe(100); // Nenhum débito adicional
    });

    it('3.2. Admin torna música gratuita e depois bloqueia novamente por 2000 RC: jogador mantém acesso', async () => {
      const { activeProfile } = await profileManager.init();
      activeProfile.rockCoins = 1000;

      const songId = 'perm-re-lock-song';
      await profileManager.unlockSong(songId, 'Música Ciclo', 500);
      expect(activeProfile.rockCoins).toBe(500);

      // Admin torna gratuita
      const songFree: SongMetadata = {
        id: songId,
        title: 'Música Ciclo',
        artist: 'Banda',
        duration: 180,
        bpm: 120,
        style: 'Rock',
        type: 'youtube',
        isAvailable: true,
        isFree: true,
        unlockCost: 0,
        records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
      };
      expect(profileManager.isSongUnlocked(songId, songFree)).toBe(true);

      // Admin rebloqueia por 2000 RockCoins
      const songSuperLocked: SongMetadata = {
        ...songFree,
        isFree: false,
        unlockCost: 2000
      };

      expect(profileManager.isSongUnlocked(songId, songSuperLocked)).toBe(true);
      expect(activeProfile.rockCoins).toBe(500); // 0 moedas gastas
    });
  });

  // =========================================================================
  // 4. TESTE DE PRESERVAÇÃO TOTAL DO PROGRESSO (FASE 4 & 10)
  // =========================================================================
  describe('4. Preservação Total do Progresso e Dados', () => {
    it('4.1. Jogador com 2000 RockCoins, 1 música comprada e recordes salvos mantém tudo intacto após reconfiguração do admin', async () => {
      const { activeProfile } = await profileManager.init();
      activeProfile.rockCoins = 2000;
      activeProfile.unlockedSongIds = ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo', 'song-bought-1'];
      activeProfile.records = {
        'mam-1406': {
          HARD: {
            score: 85000,
            bestScore: 85000,
            lastScore: 85000,
            stars: 5,
            bestStars: 5,
            lastStars: 5,
            accuracy: 98.5,
            bestAccuracy: 98.5,
            lastAccuracy: 98.5,
            maxCombo: 240,
            bestMaxCombo: 240,
            lastMaxCombo: 240,
            bestDate: Date.now() - 50000,
            lastDate: Date.now() - 50000,
            playCount: 4
          }
        }
      };
      activeProfile.history = [
        {
          id: 'hist-1',
          songId: 'mam-1406',
          songTitle: '1406',
          difficulty: 'HARD',
          score: 85000,
          accuracy: 98.5,
          maxCombo: 240,
          stars: 5,
          cleared: true,
          date: Date.now() - 50000
        }
      ];

      // Admin altera várias músicas no catálogo
      persistentCatalog.saveDraft({
        songId: 'new-song-admin',
        metadata: {
          id: 'new-song-admin',
          title: 'Nova Faixa',
          artist: 'Admin',
          duration: 100,
          bpm: 120,
          style: 'Rock',
          type: 'youtube',
          youtubeVideoId: 'videoNew',
          isAvailable: true,
          records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
        },
        charter: 'Admin',
        sourceProvider: 'CHORUS_ENCORE',
        compactCharts: PersistentCatalogService.convertBeatmapToCompact({
          EASY: [{ time: 1, lane: 0, duration: 0.1 }],
          MEDIUM: [],
          HARD: [],
          EXPERT: []
        }),
        noteCounts: { EASY: 1, MEDIUM: 0, HARD: 0, EXPERT: 0 },
        bpm: 120,
        durationSec: 100,
        offsetMs: 0,
        youtubeVideoId: 'videoNew',
        category: 'INTERNACIONAL',
        isFree: false,
        unlockCost: 999
      });

      // Recarrega perfil
      const reloadedProfile = profileManager.getActiveProfile();

      // Saldo de 2000 moedas estritamente preservado
      expect(reloadedProfile.rockCoins).toBe(2000);
      // Músicas desbloqueadas preservadas
      expect(reloadedProfile.unlockedSongIds).toContain('song-bought-1');
      // Recordes preservados
      expect(reloadedProfile.records['mam-1406']?.HARD?.bestScore).toBe(85000);
      expect(reloadedProfile.records['mam-1406']?.HARD?.bestStars).toBe(5);
      // Histórico preservado
      expect(reloadedProfile.history).toHaveLength(1);
    });
  });

  // =========================================================================
  // 5. TESTE DE TRANSIÇÃO JUSTA (GRANDFATHERING) (FASE 4 & 10)
  // =========================================================================
  describe('5. Regra de Transição Justa (Grandfathering)', () => {
    it('5.1. Jogador que já jogou música enquanto era gratuita mantém acesso gratuito perpétuo quando ela é bloqueada por 500 RC', async () => {
      const pmVeteran = new ProfileManager();
      const { activeProfile: veteranProfile } = await pmVeteran.init();
      veteranProfile.rockCoins = 50; // Saldo baixo

      const songId = 'fair-transition-song';
      // Veterano jogou e possui pontuação salva
      veteranProfile.records[songId] = {
        MEDIUM: {
          score: 42000,
          bestScore: 42000,
          lastScore: 42000,
          stars: 4,
          bestStars: 4,
          lastStars: 4,
          accuracy: 94.0,
          bestAccuracy: 94.0,
          lastAccuracy: 94.0,
          maxCombo: 110,
          bestMaxCombo: 110,
          lastMaxCombo: 110,
          bestDate: Date.now() - 100000,
          lastDate: Date.now() - 100000,
          playCount: 1
        }
      };

      // Agora o admin altera essa música para BLOQUEADA por 500 RockCoins
      const nowLockedSong: SongMetadata = {
        id: songId,
        title: 'Música Transição',
        artist: 'Artista',
        duration: 180,
        bpm: 125,
        style: 'Rock',
        type: 'youtube',
        isAvailable: true,
        isFree: false,
        unlockCost: 500,
        records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
      };

      // Veterano: ACESSO PERMITIDO sem cobrança!
      expect(pmVeteran.isSongUnlocked(songId, nowLockedSong)).toBe(true);
      expect(veteranProfile.rockCoins).toBe(50); // Moedas intactas

      // Novo Jogador (sem histórico nem recorde nessa música): ACESSO BLOQUEADO!
      const pmNewPlayer = new ProfileManager();
      const newPlayerProfile = pmNewPlayer.createProfile('Novato', 'rockbrazil-avatar-02');
      const pmNewInstance = new ProfileManager();
      (pmNewInstance as any).activeProfile = newPlayerProfile;

      expect(pmNewInstance.isSongUnlocked(songId, nowLockedSong)).toBe(false);
    });
  });

  // =========================================================================
  // 6. TESTE DE MODO ADMINISTRADOR PARA TESTES (FASE 6 & 10)
  // =========================================================================
  describe('6. Modo Administrador para Testes', () => {
    it('6.1. Admin testa música bloqueada sem pagar moedas, com watermark e sem pontuar no ranking', async () => {
      const { activeProfile } = await profileManager.init();
      activeProfile.rockCoins = 0; // 0 moedas

      const blockedSong: SongMetadata = {
        id: 'super-expensive-song',
        title: 'Música Cara',
        artist: 'Elite',
        duration: 180,
        bpm: 130,
        style: 'Metal',
        type: 'youtube',
        isAvailable: true,
        isFree: false,
        unlockCost: 9999,
        records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
      };

      // Jogador comum: bloqueado
      expect(profileManager.isSongUnlocked(blockedSong.id, blockedSong)).toBe(false);

      // Admin ativa Modo Teste
      profileManager.setAdminTestMode(true);
      expect(profileManager.isAdminTestMode()).toBe(true);

      // No modo teste: acesso liberado imediatamente sem custo!
      expect(profileManager.isSongUnlocked(blockedSong.id, blockedSong)).toBe(true);

      // Executa partida em modo de teste
      const stats: GameStats = {
        score: 999999,
        combo: 500,
        maxCombo: 500,
        multiplier: 4,
        rockMeter: 100,
        perfectCount: 200,
        greatCount: 10,
        goodCount: 0,
        missCount: 0,
        totalNotes: 210,
        playableNotesCount: 210,
        hitsCount: 210
      };

      const matchRes = await profileManager.recordMatch(blockedSong.id, blockedSong.title, 'EXPERT', stats, true);

      // Não gera moedas de teste nem altera perfil
      expect(matchRes.earnedCoins).toBe(0);
      expect(activeProfile.rockCoins).toBe(0);

      // Não publica no ranking geral
      const rankingSubmitRes = await RankingService.submitRecordIfEligible(
        activeProfile,
        blockedSong.id,
        blockedSong.title,
        blockedSong.artist,
        'EXPERT',
        stats,
        matchRes
      );
      expect(rankingSubmitRes).toBe(false);

      // Desativa modo teste
      profileManager.setAdminTestMode(false);
      expect(profileManager.isAdminTestMode()).toBe(false);
      expect(profileManager.isSongUnlocked(blockedSong.id, blockedSong)).toBe(false);
    });
  });

  // =========================================================================
  // 7. TESTE DE REMOÇÃO DO ANTIGO ROCK AI (FASE 7 & 10)
  // =========================================================================
  describe('7. Remoção do Antigo Rock AI', () => {
    it('7.1. Botão antigo "btn-open-rockai" e tela "screen-rockai" não existem mais no index.html', () => {
      const htmlPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');

      expect(html).not.toContain('id="btn-open-rockai"');
      expect(html).not.toContain('id="screen-rockai"');
      expect(html).not.toContain('ROCK AI — AUTOCHART');
      expect(html).not.toContain('rockai-engine-banner');
      expect(html).not.toContain('btn-rockai-analyze');
    });

    it('7.2. Botão do RockChart AI Studio existe e está protegido (display: none inicial para visitantes)', () => {
      const htmlPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');

      expect(html).toContain('id="btn-open-rockchart-studio"');
      expect(html).toMatch(/id="btn-open-rockchart-studio"[^>]*style="[^"]*display:\s*none/);
    });
  });

  // =========================================================================
  // 8. TESTE DA NOVA TELA FINAL (FASE 8 & 10)
  // =========================================================================
  describe('8. Nova Tela de Finalização das Músicas', () => {
    it('8.1. index.html deve exibir "Rock Brazil" e "🎸🤘🏼 Viva o Rock 🎸🤘🏼"', () => {
      const htmlPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');

      expect(html).toContain('id="overlay-rockbrazil-celebration"');
      expect(html).toContain('Rock Brazil</h1>');
      expect(html).toContain('🎸🤘🏼 Viva o Rock 🎸🤘🏼</div>');
      expect(html).toContain('id="celebration-countdown"');
      expect(html).toContain('Toque para avançar aos resultados');

      // O texto antigo não pode aparecer de forma alguma
      expect(html).not.toContain('AQUI É ROCKBRAZIL!');
      expect(html).not.toContain('SHOW FINALIZADO COM SUCESSO!');
    });
  });
});
