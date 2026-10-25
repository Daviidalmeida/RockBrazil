import { Note, Difficulty, BeatmapByDifficulty } from '../../types';

export interface SongShiftMetadata {
  songId: string;
  originalFirstNoteSec: number;
  shiftSec: number;
  correctedFirstNoteSec: number;
  isShifted: boolean;
}

/**
 * ROCKBRAZIL BETA V8 — CHART SHIFT MANAGER
 * Manages deterministic normalization of chart start times so that notes
 * arrive at the strike line at the start of audio playback.
 * 
 * Rules:
 * 1. Single consistent shift per song across all difficulties.
 * 2. Strict preservation of inter-note intervals, chords, and sustain durations.
 * 3. Strict validation: no negative timestamps produced.
 * 4. Full individual song rollback capability.
 */
export class ChartShiftManager {
  // Official shifts computed from original chart audit (min playable note time across difficulties)
  public static readonly OFFICIAL_SHIFTS: Record<string, number> = {
    'mam-1406': 12.391,
    'cap-sua-maneira': 4.364,
    'pit-chip-novo': 6.981,
    'los-anna-julia': 2.019,
    'kua-de-borest': 6.565,
    'mam-debil-metal': 3.404,
    'mam-chopis-centis': 4.217,
    'df-destruir-tudo': 2.455,
    'sup-garota-berlim': 2.500,
    'cbjr-hoje-acordei': 3.692,
    'cpm-irreversivel': 3.865,
    'mam-jumento-celestino': 10.364,
    'lan-lata-velha': 3.980,
    'cbjr-nao-e-serio': 7.250,
    'eng-era-um-garoto': 3.200,
    'cbjr-champagne': 4.174,
    'pit-equalize': 2.283,
    'tih-tropa-elite': 10.004,
    'mam-sabao-cra-cra': 2.526,
    'cbjr-so-por-uma-noite': 2.550,
    'mat-ela-roubou-caminhao': 3.200,
    'mas-evil-papagali': 3.286,
    'det-nao-reclame-mais': 5.750,
    'cbjr-papo-reto': 4.773,
    'mam-mundo-animal': 9.824,
    'mas-metal-is-the-law': 4.645,
    'mas-metal-milkshake': 4.800,
    'cue-quem-matou-bozo': 1.500,
    'har-dormi-na-praca': 3.512,
    'pit-mascara': 4.800,
    'cue-minha-juventude': 1.500
  };

  // Runtime rollback overrides (if a song is restored to original)
  private static readonly rollbackSongs = new Set<string>();

  /**
   * Returns the shift in seconds for a specific song (0 if rolled back or not defined).
   */
  public static getShiftSeconds(songId: string): number {
    if (this.rollbackSongs.has(songId)) return 0;
    return this.OFFICIAL_SHIFTS[songId] || 0;
  }

  /**
   * Checks whether a song is actively normalized.
   */
  public static isSongShifted(songId: string): boolean {
    return !this.rollbackSongs.has(songId) && (this.OFFICIAL_SHIFTS[songId] || 0) > 0;
  }

  /**
   * Rolls back a specific song to its original unshifted timestamps.
   */
  public static rollbackSong(songId: string): void {
    this.rollbackSongs.add(songId);
    console.log(`[ChartShiftManager] Song ${songId} rolled back to original chart.`);
  }

  /**
   * Re-applies normalization for a specific song.
   */
  public static reapplyShift(songId: string): void {
    this.rollbackSongs.delete(songId);
    console.log(`[ChartShiftManager] Normalization reapplied to ${songId}.`);
  }

  /**
   * Resets all rollbacks (all songs active).
   */
  public static resetAllRollbacks(): void {
    this.rollbackSongs.clear();
  }

  /**
   * Shifts notes by subtracting shiftSec, validating that no negative timestamps result
   * and preserving all relative intervals, chords, and sustain durations.
   */
  public static shiftNotes(notes: Note[], shiftSec: number): Note[] {
    if (shiftSec <= 0) {
      return notes.map((n) => ({ ...n }));
    }

    return notes.map((n) => {
      const shifted = n.time - shiftSec;
      if (shifted < -0.001) {
        throw new Error(
          `[ChartShiftManager] Negative timestamp detected: note at ${n.time}s shifted by ${shiftSec}s results in ${shifted}s.`
        );
      }
      return {
        ...n,
        time: Number(Math.max(0, shifted).toFixed(3))
      };
    });
  }

  /**
   * Shifts an entire BeatmapByDifficulty set by a uniform shiftSec.
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
