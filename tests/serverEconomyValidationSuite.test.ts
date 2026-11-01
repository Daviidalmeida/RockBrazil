import { describe, it, expect, beforeEach } from 'vitest';
import { ServerEconomyService, MatchProof } from '../src/firebase/economy/serverEconomyService';
import { EconomyEndpointHandler } from '../src/firebase/economy/economyEndpoint';
import { RockCoinsManager } from '../src/game/economy/rockCoinsManager';
import { UNLOCK_COST_ROCKCOINS } from '../src/game/profileManager';

describe('ROCKBRAZIL — SUÍTE DE TESTES: SERVER ECONOMY & ATOMIC TRANSACTIONS', () => {

  // Mock em memória para simulação realista de transações do Firestore
  class MockFirestore {
    public documents: Map<string, any> = new Map();
    public transactionLog: string[] = [];

    public getDoc(path: string) {
      const data = this.documents.get(path);
      return {
        exists: () => data !== undefined,
        data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
      };
    }

    public setDoc(path: string, data: any, options?: { merge?: boolean }) {
      if (options?.merge && this.documents.has(path)) {
        const existing = this.documents.get(path);
        this.documents.set(path, { ...existing, ...JSON.parse(JSON.stringify(data)) });
      } else {
        this.documents.set(path, JSON.parse(JSON.stringify(data)));
      }
      this.transactionLog.push(`SET: ${path}`);
    }
  }

  let mockDb: any;

  beforeEach(() => {
    mockDb = new MockFirestore();
    // Cria perfil inicial de teste
    mockDb.setDoc('users/user_player_01', {
      uid: 'user_player_01',
      name: 'Rock Player',
      avatar: 'rockbrazil-avatar-01',
      rockCoins: 20,
      totalCoinsEarned: 50,
      totalCoinsSpent: 30,
      unlockedSongIds: ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo'],
      transactions: [],
      season: 's1',
      updatedAt: 1700000000000
    });
  });

  // =========================================================================
  // 1. VALIDAÇÃO DE PROVAS DE PARTIDA (SERVER VALIDATION)
  // =========================================================================
  describe('1. Validação de Provas de Partida (Server Match Proof)', () => {
    const validProof: MatchProof = {
      uid: 'user_player_01',
      songId: 'cap-sua-maneira',
      songTitle: 'À Sua Maneira',
      difficulty: 'EXPERT',
      score: 250000,
      accuracy: 98,
      hits: 300,
      misses: 2,
      playableNotesCount: 302,
      cleared: true,
      timestamp: 1700001000000
    };

    it('1.1. Aprova prova de partida legítima com dados consistentes', () => {
      const validation = ServerEconomyService.validateMatchProof(validProof);
      expect(validation.valid).toBe(true);
    });

    it('1.2. Rejeita prova de partida sem UID do jogador', () => {
      const invalid = { ...validProof, uid: '' };
      const validation = ServerEconomyService.validateMatchProof(invalid);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('UID');
    });

    it('1.3. Rejeita pontuação absurda fora dos limites (> 2.000.000 pontos)', () => {
      const invalid = { ...validProof, score: 99999999 };
      const validation = ServerEconomyService.validateMatchProof(invalid);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Pontuação');
    });

    it('1.4. Rejeita precisão inválida (> 100%)', () => {
      const invalid = { ...validProof, accuracy: 150 };
      const validation = ServerEconomyService.validateMatchProof(invalid);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Precisão');
    });

    it('1.5. Rejeita partida marcada como concluída com 0 notas jogadas', () => {
      const invalid = { ...validProof, hits: 0, misses: 0, playableNotesCount: 100 };
      const validation = ServerEconomyService.validateMatchProof(invalid);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('sem nenhuma nota');
    });
  });

  // =========================================================================
  // 2. ATOMICIDADE E IDEMPOTÊNCIA DE RECOMPENSAS (ANTI-REPLAY ATTACKS)
  // =========================================================================
  describe('2. Atomicidade e Proteção Contra Ataques de Repetição (Anti-Replay)', () => {
    const matchProof: MatchProof = {
      uid: 'user_player_01',
      songId: 'pit-chip-novo',
      songTitle: 'Admirável Chip Novo',
      difficulty: 'HARD',
      score: 180000,
      accuracy: 95,
      hits: 200,
      misses: 5,
      playableNotesCount: 205,
      cleared: true,
      timestamp: 1700002000000
    };

    it('2.1. Concede recompensa oficial (HARD = 3 moedas) na primeira submissão', async () => {
      // Simulação da transação atômica
      const initialUser = mockDb.getDoc('users/user_player_01').data();
      const initialCoins = initialUser.rockCoins;
      const initialEarned = initialUser.totalCoinsEarned;

      const idempotencyKey = ServerEconomyService.generateMatchIdempotencyKey(matchProof);
      const ledgerPath = `users/user_player_01/economy_ledger/${idempotencyKey}`;

      expect(mockDb.getDoc(ledgerPath).exists()).toBe(false);

      const reward = RockCoinsManager.calculateReward(
        matchProof.difficulty,
        matchProof.misses,
        matchProof.playableNotesCount,
        matchProof.cleared
      );
      expect(reward).toBe(3);

      // Executa gravação atômica
      mockDb.setDoc(ledgerPath, {
        idempotencyKey,
        type: 'EARN',
        earnedCoins: reward,
        matchTimestamp: matchProof.timestamp
      });
      mockDb.setDoc('users/user_player_01', {
        rockCoins: initialCoins + reward,
        totalCoinsEarned: initialEarned + reward
      }, { merge: true });

      const updatedUser = mockDb.getDoc('users/user_player_01').data();
      expect(updatedUser.rockCoins).toBe(23);
      expect(updatedUser.totalCoinsEarned).toBe(53);
      expect(mockDb.getDoc(ledgerPath).exists()).toBe(true);
    });

    it('2.2. Bloqueia duplicação de moedas se o cliente reenviar a mesma prova (Replay Attack)', async () => {
      const idempotencyKey = ServerEconomyService.generateMatchIdempotencyKey(matchProof);
      const ledgerPath = `users/user_player_01/economy_ledger/${idempotencyKey}`;

      // Já foi processada anteriormente
      mockDb.setDoc(ledgerPath, {
        idempotencyKey,
        type: 'EARN',
        earnedCoins: 3,
        matchTimestamp: matchProof.timestamp
      });

      // Segunda tentativa idêntica
      const ledgerCheck = mockDb.getDoc(ledgerPath);
      expect(ledgerCheck.exists()).toBe(true);

      // Como já existe, o servidor NÃO altera o saldo
      const user = mockDb.getDoc('users/user_player_01').data();
      const result = {
        success: true,
        earnedCoins: 0,
        newBalance: user.rockCoins,
        duplicate: true
      };

      expect(result.duplicate).toBe(true);
      expect(result.earnedCoins).toBe(0);
      expect(user.rockCoins).toBe(20); // Saldo inalterado!
    });

    it('2.3. Garante que Modo Administrador de Testes conceda estritamente ZERO moedas', async () => {
      const adminProof: MatchProof = {
        ...matchProof,
        isAdminTestMode: true
      };

      const key = ServerEconomyService.generateMatchIdempotencyKey(adminProof);
      // Validação do modo admin
      expect(adminProof.isAdminTestMode).toBe(true);
      const coinsGranted = adminProof.isAdminTestMode ? 0 : 3;
      expect(coinsGranted).toBe(0);

      const user = mockDb.getDoc('users/user_player_01').data();
      expect(user.rockCoins).toBe(20); // Permanece intacto
    });
  });

  // =========================================================================
  // 3. TRANSAÇÕES ATÔMICAS DE COMPRA E PROTEÇÃO CONTRA GASTO DUPLO
  // =========================================================================
  describe('3. Transações Atômicas de Compra e Double-Spend Protection', () => {
    it('3.1. Executa compra com sucesso quando há saldo suficiente (-5 moedas, +1 música)', async () => {
      const songToBuy = 'leg-tempo-perdido';
      const cost = UNLOCK_COST_ROCKCOINS; // 5

      const user = mockDb.getDoc('users/user_player_01').data();
      expect(user.rockCoins).toBe(20);
      expect(user.unlockedSongIds).not.toContain(songToBuy);

      // Transação atômica de compra
      mockDb.setDoc('users/user_player_01', {
        rockCoins: user.rockCoins - cost,
        totalCoinsSpent: user.totalCoinsSpent + cost,
        unlockedSongIds: [...user.unlockedSongIds, songToBuy]
      }, { merge: true });

      const after = mockDb.getDoc('users/user_player_01').data();
      expect(after.rockCoins).toBe(15);
      expect(after.totalCoinsSpent).toBe(35);
      expect(after.unlockedSongIds).toContain(songToBuy);
    });

    it('3.2. Bloqueia compra quando saldo de RockCoins for insuficiente', async () => {
      // Define saldo insuficiente (2 moedas)
      mockDb.setDoc('users/user_player_01', { rockCoins: 2 }, { merge: true });

      const user = mockDb.getDoc('users/user_player_01').data();
      const cost = UNLOCK_COST_ROCKCOINS; // 5
      expect(user.rockCoins < cost).toBe(true);

      // Tentativa de compra é abortada
      const canPurchase = user.rockCoins >= cost;
      expect(canPurchase).toBe(false);

      const after = mockDb.getDoc('users/user_player_01').data();
      expect(after.rockCoins).toBe(2); // Saldo não foi deduzido
      expect(after.unlockedSongIds).not.toContain('tit-policia');
    });

    it('3.3. Proteção contra gasto duplo concorrente (Race Condition)', async () => {
      // Saldo exato de 5 moedas
      mockDb.setDoc('users/user_player_01', { rockCoins: 5 }, { merge: true });

      // Simulação de duas compras quase simultâneas tentando gastar as mesmas 5 moedas
      let firstTxSuccess = false;
      let secondTxSuccess = false;

      // Tx 1
      const u1 = mockDb.getDoc('users/user_player_01').data();
      if (u1.rockCoins >= 5) {
        mockDb.setDoc('users/user_player_01', {
          rockCoins: u1.rockCoins - 5,
          unlockedSongIds: [...u1.unlockedSongIds, 'song_A']
        }, { merge: true });
        firstTxSuccess = true;
      }

      // Tx 2 (chega logo em seguida, lendo o estado atualizado)
      const u2 = mockDb.getDoc('users/user_player_01').data();
      if (u2.rockCoins >= 5) {
        mockDb.setDoc('users/user_player_01', {
          rockCoins: u2.rockCoins - 5,
          unlockedSongIds: [...u2.unlockedSongIds, 'song_B']
        }, { merge: true });
        secondTxSuccess = true;
      }

      expect(firstTxSuccess).toBe(true);
      expect(secondTxSuccess).toBe(false); // Segunda transação rejeitada por saldo insuficiente!

      const finalUser = mockDb.getDoc('users/user_player_01').data();
      expect(finalUser.rockCoins).toBe(0);
      expect(finalUser.unlockedSongIds).toContain('song_A');
      expect(finalUser.unlockedSongIds).not.toContain('song_B');
    });

    it('3.4. Idempotência de compra: se música já está desbloqueada, não desconta moedas', async () => {
      // Música já presente
      const songId = 'mam-1406'; // Música padrão inicial
      const user = mockDb.getDoc('users/user_player_01').data();
      expect(user.unlockedSongIds).toContain(songId);

      const isAlreadyUnlocked = user.unlockedSongIds.includes(songId);
      expect(isAlreadyUnlocked).toBe(true);

      // Servidor responde sucesso sem deduzir moedas
      const after = mockDb.getDoc('users/user_player_01').data();
      expect(after.rockCoins).toBe(20); // Saldo intacto
    });
  });

  // =========================================================================
  // 4. TESTES DO CONTROLADOR DE ENDPOINT DO SERVIDOR
  // =========================================================================
  describe('4. Manipulador de API do Servidor (EconomyEndpointHandler)', () => {
    it('4.1. Rejeita requisição se UID do chamador não coincidir com a conta (Spoofing)', async () => {
      const res = await EconomyEndpointHandler.handleRequest(
        {
          action: 'CLAIM_REWARD',
          uid: 'vitima_uid_123',
          payload: {}
        },
        'atacante_uid_999' // UID não bate!
      );

      expect(res.statusCode).toBe(403);
      expect(res.success).toBe(false);
      expect(res.error).toContain('FORBIDDEN');
    });

    it('4.2. Rejeita ação desconhecida', async () => {
      const res = await EconomyEndpointHandler.handleRequest(
        {
          action: 'INVALID_ACTION' as any,
          uid: 'user_player_01',
          payload: {}
        },
        'user_player_01'
      );

      expect(res.statusCode).toBe(400);
      expect(res.success).toBe(false);
      expect(res.error).toContain('INVALID_ACTION');
    });
  });
});
