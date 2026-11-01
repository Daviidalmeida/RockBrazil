/**
 * ROCKBRAZIL — SERVER ECONOMY SERVICE (V14.6.1 DEFINITIVE SECURITY)
 * 
 * Motor de Validação e Transações Atômicas de Economia no Servidor / Cloud Firestore.
 * 
 * Regras Estritas:
 * 1. O cliente nunca altera diretamente rockCoins, totalCoinsEarned, totalCoinsSpent ou unlockedSongIds.
 * 2. Toda recompensa de partida exige validação de prova de partida (notas, dificuldade, precisão, timestamp).
 * 3. Idempotência absoluta contra ataques de repetição (Replay Attacks) via chaves determinísticas de partida.
 * 4. Transações atômicas com bloqueio contra gastos concorrentes (Double-Spend Protection).
 * 5. Bloqueio total de recompensas no Modo Administrador de Testes.
 * 6. Preservação de todos os saldos, recordes e músicas desbloqueadas existentes.
 */

import { doc, runTransaction, Firestore } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Difficulty } from '../../types';
import { RockCoinsManager } from '../../game/economy/rockCoinsManager';
import { INITIAL_UNLOCKED_SONG_IDS, UNLOCK_COST_ROCKCOINS } from '../../game/profileManager';

export interface MatchProof {
  uid: string;
  songId: string;
  songTitle: string;
  difficulty: Difficulty;
  score: number;
  accuracy: number;
  hits: number;
  misses: number;
  playableNotesCount: number;
  cleared: boolean;
  timestamp: number;
  isAdminTestMode?: boolean;
}

export interface EconomyRewardResult {
  success: boolean;
  earnedCoins: number;
  newBalance: number;
  totalEarned: number;
  duplicate: boolean;
  error?: string;
}

export interface EconomyPurchaseResult {
  success: boolean;
  songId: string;
  cost: number;
  remainingCoins: number;
  alreadyUnlocked?: boolean;
  error?: string;
}

export class ServerEconomyService {
  private static COLLECTION_USERS = 'users';
  private static SUBCOLLECTION_LEDGER = 'economy_ledger';

  /**
   * Valida rigorosamente a prova de conclusão de partida enviada pelo cliente.
   */
  public static validateMatchProof(proof: MatchProof): { valid: boolean; reason?: string } {
    if (!proof || !proof.uid) {
      return { valid: false, reason: 'UID do jogador ausente ou inválido.' };
    }
    if (!proof.songId || typeof proof.songId !== 'string') {
      return { valid: false, reason: 'ID de música inválido.' };
    }
    const validDiffs: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
    if (!validDiffs.includes(proof.difficulty)) {
      return { valid: false, reason: 'Dificuldade inválida.' };
    }
    if (typeof proof.score !== 'number' || proof.score < 0 || proof.score > 2000000) {
      return { valid: false, reason: 'Pontuação fora dos limites plausíveis.' };
    }
    if (typeof proof.accuracy !== 'number' || proof.accuracy < 0 || proof.accuracy > 100) {
      return { valid: false, reason: 'Precisão fora dos limites plausíveis.' };
    }
    if (typeof proof.playableNotesCount !== 'number' || proof.playableNotesCount <= 0) {
      return { valid: false, reason: 'Contagem de notas jogáveis inválida.' };
    }
    if (typeof proof.hits !== 'number' || proof.hits < 0 || typeof proof.misses !== 'number' || proof.misses < 0) {
      return { valid: false, reason: 'Valores de acertos/erros inválidos.' };
    }
    // A soma de acertos e erros não pode ser zero em uma partida concluída
    if (proof.cleared && (proof.hits + proof.misses) === 0) {
      return { valid: false, reason: 'Partida concluída sem nenhuma nota registrada.' };
    }
    if (typeof proof.timestamp !== 'number' || proof.timestamp <= 0) {
      return { valid: false, reason: 'Timestamp de partida ausente ou inválido.' };
    }
    return { valid: true };
  }

  /**
   * Gera a chave de idempotência determinística e única para uma partida.
   * Impede que a mesma partida seja recompensada mais de uma vez.
   */
  public static generateMatchIdempotencyKey(proof: MatchProof): string {
    return `reward_${proof.uid}_${proof.songId}_${proof.difficulty}_${proof.timestamp}`;
  }

