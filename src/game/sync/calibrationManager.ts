import { SongCalibration } from '../../types';

export class CalibrationManager {
  private static readonly STORAGE_KEY = 'rockbrazil_calibration_v1';
  private static cache: Record<string, SongCalibration> | null = null;

  // Offsets verificados de estúdio entre a gravação do YouTube e o chart original
  private static readonly VERIFIED_DEFAULTS: Record<string, number> = {
    // Kuase Nada - De Borest: o vídeo no YouTube (CveouQkdSCs) possui ~135ms a menos de silêncio inicial
    // Adiantar o tempo do chart em +135ms alinha o primeiro acorde aos 6.43s do vídeo.
    'kua-de-borest': 135
  };

  private static load(): Record<string, SongCalibration> {
    if (this.cache !== null) return this.cache;

    this.cache = {};
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
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
    const defaultOffset = this.VERIFIED_DEFAULTS[songId] || 0;
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

  public static setSongOffsetMs(songId: string, offsetMs: number, videoId = ''): SongCalibration {
    const data = this.load();
    data[songId] = {
      songId,
      videoId: videoId || data[songId]?.videoId || '',
      chartOffsetMs: Math.max(-500, Math.min(500, Math.round(offsetMs))),
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
    const defaultOffset = this.VERIFIED_DEFAULTS[songId] || 0;
    if (data[songId]) {
      data[songId].chartOffsetMs = defaultOffset;
      data[songId].calibrationStatus = defaultOffset !== 0 ? 'VERIFIED' : 'DEFAULT';
      data[songId].lastCalibrated = Date.now();
      this.persist();
    }
  }
}
