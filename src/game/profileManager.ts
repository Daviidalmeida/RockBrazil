import { Difficulty, GameSettings, SongRecord, GameStats, SongMetadata } from '../types';
import { RockCoinsManager } from './economy/rockCoinsManager';
import { FirestoreService } from '../firebase/firestoreService';
import { OFFICIAL_BRAZILIAN_CATALOG } from './catalog/catalogData';

export const INITIAL_UNLOCKED_SONG_IDS: string[] = ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo'];
export const UNLOCK_COST_ROCKCOINS = 5;
export const SEASON_1_RESET_KEY = 'rb_season_1_reset_v14';
export const CURRENT_SEASON_TAG = 's1';
export const MIGRATION_VERSION_S1 = 14.0;

export interface OfficialAvatar {
  id: string;
  file: string;
  name: string;
  url: string;
}

export const OFFICIAL_AVATARS: OfficialAvatar[] = Array.from({ length: 15 }, (_, i) => {
  const num = String(i + 1).padStart(2, '0');
  return {
    id: `rockbrazil-avatar-${num}`,
    file: `avatar-${num}.webp`,
    name: `Avatar ${i + 1}`,
    url: `images/avatars/avatar-${num}.webp`
  };
});

export function getAvatarUrl(avatarIdOrUrl?: string): string {
  if (!avatarIdOrUrl) return 'images/avatars/avatar-01.webp';
  if (avatarIdOrUrl.startsWith('rockbrazil-avatar-')) {
    const num = avatarIdOrUrl.replace('rockbrazil-avatar-', '');
    return `images/avatars/avatar-${num}.webp`;
  }
  if (avatarIdOrUrl.startsWith('avatar-') && avatarIdOrUrl.endsWith('.webp')) {
    return `images/avatars/${avatarIdOrUrl}`;
  }
  if (avatarIdOrUrl.startsWith('http://') || avatarIdOrUrl.startsWith('https://')) {
    return avatarIdOrUrl;
  }
  return avatarIdOrUrl;
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
}

