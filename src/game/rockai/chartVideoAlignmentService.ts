import { AlignmentStatus } from './contracts';

export interface AlignmentCalibrationState {
  songId: string;
  youtubeVideoId: string;
  chartVideoOffsetMs: number;
  offsetMs?: number;
  personalPlayerOffsetMs: number;
  status: AlignmentStatus;
  lastTestedTimestampSec: number;
  updatedAt: string;
}

/**
 * ROCKBRAZIL V13.9 — CHART VIDEO ALIGNMENT SERVICE
 *
 * Implements strict, verifiable temporal relationship:
 * chartTime = videoTime + (chartVideoOffsetMs / 1000)
 *
 * Sign convention:
 * - Positive offset (+100ms): chart notes happen earlier relative to video.
 * - Negative offset (-100ms): chart notes delayed relative to video.
 */
export class ChartVideoAlignmentService {
  private static alignmentStorageKey = 'rockbrazil_rockai_alignments';

  
  public static calculateChartTime(videoTimeSec: number, offsetMs: number): number {
    return Number((videoTimeSec + (offsetMs / 1000)).toFixed(4));
  }

  public static calculateVideoTime(chartTimeSec: number, offsetMs: number): number {
    return Number((chartTimeSec - (offsetMs / 1000)).toFixed(4));
  }

  public static createInitialAlignment(songId: string, youtubeVideoId: string): AlignmentCalibrationState {
    return {
      songId,
      youtubeVideoId,
      chartVideoOffsetMs: 0,
      offsetMs: 0,
      personalPlayerOffsetMs: 0,
      status: 'NAO_CALIBRADO',
      lastTestedTimestampSec: 0,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Adjusts the offset by a delta in milliseconds (e.g. -100, -25, +25, +100).
   */
  public static adjustOffset(
    current: AlignmentCalibrationState,
    deltaMs: -100 | -25 | 25 | 100 | number
  ): AlignmentCalibrationState {
    const newOffset = Math.max(-5000, Math.min(5000, current.chartVideoOffsetMs + deltaMs));
    return {
      ...current,
      chartVideoOffsetMs: newOffset,
      offsetMs: newOffset,
      status: 'EM_TESTE',
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Calculates chart time from raw video time and offset.
   */
  public static computeChartTime(videoTimeSec: number, alignment: AlignmentCalibrationState): number {
    const totalOffsetSec = (alignment.chartVideoOffsetMs + alignment.personalPlayerOffsetMs) / 1000;
    return Number((videoTimeSec + totalOffsetSec).toFixed(4));
  }

  /**
   * Confirms validation by administrator / user.
   */
  public static setValidationStatus(
    current: AlignmentCalibrationState,
    newStatus: AlignmentStatus
  ): AlignmentCalibrationState {
    return {
      ...current,
      status: newStatus,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Saves alignment state to local storage.
   */
  public static saveAlignment(alignment: AlignmentCalibrationState): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const stored = this.getAllAlignments();
      stored[alignment.songId] = alignment;
      localStorage.setItem(this.alignmentStorageKey, JSON.stringify(stored));
    } catch (e) {
      console.warn('[ChartVideoAlignmentService] Falha ao salvar alinhamento:', e);
    }
  }

  public static getAlignment(songId: string): AlignmentCalibrationState | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const stored = this.getAllAlignments();
      return stored[songId] || null;
    } catch {
      return null;
    }
  }

  private static getAllAlignments(): Record<string, AlignmentCalibrationState> {
    try {
      const raw = localStorage.getItem(this.alignmentStorageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
}
