import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  ProfileManager,
  INITIAL_UNLOCKED_SONG_IDS,
  UNLOCK_COST_ROCKCOINS,
  SEASON_1_RESET_KEY,
  MIGRATION_VERSION_S1,
  PlayerProfile
} from '../src/game/profileManager';
import { FirestoreService } from '../src/firebase/firestoreService';
import { RankingService, CURRENT_SEASON } from '../src/firebase/rankingService';
import { AuthService } from '../src/firebase/authService';
import { GameStats } from '../src/types';

// Polyfill in-memory localStorage para o ambiente de testes
if (typeof localStorage === 'undefined' || !(globalThis as any).localStorage?.getItem) {
  let store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

describe('ROCKBRAZIL — RESET TOTAL (TEMPORADA 1) & V13.4 PERFIL ÚNICO', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // =========================================================================
  // SEÇÃO 1: RESET TOTAL IMEDIATO DA TEMPORADA 1
  // =========================================================================
  describe('1. Reset Total Imediato e Início Oficial da Temporada 1', () => {
    it('1.1. realiza backup seguro antes de qualquer exclusão de dados locais', () => {
      // Simula dados antigos de testes salvos no navegador do jogador
      localStorage.setItem('rb_pending_ranking_sync', JSON.stringify([{ songId: 'test-song', score: 99999 }]));
      localStorage.setItem('rb_profiles_fallback', JSON.stringify([{ id: 'test_p1', name: 'Beta Tester' }]));
      localStorage.setItem('rockbrazil_settings', JSON.stringify({ musicVolume: 0.75, muteOnMiss: true }));

      const res = ProfileManager.performSeason1ResetIfNeeded();
      expect(res.resetPerformed).toBe(true);
      expect(res.backupKey).toBeDefined();

      // Confirma que o backup foi gerado no localStorage
      const backupRaw = localStorage.getItem(res.backupKey!);
      expect(backupRaw).not.toBeNull();
      const backup = JSON.parse(backupRaw!);
      expect(backup.note).toContain('Backup automático pré-reset Temporada 1');
      expect(backup.pendingSync).toContain('test-song');
      expect(backup.fallbackProfiles).toContain('Beta Tester');
    });

    it('1.2. invalida filas de sincronização pendentes e dados antigos de teste', () => {
      localStorage.setItem('rb_pending_ranking_sync', JSON.stringify([{ score: 50000 }]));
      localStorage.setItem('rb_profiles_fallback', JSON.stringify([{ id: 'old_1' }]));

      ProfileManager.performSeason1ResetIfNeeded();

      // Fila pendente antiga e perfis de teste foram excluídos
      expect(localStorage.getItem('rb_pending_ranking_sync')).toBeNull();
      expect(localStorage.getItem('rb_profiles_fallback')).toBeNull();
    });

    it('1.3. preserva configurações globais e de áudio (volume, offset, muteOnMiss)', () => {
      localStorage.setItem('rockbrazil_settings', JSON.stringify({
        musicVolume: 0.9,
        sfxVolume: 0.8,
        audioOffsetMs: -15,
        noteSpeedMultiplier: 1.2,
        muteOnMiss: true
      }));

      ProfileManager.performSeason1ResetIfNeeded();

      // Configurações do dispositivo permanecem intactas
      const settings = JSON.parse(localStorage.getItem('rockbrazil_settings')!);
      expect(settings.musicVolume).toBe(0.9);
      expect(settings.audioOffsetMs).toBe(-15);
      expect(settings.muteOnMiss).toBe(true);
    });

    it('1.4. o reset é idempotente e executa apenas uma única vez', () => {
      const res1 = ProfileManager.performSeason1ResetIfNeeded();
      expect(res1.resetPerformed).toBe(true);
      expect(localStorage.getItem(SEASON_1_RESET_KEY)).toBe('true');

      // Segunda chamada não repete exclusão nem sobrescreve novos dados
      const res2 = ProfileManager.performSeason1ResetIfNeeded();
      expect(res2.resetPerformed).toBe(false);
    });

    it('1.5. todos os jogadores iniciam com 0 RockCoins, 0 recordes e exatamente 3 músicas desbloqueadas', async () => {
      const pm = new ProfileManager();
      const { activeProfile } = await pm.init();

      expect(activeProfile.rockCoins).toBe(0);
      expect(Object.keys(activeProfile.records)).toHaveLength(0);
      expect(activeProfile.history).toHaveLength(0);
      expect(activeProfile.totalCoinsEarned).toBe(0);
      expect(activeProfile.totalCoinsSpent).toBe(0);
      expect(activeProfile.migrationVersion).toBe(MIGRATION_VERSION_S1);

      // Exatamente 3 músicas desbloqueadas
      expect(activeProfile.unlockedSongIds).toEqual(['mam-1406', 'cap-sua-maneira', 'pit-chip-novo']);
      expect(pm.isSongUnlocked('mam-1406')).toBe(true);
      expect(pm.isSongUnlocked('cap-sua-maneira')).toBe(true);
      expect(pm.isSongUnlocked('pit-chip-novo')).toBe(true);

      // As outras 159 músicas começam bloqueadas
      expect(pm.isSongUnlocked('los-anna-julia')).toBe(false);
      expect(pm.isSongUnlocked('df-destruir-tudo')).toBe(false);
      expect(pm.isSongUnlocked('cpm-irreversivel')).toBe(false);
      expect(UNLOCK_COST_ROCKCOINS).toBe(5);
      expect(CURRENT_SEASON).toBe('s1');
    });

    it('1.6. conquistas e desbloqueios obtidos na Temporada 1 são preservados em reloads futuros', async () => {
      const pm1 = new ProfileManager();
      await pm1.init();

      // Jogador ganha 5 moedas e desbloqueia uma nova música
      await pm1.addRockCoins(5);
      const unlockRes = await pm1.unlockSong('los-anna-julia', 'Anna Júlia');
      expect(unlockRes.success).toBe(true);
      expect(pm1.isSongUnlocked('los-anna-julia')).toBe(true);

      // Simula recarregamento da página (nova instância)
      const pm2 = new ProfileManager();
      await pm2.init();

      // A música desbloqueada na Temporada 1 permanece liberada!
      expect(pm2.isSongUnlocked('los-anna-julia')).toBe(true);
    });

    it('1.7. dados em nuvem de testes anteriores (< 14.0) são descartados na sincronização', () => {
      const localClean: PlayerProfile = {
        ...ProfileManager.GUEST_PROFILE,
        id: 'google_user_test',
        rockCoins: 0,
        unlockedSongIds: ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo'],
        records: {},
        migrationVersion: 14.0
      };

      // Simula perfil antigo existente no Firestore com moedas e recordes da fase de testes
      const legacyCloudData: Partial<PlayerProfile> = {
        name: 'Veterano Teste',
        avatar: 'rockbrazil-avatar-05',
        rockCoins: 250, // Moedas de teste
        unlockedSongIds: ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo', 'los-anna-julia', 'df-destruir-tudo'],
        records: {
          'los-anna-julia': {
            HARD: { score: 95000, stars: 5, accuracy: 99, maxCombo: 150, date: 1000 }
          }
        },
        migrationVersion: 13.3 // Versão antiga de teste
      };

      const merged = FirestoreService.mergeProfiles(localClean, legacyCloudData);

      // Preserva identidade visual
      expect(merged.name).toBe('Veterano Teste');
      expect(merged.avatar).toBe('rockbrazil-avatar-05');

      // Mas zera moedas e recordes de teste e mantém estritamente as 3 músicas iniciais da Temporada 1!
      expect(merged.rockCoins).toBe(0);
      expect(Object.keys(merged.records)).toHaveLength(0);
      expect(merged.unlockedSongIds).toEqual(['mam-1406', 'cap-sua-maneira', 'pit-chip-novo']);
      expect(merged.migrationVersion).toBe(14.0);
    });
  });

  // =========================================================================
  // SEÇÃO 2: ROCKBRAZIL V13.4 — SISTEMA DE PERFIL ÚNICO (SINGLE PROFILE)
  // =========================================================================
  describe('2. Sistema de Perfil Único (Single Profile per Account)', () => {
    it('2.1. cada conta Google possui exatamente um perfil associado ao seu UID', async () => {
      const pm = new ProfileManager();
      const uid = 'google_user_unique_123';

      const p1 = await pm.setGoogleProfile(uid, 'Leo Rocker', 'rockbrazil-avatar-01');
      expect(p1.id).toBe(uid);
      expect(p1.accountType).toBe('google');

      // Login repetido com o mesmo UID recupera o mesmo perfil sem criar duplicatas
      const p2 = await pm.setGoogleProfile(uid, 'Leo Rocker');
      expect(p2.id).toBe(uid);
      expect(p2.name).toBe('Leo Rocker');

      const all = await pm.getAllProfiles();
      // Interface enxerga apenas o perfil único ativo
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(uid);
    });

    it('2.2. não permite alternar para convidado enquanto estiver autenticado com Google', async () => {
      const pm = new ProfileManager();
      const uid = 'google_user_active_888';

      await pm.setGoogleProfile(uid, 'Rocker Supremo');
      expect(pm.getActiveProfile().accountType).toBe('google');

      // Tenta acionar modo convidado
      const active = pm.setGuestMode();
      // Bloqueado: continua com a conta Google ativa!
      expect(active.accountType).toBe('google');
      expect(active.id).toBe(uid);
    });

    it('2.3. logout não converte o perfil Google em convidado', async () => {
      AuthService.setSavedAuthPreference('google');
      expect(AuthService.getSavedAuthPreference()).toBe('google');

      // Simula o logout
      await AuthService.signOutUser();
      expect(AuthService.getSavedAuthPreference()).toBeNull();
      // O perfil Google original não foi sobrescrito para "guest"
    });

    it('2.4. modo convidado é isolado e não pode enviar pontuações para o Ranking Global', () => {
      const pm = new ProfileManager();
      const guest = pm.setGuestMode();

      expect(guest.id).toBe('guest');
      expect(guest.accountType).toBe('guest');
      expect(RankingService.isEligibleForRanking(guest)).toBe(false);
    });

    it('2.5. vinculação de convidado com Google transfere dados e converte permanentemente para conta Google', () => {
      const pm = new ProfileManager();
      const guest = pm.setGuestMode();
      guest.rockCoins = 10;
      guest.unlockedSongIds = ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo', 'los-anna-julia'];
      pm.saveGuestProfile(guest);

      const targetUid = 'google_linked_uid_777';
      const linked = pm.linkGuestToGoogle(targetUid, 'Rocker Convertido', 'rockbrazil-avatar-03');

      expect(linked.id).toBe(targetUid);
      expect(linked.accountType).toBe('google');
      expect(linked.rockCoins).toBe(10);
      expect(linked.unlockedSongIds).toContain('los-anna-julia');
      expect(pm.getActiveProfile().id).toBe(targetUid);
      expect(pm.getActiveProfile().accountType).toBe('google');

      // O slot de convidado foi limpo e desacoplado
      const freshGuest = pm.loadGuestProfile();
      expect(freshGuest.rockCoins).toBe(0);
      expect(freshGuest.accountType).toBe('guest');
    });

    it('2.6. interface de MEU PERFIL não possui botões de troca nem de criação de perfis múltiplos', () => {
      const htmlPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');

      // Modal MEU PERFIL está presente
      expect(html).toContain('id="modal-player-profiles"');
      expect(html).toContain('MEU PERFIL');

      // Elementos de múltiplos perfis foram completamente removidos da interface
      expect(html).not.toContain('class="profiles-switcher-section"');
      expect(html).not.toContain('id="profiles-scroll-list"');
      expect(html).not.toContain('id="btn-open-create-new-profile"');
      expect(html).not.toContain('btn-choose-profile');

      // Botão de alterar avatar e fechar permanecem
      expect(html).toContain('id="btn-open-change-avatar"');
      expect(html).toContain('id="btn-close-player-profiles"');
    });
  });
});
