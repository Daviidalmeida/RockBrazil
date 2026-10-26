import { Difficulty, GameSettings, SongRecord, GameStats } from '../types';
import { RockCoinsManager } from './economy/rockCoinsManager';
import { FirestoreService } from '../firebase/firestoreService';

export const INITIAL_UNLOCKED_SONG_IDS: string[] = ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo'];
export const UNLOCK_COST_ROCKCOINS = 5;

export interface MatchHistoryItem {
  id: string;
  songId: string;
  songTitle: string;
  artist?: string;
  difficulty: Difficulty;
  score: number;
  accuracy: number;
  maxCombo: number;
  stars: number;
  cleared: boolean;
  date: number;
  hits?: number;
  misses?: number;
  isFullCombo?: boolean;
  earnedCoins?: number;
}

export interface CoinTransaction {
  id: string;
  type: 'EARN' | 'SPEND';
  amount: number;
  description: string;
  songId?: string;
  timestamp: number;
}

export interface PlayerProfile {
  id: string;
  name: string;
  avatar: string; // e.g. '🎸', '⚡', '🔥', '💀', '👑', '🤘'
  createdAt: number;
  lastPlayedAt: number;
  settings: GameSettings;
  records: Record<string, Partial<Record<Difficulty, SongRecord>>>;
  history: MatchHistoryItem[];
  rockCoins?: number;
  unlockedSongIds?: string[];
  totalCoinsEarned?: number;
  totalCoinsSpent?: number;
  transactions?: CoinTransaction[];
  migrationVersion?: number;
  accountType?: 'google' | 'guest';
}

export interface ProfileStats {
  songsPlayed: number;
  completedMatches: number;
  totalHits: number;
  totalMisses: number;
  avgAccuracy: number;
  maxCombo: number;
  bestSong: {
    songId: string;
    title: string;
    artist: string;
    score: number;
    difficulty: Difficulty;
    coverUrl?: string;
  } | null;
  rockCoins: number;
  totalCoinsEarned: number;
  totalCoinsSpent: number;
  unlockedSongsCount: number;
}

export interface LeaderboardEntry {
  playerName: string;
  avatar: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  stars: number;
  date: number;
}

export interface RecordMatchResult {
  isNewRecord: boolean;
  previousBestScore: number;
  newScore: number;
  record: SongRecord;
  earnedCoins?: number;
  totalCoins?: number;
}

export class ProfileManager {
  private static DB_NAME = 'RockBrazilProfilesDB';
  private static STORE_NAME = 'profiles';
  private activeProfile: PlayerProfile | null = null;

  public static GUEST_PROFILE: PlayerProfile = {
    id: 'guest',
    name: 'Convidado',
    avatar: '🎸',
    createdAt: 0,
    lastPlayedAt: 0,
    settings: {
      musicVolume: 0.85,
      sfxVolume: 0.9,
      audioOffsetMs: 0,
      noteSpeedMultiplier: 1.0,
      visualEffectsEnabled: true,
      muteOnMiss: false
    },
    records: {},
    history: [],
    rockCoins: 0,
    unlockedSongIds: ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo'],
    totalCoinsEarned: 0,
    totalCoinsSpent: 0,
    transactions: [],
    migrationVersion: 13.3,
    accountType: 'guest'
  };

