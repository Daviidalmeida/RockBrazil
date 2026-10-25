import { MusicTimeline, AudioTimeSource } from '../timeline/musicTimeline';
import { PlaybackState } from '../../types';

export type { AudioTimeSource };

/**
 * Unified Master Clock for RockBrazil Beta.
 * Single source of truth that feeds:
 * - Note rendering on the 3D highway
 * - Strike line receptor alignment
 * - Engine hit detection and windows
 * - Sustains / holds and chords
 * - Scoring and combo mechanics
 * - HUD song progress bar
 * - Song completion detection
 *
 * Inherits the full V6 MusicTimeline architecture:
 * - Exact single offset calculation
 * - Audio-driven non-decreasing monotonic progression
 * - Clean buffering / pause isolation
 */
export class UnifiedMasterClock extends MusicTimeline {
  /**
   * Calculates progress for a note on the 3D highway (0.0 = horizon, 1.0 = strike line).
   */
  public getNoteProgress(noteTime: number, noteSpeed = 0.92): number {
    const currentTime = this.getTime();
    const timeRemaining = noteTime - currentTime;
    return 1.0 - (timeRemaining / noteSpeed);
  }
}