export const OFFICIAL_ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first_show',
    title: 'Primeiro Show',
    description: 'Complete sua primeira música em qualquer dificuldade.',
    icon: '🎸',
    tier: 'bronze'
  },
  {
    id: 'rookie_5_songs',
    title: 'Estreante',
    description: 'Complete 5 músicas diferentes.',
    icon: '⚡',
    tier: 'bronze'
  },
  {
    id: 'rocker_20_songs',
    title: 'Roqueiro',
    description: 'Complete 20 músicas diferentes.',
    icon: '🔥',
    tier: 'silver'
  },
  {
    id: 'veteran_50_songs',
    title: 'Veterano',
    description: 'Complete 50 músicas diferentes.',
    icon: '👑',
    tier: 'gold'
  },
  {
    id: 'first_full_combo',
    title: 'Primeiro Full Combo',
    description: 'Complete qualquer música com 100% de notas e 0 erros.',
    icon: '🎯',
    tier: 'silver'
  },
  {
    id: 'collector_10',
    title: 'Colecionador',
    description: 'Desbloqueie 10 músicas misteriosas.',
    icon: '💿',
    tier: 'bronze'
  },
  {
    id: 'super_collector_50',
    title: 'Supercolecionador',
    description: 'Desbloqueie 50 músicas misteriosas.',
    icon: '🏆',
    tier: 'gold'
  },
  {
    id: 'rock_legend_162',
    title: 'Lenda do Rock',
    description: 'Desbloqueie todas as 162 músicas do RockBrazil.',
    icon: '🌟',
    tier: 'platinum'
  }
];

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
  achievements?: Record<string, { unlockedAt: number }>;
  updatedAt?: number;
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
  achievementsCount?: number;
  totalAchievementsCount?: number;
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
    avatar: 'rockbrazil-avatar-01',
    createdAt: 0,
    lastPlayedAt: 0,
    settings: {
      musicVolume: 0.85,
      sfxVolume: 0.9,
      audioOffsetMs: 0,
      noteSpeedMultiplier: 1.0,
      visualEffectsEnabled: true,
      muteOnMiss: true
    },
    records: {},
    history: [],
    rockCoins: 0,
    unlockedSongIds: ['mam-1406', 'cap-sua-maneira', 'pit-chip-novo'],
    totalCoinsEarned: 0,
    totalCoinsSpent: 0,
    transactions: [],
    migrationVersion: 14.0,
    accountType: 'guest',
    achievements: {}
  };

  /**
   * Executa o Reset Total da Temporada 1 uma única vez.
   * Cria backup prévio, invalida dados e filas de testes antigos, e define o estado oficial.
   */
  public static performSeason1ResetIfNeeded(): { resetPerformed: boolean; backupKey?: string } {
    try {
      if (typeof localStorage === 'undefined') return { resetPerformed: false };

      const alreadyReset = localStorage.getItem(SEASON_1_RESET_KEY);
      if (alreadyReset === 'true') {
        return { resetPerformed: false };
      }

      // 1. Backup de segurança dos dados locais de teste antes de qualquer exclusão
      const backupData: Record<string, any> = {
        timestamp: Date.now(),
        date: new Date().toISOString(),
        note: 'Backup automático pré-reset Temporada 1 RockBrazil',
        activeProfileId: localStorage.getItem('rb_active_profile_id'),
        fallbackProfiles: localStorage.getItem('rb_profiles_fallback'),
        settings: localStorage.getItem('rockbrazil_settings'),
        pendingSync: localStorage.getItem('rb_pending_ranking_sync'),
        authPreference: localStorage.getItem('rb_auth_preference')
      };
      const backupKey = `rb_backup_pre_season_1_${Date.now()}`;
      localStorage.setItem(backupKey, JSON.stringify(backupData));
      localStorage.setItem('rb_last_backup_pre_season_1_key', backupKey);

      // 2. Limpar filas de sincronização offline antigas (impede republicação de recordes da fase de testes!)
      localStorage.removeItem('rb_pending_ranking_sync');
      localStorage.removeItem('rb_profiles_fallback');
      localStorage.removeItem('rb_active_profile_id');
      localStorage.removeItem('rb_guest_profile');

      // 3. Limpar bancos IndexedDB antigos do navegador
      if (typeof indexedDB !== 'undefined') {
        try {
          indexedDB.deleteDatabase(this.DB_NAME);
        } catch {
          // Ignore
        }
      }

      // 4. Marcação definitiva do reset da Temporada 1 (acontece apenas uma única vez!)
      localStorage.setItem(SEASON_1_RESET_KEY, 'true');

      return { resetPerformed: true, backupKey };
    } catch (err) {
      console.warn('[ProfileManager] Erro no reset da Temporada 1:', err);
      return { resetPerformed: false };
    }
  }

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
    ProfileManager.performSeason1ResetIfNeeded();

    const savedActiveId = ProfileManager.getStorageItem('rb_active_profile_id');

    if (savedActiveId && savedActiveId !== 'guest') {
      const stored = await this.getProfileByUid(savedActiveId);
      if (stored) {
        this.activeProfile = this.migrateProfile(stored, catalogSongIds);
        return { isFirstRun: false, activeProfile: this.activeProfile };
      }
    }

    const guest = this.loadGuestProfile();
    this.activeProfile = this.migrateProfile(guest, catalogSongIds);
    ProfileManager.setStorageItem('rb_active_profile_id', 'guest');
    return { isFirstRun: false, activeProfile: this.activeProfile };
  }

  public migrateProfile(profile: PlayerProfile, catalogSongIds?: string[]): PlayerProfile {
    // Compatibilidade com testes legados que passaram catalogSongIds explicitamente sem versão
    if (!profile.migrationVersion || profile.migrationVersion < 13.3) {
      if (catalogSongIds && catalogSongIds.length > 0) {
        profile.unlockedSongIds = [...catalogSongIds];
      } else {
        profile.unlockedSongIds = [...INITIAL_UNLOCKED_SONG_IDS];
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
      if (!profile.settings) {
        profile.settings = {
          musicVolume: 0.85,
          sfxVolume: 0.9,
          audioOffsetMs: 0,
          noteSpeedMultiplier: 1.0,
          visualEffectsEnabled: true,
          muteOnMiss: true
        };
      } else if (profile.settings.muteOnMiss === undefined || profile.settings.muteOnMiss === null) {
        profile.settings.muteOnMiss = true;
      }
      profile.migrationVersion = 13.3;
      this.saveProfileToDB(profile).catch(() => {});
      return profile;
    }

    // Se estiver na versão 13.3 e migrando para 14.0 (Temporada 1)
    if (profile.migrationVersion < 14.0) {
      if (!profile.unlockedSongIds || profile.unlockedSongIds.length === 0) {
        profile.unlockedSongIds = [...INITIAL_UNLOCKED_SONG_IDS];
      }
      profile.migrationVersion = 14.0;
    }

    // Garante preferências de áudio e muteOnMiss
    if (!profile.settings) {
      profile.settings = {
        musicVolume: 0.85,
        sfxVolume: 0.9,
        audioOffsetMs: 0,
        noteSpeedMultiplier: 1.0,
        visualEffectsEnabled: true,
        muteOnMiss: true
      };
    } else if (profile.settings.muteOnMiss === undefined || profile.settings.muteOnMiss === null) {
      profile.settings.muteOnMiss = true;
    }

    return profile;
  }

  async updateActiveAvatar(avatarId: string): Promise<PlayerProfile | null> {
    if (!this.activeProfile) return null;
    this.activeProfile.avatar = avatarId;
    this.activeProfile.updatedAt = Date.now();
    await this.saveProfileToDB(this.activeProfile);
    if (this.activeProfile.id && this.activeProfile.id !== 'guest') {
      FirestoreService.syncProfileToCloud(this.activeProfile.id, this.activeProfile).catch(() => {});
    }
    return this.activeProfile;
  }

  /**
   * Obtém um perfil persistido diretamente pelo UID.
   */
  public async getProfileByUid(uid: string): Promise<PlayerProfile | null> {
    if (!uid) return null;
    if (uid === 'guest') return this.loadGuestProfile();

    const all = await this.getAllStoredProfiles();
    return all.find((p) => p.id === uid) || null;
  }

  /**
   * Define e recupera o perfil único oficial da conta Google autenticada.
   */
  public async setGoogleProfile(uid: string, name?: string, avatar?: string): Promise<PlayerProfile> {
    if (!uid || uid === 'guest') {
      return this.setGuestMode();
    }

    let profile = await this.getProfileByUid(uid);
    if (!profile) {
      const publicName = (name || 'Rockeiro').split('@')[0].trim().substring(0, 24);
      profile = {
        id: uid,
        name: publicName,
        avatar: avatar || 'rockbrazil-avatar-01',
        createdAt: Date.now(),
        lastPlayedAt: Date.now(),
        settings: {
          musicVolume: 0.85,
          sfxVolume: 0.9,
          audioOffsetMs: 0,
          noteSpeedMultiplier: 1.0,
          visualEffectsEnabled: true,
          muteOnMiss: true
        },
        records: {},
        history: [],
        rockCoins: 0,
        unlockedSongIds: [...INITIAL_UNLOCKED_SONG_IDS],
        totalCoinsEarned: 0,
        totalCoinsSpent: 0,
        transactions: [],
        migrationVersion: 14.0,
        accountType: 'google',
        achievements: {}
      };
    } else {
      profile.accountType = 'google';
      if (name && (!profile.name || profile.name === 'Convidado')) {
        profile.name = name.split('@')[0].trim().substring(0, 24);
      }
      if (avatar && (!profile.avatar || profile.avatar === 'rockbrazil-avatar-01')) {
        profile.avatar = avatar;
      }
    }

    ProfileManager.setStorageItem(SEASON_1_RESET_KEY, 'true');
    this.activeProfile = profile;
    ProfileManager.setStorageItem('rb_active_profile_id', uid);
    await this.saveProfileToDB(profile);
    return profile;
  }

  /**
   * Converte permanentemente o perfil de Convidado em perfil oficial Google ao vincular.
   */
  public linkGuestToGoogle(uid: string, name?: string, avatar?: string): PlayerProfile {
    const guest = this.loadGuestProfile();
    const publicName = (name || (guest.name !== 'Convidado' ? guest.name : 'Rockeiro')).split('@')[0].trim().substring(0, 24);

    const googleProfile: PlayerProfile = {
      ...guest,
      id: uid,
      name: publicName,
      avatar: avatar || guest.avatar || 'rockbrazil-avatar-01',
      accountType: 'google',
      migrationVersion: 14.0
    };

    this.activeProfile = googleProfile;
    ProfileManager.setStorageItem('rb_active_profile_id', uid);
    this.saveProfileToDB(googleProfile).catch(() => {});

    // Limpa o slot de convidado para que não guarde os dados do jogador agora vinculado
    this.saveGuestProfile({ ...ProfileManager.GUEST_PROFILE });

    return googleProfile;
  }

  /**
   * Ativa o Modo Convidado único.
   * Regra de Identidade: Não permite trocar para convidado se autenticado com Google.
   */
  setGuestMode(): PlayerProfile {
    if (this.activeProfile && this.activeProfile.accountType === 'google' && this.activeProfile.id !== 'guest') {
      return this.activeProfile;
    }

    const guest = this.loadGuestProfile();
    this.activeProfile = guest;
    ProfileManager.setStorageItem('rb_active_profile_id', 'guest');
    return this.activeProfile;
  }

  public loadGuestProfile(): PlayerProfile {
    try {
      const stored = ProfileManager.getStorageItem('rb_guest_profile');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.id === 'guest') {
          return parsed;
        }
      }
    } catch {
      // Ignore
    }
    return { ...ProfileManager.GUEST_PROFILE };
  }

  public saveGuestProfile(profile: PlayerProfile): void {
    ProfileManager.setStorageItem('rb_guest_profile', JSON.stringify(profile));
  }

  getActiveProfile(): PlayerProfile {
    return this.activeProfile || ProfileManager.GUEST_PROFILE;
  }

  /**
   * V13.4: Retorna todos os perfis armazenados ou o perfil ativo único.
   */
  async getAllProfiles(): Promise<PlayerProfile[]> {
    const all = await this.getAllStoredProfiles();
    if (all.length > 0) return all;
    return [this.getActiveProfile()];
  }

  /**
   * Recupera todos os perfis armazenados localmente (IndexedDB / Fallback).
   */
  public async getAllStoredProfiles(): Promise<PlayerProfile[]> {
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
      avatar: avatar || 'rockbrazil-avatar-01',
      createdAt: Date.now(),
      lastPlayedAt: Date.now(),
      settings: {
        musicVolume: 0.85,
        sfxVolume: 0.9,
        audioOffsetMs: 0,
        noteSpeedMultiplier: 1.0,
        visualEffectsEnabled: true,
        muteOnMiss: true
      },
      records: {},
      history: [],
      rockCoins: 0,
      unlockedSongIds: [...INITIAL_UNLOCKED_SONG_IDS],
      totalCoinsEarned: 0,
      totalCoinsSpent: 0,
      transactions: [],
      migrationVersion: 14.0,
      accountType,
      achievements: {}
    };

    ProfileManager.setStorageItem(SEASON_1_RESET_KEY, 'true');
    await this.saveProfileToDB(newProfile);
    this.activeProfile = newProfile;
    ProfileManager.setStorageItem('rb_active_profile_id', newProfile.id);
    return newProfile;
  }

  async switchProfile(id: string): Promise<PlayerProfile | null> {
    if (this.activeProfile?.id === id) return this.activeProfile;
    const profiles = await this.getAllStoredProfiles();
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
    const updated = { ...this.activeProfile, ...updates, updatedAt: Date.now() };
    await this.saveProfileToDB(updated);
    this.activeProfile = updated;
    if (updated.id && updated.id !== 'guest') {
      FirestoreService.syncProfileToCloud(updated.id, updated).catch(() => {});
    }
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
    songArtist?: string,
    isInternational?: boolean
  ): Promise<RecordMatchResult> {
    const timestamp = Date.now();
    const hits = stats.hitsCount ?? (stats.perfectCount + stats.greatCount + stats.goodCount);
    const misses = stats.missCount ?? 0;
    const playableCount = stats.playableNotesCount ?? (hits + misses);
    // V13.6: Músicas internacionais em teste não geram RockCoins
    const earnedCoins = isInternational ? 0 : RockCoinsManager.calculateReward(
      diff,
      misses,
      playableCount,
      cleared
    );

    if (!this.activeProfile) {
      this.activeProfile = this.getActiveProfile();
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
      isFullCombo: (misses === 0 && ((stats as any).extraPressCount || 0) === 0 && cleared && playableCount > 0),
      earnedCoins: cleared ? earnedCoins : 0
    };

    this.activeProfile.history.unshift(historyItem);
    if (this.activeProfile.history.length > 50) {
      this.activeProfile.history.pop();
    }

    this.activeProfile.lastPlayedAt = timestamp;
    this.activeProfile.updatedAt = timestamp;

    // V13.5 / V13.7: Avaliação automática de Conquistas da Temporada 1 (apenas catálogo brasileiro)
    if (!isInternational) {
      const isFC = (misses === 0 && ((stats as any).extraPressCount || 0) === 0 && cleared && playableCount > 0);
      this.checkAndUnlockAchievements(stats, cleared, isFC);
    }

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
    if (songId.startsWith('intl-') || songId === 'tnt-acdc') {
      return true; // Músicas internacionais e T.N.T. são gratuitas e desbloqueadas para teste imediato
    }
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

    // Avalia conquistas de coleção após desbloqueio
    this.checkAndUnlockAchievements();

    profile.updatedAt = Date.now();
    await this.saveProfileToDB(profile);

    if (profile.id && profile.id !== 'guest') {
      FirestoreService.syncProfileToCloud(profile.id, profile).catch(() => {});
    }

    return { success: true, remainingCoins: profile.rockCoins };
  }

  /**
   * Retorna a lista canônica de IDs de todas as 162 músicas do catálogo oficial.
   */
  public static getCanonicalSongOrder(): string[] {
    return OFFICIAL_BRAZILIAN_CATALOG.map((s) => s.id);
  }

  /**
   * Retorna os metadados da próxima música misteriosa a ser desbloqueada,
   * seguindo rigorosamente a ordem fixa do catálogo oficial (159 músicas misteriosas).
   * Retorna null quando todas as 162 músicas já estiverem desbloqueadas.
   */
  public getNextMysterySong(): SongMetadata | null {
    const profile = this.getActiveProfile();
    const unlocked = profile.unlockedSongIds && profile.unlockedSongIds.length > 0
      ? profile.unlockedSongIds
      : INITIAL_UNLOCKED_SONG_IDS;

    for (const song of OFFICIAL_BRAZILIAN_CATALOG) {
      if (!unlocked.includes(song.id)) {
        return song;
      }
    }
    return null;
  }

  /**
   * Retorna a quantidade de músicas desbloqueadas pelo perfil ativo dentro do catálogo oficial.
   */
  public getUnlockedSongsCount(): number {
    const profile = this.getActiveProfile();
    const unlocked = profile.unlockedSongIds && profile.unlockedSongIds.length > 0
      ? profile.unlockedSongIds
      : INITIAL_UNLOCKED_SONG_IDS;
    const officialIds = new Set(OFFICIAL_BRAZILIAN_CATALOG.map((s) => s.id));
    const count = unlocked.filter((id) => officialIds.has(id)).length;
    return Math.max(INITIAL_UNLOCKED_SONG_IDS.length, Math.min(count, OFFICIAL_BRAZILIAN_CATALOG.length));
  }

  /**
   * Retorna o total oficial de faixas do catálogo (162).
   */
  public getTotalCatalogCount(): number {
    return OFFICIAL_BRAZILIAN_CATALOG.length;
  }

  /**
   * Desbloqueia a próxima música misteriosa da sequência canônica oficial.
   * Deduz 5 RockCoins de forma atômica e segura, registra a transação e atualiza as conquistas.
   */
  public async unlockNextMysterySong(
    cost: number = UNLOCK_COST_ROCKCOINS
  ): Promise<{ success: boolean; error?: string; song?: SongMetadata; remainingCoins?: number }> {
    const profile = this.getActiveProfile();
    const nextSong = this.getNextMysterySong();

    if (!nextSong) {
      return {
        success: false,
        error: 'ALL_SONGS_UNLOCKED',
        remainingCoins: profile.rockCoins || 0
      };
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
    if (!profile.unlockedSongIds.includes(nextSong.id)) {
      profile.unlockedSongIds.push(nextSong.id);
    }

    if (!profile.transactions) {
      profile.transactions = [];
    }
    profile.transactions.push({
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'SPEND',
      amount: cost,
      description: `Desbloqueio de música misteriosa: ${nextSong.title} (${nextSong.artist})`,
      songId: nextSong.id,
      timestamp: Date.now()
    });

    // Avalia conquistas de coleção
    this.checkAndUnlockAchievements();

    profile.updatedAt = Date.now();
    await this.saveProfileToDB(profile);

    if (profile.id && profile.id !== 'guest') {
      FirestoreService.syncProfileToCloud(profile.id, profile).catch(() => {});
    }

    return {
      success: true,
      song: nextSong,
      remainingCoins: profile.rockCoins
    };
  }

  /**
   * Avalia as 8 conquistas oficiais do RockBrazil e persiste as que foram completadas.
   */
  public checkAndUnlockAchievements(
    _stats?: GameStats,
    _cleared?: boolean,
    isFullCombo?: boolean
  ): { newlyUnlocked: AchievementDefinition[]; allUnlocked: string[] } {
    const profile = this.getActiveProfile();
    if (!profile.achievements) {
      profile.achievements = {};
    }

    const newlyUnlocked: AchievementDefinition[] = [];
    const now = Date.now();

    // 1. Músicas distintas concluídas
    const completedSongIds = new Set<string>();
    if (profile.history && Array.isArray(profile.history)) {
      profile.history.forEach((h) => {
        if (h.cleared) completedSongIds.add(h.songId);
      });
    }
    if (profile.records) {
      Object.entries(profile.records).forEach(([songId, diffs]) => {
        if (!diffs) return;
        Object.values(diffs).forEach((rec) => {
          if (rec && (rec.bestScore || rec.score || 0) > 0) {
            completedSongIds.add(songId);
          }
        });
      });
    }
    const completedCount = completedSongIds.size;

    // 2. Full Combo já obtido
    const hasFullCombo = Boolean(
      isFullCombo ||
      (profile.history && profile.history.some((h) => h.isFullCombo))
    );

    // 3. Contagem de desbloqueios
    const unlockedList = profile.unlockedSongIds && profile.unlockedSongIds.length > 0
      ? profile.unlockedSongIds
      : INITIAL_UNLOCKED_SONG_IDS;
    const officialCount = OFFICIAL_BRAZILIAN_CATALOG.length; // 162
    const totalUnlockedOfficial = unlockedList.filter((id) =>
      OFFICIAL_BRAZILIAN_CATALOG.some((s) => s.id === id)
    ).length;
    const mysteryUnlockedCount = Math.max(0, totalUnlockedOfficial - INITIAL_UNLOCKED_SONG_IDS.length);

    // Critérios das 8 conquistas
    const criteria: Record<string, boolean> = {
      first_show: completedCount >= 1,
      rookie_5_songs: completedCount >= 5,
      rocker_20_songs: completedCount >= 20,
      veteran_50_songs: completedCount >= 50,
      first_full_combo: hasFullCombo,
      collector_10: mysteryUnlockedCount >= 10 || totalUnlockedOfficial >= 13,
      super_collector_50: mysteryUnlockedCount >= 50 || totalUnlockedOfficial >= 53,
      rock_legend_162: totalUnlockedOfficial >= officialCount
    };

    OFFICIAL_ACHIEVEMENTS.forEach((ach) => {
      if (criteria[ach.id] && !profile.achievements![ach.id]) {
        profile.achievements![ach.id] = { unlockedAt: now };
        newlyUnlocked.push(ach);
      }
    });

    return {
      newlyUnlocked,
      allUnlocked: Object.keys(profile.achievements)
    };
  }

  /**
   * Retorna a lista detalhada de conquistas e status para exibição no perfil.
   */
  public getAchievements(): { definition: AchievementDefinition; unlocked: boolean; unlockedAt?: number }[] {
    const profile = this.getActiveProfile();
    this.checkAndUnlockAchievements();
    const userAch = profile.achievements || {};
    return OFFICIAL_ACHIEVEMENTS.map((def) => ({
      definition: def,
      unlocked: Boolean(userAch[def.id]),
      unlockedAt: userAch[def.id]?.unlockedAt
    }));
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

    const userAchievements = target.achievements || {};
    const achievementsCount = Object.keys(userAchievements).length;

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
      unlockedSongsCount: target.unlockedSongIds?.length ?? INITIAL_UNLOCKED_SONG_IDS.length,
      achievementsCount,
      totalAchievementsCount: OFFICIAL_ACHIEVEMENTS.length
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

  public async saveProfileToDB(profile: PlayerProfile): Promise<void> {
    if (profile.id === 'guest') {
      this.saveGuestProfile(profile);
      return;
    }

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
