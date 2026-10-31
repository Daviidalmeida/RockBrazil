import { VerifiedSyncProfile, ConfidenceLevel } from './types';

const STORAGE_KEY = 'rockbrazil_verified_sync_profiles';

export class VerifiedSyncProfileLearning {
  private static readonly BUILTIN_PROFILES: Record<string, VerifiedSyncProfile> = {
    'tnt-acdc': {
      songId: 'tnt-acdc',
      recordingId: 'yt-fGDQ9IukMOc',
      playbackSource: 'youtube',
      chartVersion: 'v13.9.4-official',
      calibratedOffsetMs: 0,
      driftRatePerSec: 0,
      verifiedAnchors: [
        { mediaTime: 0.71, chartTime: 0.71 },
        { mediaTime: 114.5, chartTime: 114.5 },
        { mediaTime: 228.4, chartTime: 228.4 }
      ],
      confidence: 'VERIFIED',
      calibratedAt: 1730390400000,
      algorithmVersion: 'SmartRhythmEngine_1.0'
    }
  };

  /**
   * Retrieves the best verified calibration profile for a given song and media source.
   */
  public static getProfile(songId: string, recordingId?: string): VerifiedSyncProfile | null {
    try {
      // 1. Check user-stored learned profiles
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed: Record<string, VerifiedSyncProfile> = JSON.parse(stored);
          const key = recordingId ? `${songId}_${recordingId}` : songId;
          if (parsed[key]) return parsed[key];
          if (parsed[songId]) return parsed[songId];
        }
      }
    } catch {
      // Ignore
    }

    // 2. Check built-in verified profiles
    return this.BUILTIN_PROFILES[songId] || null;
  }

  /**
   * Saves or updates a sync profile ONLY when verified with sufficient evidence.
   * Does NOT learn from player misses or poor performance.
   */
  public static saveProfile(profile: VerifiedSyncProfile): boolean {
    if (profile.confidence !== 'VERIFIED' && profile.confidence !== 'HIGH_CONFIDENCE') {
      return false; // Reject unverified profiles
    }

    try {
      if (typeof localStorage === 'undefined') return false;

      let storedMap: Record<string, VerifiedSyncProfile> = {};
      const existing = localStorage.getItem(STORAGE_KEY);
      if (existing) {
        storedMap = JSON.parse(existing);
      }

      const key = profile.recordingId ? `${profile.songId}_${profile.recordingId}` : profile.songId;
      storedMap[key] = {
        ...profile,
        calibratedAt: Date.now()
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedMap));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clears stored calibration profiles, restoring baseline defaults.
   */
  public static clearLearnedProfiles(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
  }
}
