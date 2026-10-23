import { Difficulty, GameSettings, SongRecord, GameStats } from '../types';

export interface MatchHistoryItem {
  id: string;
  songId: string;
  songTitle: string;
  difficulty: Difficulty;
  score: number;
  accuracy: number;
  maxCombo: number;
  stars: number;
  cleared: boolean;
  date: number;
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

export class ProfileManager {
  private static DB_NAME = 'RockBrazilProfilesDB';
  private static STORE_NAME = 'profiles';
  private activeProfile: PlayerProfile | null = null;

  public static GUEST_PROFILE: PlayerProfile = {
    id: 'guest',
    name: 'Convidado',
    avatar: '👤',
    createdAt: 0,
    lastPlayedAt: 0,
    settings: {
      musicVolume: 0.85,
      sfxVolume: 0.9,
      audioOffsetMs: 0,
      noteSpeedMultiplier: 1.0,
      visualEffectsEnabled: true
    },
    records: {},
    history: []
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

  async init(): Promise<{ isFirstRun: boolean; activeProfile: PlayerProfile }> {
    const profiles = await this.getAllProfiles();

    if (profiles.length === 0) {
      this.activeProfile = ProfileManager.GUEST_PROFILE;
      return { isFirstRun: true, activeProfile: ProfileManager.GUEST_PROFILE };
    }

    const savedActiveId = ProfileManager.getStorageItem('rb_active_profile_id');
    let current = profiles.find((p) => p.id === savedActiveId);
    if (!current) {
      current = savedActiveId === 'guest' ? ProfileManager.GUEST_PROFILE : profiles[0];
    }

    this.activeProfile = current;
    ProfileManager.setStorageItem('rb_active_profile_id', current.id);
    return { isFirstRun: false, activeProfile: current };
  }

  setGuestMode(): PlayerProfile {
    this.activeProfile = ProfileManager.GUEST_PROFILE;
    ProfileManager.setStorageItem('rb_active_profile_id', 'guest');
    return ProfileManager.GUEST_PROFILE;
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

  async createProfile(name: string, avatar: string): Promise<PlayerProfile> {
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
        visualEffectsEnabled: true
      },
      records: {},
      history: []
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

  async recordMatch(
    songId: string,
    songTitle: string,
    diff: Difficulty,
    stats: GameStats,
    cleared: boolean
  ): Promise<void> {
    if (!this.activeProfile) return;

    const newRecord: SongRecord = {
      score: stats.score,
      stars: stats.stars || 1,
      accuracy: stats.accuracy || 0,
      maxCombo: stats.maxCombo
    };

    if (!this.activeProfile.records[songId]) {
      this.activeProfile.records[songId] = {};
    }

    const currentBest = this.activeProfile.records[songId][diff];
    if (!currentBest || newRecord.score > currentBest.score) {
      this.activeProfile.records[songId][diff] = newRecord;
    }

    const historyItem: MatchHistoryItem = {
      id: `match_${Date.now()}`,
      songId,
      songTitle,
      difficulty: diff,
      score: stats.score,
      accuracy: stats.accuracy || 0,
      maxCombo: stats.maxCombo,
      stars: stats.stars || 1,
      cleared,
      date: Date.now()
    };

    this.activeProfile.history.unshift(historyItem);
    if (this.activeProfile.history.length > 50) {
      this.activeProfile.history.pop();
    }

    this.activeProfile.lastPlayedAt = Date.now();
    await this.saveProfileToDB(this.activeProfile);
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
