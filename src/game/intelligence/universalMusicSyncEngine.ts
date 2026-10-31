import { ClockStateSnapshot } from './types';

export interface AudioMediaSource {
  getCurrentTime(): number;
  isPlaying(): boolean;
  isBuffering(): boolean;
  isPaused(): boolean;
}

export class UniversalMusicSyncEngine {
  private mediaTime = 0;
  private chartTime = 0;
  private renderTime = 0;

  private calibratedOffsetMs = 0;
  private driftRatePerSec = 0;

  private isBufferingState = false;
  private isPausedState = false;
  private isCountdownState = true;

  private lastMediaReportTime = 0;
  private lastUpdatePerfTime = 0;
  private lastRenderAdvanceTime = 0;

  private consecutiveMisses = 0;
  private totalMisses = 0;
  private totalHits = 0;

  private mediaSource: AudioMediaSource | null = null;

  constructor() {
    this.lastUpdatePerfTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  public setSource(source: AudioMediaSource | null): void {
    this.mediaSource = source;
  }

  public setCalibration(offsetMs: number, driftRatePerSec = 0): void {
    this.calibratedOffsetMs = offsetMs;
    this.driftRatePerSec = Math.max(-0.01, Math.min(0.01, driftRatePerSec)); // clamp to max 10ms/s safety limit
  }

  public startPlayback(): void {
    this.isCountdownState = false;
    this.isPausedState = false;
    this.isBufferingState = false;
    this.lastUpdatePerfTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  public pause(): void {
    this.isPausedState = true;
  }

  public resume(): void {
    this.isPausedState = false;
    this.lastUpdatePerfTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  public setBuffering(buffering: boolean): void {
    this.isBufferingState = buffering;
    if (buffering) {
      // Freeze the timeline during buffering
      this.lastUpdatePerfTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    }
  }

  /**
   * Called on every animation/render frame.
   * Advances the 3 clocks strictly following the official media reference.
   */
  public update(currentPerfTime?: number): ClockStateSnapshot {
    const now = currentPerfTime ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const deltaMs = Math.max(0, Math.min(100, now - this.lastUpdatePerfTime));
    this.lastUpdatePerfTime = now;

    if (this.isCountdownState) {
      return this.getSnapshot(0);
    }

    if (this.isPausedState) {
      return this.getSnapshot(deltaMs);
    }

    if (this.mediaSource) {
      if (this.mediaSource.isBuffering()) {
        this.isBufferingState = true;
        return this.getSnapshot(deltaMs);
      }
      this.isBufferingState = false;

      const rawMedia = this.mediaSource.getCurrentTime();
      if (rawMedia >= 0) {
        // Detect seek (jump greater than 1.5s relative to monotonic time)
        const seekJump = Math.abs(rawMedia - this.mediaTime);
        if (seekJump > 1.5) {
          this.mediaTime = rawMedia;
        } else if (rawMedia >= this.mediaTime) {
          this.mediaTime = rawMedia;
        } else {
          // Keep monotonic progression between intermittent iframe polling
          const extDeltaSec = deltaMs / 1000;
          this.mediaTime = Math.min(rawMedia + 0.1, this.mediaTime + extDeltaSec);
        }
      }
    } else {
      // Synthetic fallback progression
      if (!this.isBufferingState && !this.isPausedState) {
        this.mediaTime += deltaMs / 1000;
      }
    }

    // Compute Chart Clock using unified offset & drift formula
    const offsetSec = this.calibratedOffsetMs / 1000;
    const driftSec = this.driftRatePerSec * this.mediaTime;
    this.chartTime = Math.max(0, this.mediaTime + offsetSec + driftSec);

    // Compute Render Clock (smooth interpolation tracking Chart Clock)
    const error = this.chartTime - this.renderTime;
    if (Math.abs(error) > 0.15) {
      // Snap on large jumps (seek or load)
      this.renderTime = this.chartTime;
    } else {
      // Smooth visual convergence without jitter
      this.renderTime += error * 0.4 + (deltaMs / 1000);
    }

    return this.getSnapshot(deltaMs);
  }

  /**
   * Strictly processes a gameplay miss.
   * A MISS affects ONLY the gameplay state (combo = 0, consecutive misses).
   * It NEVER pauses, NEVER silences, and NEVER freezes the clock or highway!
   */
  public registerMiss(): void {
    this.consecutiveMisses++;
    this.totalMisses++;
  }

  /**
   * Registers a successful note hit, resetting the miss streak.
   */
  public registerHit(): void {
    this.consecutiveMisses = 0;
    this.totalHits++;
  }

  public reset(): void {
    this.mediaTime = 0;
    this.chartTime = 0;
    this.renderTime = 0;
    this.isCountdownState = true;
    this.isPausedState = false;
    this.isBufferingState = false;
    this.consecutiveMisses = 0;
    this.totalMisses = 0;
    this.totalHits = 0;
  }

  public getMediaTime(): number {
    return this.mediaTime;
  }

  public getChartTime(): number {
    return this.chartTime;
  }

  public getRenderTime(): number {
    return this.renderTime;
  }

  public getConsecutiveMisses(): number {
    return this.consecutiveMisses;
  }

  public isBuffering(): boolean {
    return this.isBufferingState;
  }

  public isPaused(): boolean {
    return this.isPausedState;
  }

  private getSnapshot(deltaMs: number): ClockStateSnapshot {
    const fps = deltaMs > 0 ? Math.round(1000 / deltaMs) : 60;
    return {
      mediaTime: Number(this.mediaTime.toFixed(3)),
      chartTime: Number(this.chartTime.toFixed(3)),
      renderTime: Number(this.renderTime.toFixed(3)),
      isBuffering: this.isBufferingState,
      isPaused: this.isPausedState,
      appliedOffsetMs: this.calibratedOffsetMs,
      calibratedOffsetMs: this.calibratedOffsetMs,
      driftRatePerSec: this.driftRatePerSec,
      fps: Math.min(240, Math.max(0, fps))
    };
  }
}
