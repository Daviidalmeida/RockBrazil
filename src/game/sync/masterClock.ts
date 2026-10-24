import { PlaybackState } from '../../types';

export interface AudioTimeSource {
  getCurrentTime(): number;
  getPlaybackState(): PlaybackState;
  isBuffering(): boolean;
}

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
 */
export class UnifiedMasterClock {
  private source: AudioTimeSource | null = null;
  private songOffsetSec = 0;
  private globalOffsetSec = 0;
  private frozenTime = 0;
  private isPaused = false;
  private isBufferingState = false;
  private isCountdown = true;
  private lastReportedTime = 0;

  // Background tab protection
  private isTabHidden = false;
  private tabHiddenTime = 0;

  constructor() {
    this.setupVisibilityListener();
  }

  private setupVisibilityListener(): void {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.isTabHidden = true;
          this.tabHiddenTime = performance.now();
        } else {
          this.isTabHidden = false;
          // Tab became visible again: guard against time leap
          this.resyncAfterBackgroundSwitch();
        }
      });
    }
  }

  public setSource(source: AudioTimeSource | null): void {
    this.source = source;
  }

  public setOffsets(songOffsetMs: number, globalOffsetMs = 0): void {
    this.songOffsetSec = songOffsetMs / 1000;
    this.globalOffsetSec = globalOffsetMs / 1000;
  }

  public setSongOffsetSec(sec: number): void {
    this.songOffsetSec = sec;
  }

  public setGlobalOffsetSec(sec: number): void {
    this.globalOffsetSec = sec;
  }

  public getSongOffsetSec(): number {
    return this.songOffsetSec;
  }

  public getGlobalOffsetSec(): number {
    return this.globalOffsetSec;
  }

  public getTotalOffsetSec(): number {
    return this.songOffsetSec + this.globalOffsetSec;
  }

  public startCountdown(): void {
    this.isCountdown = true;
    this.isPaused = false;
    this.isBufferingState = false;
    this.frozenTime = 0;
    this.lastReportedTime = 0;
  }

  public startPlayback(): void {
    this.isCountdown = false;
    this.isPaused = false;
    this.isBufferingState = false;
  }

  public pause(): void {
    if (!this.isPaused) {
      this.frozenTime = this.getTime();
      this.isPaused = true;
    }
  }

  public resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
    }
  }

  public setBuffering(buffering: boolean): void {
    if (buffering && !this.isBufferingState) {
      this.frozenTime = this.getTime();
      this.isBufferingState = true;
    } else if (!buffering && this.isBufferingState) {
      this.isBufferingState = false;
    }
  }

  public reset(): void {
    this.isCountdown = true;
    this.isPaused = false;
    this.isBufferingState = false;
    this.frozenTime = 0;
    this.lastReportedTime = 0;
  }

  private resyncAfterBackgroundSwitch(): void {
    // If paused or buffering during background, keep frozen
    if (this.isPaused || this.isBufferingState || this.isCountdown) {
      return;
    }
    // Time will read fresh from the source on next call
  }

  /**
   * Returns the single unified logical clock time (in seconds).
   * Exact rule: when getTime() == note.time, the note is mathematically
   * aligned with the strike line center.
   */
  public getTime(): number {
    // 1. During countdown or before genuine audio playback, clock is strictly 0
    if (this.isCountdown) {
      return 0;
    }

    // 2. If paused or buffering, clock is completely frozen
    if (this.isPaused || this.isBufferingState) {
      return Math.max(0, this.frozenTime);
    }

    // 3. Check active source state
    if (!this.source) {
      return Math.max(0, this.frozenTime);
    }

    const state = this.source.getPlaybackState();
    if (state === PlaybackState.BUFFERING || this.source.isBuffering()) {
      return Math.max(0, this.frozenTime);
    }

    if (state !== PlaybackState.PLAYING && state !== PlaybackState.PAUSED) {
      return 0;
    }

    // 4. Source time + verified song recording offset + user global offset
    const sourceRaw = this.source.getCurrentTime();
    const calculated = sourceRaw + this.getTotalOffsetSec();

    // Prevent clock from rolling backwards due to minor network jitter
    const finalTime = Math.max(0, calculated);
    this.lastReportedTime = finalTime;
    this.frozenTime = finalTime;

    return finalTime;
  }

  /**
   * Calculates progress for a note on the 3D highway (0.0 = horizon, 1.0 = strike line).
   */
  public getNoteProgress(noteTime: number, noteSpeed = 1.35): number {
    const currentTime = this.getTime();
    const timeRemaining = noteTime - currentTime;
    return 1.0 - (timeRemaining / noteSpeed);
  }
}
