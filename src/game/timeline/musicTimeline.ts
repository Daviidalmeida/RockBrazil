import { PlaybackState } from '../../types';

export interface AudioTimeSource {
  getCurrentTime(): number;
  getPlaybackState(): PlaybackState;
  isBuffering(): boolean;
}

/**
 * ROCKBRAZIL BETA V6 — MUSIC TIMELINE
 * Single reference timeline for all rhythm gameplay.
 * - Obtains accurate musical reference time from the active audio source.
 * - Controls pause, resume, and buffering with zero drift.
 * - Applies calibration offsets EXACTLY once: totalOffsetSec = (songOffsetMs + globalOffsetMs) / 1000.
 * - Protects against unwanted restarts or resets when multiple PLAYING events fire.
 * - Supports smooth visual pre-roll during countdown (allowing approaching notes to descend).
 */
export class MusicTimeline {
  private source: AudioTimeSource | null = null;
  private songOffsetSec = 0;
  private globalOffsetSec = 0;
  private frozenTime = 0;
  private isPaused = false;
  private _isBufferingState = false;
  private isCountdown = true;
  private lastReportedTime = 0;
  private visualPrerollTime = 0;
  private isPrerollActive = false;

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
        }
      });
    }
  }

  public setSource(source: AudioTimeSource | null): void {
    this.source = source;
  }

  public getSource(): AudioTimeSource | null {
    return this.source;
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

  /**
   * Starts the countdown state. Supports visual pre-roll duration so notes in the
   * first few seconds start descending the highway smoothly.
   */
  public startCountdown(prerollSec = 0): void {
    this.isCountdown = true;
    this.isPaused = false;
    this._isBufferingState = false;
    this.frozenTime = 0;
    this.lastReportedTime = 0;
    if (prerollSec > 0) {
      this.isPrerollActive = true;
      this.visualPrerollTime = -prerollSec;
    } else {
      this.isPrerollActive = false;
      this.visualPrerollTime = 0;
    }
  }

  /**
   * Updates visual pre-roll time as countdown ticks progress (0.0 at tick 3 down to 1.0 at ROCK!)
   */
  public setPrerollProgress(progress: number, prerollSec: number): void {
    if (this.isCountdown && this.isPrerollActive) {
      // Linear advance from -prerollSec to 0
      this.visualPrerollTime = -prerollSec * (1.0 - Math.min(1.0, Math.max(0, progress)));
    }
  }

  /**
   * Transitions definitively to active playback.
   * If already playing, ignores duplicate calls to prevent time resets.
   */
  public startPlayback(): void {
    this.isCountdown = false;
    this.isPrerollActive = false;
    this.isPaused = false;
    this._isBufferingState = false;
  }

  public pause(): void {
    if (!this.isPaused) {
      this.frozenTime = this.lastReportedTime;
      this.isPaused = true;
    }
  }

  public resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
    }
  }

  public setBuffering(buffering: boolean): void {
    if (buffering && !this._isBufferingState) {
      this.frozenTime = this.lastReportedTime;
      this._isBufferingState = true;
    } else if (!buffering && this._isBufferingState) {
      this._isBufferingState = false;
    }
  }

  public isBuffering(): boolean {
    return this._isBufferingState;
  }

  get isBufferingState(): boolean {
    return this._isBufferingState;
  }

  public isPausedState(): boolean {
    return this.isPaused;
  }

  public isCountdownState(): boolean {
    return this.isCountdown;
  }

  public reset(): void {
    this.isCountdown = true;
    this.isPrerollActive = false;
    this.visualPrerollTime = 0;
    this.isPaused = false;
    this._isBufferingState = false;
    this.frozenTime = 0;
    this.lastReportedTime = 0;
  }

  /**
   * Returns high-precision non-decreasing reference time (in seconds).
   * Exact rule: when getTime() == note.time, the note is mathematically
   * aligned with the strike line center.
   */
  public getTime(): number {
    // 1. During countdown:
    if (this.isCountdown) {
      if (this.isPrerollActive) {
        return this.visualPrerollTime;
      }
      return 0;
    }

    // 2. If paused, clock is strictly frozen at the pause moment
    if (this.isPaused) {
      return Math.max(0, this.frozenTime);
    }

    // 3. Self-healing buffering check:
    if (this._isBufferingState) {
      if (
        this.source &&
        this.source.getPlaybackState() === PlaybackState.PLAYING &&
        !this.source.isBuffering()
      ) {
        this._isBufferingState = false;
      } else {
        return Math.max(0, this.frozenTime);
      }
    }

    // 4. Check active source
    if (!this.source) {
      return Math.max(0, this.frozenTime);
    }

    const state = this.source.getPlaybackState();
    if (state === PlaybackState.BUFFERING || this.source.isBuffering()) {
      if (!this._isBufferingState) {
        this.frozenTime = this.lastReportedTime;
        this._isBufferingState = true;
      }
      return Math.max(0, this.frozenTime);
    }

    if (state !== PlaybackState.PLAYING && state !== PlaybackState.PAUSED) {
      return Math.max(0, this.lastReportedTime);
    }

    // 5. Source time + song offset + global offset applied exactly once
    const sourceRaw = this.source.getCurrentTime();
    const calculated = sourceRaw + this.getTotalOffsetSec();

    // Prevent backwards roll from minor network jitter / timer quantization
    const finalTime = Math.max(this.lastReportedTime, calculated);
    this.lastReportedTime = finalTime;
    this.frozenTime = finalTime;

    return finalTime;
  }
}