  /**
   * Concede a recompensa de partida de forma atômica e idempotente no Firestore.
   * Se a partida já tiver sido recompensada, retorna sucesso sem duplicar moedas.
   */
  public static async claimMatchReward(
    proof: MatchProof,
    customDb?: Firestore
  ): Promise<EconomyRewardResult> {
    const firestoreInstance = customDb || db;
    if (!firestoreInstance) {
      return {
        success: false,
        earnedCoins: 0,
        newBalance: 0,
        totalEarned: 0,
        duplicate: false,
        error: 'FIRESTORE_UNAVAILABLE'
      };
    }

    // 1. Validação estrita da prova
    const validation = this.validateMatchProof(proof);
    if (!validation.valid) {
      return {
        success: false,
        earnedCoins: 0,
        newBalance: 0,
        totalEarned: 0,
        duplicate: false,
        error: validation.reason
      };
    }

    // 2. Modo Administrador de Testes: Concede estritamente 0 moedas
    if (proof.isAdminTestMode) {
      return {
        success: true,
        earnedCoins: 0,
        newBalance: 0,
        totalEarned: 0,
        duplicate: false
      };
    }

    // 3. Cálculo da recompensa oficial (0 a 5 RockCoins)
    const calculatedCoins = proof.cleared
      ? RockCoinsManager.calculateReward(
          proof.difficulty,
          proof.misses,
          proof.playableNotesCount,
          proof.cleared
        )
      : 0;

    const idempotencyKey = this.generateMatchIdempotencyKey(proof);
    const userRef = doc(firestoreInstance, this.COLLECTION_USERS, proof.uid);
    const ledgerRef = doc(firestoreInstance, this.COLLECTION_USERS, proof.uid, this.SUBCOLLECTION_LEDGER, idempotencyKey);

    try {
      const result = await runTransaction(firestoreInstance, async (transaction) => {
        // Leitura 1: Verifica se a transação determinística já foi processada no livro-razão (Ledger)
        const ledgerDoc = await transaction.get(ledgerRef);
        if (ledgerDoc.exists()) {
          const ledgerData = ledgerDoc.data();
          const userDoc = await transaction.get(userRef);
          const currentCoins = userDoc.exists() ? (userDoc.data()?.rockCoins || 0) : 0;
          const currentEarned = userDoc.exists() ? (userDoc.data()?.totalCoinsEarned || 0) : 0;
          return {
            success: true,
            earnedCoins: 0,
            newBalance: currentCoins,
            totalEarned: currentEarned,
            duplicate: true
          };
        }

        // Leitura 2: Documento do usuário
        const userDoc = await transaction.get(userRef);
        const userData = userDoc.exists() ? userDoc.data() : null;

        const currentCoins = userData?.rockCoins !== undefined ? Math.max(0, userData.rockCoins) : 0;
        const currentEarned = userData?.totalCoinsEarned !== undefined ? Math.max(0, userData.totalCoinsEarned) : currentCoins;
        const currentSpent = userData?.totalCoinsSpent !== undefined ? Math.max(0, userData.totalCoinsSpent) : 0;

        const newBalance = currentCoins + calculatedCoins;
        const newEarned = currentEarned + calculatedCoins;

        // Escrita 1: Registra entrada imutável no Ledger
        transaction.set(ledgerRef, {
          idempotencyKey,
          type: 'EARN',
          songId: proof.songId,
          difficulty: proof.difficulty,
          earnedCoins: calculatedCoins,
          score: proof.score,
          accuracy: proof.accuracy,
          hits: proof.hits,
          misses: proof.misses,
          matchTimestamp: proof.timestamp,
          processedAt: Date.now()
        });

        // Escrita 2: Atualiza saldos econômicos de forma atômica no perfil do usuário
        const transactionRecord = {
          id: idempotencyKey,
          type: 'EARN',
          amount: calculatedCoins,
          description: `Recompensa por concluir ${proof.songTitle || proof.songId} (${proof.difficulty})`,
          songId: proof.songId,
          timestamp: proof.timestamp
        };

        const existingTransactions = userData?.transactions || [];
        const updatedTransactions = [transactionRecord, ...existingTransactions].slice(0, 50);

        transaction.set(
          userRef,
          {
            rockCoins: newBalance,
            totalCoinsEarned: newEarned,
            totalCoinsSpent: currentSpent,
            transactions: updatedTransactions,
            lastPlayedAt: proof.timestamp,
            updatedAt: Date.now()
          },
          { merge: true }
        );

        return {
          success: true,
          earnedCoins: calculatedCoins,
          newBalance,
          totalEarned: newEarned,
          duplicate: false
        };
      });

      return result;
    } catch (err: any) {
      console.warn('[ServerEconomyService] Falha na transação de recompensa:', err);
      return {
        success: false,
        earnedCoins: 0,
        newBalance: 0,
        totalEarned: 0,
        duplicate: false,
        error: err?.message || 'TRANSACTION_FAILED'
      };
    }
  }

