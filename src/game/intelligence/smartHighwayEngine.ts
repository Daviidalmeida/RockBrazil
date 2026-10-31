import { Difficulty, Note } from '../../types';
import { VisualSpeedPreset } from './types';

export class SmartHighwayEngine {
  /**
   * Baseline approach times approved for V13.8.5 and V13.9.4
   */
  public static readonly BASE_APPROACH_TIMES: Record<Difficulty, number> = {
    EASY: 1.90,
    MEDIUM: 2.20,
    HARD: 1.85,
    EXPERT: 1.65
  };

  /**
   * Multiplier modifiers for visual speed presets:
   * Slower preset adds more travel time (notes move slower).
   * Faster preset reduces travel time (notes move faster).
   */
  public static readonly PRESET_MODIFIERS: Record<VisualSpeedPreset, number> = {
    LENTA: 1.25, // 25% more travel time = slower visual descent
    NORMAL: 1.0, // Baseline comfortable speed
    RÁPIDA: 0.80 // 20% less travel time = faster visual descent
  };

  /**
   * Computes the effective approach time for a difficulty and speed preset.
   */
  public static calculateApproachTime(
    difficulty: Difficulty,
    preset: VisualSpeedPreset = 'NORMAL',
    userMultiplier = 1.0
  ): number {
    const base = this.BASE_APPROACH_TIMES[difficulty] ?? 1.85;
    const presetMod = this.PRESET_MODIFIERS[preset] ?? 1.0;
    const clampedUser = Math.max(0.6, Math.min(2.0, userMultiplier));

    const finalApproach = (base * presetMod) / clampedUser;
    // Bounded safety limits (between 0.90s and 3.20s)
    return Math.max(0.90, Math.min(3.20, Number(finalApproach.toFixed(3))));
  }

  /**
   * Performs sublinear binary search to find the index of the first note
   * visible in the highway viewport window.
   */
  public static findFirstVisibleIndex(notes: Note[], windowStartTime: number): number {
    let low = 0;
    let high = notes.length - 1;
    let result = 0;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const note = notes[mid];
      // Note is visible if it ends after windowStartTime
      const noteEndTime = note.time + (note.duration || 0);

      if (noteEndTime >= windowStartTime) {
        result = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return result;
  }

  /**
   * Performs sublinear binary search to find the index of the last note
   * visible in the highway viewport window.
   */
  public static findLastVisibleIndex(notes: Note[], windowEndTime: number): number {
    let low = 0;
    let high = notes.length - 1;
    let result = notes.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const note = notes[mid];

      if (note.time <= windowEndTime) {
        result = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return result;
  }

  /**
   * Returns a sliced view of notes visible on screen during the current frame,
   * avoiding full $O(N)$ iteration across thousands of notes.
   */
  public static getVisibleNotes(
    notes: Note[],
    currentTime: number,
    approachTime: number
  ): Note[] {
    if (!notes || notes.length === 0) return [];

    const windowStart = currentTime - 0.25; // 250ms past receptor for completion animations
    const windowEnd = currentTime + approachTime + 0.15; // Horizon lead-in

    const firstIndex = this.findFirstVisibleIndex(notes, windowStart);
    const lastIndex = this.findLastVisibleIndex(notes, windowEnd);

    if (firstIndex > lastIndex) return [];
    return notes.slice(firstIndex, lastIndex + 1);
  }
}
