import { MusicTimeline, AudioTimeSource } from '../timeline/musicTimeline';
import { PlaybackState } from '../../types';

export type { AudioTimeSource };

export const YOUTUBE_SYSTEMIC_IPC_LATENCY_SEC = 0.200; // 200ms YouTube IFrame postMessage & render delay compensation

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
 * - V14.0: Compensates for asynchronous YouTube IFrame postMessage latency (200ms)
 */
export class UnifiedMasterClock extends MusicTimeline {
  /**
   * Configures systemic latency compensation depending on whether the source is YouTube or local Web Audio.
   */
  public configureForSource(sourceType: 'youtube' | 'audio-buffer' | 'procedural' | 'none'): void {
    if (sourceType === 'youtube') {
      this.setSystemicCompensationSec(YOUTUBE_SYSTEMIC_IPC_LATENCY_SEC);
    } else {
      this.setSystemicCompensationSec(0);
    }
  }

  /**
   * Calculates progress for a note on the 3D highway (0.0 = horizon, 1.0 = strike line).
   */
  public getNoteProgress(noteTime: number, noteSpeed = 0.92): number {
    const currentTime = this.getTime();
    const timeRemaining = noteTime - currentTime;
    return 1.0 - (timeRemaining / noteSpeed);
  }
}