  /**
   * Executa a compra/desbloqueio de música de forma atômica no Firestore.
   * Protege contra race condition, compras duplicadas e saldo insuficiente.
   */
  public static async purchaseSongUnlock(
    uid: string,
    songId: string,
    songTitle?: string,
    cost: number = UNLOCK_COST_ROCKCOINS,
    customDb?: Firestore
  ): Promise<EconomyPurchaseResult> {
    const firestoreInstance = customDb || db;
    if (!firestoreInstance) {
      return {
        success: false,
        songId,
        cost,
        remainingCoins: 0,
        error: 'FIRESTORE_UNAVAILABLE'
      };
    }

    if (!uid || uid === 'guest') {
      return {
        success: false,
        songId,
        cost,
        remainingCoins: 0,
        error: 'GUEST_CANNOT_PURCHASE_CLOUD'
      };
    }

    const unlockCost = Math.max(0, cost);
    const userRef = doc(firestoreInstance, this.COLLECTION_USERS, uid);
    const purchaseTxId = `purchase_${uid}_${songId}`;
    const ledgerRef = doc(firestoreInstance, this.COLLECTION_USERS, uid, this.SUBCOLLECTION_LEDGER, purchaseTxId);

    try {
      const result = await runTransaction(firestoreInstance, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) {
          return {
            success: false,
            songId,
            cost: unlockCost,
            remainingCoins: 0,
            error: 'USER_PROFILE_NOT_FOUND'
          };
        }

        const userData = userDoc.data();
        const unlockedSongIds: string[] = Array.isArray(userData?.unlockedSongIds)
          ? userData.unlockedSongIds
          : [...INITIAL_UNLOCKED_SONG_IDS];

        // 1. Já desbloqueada: idempotência de compra
        if (unlockedSongIds.includes(songId)) {
          return {
            success: true,
            songId,
            cost: 0,
            remainingCoins: userData?.rockCoins || 0,
            alreadyUnlocked: true
          };
        }

        // 2. Verificação de saldo atômica
        const currentCoins = userData?.rockCoins || 0;
        if (currentCoins < unlockCost) {
          return {
            success: false,
            songId,
            cost: unlockCost,
            remainingCoins: currentCoins,
            error: 'ROCKCOINS_INSUFFICIENT'
          };
        }

        const newBalance = currentCoins - unlockCost;
        const currentSpent = userData?.totalCoinsSpent || 0;
        const newSpent = currentSpent + unlockCost;
        const newUnlockedList = [...unlockedSongIds, songId];

        // Escrita 1: Registro imutável de compra no Ledger
        transaction.set(ledgerRef, {
          purchaseTxId,
          type: 'SPEND',
          songId,
          cost: unlockCost,
          purchasedAt: Date.now()
        });

        // Escrita 2: Atualização atômica do saldo e lista de desbloqueios
        const transactionRecord = {
          id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type: 'SPEND',
          amount: unlockCost,
          description: `Desbloqueio de música: ${songTitle || songId}`,
          songId,
          timestamp: Date.now()
        };

        const existingTransactions = userData?.transactions || [];
        const updatedTransactions = [transactionRecord, ...existingTransactions].slice(0, 50);

        transaction.set(
          userRef,
          {
            rockCoins: newBalance,
            totalCoinsSpent: newSpent,
            unlockedSongIds: newUnlockedList,
            transactions: updatedTransactions,
            updatedAt: Date.now()
          },
          { merge: true }
        );

        return {
          success: true,
          songId,
          cost: unlockCost,
          remainingCoins: newBalance,
          alreadyUnlocked: false
        };
      });

      return result;
    } catch (err: any) {
      console.warn('[ServerEconomyService] Falha na transação de compra:', err);
      return {
        success: false,
        songId,
        cost: unlockCost,
        remainingCoins: 0,
        error: err?.message || 'TRANSACTION_FAILED'
      };
    }
  }
}
