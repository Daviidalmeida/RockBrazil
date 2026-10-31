import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { PlayerProfile, SongRecord, Difficulty } from '../types';

export type SyncState = 'synced' | 'syncing' | 'pending' | 'offline' | 'error';
export type SyncStateCallback = (state: SyncState, message?: string) => void;

export class FirestoreService {
  private static COLLECTION_USERS = 'users';
  private static STORAGE_KEY_PENDING_SYNC = 'rb_pending_profile_sync';
  private static DEFAULT_UNLOCKED_SONGS = ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo'];
  private static listeners: Set<SyncStateCallback> = new Set();
  private static currentSyncState: SyncState = 'synced';

  /**
   * Registra um ouvinte para alterações no estado de sincronização em nuvem.
   */
  public static onSyncStateChange(callback: SyncStateCallback): () => void {
    this.listeners.add(callback);
    callback(this.currentSyncState);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public static getSyncState(): SyncState {
    return this.currentSyncState;
  }

  public static setSyncState(state: SyncState, message?: string): void {
    this.currentSyncState = state;
    for (const cb of this.listeners) {
      try {
        cb(state, message);
      } catch {
        // Ignora erros em callbacks de UI
      }
    }
  }

  /**
   * Salva o perfil do jogador na nuvem (Firestore).
   * Operação atômica em doc 'users/{uid}'.
   * Se offline ou falhar, armazena na fila de sincronização pendente.
   */
  public static async syncProfileToCloud(uid: string, profile: PlayerProfile): Promise<boolean> {
    if (!uid || uid === 'guest') {
      return false;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.queuePendingSync(uid, profile);
      this.setSyncState('pending', 'Sem conexão — sincronização pendente');
      return false;
    }

    if (!db) {
      this.queuePendingSync(uid, profile);
      this.setSyncState('pending', 'Banco indisponível — salvo localmente');
      return false;
    }

    this.setSyncState('syncing', 'Sincronizando com a nuvem...');

    try {
      const userRef = doc(db, this.COLLECTION_USERS, uid);
      const dataToSave = {
        uid,
        name: profile.name || 'Rockeiro',
        avatar: profile.avatar || 'rockbrazil-avatar-01',
        rockCoins: Math.max(0, profile.rockCoins || 0),
        totalCoinsEarned: Math.max(0, profile.totalCoinsEarned || 0),
        totalCoinsSpent: Math.max(0, profile.totalCoinsSpent || 0),
        unlockedSongIds: Array.from(new Set([
          ...(profile.unlockedSongIds || this.DEFAULT_UNLOCKED_SONGS)
        ])),
        achievements: profile.achievements || {},
        records: profile.records || {},
        settings: profile.settings || {},
        transactions: (profile.transactions || []).slice(-50),
        season: 's1',
        migrationVersion: 14.0,
        lastPlayedAt: profile.lastPlayedAt || Date.now(),
        updatedAt: profile.updatedAt || Date.now()
      };

      await setDoc(userRef, dataToSave, { merge: true });
      this.clearPendingSync(uid);
      this.setSyncState('synced', 'Sincronizado');
      return true;
    } catch (err: any) {
      console.warn('[FirestoreService] Falha ao sincronizar perfil com o Firestore:', err);
      this.queuePendingSync(uid, profile);
      this.setSyncState('pending', 'Falha temporária — enfileirado para reenvio');
      return false;
    }
  }

  /**
   * Carrega o perfil do jogador do Firestore.
   */
  public static async fetchProfileFromCloud(uid: string): Promise<Partial<PlayerProfile> | null> {
    if (!db || !uid || uid === 'guest') return null;

    try {
      const userRef = doc(db, this.COLLECTION_USERS, uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        return snap.data() as Partial<PlayerProfile>;
      }
      return null;
    } catch (err: any) {
      console.warn('[FirestoreService] Falha ao carregar perfil do Firestore:', err);
      return null;
    }
  }

  /**
   * Mescla inteligentemente os dados locais e remotos, preservando o melhor de cada um.
   * - Músicas desbloqueadas: união completa dos dois conjuntos.
   * - Conquistas: união completa com a data mais antiga de conquista.
   * - Recordes: melhores pontuações, estrelas, precisão e combo.
   * - RockCoins: resolução por timestamp mais recente (updatedAt) ou pelo maior progresso comprovado,
   *   evitando qualquer duplicação ou perda de saldo.
   */
  public static mergeProfiles(local: PlayerProfile, cloud: Partial<PlayerProfile>): PlayerProfile {
    // Se os dados da nuvem forem anteriores à Temporada 1 (< 14.0),
    // pertencem à fase de testes e NÃO restauram recordes ou moedas antigas
    const isCloudLegacyTest = cloud.migrationVersion !== undefined && cloud.migrationVersion < 14.0;
    if (isCloudLegacyTest) {
      return {
        ...local,
        name: cloud.name || local.name,
        avatar: cloud.avatar || local.avatar,
        rockCoins: Math.max(0, local.rockCoins || 0),
        unlockedSongIds: local.unlockedSongIds && local.unlockedSongIds.length > 0
          ? [...local.unlockedSongIds]
          : [...this.DEFAULT_UNLOCKED_SONGS],
        records: { ...local.records },
        settings: { ...local.settings, ...cloud.settings },
        migrationVersion: 14.0,
        updatedAt: Date.now()
      };
    }

    // 1. Músicas Desbloqueadas: União canônica sem repetições
    const mergedUnlockedSongs = Array.from(new Set([
      ...(local.unlockedSongIds || this.DEFAULT_UNLOCKED_SONGS),
      ...(cloud.unlockedSongIds || [])
    ]));

    // 2. Conquistas: União preservando a data mais antiga de conquista
    const mergedAchievements: Record<string, { unlockedAt: number }> = {
      ...(local.achievements || {})
    };
    if (cloud.achievements) {
      for (const [achId, achData] of Object.entries(cloud.achievements)) {
        if (!mergedAchievements[achId] || (achData.unlockedAt && achData.unlockedAt < mergedAchievements[achId].unlockedAt)) {
          mergedAchievements[achId] = { unlockedAt: achData.unlockedAt || Date.now() };
        }
      }
    }

    // 3. Resolução de RockCoins baseada em timestamp de atualização
    const localUpdatedAt = local.updatedAt;
    const cloudUpdatedAt = cloud.updatedAt;

    let mergedCoins: number;
    let mergedEarned: number;
    let mergedSpent: number;

    if (cloudUpdatedAt !== undefined && (localUpdatedAt === undefined || cloudUpdatedAt > localUpdatedAt) && cloud.rockCoins !== undefined) {
      // Nuvem possui estado mais recente comprovado
      mergedCoins = Math.max(0, cloud.rockCoins);
      mergedEarned = Math.max(local.totalCoinsEarned || 0, cloud.totalCoinsEarned || 0);
      mergedSpent = Math.max(local.totalCoinsSpent || 0, cloud.totalCoinsSpent || 0);
    } else if (localUpdatedAt !== undefined && (cloudUpdatedAt === undefined || localUpdatedAt > cloudUpdatedAt) && local.rockCoins !== undefined) {
      // Local possui estado mais recente comprovado
      mergedCoins = Math.max(0, local.rockCoins);
      mergedEarned = Math.max(local.totalCoinsEarned || 0, cloud.totalCoinsEarned || 0);
      mergedSpent = Math.max(local.totalCoinsSpent || 0, cloud.totalCoinsSpent || 0);
    } else {
      // Timestamps iguais ou inexistentes: adota o maior saldo válido (segurança contra perda)
      mergedCoins = Math.max(local.rockCoins || 0, cloud.rockCoins || 0);
      mergedEarned = Math.max(local.totalCoinsEarned || 0, cloud.totalCoinsEarned || 0);
      mergedSpent = Math.max(local.totalCoinsSpent || 0, cloud.totalCoinsSpent || 0);
    }

    // Proteção de integridade do catálogo: garantir que o total de moedas ganhas
    // suporte as músicas desbloqueadas adicionais
    const additionalUnlockedCount = Math.max(0, mergedUnlockedSongs.length - this.DEFAULT_UNLOCKED_SONGS.length);
    const minSpentForUnlocks = additionalUnlockedCount * 5;
    if (mergedSpent < minSpentForUnlocks) {
      mergedSpent = minSpentForUnlocks;
    }
    if (mergedEarned < (mergedCoins + mergedSpent)) {
      mergedEarned = mergedCoins + mergedSpent;
    }

    // 4. Recordes: melhor pontuação, estrelas, precisão e combo
    const mergedRecords = { ...local.records };
    if (cloud.records) {
      for (const songId of Object.keys(cloud.records)) {
        if (!mergedRecords[songId]) {
          mergedRecords[songId] = cloud.records[songId];
          continue;
        }

        const localDiffs = mergedRecords[songId]!;
        const cloudDiffs = cloud.records[songId]!;

        for (const diffKey of Object.keys(cloudDiffs) as Difficulty[]) {
          const cRec = cloudDiffs[diffKey] as SongRecord;
          const lRec = localDiffs[diffKey] as SongRecord;

          if (!lRec) {
            localDiffs[diffKey] = cRec;
          } else if (cRec) {
            const bestScore = Math.max(lRec.bestScore || lRec.score || 0, cRec.bestScore || cRec.score || 0);
            const bestStars = Math.max(lRec.bestStars || lRec.stars || 1, cRec.bestStars || cRec.stars || 1);
            const bestAccuracy = Math.max(lRec.bestAccuracy || lRec.accuracy || 0, cRec.bestAccuracy || cRec.accuracy || 0);
            const bestMaxCombo = Math.max(lRec.bestMaxCombo || lRec.maxCombo || 0, cRec.bestMaxCombo || cRec.maxCombo || 0);
            const playCount = Math.max(lRec.playCount || 1, cRec.playCount || 1);
            const bestDate = (lRec.bestScore || lRec.score || 0) >= (cRec.bestScore || cRec.score || 0)
              ? (lRec.bestDate || lRec.lastDate || Date.now())
              : (cRec.bestDate || cRec.lastDate || Date.now());

            localDiffs[diffKey] = {
              ...lRec,
              bestScore,
              score: bestScore,
              bestStars,
              stars: bestStars,
              bestAccuracy,
              accuracy: bestAccuracy,
              bestMaxCombo,
              maxCombo: bestMaxCombo,
              playCount,
              bestDate
            };
          }
        }
      }
    }

    // 5. Configurações e Preferências
    const mergedSettings = { ...cloud.settings, ...local.settings };

    // 6. Nome e Avatar
    const mergedName = (!local.name || local.name === 'Convidado')
      ? (cloud.name || local.name)
      : (cloud.name && cloud.name !== 'Convidado' ? cloud.name : local.name);

    const mergedAvatar = (!local.avatar || local.avatar === 'rockbrazil-avatar-01')
      ? (cloud.avatar || local.avatar)
      : (cloud.avatar || local.avatar);

    return {
      ...local,
      name: mergedName,
      avatar: mergedAvatar,
      rockCoins: mergedCoins,
      totalCoinsEarned: mergedEarned,
      totalCoinsSpent: mergedSpent,
      unlockedSongIds: mergedUnlockedSongs,
      achievements: mergedAchievements,
      records: mergedRecords,
      settings: mergedSettings,
      migrationVersion: 14.0,
      updatedAt: Math.max(localUpdatedAt || 0, cloudUpdatedAt || 0, Date.now())
    };
  }

  /**
   * Enfileira sincronização pendente no localStorage caso a conexão esteja offline.
   */
  public static queuePendingSync(uid: string, profile: PlayerProfile): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const payload = {
        uid,
        profile,
        queuedAt: Date.now()
      };
      localStorage.setItem(this.STORAGE_KEY_PENDING_SYNC, JSON.stringify(payload));
    } catch {
      // Ignora erro de cota de armazenamento
    }
  }

  public static getPendingSync(): { uid: string; profile: PlayerProfile; queuedAt: number } | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(this.STORAGE_KEY_PENDING_SYNC);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public static clearPendingSync(uid?: string): void {
    try {
      if (typeof localStorage === 'undefined') return;
      if (!uid) {
        localStorage.removeItem(this.STORAGE_KEY_PENDING_SYNC);
        return;
      }
      const pending = this.getPendingSync();
      if (pending && pending.uid === uid) {
        localStorage.removeItem(this.STORAGE_KEY_PENDING_SYNC);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Processa itens na fila de sincronização pendente quando a conexão é restabelecida.
   */
  public static async processPendingSyncs(): Promise<boolean> {
    const pending = this.getPendingSync();
    if (!pending || !pending.uid || !pending.profile) {
      return true;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return false;
    }

    if (!db) {
      return false;
    }

    try {
      this.setSyncState('syncing', 'Reenviando dados pendentes...');
      const userRef = doc(db, this.COLLECTION_USERS, pending.uid);
      const dataToSave = {
        uid: pending.uid,
        name: pending.profile.name || 'Rockeiro',
        avatar: pending.profile.avatar || 'rockbrazil-avatar-01',
        rockCoins: Math.max(0, pending.profile.rockCoins || 0),
        totalCoinsEarned: Math.max(0, pending.profile.totalCoinsEarned || 0),
        totalCoinsSpent: Math.max(0, pending.profile.totalCoinsSpent || 0),
        unlockedSongIds: Array.from(new Set([
          ...(pending.profile.unlockedSongIds || this.DEFAULT_UNLOCKED_SONGS)
        ])),
        achievements: pending.profile.achievements || {},
        records: pending.profile.records || {},
        settings: pending.profile.settings || {},
        transactions: (pending.profile.transactions || []).slice(-50),
        season: 's1',
        migrationVersion: 14.0,
        lastPlayedAt: pending.profile.lastPlayedAt || Date.now(),
        updatedAt: pending.profile.updatedAt || Date.now()
      };

      await setDoc(userRef, dataToSave, { merge: true });
      this.clearPendingSync();
      this.setSyncState('synced', 'Sincronizado');
      return true;
    } catch (err) {
      console.warn('[FirestoreService] Falha ao processar fila de sincronização pendente:', err);
      this.setSyncState('pending', 'Falha ao reenviar dados');
      return false;
    }
  }
}
