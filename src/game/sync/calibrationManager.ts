import { SongCalibration } from '../../types';
import { INTERNATIONAL_SYNC_REGISTRY } from './internationalSyncRegistry';

export class CalibrationManager {
  private static readonly STORAGE_KEY = 'rockbrazil_calibration_v2';
  private static cache: Record<string, SongCalibration> | null = null;

  // V8: Brazilian charts are normalized at source (0ms).
  // V13.8.4: International songs sync defaults driven by INTERNATIONAL_SYNC_REGISTRY
  private static getVerifiedDefault(songId: string): number {
    if (INTERNATIONAL_SYNC_REGISTRY[songId]) {
      return INTERNATIONAL_SYNC_REGISTRY[songId].chartVideoOffsetMs;
    }
    return 0;
  }

  private static load(): Record<string, SongCalibration> {
    if (this.cache !== null) return this.cache;

    this.cache = {};
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Clean legacy v1 storage if present to avoid old test offsets
        window.localStorage.removeItem('rockbrazil_calibration_v1');
        const raw = window.localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          this.cache = JSON.parse(raw);
        }
      }
    } catch {
      this.cache = {};
    }
    return this.cache!;
  }

  private static persist(): void {
    if (typeof window !== 'undefined' && window.localStorage && this.cache) {
      try {
        window.localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.cache));
      } catch {
        // Ignore quota errors
      }
    }
  }

  public static getCalibration(songId: string, videoId = ''): SongCalibration {
    const data = this.load();
    const defaultOffset = this.getVerifiedDefault(songId);
    if (!data[songId]) {
      data[songId] = {
        songId,
        videoId,
        chartOffsetMs: defaultOffset,
        inputLatencyMs: 0,
        calibrationStatus: defaultOffset !== 0 ? 'VERIFIED' : 'DEFAULT',
        lastCalibrated: Date.now()
      };
    }
    return { ...data[songId] };
  }

  public static getSongOffsetMs(songId: string): number {
    return this.getCalibration(songId).chartOffsetMs || 0;
  }

  public static getOffsetForSong(songId: string): number {
    return this.getSongOffsetMs(songId);
  }

  public static setSongOffsetMs(songId: string, offsetMs: number, videoId = ''): SongCalibration {
    const data = this.load();
    data[songId] = {
      songId,
      videoId: videoId || data[songId]?.videoId || '',
      chartOffsetMs: Math.max(-5000, Math.min(5000, Math.round(offsetMs))),
      inputLatencyMs: data[songId]?.inputLatencyMs || 0,
      calibrationStatus: 'USER_CALIBRATED',
      lastCalibrated: Date.now()
    };
    this.persist();
    return { ...data[songId] };
  }

  public static adjustOffsetMs(songId: string, deltaMs: number, videoId = ''): number {
    const current = this.getSongOffsetMs(songId);
    const updated = current + deltaMs;
    this.setSongOffsetMs(songId, updated, videoId);
    return updated;
  }

  public static resetOffsetMs(songId: string): void {
    const data = this.load();
    const defaultOffset = this.getVerifiedDefault(songId);
    if (data[songId]) {
      data[songId].chartOffsetMs = defaultOffset;
      data[songId].calibrationStatus = defaultOffset !== 0 ? 'VERIFIED' : 'DEFAULT';
      data[songId].lastCalibrated = Date.now();
      this.persist();
    }
  }
}
