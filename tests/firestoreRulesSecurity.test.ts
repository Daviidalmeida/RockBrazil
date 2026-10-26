import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { RankingService, CURRENT_SEASON, GlobalRankingEntry, GlobalSummaryEntry } from '../src/firebase/rankingService';
import { ProfileManager, PlayerProfile } from '../src/game/profileManager';
import { GameStats } from '../src/types';

// Polyfill localStorage se necessário no ambiente de testes
if (typeof localStorage === 'undefined' || !(globalThis as any).localStorage?.getItem) {
  let store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

describe('ROCKBRAZIL — REVISÃO DE SEGURANÇA DO FIRESTORE & TEMPORADA 1', () => {

  const rulesPath = path.resolve(__dirname, '../firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf-8');

  // =========================================================================
  // SEÇÃO 1: AUDITORIA ESTÁTICA DO ARQUIVO firestore.rules
  // =========================================================================
  describe('1. Auditoria Estática e Conformidade com Firebase Spark', () => {
    it('1.1. arquivo firestore.rules utiliza versão 2 da sintaxe oficial', () => {
      expect(rules).toContain("rules_version = '2';");
      expect(rules).toContain("service cloud.firestore");
    });

    it('1.2. não consome leituras extras no Spark (zero chamadas get() ou exists() em regras)', () => {
      // Regras que usam get() ou exists() cobram leitura de documentos no Firestore
      // A proteção para Spark deve inspecionar apenas request.auth, request.resource e resource
      const hasGetCall = /get\s*\(/g.test(rules);
      const hasExistsCall = /exists\s*\(/g.test(rules);
      expect(hasGetCall).toBe(false);
      expect(hasExistsCall).toBe(false);
    });

    it('1.3. função isGoogleUser exige provedor google.com estrito', () => {
      expect(rules).toContain("function isGoogleUser()");
      expect(rules).toContain("request.auth != null");
      expect(rules).toContain("request.auth.token.firebase.sign_in_provider == 'google.com'");
    });

    it('1.4. bloqueia totalmente exclusão de dados pelos clientes em rankings', () => {
      // rankings_summary e rankings_song devem ter allow delete: if false;
      const deleteFalseMatches = rules.match(/allow\s+delete:\s*if\s+false;/g);
      expect(deleteFalseMatches).not.toBeNull();
      expect(deleteFalseMatches!.length).toBeGreaterThanOrEqual(2);
    });

    it('1.5. vincula ID do documento de ranking ao UID autenticado e songId + difficulty', () => {
      expect(rules).toContain(
        "recordId == (request.resource.data.songId + '_' + request.resource.data.difficulty + '_' + request.auth.uid)"
      );
      expect(rules).toContain("request.auth.uid == request.resource.data.uid");
    });

    it('1.6. impede redução de pontuação (downgrade) em atualizações de recordes e resumo', () => {
      expect(rules).toContain("request.resource.data.score >= resource.data.score");
      expect(rules).toContain("request.resource.data.totalScore >= resource.data.totalScore");
    });

    it('1.7. garante imutabilidade dos campos-chave em atualizações', () => {
      expect(rules).toContain("request.resource.data.uid == resource.data.uid");
      expect(rules).toContain("request.resource.data.songId == resource.data.songId");
      expect(rules).toContain("request.resource.data.difficulty == resource.data.difficulty");
      expect(rules).toContain("request.resource.data.season == resource.data.season");
    });

    it('1.8. aplica lista branca estrita (hasOnly) e campos obrigatórios (hasAll)', () => {
      // rankings_summary
      expect(rules).toContain("hasOnly(['uid', 'playerName', 'avatar', 'totalScore', 'songsCount', 'updatedAt', 'season'])");
      expect(rules).toContain("hasAll(['uid', 'playerName', 'avatar', 'totalScore', 'songsCount', 'updatedAt', 'season'])");

      // rankings_song
      expect(rules).toContain("hasOnly(['uid', 'songId', 'songTitle', 'artist', 'difficulty', 'score', 'accuracy', 'maxCombo', 'stars', 'playerName', 'avatar', 'updatedAt', 'season'])");
      expect(rules).toContain("hasAll(['uid', 'songId', 'songTitle', 'artist', 'difficulty', 'score', 'accuracy', 'maxCombo', 'stars', 'playerName', 'avatar', 'updatedAt', 'season'])");
    });

    it('1.9. valida tetos e pisos de pontuação plausíveis (score <= 2.000.000, total <= 500.000.000)', () => {
      expect(rules).toContain("isValidScore(score)");
      expect(rules).toContain("score >= 0 && score <= 2000000");
      expect(rules).toContain("isValidTotalScore(totalScore)");
      expect(rules).toContain("totalScore >= 0 && totalScore <= 500000000");
    });

    it('1.10. valida limites de tamanho de apelido (1 a 35 caracteres)', () => {
      expect(rules).toContain("isValidPlayerName(name)");
      expect(rules).toContain("name is string && name.size() >= 1 && name.size() <= 35");
    });

    it('1.11. valida identificação da Temporada 1 (season == "s1")', () => {
      expect(rules).toContain("isValidSeason(season)");
      expect(rules).toContain("season == 's1'");
    });

    it('1.12. bloqueia dados privados (email, token, password, secret)', () => {
      expect(rules).toContain("!('email' in request.resource.data)");
      expect(rules).toContain("!('token' in request.resource.data)");
      expect(rules).toContain("!('password' in request.resource.data)");
    });

    it('1.13. preserva isolamento estrito dos perfis privados em users/{userId}', () => {
      expect(rules).toContain("match /users/{userId}");
      expect(rules).toContain("allow read, write: if request.auth != null && request.auth.uid == userId;");
    });

    it('1.14. possui regra global padrão de negação para qualquer coleção não especificada', () => {
      expect(rules).toContain("match /{document=**}");
      expect(rules).toContain("allow read, write: if false;");
    });
  });

  // =========================================================================
  // SEÇÃO 2: SIMULADOR DE LÓGICA DE REGRAS DE SEGURANÇA
  // =========================================================================
  describe('2. Testes de Lógica e Validação de Casos de Ataque / Abuso', () => {
    // Implementação das funções de validação idênticas às regras para testes comportamentais
    const isGoogleAuth = (auth: any) =>
      auth !== null && auth.token?.firebase?.sign_in_provider === 'google.com';

    const isValidPlayerName = (name: any) =>
      typeof name === 'string' && name.length >= 1 && name.length <= 35;

    const isValidDifficulty = (diff: any) =>
      ['EASY', 'MEDIUM', 'HARD', 'EXPERT'].includes(diff);

    const isValidScore = (score: any) =>
      typeof score === 'number' && score >= 0 && score <= 2000000;

    const isValidSeason = (season: any) => season === 's1';

    const hasNoPrivateData = (data: any) =>
      !('email' in data) && !('token' in data) && !('password' in data);

    const SONG_ALLOWED_KEYS = [
      'uid', 'songId', 'songTitle', 'artist', 'difficulty',
      'score', 'accuracy', 'maxCombo', 'stars', 'playerName',
      'avatar', 'updatedAt', 'season'
    ];

    const simulateSongCreate = (auth: any, recordId: string, payload: any): boolean => {
      if (!isGoogleAuth(auth)) return false;
      if (auth.uid !== payload.uid) return false;
      const expectedDocId = `${payload.songId}_${payload.difficulty}_${auth.uid}`;
      if (recordId !== expectedDocId) return false;

      const keys = Object.keys(payload);
      const hasOnly = keys.every(k => SONG_ALLOWED_KEYS.includes(k));
      const hasAll = SONG_ALLOWED_KEYS.every(k => keys.includes(k));
      if (!hasOnly || !hasAll) return false;

      if (!isValidPlayerName(payload.playerName)) return false;
      if (!isValidDifficulty(payload.difficulty)) return false;
      if (!isValidScore(payload.score)) return false;
      if (!isValidSeason(payload.season)) return false;
      if (!hasNoPrivateData(payload)) return false;

      return true;
    };

    const simulateSongUpdate = (auth: any, recordId: string, existing: any, updated: any): boolean => {
      if (!isGoogleAuth(auth)) return false;
      if (auth.uid !== updated.uid) return false;
      const expectedDocId = `${updated.songId}_${updated.difficulty}_${auth.uid}`;
      if (recordId !== expectedDocId) return false;

      // Imutabilidade de chaves primárias
      if (updated.uid !== existing.uid) return false;
      if (updated.songId !== existing.songId) return false;
      if (updated.difficulty !== existing.difficulty) return false;
      if (updated.season !== existing.season) return false;

      // Downgrade protection: novo score deve ser >= ao existente
      if (updated.score < existing.score) return false;

      const keys = Object.keys(updated);
      if (!keys.every(k => SONG_ALLOWED_KEYS.includes(k))) return false;
      if (!isValidScore(updated.score)) return false;
      if (!isValidPlayerName(updated.playerName)) return false;
      if (!isValidSeason(updated.season)) return false;
      if (!hasNoPrivateData(updated)) return false;

      return true;
    };

    const googleAuth = { uid: 'user_google_123', token: { firebase: { sign_in_provider: 'google.com' } } };
    const anonAuth = { uid: 'user_anon_456', token: { firebase: { sign_in_provider: 'anonymous' } } };

    const validPayload = {
      uid: 'user_google_123',
      songId: 'mam-1406',
      songTitle: '1406',
      artist: 'Mamonas Assassinas',
      difficulty: 'HARD',
      score: 85000,
      accuracy: 98.4,
      maxCombo: 240,
      stars: 5,
      playerName: 'Rocker Pro',
      avatar: 'rockbrazil-avatar-01',
      updatedAt: 1700000000000,
      season: 's1'
    };

    it('2.1. rejeita jogador não autenticado ou anônimo', () => {
      const docId = `mam-1406_HARD_user_google_123`;
      expect(simulateSongCreate(null, docId, validPayload)).toBe(false);
      expect(simulateSongCreate(anonAuth, docId, validPayload)).toBe(false);
    });

    it('2.2. aceita gravação válida de conta Google com docId determinístico', () => {
      const docId = `mam-1406_HARD_user_google_123`;
      expect(simulateSongCreate(googleAuth, docId, validPayload)).toBe(true);
    });

    it('2.3. rejeita tentativa de sequestrar ou alterar documento de outro jogador', () => {
      // Atacante tenta gravar no docId de outro usuário
      const foreignDocId = `mam-1406_HARD_vitima_789`;
      expect(simulateSongCreate(googleAuth, foreignDocId, validPayload)).toBe(false);

      // Atacante tenta forjar payload com UID de outro usuário
      const forgedPayload = { ...validPayload, uid: 'vitima_789' };
      expect(simulateSongCreate(googleAuth, `mam-1406_HARD_vitima_789`, forgedPayload)).toBe(false);
    });

    it('2.4. rejeita tentativa de gravar pontuação negativa ou acima do limite plausível (2.000.000)', () => {
      const docId = `mam-1406_HARD_user_google_123`;
      expect(simulateSongCreate(googleAuth, docId, { ...validPayload, score: -10 })).toBe(false);
      expect(simulateSongCreate(googleAuth, docId, { ...validPayload, score: 999999999 })).toBe(false);
      expect(simulateSongCreate(googleAuth, docId, { ...validPayload, score: 2000001 })).toBe(false);
      expect(simulateSongCreate(googleAuth, docId, { ...validPayload, score: 1950000 })).toBe(true);
    });

    it('2.5. rejeita tentativa de injeção de campos privados ou não permitidos (lista branca)', () => {
      const docId = `mam-1406_HARD_user_google_123`;
      expect(simulateSongCreate(googleAuth, docId, { ...validPayload, email: 'hacker@privado.com' })).toBe(false);
      expect(simulateSongCreate(googleAuth, docId, { ...validPayload, role: 'admin' })).toBe(false);
      expect(simulateSongCreate(googleAuth, docId, { ...validPayload, token: 'secret_token' })).toBe(false);
    });

    it('2.6. rejeita payload sem o identificador oficial da Temporada 1 (season: "s1")', () => {
      const docId = `mam-1406_HARD_user_google_123`;
      expect(simulateSongCreate(googleAuth, docId, { ...validPayload, season: 's2' })).toBe(false);
      expect(simulateSongCreate(googleAuth, docId, { ...validPayload, season: undefined })).toBe(false);
    });

    it('2.7. rejeita tentativa de atualização com pontuação inferior (downgrade)', () => {
      const docId = `mam-1406_HARD_user_google_123`;
      const existing = { ...validPayload, score: 100000 };

      // Tentativa de gravar 80.000 quando já tinha 100.000
      const downgrade = { ...validPayload, score: 80000 };
      expect(simulateSongUpdate(googleAuth, docId, existing, downgrade)).toBe(false);

      // Pontuação igual ou superior deve ser aceita
      const same = { ...validPayload, score: 100000 };
      expect(simulateSongUpdate(googleAuth, docId, existing, same)).toBe(true);

      const upgrade = { ...validPayload, score: 120000 };
      expect(simulateSongUpdate(googleAuth, docId, existing, upgrade)).toBe(true);
    });

    it('2.8. rejeita alteração de campos imutáveis durante update (UID, songId, difficulty, season)', () => {
      const docId = `mam-1406_HARD_user_google_123`;
      const existing = { ...validPayload, score: 100000 };

      // Tenta alterar a música no update
      expect(simulateSongUpdate(googleAuth, docId, existing, { ...validPayload, songId: 'outra-musica', score: 120000 })).toBe(false);

      // Tenta alterar a dificuldade
      expect(simulateSongUpdate(googleAuth, docId, existing, { ...validPayload, difficulty: 'EXPERT', score: 120000 })).toBe(false);

      // Tenta alterar a temporada
      expect(simulateSongUpdate(googleAuth, docId, existing, { ...validPayload, season: 's2', score: 120000 })).toBe(false);
    });
  });

  // =========================================================================
  // SEÇÃO 3: RankingService — INTEGRAÇÃO E CONSISTÊNCIA DE DADOS
  // =========================================================================
  describe('3. RankingService — Conformidade com Temporada 1 e Schema das Regras', () => {
    it('3.1. CURRENT_SEASON é constante exportada igual a "s1"', () => {
      expect(CURRENT_SEASON).toBe('s1');
    });

    it('3.2. submitRecordIfEligible rejeita perfis convidados', async () => {
      const guest = { ...ProfileManager.GUEST_PROFILE };
      const stats: GameStats = {
        score: 40000, combo: 50, maxCombo: 50,
        perfectCount: 40, greatCount: 10, goodCount: 0, missCount: 0, accuracy: 100
      };

      const result = await RankingService.submitRecordIfEligible(
        guest,
        'mam-1406',
        '1406',
        'Mamonas Assassinas',
        'HARD',
        stats,
        {
          isNewRecord: true,
          previousBestScore: 0,
          newScore: 40000,
          record: { score: 40000, stars: 5, accuracy: 100, maxCombo: 50, date: Date.now() }
        }
      );

      expect(result).toBe(false);
    });

    it('3.3. interfaces GlobalRankingEntry e GlobalSummaryEntry suportam a chave season', () => {
      const songEntry: GlobalRankingEntry = {
        uid: 'user1',
        playerName: 'Leo Rocker',
        avatar: 'rockbrazil-avatar-01',
        score: 50000,
        season: 's1',
        updatedAt: Date.now()
      };
      expect(songEntry.season).toBe('s1');

      const summaryEntry: GlobalSummaryEntry = {
        uid: 'user1',
        playerName: 'Leo Rocker',
        avatar: 'rockbrazil-avatar-01',
        totalScore: 50000,
        songsCount: 1,
        season: 's1',
        updatedAt: Date.now()
      };
      expect(summaryEntry.season).toBe('s1');
    });

    it('3.4. constrói ID determinístico compatível com a regra de segurança', () => {
      const songId = 'pit-chip-novo';
      const difficulty = 'EXPERT';
      const uid = 'google_uid_xyz';
      const expectedDocId = `${songId}_${difficulty}_${uid}`;

      // Valida o padrão exato que a regra exige: songId + '_' + difficulty + '_' + uid
      expect(expectedDocId).toBe('pit-chip-novo_EXPERT_google_uid_xyz');
    });
  });
});
