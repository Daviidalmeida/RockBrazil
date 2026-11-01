import { MusicTimeline, AudioTimeSource } from '../timeline/musicTimeline';
import { PlaybackState } from '../../types';
import { AdaptiveClockEstimator, TelemetryDiagnostics } from '../rockchart/telemetry/adaptiveClockEstimator';

export type { AudioTimeSource, TelemetryDiagnostics };

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
 * - V14.1: AdaptiveClockEstimator dynamically interpolates YouTube's ~200ms discrete polls for 60/120fps fluidity
 */
export class UnifiedMasterClock extends MusicTimeline {
  private estimator = new AdaptiveClockEstimator();
  private isAdaptiveEnabled = false;

  /**
   * Configures systemic latency compensation and dynamic telemetry estimation
   * depending on whether the source is YouTube or local Web Audio.
   */
  public configureForSource(sourceType: 'youtube' | 'audio-buffer' | 'procedural' | 'none'): void {
    if (sourceType === 'youtube') {
      this.isAdaptiveEnabled = true;
      this.setSystemicCompensationSec(YOUTUBE_SYSTEMIC_IPC_LATENCY_SEC);
    } else {
      this.isAdaptiveEnabled = false;
      this.setSystemicCompensationSec(0);
    }
  }

  /**
   * Overrides raw source time with AdaptiveClockEstimator when connected to YouTube
   */
  protected override getRawSourceTime(): number {
    const src = this.getSource();
    if (this.isAdaptiveEnabled && src) {
      return this.estimator.update(src);
    }
    return super.getRawSourceTime();
  }

  /**
   * Returns current high-precision telemetry metrics for the admin diagnostic panel
   */
  public getTelemetryDiagnostics(): TelemetryDiagnostics {
    return this.estimator.getDiagnostics(this.getSource());
  }

  public override reset(): void {
    super.reset();
    this.estimator.reset();
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
