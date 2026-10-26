import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { PlayerProfile, SongRecord, Difficulty } from '../types';

export class FirestoreService {
  private static COLLECTION_USERS = 'users';

  /**
   * Salva o perfil do jogador na nuvem (Firestore).
   * Operação atômica em doc 'users/{uid}'.
   */
  public static async syncProfileToCloud(uid: string, profile: PlayerProfile): Promise<boolean> {
    if (!db || !uid) return false;

    try {
      const userRef = doc(db, this.COLLECTION_USERS, uid);
      const dataToSave = {
        name: profile.name,
        avatar: profile.avatar,
        rockCoins: Math.max(0, profile.rockCoins || 0),
        records: profile.records || {},
        settings: profile.settings || {},
        lastPlayedAt: Date.now(),
        updatedAt: Date.now()
      };

      await setDoc(userRef, dataToSave, { merge: true });
      return true;
    } catch (err: any) {
      console.warn('[FirestoreService] Falha ao sincronizar perfil com o Firestore (as regras de segurança podem estar pendentes de publicação no console):', err);
      return false;
    }
  }

  /**
   * Carrega o perfil do jogador do Firestore.
   */
  public static async fetchProfileFromCloud(uid: string): Promise<Partial<PlayerProfile> | null> {
    if (!db || !uid) return null;

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
   * Não duplica RockCoins e sempre preserva os maiores recordes e pontuações.
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
          : ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo'],
        records: { ...local.records },
        settings: { ...local.settings, ...cloud.settings },
        migrationVersion: 14.0
      };
    }

    const merged: PlayerProfile = {
      ...local,
      name: cloud.name || local.name,
      avatar: cloud.avatar || local.avatar,
      // Moedas: adota o maior valor válido existente
      rockCoins: Math.max(local.rockCoins || 0, cloud.rockCoins || 0),
      unlockedSongIds: Array.from(new Set([
        ...(local.unlockedSongIds || ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo']),
        ...(cloud.unlockedSongIds || [])
      ])),
      records: { ...local.records },
      settings: { ...local.settings, ...cloud.settings },
      migrationVersion: 14.0
    };

    if (cloud.records) {
      for (const songId of Object.keys(cloud.records)) {
        if (!merged.records[songId]) {
          merged.records[songId] = cloud.records[songId];
          continue;
        }

        const localDiffs = merged.records[songId];
        const cloudDiffs = cloud.records[songId];

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
              playCount
            };
          }
        }
      }
    }

    return merged;
  }
}
