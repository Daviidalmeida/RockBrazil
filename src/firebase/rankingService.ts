import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  DocumentData,
  QueryConstraint
} from 'firebase/firestore';
import { db, auth } from './firebaseConfig';
import { PlayerProfile, Difficulty, SongRecord, GameStats } from '../types';
import { RecordMatchResult } from '../game/profileManager';
import { AuthService } from './authService';

export interface GlobalRankingEntry {
  uid: string;
  playerName: string;
  avatar: string;
  score: number;
  songId?: string;
  songTitle?: string;
  artist?: string;
  difficulty?: Difficulty;
  accuracy?: number;
  maxCombo?: number;
  stars?: number;
  updatedAt: number;
  rank?: number;
}

export interface GlobalSummaryEntry {
  uid: string;
  playerName: string;
  avatar: string;
  totalScore: number;
  songsCount: number;
  updatedAt: number;
  rank?: number;
}

export type RankingFilterType = 'general' | 'song' | 'difficulty';

const STORAGE_KEY_PENDING_SYNC = 'rb_pending_ranking_sync';

export class RankingService {
  private static COLLECTION_RANKINGS_SONG = 'rankings_song';
  private static COLLECTION_RANKINGS_SUMMARY = 'rankings_summary';

  /**
   * Verifica estritamente se o usuário e o perfil estão autenticados via provedor Google.
   * Contas anônimas ou perfis em modo Convidado retornam FALSE.
   */
  public static isGoogleAuthenticated(): boolean {
    if (!auth || !auth.currentUser) return false;
    const user = auth.currentUser;
    if (user.isAnonymous) return false;
    // Verifica se algum dos provedores vinculados é google.com
    const isGoogleProvider = user.providerData && user.providerData.some(p => p.providerId === 'google.com');
    return isGoogleProvider || AuthService.getSavedAuthPreference() === 'google';
  }

  /**
   * Valida se o perfil ativo atual pertence à conta Google autenticada.
   */
  public static isEligibleForRanking(profile: PlayerProfile | null): boolean {
    if (!profile) return false;
    if (profile.accountType === 'guest' || profile.id === 'guest') return false;
    return this.isGoogleAuthenticated();
  }

  /**
   * Envia o recorde de uma partida concluída para o Ranking Global no Firestore.
   * Executa em segundo plano de forma não bloqueante.
   */
  public static async submitRecordIfEligible(
    profile: PlayerProfile,
    songId: string,
    songTitle: string,
    artist: string,
    difficulty: Difficulty,
    stats: GameStats,
    recordResult: RecordMatchResult
  ): Promise<boolean> {
    if (!this.isEligibleForRanking(profile)) {
      return false;
    }

    const uid = auth?.currentUser?.uid || profile.id;
    if (!uid) return false;

    // Filtra para publicar apenas apelido limpo (sem emails ou UIDs longos)
    const rawName = profile.name || auth?.currentUser?.displayName || 'Rockeiro';
    const publicName = rawName.split('@')[0].trim().substring(0, 24);
    const avatar = profile.avatar || 'rockbrazil-avatar-01';

    const payload = {
      uid,
      songId,
      songTitle,
      artist,
      difficulty,
      score: recordResult.newScore,
      accuracy: stats.accuracy || 0,
      maxCombo: stats.maxCombo || 0,
      stars: stats.stars || 1,
      playerName: publicName,
      avatar,
      updatedAt: Date.now()
    };

    if (!db || typeof navigator !== 'undefined' && !navigator.onLine) {
      this.enqueuePendingSync(payload);
      return false;
    }

    try {
      // 1. Grava o recorde da música se for maior que o recorde anterior
      const docId = `${songId}_${difficulty}_${uid}`;
      const recordRef = doc(db, this.COLLECTION_RANKINGS_SONG, docId);

      const existingSnap = await getDoc(recordRef);
      if (existingSnap.exists()) {
        const existingData = existingSnap.data();
        if (existingData.score >= payload.score) {
          // Recorde anterior existente é superior ou igual; não sobrescreve
          return false;
        }
      }

      await setDoc(recordRef, payload, { merge: true });

      // 2. Atualiza o resumo do Ranking Geral do jogador (soma única por música+dificuldade)
      await this.updateUserGlobalSummary(profile, uid, publicName, avatar);

      return true;
    } catch (err) {
      console.warn('[RankingService] Falha ao enviar recorde online, enfileirando para reconexão:', err);
      this.enqueuePendingSync(payload);
      return false;
    }
  }