  private static getStorageItem(key: string): string | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }

  private static setStorageItem(key: string, val: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, val);
      }
    } catch {
      // Ignore
    }
  }

  private static removeStorageItem(key: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {
      // Ignore
    }
  }

  private static async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async init(catalogSongIds?: string[]): Promise<{ isFirstRun: boolean; activeProfile: PlayerProfile }> {
    const profiles = await this.getAllProfiles();

    if (profiles.length === 0) {
      this.activeProfile = { ...ProfileManager.GUEST_PROFILE };
      return { isFirstRun: true, activeProfile: this.activeProfile };
    }

    const savedActiveId = ProfileManager.getStorageItem('rb_active_profile_id');
    let current = profiles.find((p) => p.id === savedActiveId);
    if (!current) {
      current = savedActiveId === 'guest' ? { ...ProfileManager.GUEST_PROFILE } : profiles[0];
    }

    current = this.migrateProfile(current, catalogSongIds);
    this.activeProfile = current;
    ProfileManager.setStorageItem('rb_active_profile_id', current.id);
    return { isFirstRun: false, activeProfile: current };
  }

  public migrateProfile(profile: PlayerProfile, catalogSongIds?: string[]): PlayerProfile {
    if (!profile.migrationVersion || profile.migrationVersion < 13.3) {
      if (!profile.unlockedSongIds || profile.unlockedSongIds.length === 0) {
        if (catalogSongIds && catalogSongIds.length > 0) {
          profile.unlockedSongIds = [...catalogSongIds];
        } else {
          const recordsSongs = Object.keys(profile.records || {});
          const historySongs = (profile.history || []).map((h) => h.songId);
          const existingPlayed = Array.from(new Set([...recordsSongs, ...historySongs]));
          if (existingPlayed.length > 0) {
            profile.unlockedSongIds = Array.from(new Set([...INITIAL_UNLOCKED_SONG_IDS, ...existingPlayed]));
          } else {
            profile.unlockedSongIds = [...INITIAL_UNLOCKED_SONG_IDS];
          }
        }
      }
      if (profile.rockCoins === undefined) {
        profile.rockCoins = 0;
      }
      if (profile.totalCoinsEarned === undefined) {
        profile.totalCoinsEarned = profile.rockCoins;
      }
      if (profile.totalCoinsSpent === undefined) {
        profile.totalCoinsSpent = 0;
      }
      if (!profile.transactions) {
        profile.transactions = [];
      }
      if (!profile.accountType) {
        profile.accountType = profile.id === 'guest' ? 'guest' : 'google';
      }
      profile.migrationVersion = 13.3;
      this.saveProfileToDB(profile).catch(() => {});
    }
    return profile;
  }

  setGuestMode(): PlayerProfile {
    this.activeProfile = { ...ProfileManager.GUEST_PROFILE };
    ProfileManager.setStorageItem('rb_active_profile_id', 'guest');
    return this.activeProfile;
  }

  getActiveProfile(): PlayerProfile {
    return this.activeProfile || ProfileManager.GUEST_PROFILE;
  }

  async getAllProfiles(): Promise<PlayerProfile[]> {
    try {
      const db = await ProfileManager.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(ProfileManager.STORE_NAME, 'readonly');
        const store = tx.objectStore(ProfileManager.STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(this.loadProfilesFallback());
      });
    } catch {
      return this.loadProfilesFallback();
    }
  }

  async createProfile(name: string, avatar: string, accountType: 'google' | 'guest' = 'guest'): Promise<PlayerProfile> {
    const trimmed = name.trim() || 'Rockeiro';
    const id = `profile_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newProfile: PlayerProfile = {
      id,
      name: trimmed,
      avatar: avatar || '🎸',
      createdAt: Date.now(),
      lastPlayedAt: Date.now(),
      settings: {
        musicVolume: 0.85,
        sfxVolume: 0.9,
        audioOffsetMs: 0,
        noteSpeedMultiplier: 1.0,
        visualEffectsEnabled: true,
        muteOnMiss: false
      },
      records: {},
      history: [],
      rockCoins: 0,
      unlockedSongIds: [...INITIAL_UNLOCKED_SONG_IDS],
      totalCoinsEarned: 0,
      totalCoinsSpent: 0,
      transactions: [],
      migrationVersion: 13.3,
      accountType
    };

    await this.saveProfileToDB(newProfile);
    this.activeProfile = newProfile;
    ProfileManager.setStorageItem('rb_active_profile_id', newProfile.id);
    return newProfile;
  }

  async switchProfile(id: string): Promise<PlayerProfile | null> {
    const profiles = await this.getAllProfiles();
    const target = profiles.find((p) => p.id === id);
    if (target) {
      this.activeProfile = target;
      ProfileManager.setStorageItem('rb_active_profile_id', target.id);
      return target;
    }
    return null;
  }

  async updateActiveProfile(updates: Partial<PlayerProfile>): Promise<PlayerProfile | null> {
    if (!this.activeProfile) return null;
    const updated = { ...this.activeProfile, ...updates };
    await this.saveProfileToDB(updated);
    this.activeProfile = updated;
    return updated;
  }

  async deleteProfile(id: string): Promise<boolean> {
    try {
      const db = await ProfileManager.openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(ProfileManager.STORE_NAME, 'readwrite');
        const store = tx.objectStore(ProfileManager.STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

      const remaining = await this.getAllProfiles();
      if (this.activeProfile?.id === id) {
        this.activeProfile = remaining.length > 0 ? remaining[0] : null;
        if (this.activeProfile) {
          ProfileManager.setStorageItem('rb_active_profile_id', this.activeProfile.id);
        } else {
          ProfileManager.removeStorageItem('rb_active_profile_id');
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  getSongRecord(songId: string, diff: Difficulty): SongRecord | null {
    if (!this.activeProfile) return null;
    return (this.activeProfile.records[songId]?.[diff] as SongRecord) || null;
  }

  async recordMatch(
    songId: string,
    songTitle: string,
    diff: Difficulty,
    stats: GameStats,
    cleared: boolean,
    songArtist?: string
  ): Promise<RecordMatchResult> {
    const timestamp = Date.now();
    const hits = stats.hitsCount ?? (stats.perfectCount + stats.greatCount + stats.goodCount);
    const misses = stats.missCount ?? 0;
    const playableCount = stats.playableNotesCount ?? (hits + misses);
    const earnedCoins = RockCoinsManager.calculateReward(
      diff,
      misses,
      playableCount,
      cleared
    );

    if (!this.activeProfile) {
      const fallbackRecord: SongRecord = {
        score: stats.score,
        stars: stats.stars || 1,
        accuracy: stats.accuracy || 0,
        maxCombo: stats.maxCombo,
        bestScore: stats.score,
        lastScore: stats.score,
        bestStars: stats.stars || 1,
        lastStars: stats.stars || 1,
        bestMaxCombo: stats.maxCombo,
        lastMaxCombo: stats.maxCombo,
        bestAccuracy: stats.accuracy || 0,
        lastAccuracy: stats.accuracy || 0,
        bestDate: timestamp,
        lastDate: timestamp,
        playCount: 1
      };
      return {
        isNewRecord: cleared,
        previousBestScore: 0,
        newScore: stats.score,
        record: fallbackRecord,
        earnedCoins,
        totalCoins: earnedCoins
      };
    }

    if (this.activeProfile.rockCoins === undefined) {
      this.activeProfile.rockCoins = 0;
    }
    if (this.activeProfile.totalCoinsEarned === undefined) {
      this.activeProfile.totalCoinsEarned = 0;
    }
    if (cleared) {
      this.activeProfile.rockCoins += earnedCoins;
      this.activeProfile.totalCoinsEarned += earnedCoins;
      if (earnedCoins > 0) {
        if (!this.activeProfile.transactions) this.activeProfile.transactions = [];
        this.activeProfile.transactions.push({
          id: `tx_${timestamp}_${Math.random().toString(36).substring(2, 6)}`,
          type: 'EARN',
          amount: earnedCoins,
          description: `Recompensa por concluir ${songTitle} (${diff})`,
          songId,
          timestamp
        });
      }
    }

    if (!this.activeProfile.records[songId]) {
      this.activeProfile.records[songId] = {};
    }

    const existing = this.activeProfile.records[songId][diff];
    const previousPlayCount = existing?.playCount ?? (existing ? 1 : 0);
    const previousBestScore = existing?.bestScore ?? existing?.score ?? 0;
    const previousBestStars = existing?.bestStars ?? existing?.stars ?? 0;
    const previousBestCombo = existing?.bestMaxCombo ?? existing?.maxCombo ?? 0;
    const previousBestAcc = existing?.bestAccuracy ?? existing?.accuracy ?? 0;
    const previousBestDate = existing?.bestDate ?? timestamp;

    let isNewRecord = false;
    let bestScore = previousBestScore;
    let bestStars = previousBestStars;
    let bestMaxCombo = previousBestCombo;
    let bestAccuracy = previousBestAcc;
    let bestDate = previousBestDate;

    if (cleared) {
      if (previousBestScore === 0 || stats.score > previousBestScore) {
        isNewRecord = true;
        bestScore = stats.score;
        bestStars = stats.stars || 1;
        bestMaxCombo = stats.maxCombo;
        bestAccuracy = stats.accuracy || 0;
        bestDate = timestamp;
      }
    }

    const lastScore = stats.score;
    const lastStars = stats.stars || 1;
    const lastMaxCombo = stats.maxCombo;
    const lastAccuracy = stats.accuracy || 0;
    const lastDate = timestamp;
    const playCount = previousPlayCount + 1;

    const newRecord: SongRecord = {
      score: bestScore,
      stars: bestStars,
      accuracy: bestAccuracy,
      maxCombo: bestMaxCombo,
      bestScore,
      lastScore,
      bestStars,
      lastStars,
      bestMaxCombo,
      lastMaxCombo,
      bestAccuracy,
      lastAccuracy,
      bestDate,
      lastDate,
      playCount
    };

    this.activeProfile.records[songId][diff] = newRecord;

    const historyItem: MatchHistoryItem = {
      id: `match_${timestamp}`,
      songId,
      songTitle,
      artist: songArtist || '',
      difficulty: diff,
      score: stats.score,
      accuracy: stats.accuracy || 0,
      maxCombo: stats.maxCombo,
      stars: stats.stars || 1,
      cleared,
      date: timestamp,
      hits,
      misses,
      isFullCombo: (misses === 0 && cleared && playableCount > 0),
      earnedCoins: cleared ? earnedCoins : 0
    };

    this.activeProfile.history.unshift(historyItem);
    if (this.activeProfile.history.length > 50) {
      this.activeProfile.history.pop();
    }

    this.activeProfile.lastPlayedAt = timestamp;
    await this.saveProfileToDB(this.activeProfile);

    // V13: Sincronização em nuvem segura para usuários autenticados
    if (this.activeProfile.id && this.activeProfile.id !== 'guest') {
      FirestoreService.syncProfileToCloud(this.activeProfile.id, this.activeProfile).catch(() => {});
    }

    return {
      isNewRecord,
      previousBestScore,
      newScore: stats.score,
      record: newRecord,
      earnedCoins,
      totalCoins: this.activeProfile.rockCoins
    };
  }

  public isSongUnlocked(songId: string): boolean {
    const profile = this.getActiveProfile();
    if (!profile.unlockedSongIds || profile.unlockedSongIds.length === 0) {
      return INITIAL_UNLOCKED_SONG_IDS.includes(songId);
    }
    return profile.unlockedSongIds.includes(songId);
  }

  public async unlockSong(
    songId: string,
    songTitle?: string,
    cost: number = UNLOCK_COST_ROCKCOINS
  ): Promise<{ success: boolean; error?: string; remainingCoins?: number }> {
    const profile = this.getActiveProfile();
    if (this.isSongUnlocked(songId)) {
      return { success: true, remainingCoins: profile.rockCoins || 0 };
    }
    const currentCoins = profile.rockCoins || 0;
    if (currentCoins < cost) {
      return {
        success: false,
        error: 'ROCKCOINS_INSUFFICIENT',
        remainingCoins: currentCoins
      };
    }

    profile.rockCoins = currentCoins - cost;
    profile.totalCoinsSpent = (profile.totalCoinsSpent || 0) + cost;
    if (!profile.unlockedSongIds) {
      profile.unlockedSongIds = [...INITIAL_UNLOCKED_SONG_IDS];
    }
    if (!profile.unlockedSongIds.includes(songId)) {
      profile.unlockedSongIds.push(songId);
    }
    if (!profile.transactions) {
      profile.transactions = [];
    }
    profile.transactions.push({
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'SPEND',
      amount: cost,
      description: `Desbloqueio de música: ${songTitle || songId}`,
      songId,
      timestamp: Date.now()
    });

    await this.saveProfileToDB(profile);

    if (profile.id && profile.id !== 'guest') {
      FirestoreService.syncProfileToCloud(profile.id, profile).catch(() => {});
    }

    return { success: true, remainingCoins: profile.rockCoins };
  }

  public getProfileStats(
    profile?: PlayerProfile,
    songLookup?: (id: string) => { title: string; artist: string; coverUrl?: string } | undefined
  ): ProfileStats {
    const target = profile || this.getActiveProfile();
    const songsPlayedSet = new Set<string>();
    let completedMatches = 0;
    let totalHits = 0;
    let totalMisses = 0;
    let maxCombo = 0;

    let bestScore = 0;
    let bestSongInfo: {
      songId: string;
      title: string;
      artist: string;
      score: number;
      difficulty: Difficulty;
      coverUrl?: string;
    } | null = null;

    if (target.history && Array.isArray(target.history)) {
      target.history.forEach((h) => {
        if (h.cleared) {
          songsPlayedSet.add(h.songId);
          completedMatches++;
        }
        totalHits += h.hits ?? 0;
        totalMisses += h.misses ?? 0;
        if (h.maxCombo > maxCombo) {
          maxCombo = h.maxCombo;
        }
        if (h.score > bestScore) {
          bestScore = h.score;
          const lookup = songLookup?.(h.songId);
          bestSongInfo = {
            songId: h.songId,
            title: lookup?.title || h.songTitle || h.songId,
            artist: lookup?.artist || h.artist || 'RockBrazil',
            score: h.score,
            difficulty: h.difficulty,
            coverUrl: lookup?.coverUrl
          };
        }
      });
    }

    if (target.records) {
      Object.entries(target.records).forEach(([songId, diffs]) => {
        if (!diffs) return;
        Object.entries(diffs).forEach(([diffKey, rec]) => {
          if (!rec) return;
          const s = rec.bestScore ?? rec.score ?? 0;
          const c = rec.bestMaxCombo ?? rec.maxCombo ?? 0;
          if (c > maxCombo) maxCombo = c;
          if (s > 0) {
            songsPlayedSet.add(songId);
          }
          if (s > bestScore) {
            bestScore = s;
            const lookup = songLookup?.(songId);
            bestSongInfo = {
              songId,
              title: lookup?.title || songId,
              artist: lookup?.artist || 'RockBrazil',
              score: s,
              difficulty: diffKey as Difficulty,
              coverUrl: lookup?.coverUrl
            };
          }
        });
      });
    }

    let avgAccuracy = 0;
    const totalNotes = totalHits + totalMisses;
    if (totalNotes > 0) {
      avgAccuracy = Math.round((totalHits / totalNotes) * 1000) / 10;
    } else if (target.history && target.history.length > 0) {
      const sumAcc = target.history.reduce((acc, h) => acc + (h.accuracy || 0), 0);
      avgAccuracy = Math.round((sumAcc / target.history.length) * 10) / 10;
    }

    return {
      songsPlayed: songsPlayedSet.size,
      completedMatches,
      totalHits,
      totalMisses,
      avgAccuracy,
      maxCombo,
      bestSong: bestSongInfo,
      rockCoins: target.rockCoins || 0,
      totalCoinsEarned: target.totalCoinsEarned ?? (target.rockCoins || 0),
      totalCoinsSpent: target.totalCoinsSpent || 0,
      unlockedSongsCount: target.unlockedSongIds?.length ?? INITIAL_UNLOCKED_SONG_IDS.length
    };
  }

  public getRockCoins(): number {
    return this.activeProfile?.rockCoins ?? 0;
  }

  public async addRockCoins(amount: number): Promise<number> {
    if (!this.activeProfile) return 0;
    this.activeProfile.rockCoins = Math.max(0, (this.activeProfile.rockCoins || 0) + amount);
    await this.saveProfileToDB(this.activeProfile);
    return this.activeProfile.rockCoins;
  }

  async getLeaderboard(songId: string, diff: Difficulty): Promise<LeaderboardEntry[]> {
    const profiles = await this.getAllProfiles();
    const entries: LeaderboardEntry[] = [];

    profiles.forEach((p) => {
      const rec = p.records[songId]?.[diff];
      if (rec) {
        entries.push({
          playerName: p.name,
          avatar: p.avatar,
          score: rec.score,
          accuracy: rec.accuracy,
          maxCombo: rec.maxCombo,
          stars: rec.stars,
          date: p.lastPlayedAt
        });
      }
    });

    entries.sort((a, b) => b.score - a.score);
    return entries;
  }

  async exportJSON(): Promise<string> {
    const profiles = await this.getAllProfiles();
    const exportData = {
      version: 'RockBrazil_V4',
      exportDate: Date.now(),
      profiles
    };
    return JSON.stringify(exportData, null, 2);
  }

  async importJSON(jsonStr: string): Promise<{ success: boolean; importedCount: number; error?: string }> {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed.profiles || !Array.isArray(parsed.profiles)) {
        return { success: false, importedCount: 0, error: 'Estrutura JSON inválida para perfis RockBrazil.' };
      }

      for (const profile of parsed.profiles) {
        if (profile.id && profile.name) {
          await this.saveProfileToDB(profile);
        }
      }

      const all = await this.getAllProfiles();
      if (!this.activeProfile && all.length > 0) {
        this.activeProfile = all[0];
        localStorage.setItem('rb_active_profile_id', all[0].id);
      }

      return { success: true, importedCount: parsed.profiles.length };
    } catch (err: any) {
      return { success: false, importedCount: 0, error: err.message || 'Falha ao importar JSON' };
    }
  }

  private async saveProfileToDB(profile: PlayerProfile): Promise<void> {
    try {
      const db = await ProfileManager.openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(ProfileManager.STORE_NAME, 'readwrite');
        const store = tx.objectStore(ProfileManager.STORE_NAME);
        const req = store.put(profile);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      this.saveProfileFallback(profile);
    }
  }

  private loadProfilesFallback(): PlayerProfile[] {
    try {
      const data = ProfileManager.getStorageItem('rb_profiles_fallback');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveProfileFallback(profile: PlayerProfile): void {
    try {
      const profiles = this.loadProfilesFallback();
      const idx = profiles.findIndex((p) => p.id === profile.id);
      if (idx >= 0) profiles[idx] = profile;
      else profiles.push(profile);
      ProfileManager.setStorageItem('rb_profiles_fallback', JSON.stringify(profiles));
    } catch {
      // Ignore
    }
  }
}
