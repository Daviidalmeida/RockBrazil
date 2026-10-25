import { Note, Lane, Difficulty, BeatmapByDifficulty } from '../../types';

export interface SongShiftMetadata {
  songId: string;
  originalFirstNoteSec: number;
  shiftSec: number;
  correctedFirstNoteSec: number;
  isShifted: boolean;
}

/**
 * ROCKBRAZIL V9 — CHART SHIFT MANAGER (SHIFT REMOVED)
 * In V9, all artificial first-note-to-zero shifts are completely removed.
 * Authentic Clone Hero / community chart timings and musical introductions are preserved 100%.
 */
export class ChartShiftManager {
  // V9: No hardcoded artificial shifts applied. Authentic musical introduction is preserved.
  public static readonly OFFICIAL_SHIFTS: Record<string, number> = {};

  // Runtime rollback overrides (if needed)
  private static readonly rollbackSongs = new Set<string>();

  /**
   * Returns the shift in seconds for a specific song (strictly 0 in V9).
   */
  public static getShiftSeconds(songId: string): number {
    return this.OFFICIAL_SHIFTS[songId] || 0;
  }

  /**
   * Checks if a song is shifted (strictly false in V9).
   */
  public static isSongShifted(songId: string): boolean {
    return (this.OFFICIAL_SHIFTS[songId] || 0) > 0;
  }

  /**
   * Rolls back a specific song to its original unshifted timestamps.
   */
  public static rollbackSong(songId: string): void {
    this.rollbackSongs.add(songId);
  }

  /**
   * Reapplies shift (noop in V9 as shifts are removed).
   */
  public static reapplyShift(songId: string): void {
    this.rollbackSongs.delete(songId);
  }

  /**
   * Identity pass-through or safe shift
   */
  public static shiftNotes(notes: Note[], shiftSec: number): Note[] {
    if (shiftSec <= 0) {
      return notes.map((n) => ({ ...n }));
    }

    return notes.map((n) => {
      const shifted = n.time - shiftSec;
      return {
        ...n,
        time: Number(Math.max(0, shifted).toFixed(3))
      };
    });
  }

  /**
   * Shifts an entire BeatmapByDifficulty set by uniform shiftSec (noop if <= 0).
   */
  public static shiftBeatmap(beatmap: BeatmapByDifficulty, shiftSec: number): BeatmapByDifficulty {
    if (shiftSec <= 0) return beatmap;
    return {
      EASY: this.shiftNotes(beatmap.EASY, shiftSec),
      MEDIUM: this.shiftNotes(beatmap.MEDIUM, shiftSec),
      HARD: this.shiftNotes(beatmap.HARD, shiftSec),
      EXPERT: this.shiftNotes(beatmap.EXPERT, shiftSec)
    };
  }
}