  /**
   * Atualiza o documento de resumo do jogador para o Ranking Geral.
   * totalScore = soma dos maiores recordes únicos por (música, dificuldade).
   */
  public static async updateUserGlobalSummary(
    profile: PlayerProfile,
    uid: string,
    publicName: string,
    avatar: string
  ): Promise<void> {
    if (!db || !uid) return;

    try {
      let totalScore = 0;
      let count = 0;

      if (profile.records) {
        for (const songId of Object.keys(profile.records)) {
          const diffs = profile.records[songId];
          if (!diffs) continue;
          for (const diff of Object.keys(diffs) as Difficulty[]) {
            const rec = diffs[diff] as SongRecord;
            if (rec && (rec.bestScore || rec.score)) {
              totalScore += (rec.bestScore || rec.score || 0);
              count++;
            }
          }
        }
      }

      if (totalScore <= 0) return;

      const summaryRef = doc(db, this.COLLECTION_RANKINGS_SUMMARY, uid);
      await setDoc(summaryRef, {
        uid,
        playerName: publicName,
        avatar,
        totalScore,
        songsCount: count,
        updatedAt: Date.now()
      }, { merge: true });
    } catch (err) {
      console.warn('[RankingService] Erro ao atualizar resumo do ranking geral:', err);
    }
  }

  /**
   * Consulta o ranking global com suporte a filtros e limite para controle de cota.
   */
  public static async fetchRanking(
    filter: RankingFilterType,
    songId?: string,
    difficulty?: Difficulty,
    maxLimit: number = 30
  ): Promise<GlobalRankingEntry[] | GlobalSummaryEntry[]> {
    if (!db) {
      throw new Error('Serviço de banco de dados indisponível.');
    }

    try {
      if (filter === 'general') {
        const summaryColl = collection(db, this.COLLECTION_RANKINGS_SUMMARY);
        const q = query(summaryColl, orderBy('totalScore', 'desc'), limit(maxLimit));
        const snapshot = await getDocs(q);

        const list: GlobalSummaryEntry[] = [];
        let r = 1;
        snapshot.forEach((d) => {
          const data = d.data() as GlobalSummaryEntry;
          list.push({ ...data, rank: r++ });
        });
        return list;
      } else {
        const songColl = collection(db, this.COLLECTION_RANKINGS_SONG);
        const constraints: QueryConstraint[] = [];

        if (filter === 'song' && songId) {
          constraints.push(where('songId', '==', songId));
        }

        if (difficulty) {
          constraints.push(where('difficulty', '==', difficulty));
        }

        constraints.push(orderBy('score', 'desc'));
        constraints.push(limit(maxLimit));

        const q = query(songColl, ...constraints);
        const snapshot = await getDocs(q);

        const list: GlobalRankingEntry[] = [];
        let r = 1;
        snapshot.forEach((d) => {
          const data = d.data() as GlobalRankingEntry;
          list.push({ ...data, rank: r++ });
        });
        return list;
      }
    } catch (err: any) {
      console.warn('[RankingService] Erro ao carregar ranking do Firestore:', err);
      throw err;
    }
  }

  /**
   * Enfileira recorde pendente para envio quando offline.
   */
  private static enqueuePendingSync(item: any): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PENDING_SYNC);
      const queue: any[] = stored ? JSON.parse(stored) : [];
      // Evita duplicatas da mesma música e dificuldade
      const filtered = queue.filter(q => !(q.songId === item.songId && q.difficulty === item.difficulty && q.uid === item.uid));
      filtered.push(item);
      localStorage.setItem(STORAGE_KEY_PENDING_SYNC, JSON.stringify(filtered.slice(-20))); // no max 20 itens
    } catch {
      // Ignora erro de cota local
    }
  }

  /**
   * Processa a fila de sincronização pendente quando a conexão for reestabelecida.
   */
  public static async flushPendingSync(): Promise<void> {
    if (!db || !this.isGoogleAuthenticated()) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PENDING_SYNC);
      if (!stored) return;
      const queue: any[] = JSON.parse(stored);
      if (!queue.length) return;

      const remaining: any[] = [];
      for (const item of queue) {
        try {
          const docId = `${item.songId}_${item.difficulty}_${item.uid}`;
          const recordRef = doc(db, this.COLLECTION_RANKINGS_SONG, docId);
          await setDoc(recordRef, item, { merge: true });
        } catch {
          remaining.push(item);
        }
      }

      if (remaining.length > 0) {
        localStorage.setItem(STORAGE_KEY_PENDING_SYNC, JSON.stringify(remaining));
      } else {
        localStorage.removeItem(STORAGE_KEY_PENDING_SYNC);
      }
    } catch (err) {
      console.warn('[RankingService] Falha ao processar fila de sincronização:', err);
    }
  }
}
