import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('ROCKBRAZIL V14.6.1 — AUDITORIA DE SEGURANÇA E PROTEÇÃO DE USERS/{USERID}', () => {
  const rootDir = path.resolve(__dirname, '..');
  const rulesPath = path.join(rootDir, 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf-8');

  // =========================================================================
  // SEÇÃO 1: AUDITORIA ESTÁTICA DAS REGRAS DO FIRESTORE (firestore.rules)
  // =========================================================================
  describe('1. Auditoria Estática de Regras do Firestore', () => {
    it('1.1. define a coleção users/{userId} com regras granulares (read, create, update, delete)', () => {
      expect(rules).toContain('match /users/{userId}');
      expect(rules).toContain('allow read: if request.auth != null && (request.auth.uid == userId || isAdmin());');
      expect(rules).toContain('allow delete: if false;');
      expect(rules).toContain('allow create: if request.auth != null &&');
      expect(rules).toContain('allow update: if request.auth != null && (');
    });

    it('1.2. mantém conformidade estrita com o Spark Plan (zero chamadas get() ou exists())', () => {
      const hasGetCall = /get\s*\(/g.test(rules);
      const hasExistsCall = /exists\s*\(/g.test(rules);
      expect(hasGetCall).toBe(false);
      expect(hasExistsCall).toBe(false);
    });

    it('1.3. proíbe injeção de dados confidenciais e privilégios administrativos (admin, role)', () => {
      expect(rules).toContain("!('admin' in request.resource.data)");
      expect(rules).toContain("!('role' in request.resource.data)");
      expect(rules).toContain("!('email' in request.resource.data)");
      expect(rules).toContain("!('password' in request.resource.data)");
      expect(rules).toContain("!('token' in request.resource.data)");
      expect(rules).toContain("!('secret' in request.resource.data)");
    });

    it('1.4. define funções auxiliares de integridade econômica para users/{userId}', () => {
      expect(rules).toContain('function isValidUserProfileKeys()');
      expect(rules).toContain('function isValidUserProfileData()');
      expect(rules).toContain('function getResourceCoins()');
      expect(rules).toContain('function getResourceEarned()');
      expect(rules).toContain('function getResourceSpent()');
      expect(rules).toContain('function getResourceUnlockedSize()');
    });

    it('1.5. impõe teto absoluto e limites matemáticos de RockCoins', () => {
      expect(rules).toContain('request.resource.data.totalCoinsEarned <= 500000');
      expect(rules).toContain('request.resource.data.rockCoins <= request.resource.data.totalCoinsEarned');
      expect(rules).toContain('(request.resource.data.totalCoinsEarned - getResourceEarned()) <= 150');
    });

    it('1.6. impõe limites de segurança contra desbloqueio fraudulento de músicas', () => {
      expect(rules).toContain('(request.resource.data.unlockedSongIds.size() - getResourceUnlockedSize()) <= 5');
      expect(rules).toContain('request.resource.data.totalCoinsSpent > getResourceSpent()');
    });
  });

  // =========================================================================
  // SEÇÃO 2: SIMULADOR DE LÓGICA DAS REGRAS DE SEGURANÇA
  // =========================================================================
  describe('2. Testes de Lógica e Simulação de Casos de Ataque e Uso Normal', () => {
    // Implementação das funções de validação espelhando exatamente a lógica das regras
    const isValidPlayerName = (name: any) =>
      typeof name === 'string' && name.length >= 1 && name.length <= 35;

    const isValidAvatar = (avatar: any) =>
      typeof avatar === 'string' && avatar.length >= 1 && avatar.length <= 60;

    const isValidSeason = (season: any) => season === 's1';

    const hasNoPrivateData = (data: any) =>
      !('email' in data) &&
      !('token' in data) &&
      !('password' in data) &&
      !('secret' in data) &&
      !('admin' in data) &&
      !('role' in data);

    const isAdmin = (auth: any) =>
      auth !== null && (auth.token?.admin === true || auth.token?.role === 'SUPER_ADMIN');

    const isValidUserProfileKeys = (data: any) => {
      const allowedKeys = new Set([
        'uid', 'name', 'avatar',
        'rockCoins', 'totalCoinsEarned', 'totalCoinsSpent',
        'unlockedSongIds', 'achievements', 'records', 'settings',
        'transactions', 'season', 'migrationVersion', 'lastPlayedAt', 'updatedAt'
      ]);
      const requiredKeys = [
        'uid', 'name', 'avatar',
        'rockCoins', 'totalCoinsEarned', 'totalCoinsSpent',
        'unlockedSongIds', 'season', 'updatedAt'
      ];
      const keys = Object.keys(data);
      const onlyAllowed = keys.every(k => allowedKeys.has(k));
      const hasAllRequired = requiredKeys.every(k => keys.includes(k));
      return onlyAllowed && hasAllRequired;
    };

    const isValidUserProfileData = (auth: any, data: any) => {
      if (typeof data.uid !== 'string' || data.uid !== auth?.uid) return false;
      if (!isValidPlayerName(data.name)) return false;
      if (!isValidAvatar(data.avatar)) return false;
      if (!isValidSeason(data.season)) return false;
      if (typeof data.updatedAt !== 'number') return false;
      if (typeof data.rockCoins !== 'number' || data.rockCoins < 0) return false;
      if (typeof data.totalCoinsEarned !== 'number' || data.totalCoinsEarned < 0) return false;
      if (typeof data.totalCoinsSpent !== 'number' || data.totalCoinsSpent < 0) return false;
      if (data.totalCoinsEarned > 500000) return false;
      if (data.rockCoins > data.totalCoinsEarned) return false;
      if (!Array.isArray(data.unlockedSongIds)) return false;
      if (data.unlockedSongIds.length < 3 || data.unlockedSongIds.length > 250) return false;
      const initial3 = ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo'];
      if (!initial3.every(id => data.unlockedSongIds.includes(id))) return false;
      if ('achievements' in data && (typeof data.achievements !== 'object' || data.achievements === null || Array.isArray(data.achievements))) return false;
      if ('records' in data && (typeof data.records !== 'object' || data.records === null || Array.isArray(data.records))) return false;
      if ('settings' in data && (typeof data.settings !== 'object' || data.settings === null || Array.isArray(data.settings))) return false;
      if ('transactions' in data && !Array.isArray(data.transactions)) return false;
      if ('migrationVersion' in data && typeof data.migrationVersion !== 'number') return false;
      if ('lastPlayedAt' in data && typeof data.lastPlayedAt !== 'number') return false;
      if (!hasNoPrivateData(data)) return false;
      return true;
    };

    const getResourceCoins = (existing: any) =>
      ('rockCoins' in existing && typeof existing.rockCoins === 'number') ? existing.rockCoins : 0;

    const getResourceEarned = (existing: any) =>
      ('totalCoinsEarned' in existing && typeof existing.totalCoinsEarned === 'number') ? existing.totalCoinsEarned : getResourceCoins(existing);

    const getResourceSpent = (existing: any) =>
      ('totalCoinsSpent' in existing && typeof existing.totalCoinsSpent === 'number') ? existing.totalCoinsSpent : 0;

    const getResourceUnlockedSize = (existing: any) =>
      ('unlockedSongIds' in existing && Array.isArray(existing.unlockedSongIds)) ? existing.unlockedSongIds.length : 3;

    // Simulador de allow create
    const simulateCreateUser = (auth: any, userId: string, data: any) => {
      if (!auth || auth.uid !== userId) return false;
      if (!isValidUserProfileKeys(data)) return false;
      if (!isValidUserProfileData(auth, data)) return false;
      if (data.totalCoinsEarned > 10000) return false;
      if (data.unlockedSongIds.length > 50) return false;
      return true;
    };

    // Simulador de allow update
    const simulateUpdateUser = (auth: any, userId: string, existing: any, updated: any) => {
      if (!auth) return false;
      if (isAdmin(auth)) return true;
      if (auth.uid !== userId) return false;
      if (updated.uid !== existing.uid) return false;
      if (updated.season !== existing.season) return false;
      if (!isValidUserProfileKeys(updated)) return false;
      if (!isValidUserProfileData(auth, updated)) return false;

      // 1. Integridade de músicas: desbloqueios anteriores nunca podem ser revogados
      const existingSongs = Array.isArray(existing.unlockedSongIds) ? existing.unlockedSongIds : ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo'];
      if (!existingSongs.every((id: string) => updated.unlockedSongIds.includes(id))) return false;

      const prevUnlockedCount = getResourceUnlockedSize(existing);
      const newUnlockedCount = updated.unlockedSongIds.length;
      if (newUnlockedCount < prevUnlockedCount) return false;
      if ((newUnlockedCount - prevUnlockedCount) > 5) return false;

      // 2. Proteção Econômica de Desbloqueio
      const prevSpent = getResourceSpent(existing);
      const prevEarned = getResourceEarned(existing);
      const spentIncreased = updated.totalCoinsSpent > prevSpent;
      const earnedIncreased = updated.totalCoinsEarned > prevEarned;
      if (newUnlockedCount > prevUnlockedCount && !spentIncreased && !earnedIncreased) {
        return false;
      }

      // 3. Integridade de Moedas Ganhas
      if (updated.totalCoinsEarned < prevEarned) return false;
      if ((updated.totalCoinsEarned - prevEarned) > 150) return false;

      // 4. Integridade de Saldo
      const prevCoins = getResourceCoins(existing);
      if (updated.rockCoins > prevCoins) {
        if ((updated.rockCoins - prevCoins) > (updated.totalCoinsEarned - prevEarned)) {
          return false;
        }
      }

      // 5. Integridade de Gastos
      if (updated.totalCoinsSpent < prevSpent) return false;
      if (updated.rockCoins < prevCoins && updated.totalCoinsSpent <= prevSpent) {
        return false;
      }

      return true;
    };

    // Simulador de allow delete
    const simulateDeleteUser = () => false;

    // Cenários de teste
    const validAuth = { uid: 'user_123', token: {} };
    const adminAuth = { uid: 'admin_456', token: { admin: true } };

    const initialValidProfile = {
      uid: 'user_123',
      name: 'Davi Rock',
      avatar: 'rockbrazil-avatar-01',
      rockCoins: 0,
      totalCoinsEarned: 0,
      totalCoinsSpent: 0,
      unlockedSongIds: ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo'],
      achievements: {},
      records: {},
      settings: { musicVolume: 0.8 },
      transactions: [],
      season: 's1',
      migrationVersion: 14.0,
      updatedAt: 1700000000000
    };

    it('2.1. Permite criação de perfil inicial legítimo para novo usuário', () => {
      expect(simulateCreateUser(validAuth, 'user_123', initialValidProfile)).toBe(true);
    });

    it('2.2. Permite criação com dados trazidos de migração de Convidado legítimo', () => {
      const guestLinkedProfile = {
        ...initialValidProfile,
        rockCoins: 25,
        totalCoinsEarned: 35,
        totalCoinsSpent: 10,
        unlockedSongIds: ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo', 'leg-tempo-perdido', 'tit-policia']
      };
      expect(simulateCreateUser(validAuth, 'user_123', guestLinkedProfile)).toBe(true);
    });

    it('2.3. Bloqueia criação com saldo inicial absurdo (tentativa de injeção inicial de 1.000.000 moedas)', () => {
      const hackedInitial = {
        ...initialValidProfile,
        rockCoins: 1000000,
        totalCoinsEarned: 1000000
      };
      expect(simulateCreateUser(validAuth, 'user_123', hackedInitial)).toBe(false);
    });

    it('2.4. Bloqueia criação com excesso de músicas desbloqueadas (> 50 no cadastro inicial)', () => {
      const manySongs = Array.from({ length: 55 }, (_, i) => `song_${i}`);
      const hackedSongs = {
        ...initialValidProfile,
        unlockedSongIds: ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo', ...manySongs]
      };
      expect(simulateCreateUser(validAuth, 'user_123', hackedSongs)).toBe(false);
    });

    it('2.5. Permite atualização normal após concluir partida (ganho legítimo de 3 RockCoins)', () => {
      const existing = { ...initialValidProfile, rockCoins: 10, totalCoinsEarned: 20, totalCoinsSpent: 10 };
      const afterMatch = {
        ...existing,
        rockCoins: 13,
        totalCoinsEarned: 23,
        updatedAt: 1700001000000
      };
      expect(simulateUpdateUser(validAuth, 'user_123', existing, afterMatch)).toBe(true);
    });

    it('2.6. Permite atualização normal após comprar música misteriosa (-5 moedas, +5 gastos, +1 música)', () => {
      const existing = {
        ...initialValidProfile,
        rockCoins: 13,
        totalCoinsEarned: 23,
        totalCoinsSpent: 10,
        unlockedSongIds: ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo']
      };
      const afterPurchase = {
        ...existing,
        rockCoins: 8,
        totalCoinsSpent: 15,
        unlockedSongIds: ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo', 'leg-tempo-perdido'],
        updatedAt: 1700002000000
      };
      expect(simulateUpdateUser(validAuth, 'user_123', existing, afterPurchase)).toBe(true);
    });

    it('2.7. Permite atualização de nome e avatar nas configurações', () => {
      const existing = { ...initialValidProfile, rockCoins: 10, totalCoinsEarned: 20, totalCoinsSpent: 10 };
      const afterSettings = {
        ...existing,
        name: 'Mestre do Rock',
        avatar: 'rockbrazil-avatar-05',
        updatedAt: 1700003000000
      };
      expect(simulateUpdateUser(validAuth, 'user_123', existing, afterSettings)).toBe(true);
    });

    it('2.8. Bloqueia manipulação direta de rockCoins (cheater altera rockCoins sem ter ganho totalCoinsEarned)', () => {
      const existing = { ...initialValidProfile, rockCoins: 10, totalCoinsEarned: 20, totalCoinsSpent: 10 };
      const hackedCoins = {
        ...existing,
        rockCoins: 999999
      };
      expect(simulateUpdateUser(validAuth, 'user_123', existing, hackedCoins)).toBe(false);
    });

    it('2.9. Bloqueia manipulação direta de totalCoinsEarned (cheater tenta saltar 10.000 moedas de uma vez)', () => {
      const existing = { ...initialValidProfile, rockCoins: 10, totalCoinsEarned: 20, totalCoinsSpent: 10 };
      const hackedJump = {
        ...existing,
        rockCoins: 10010,
        totalCoinsEarned: 10020
      };
      expect(simulateUpdateUser(validAuth, 'user_123', existing, hackedJump)).toBe(false);
    });

    it('2.10. Bloqueia desbloqueio fraudulento de músicas sem gastar moedas e sem jogar', () => {
      const existing = { ...initialValidProfile, rockCoins: 10, totalCoinsEarned: 20, totalCoinsSpent: 10 };
      const freeUnlockHacked = {
        ...existing,
        unlockedSongIds: [...existing.unlockedSongIds, 'leg-tempo-perdido']
        // totalCoinsSpent e totalCoinsEarned mantidos iguais -> FRAUDE!
      };
      expect(simulateUpdateUser(validAuth, 'user_123', existing, freeUnlockHacked)).toBe(false);
    });

    it('2.11. Bloqueia desbloqueio em massa de músicas (> 5 músicas em uma única sincronização)', () => {
      const existing = { ...initialValidProfile, rockCoins: 100, totalCoinsEarned: 200, totalCoinsSpent: 100 };
      const massUnlock = {
        ...existing,
        rockCoins: 50,
        totalCoinsSpent: 150,
        unlockedSongIds: [...existing.unlockedSongIds, 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']
      };
      expect(simulateUpdateUser(validAuth, 'user_123', existing, massUnlock)).toBe(false);
    });

    it('2.12. Bloqueia tentativa de "reembolso" fraudulento (reduzir totalCoinsSpent)', () => {
      const existing = { ...initialValidProfile, rockCoins: 10, totalCoinsEarned: 50, totalCoinsSpent: 40 };
      const hackedRefund = {
        ...existing,
        rockCoins: 30,
        totalCoinsSpent: 20 // Tentativa de recuperar 20 moedas gastas
      };
      expect(simulateUpdateUser(validAuth, 'user_123', existing, hackedRefund)).toBe(false);
    });

    it('2.13. Bloqueia revogação ou perda acidental de músicas já desbloqueadas', () => {
      const existing = {
        ...initialValidProfile,
        unlockedSongIds: ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo', 'leg-tempo-perdido']
      };
      const songsRemoved = {
        ...existing,
        unlockedSongIds: ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo'] // Removeu leg-tempo-perdido
      };
      expect(simulateUpdateUser(validAuth, 'user_123', existing, songsRemoved)).toBe(false);
    });

    it('2.14. Bloqueia exclusão de documentos de usuários (allow delete: if false)', () => {
      expect(simulateDeleteUser()).toBe(false);
    });

    it('2.15. Bloqueia usuário tentando gravar no documento de outro jogador', () => {
      const existing = { ...initialValidProfile };
      expect(simulateUpdateUser(validAuth, 'outro_usuario_999', existing, existing)).toBe(false);
    });

    it('2.16. Bloqueia tentativa de injeção de privilégio admin no documento de usuário', () => {
      const existing = { ...initialValidProfile };
      const hackedAdminRole = {
        ...existing,
        role: 'SUPER_ADMIN',
        admin: true
      };
      expect(simulateUpdateUser(validAuth, 'user_123', existing, hackedAdminRole)).toBe(false);
    });

    it('2.17. Garante compatibilidade com perfil legado existente (campos ausentes não quebram)', () => {
      const legacyExisting = {
        uid: 'user_123',
        name: 'Jogador Antigo',
        avatar: 'rockbrazil-avatar-01',
        rockCoins: 15,
        // totalCoinsEarned e totalCoinsSpent não existiam na versão legada
        unlockedSongIds: ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo'],
        season: 's1',
        updatedAt: 1600000000000
      };
      const updatedMigrated = {
        ...legacyExisting,
        totalCoinsEarned: 15,
        totalCoinsSpent: 0,
        updatedAt: 1700000000000
      };
      expect(simulateUpdateUser(validAuth, 'user_123', legacyExisting, updatedMigrated)).toBe(true);
    });

    it('2.18. Permite que administradores autenticados façam manutenção sem serem bloqueados', () => {
      const existing = { ...initialValidProfile };
      const adminMaintenance = {
        ...existing,
        rockCoins: 50,
        totalCoinsEarned: 100
      };
      expect(simulateUpdateUser(adminAuth, 'user_123', existing, adminMaintenance)).toBe(true);
    });
  });
});
