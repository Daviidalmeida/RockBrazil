import { Note, PlaybackState, HitResult, GameStats } from '../../types';
import { UnifiedMasterClock } from './masterClock';
import { GameEngine } from '../engine';
import { GameRenderer } from '../../render/renderer';

export interface SyncHealthReport {
  clockTime: number;
  lastFrameDeltaMs: number;
  consecutiveMissCount: number;
  isClockStalled: boolean;
  isBufferRecovering: boolean;
  totalMissesProcessed: number;
  clockDriftMs: number;
  fps: number;
}

export interface RockSyncConfig {
  maxExtrapolationSec: number;
  frameDropThresholdMs: number;
  maxConsecutiveMissGraceSec: number;
}

const DEFAULT_CONFIG: RockSyncConfig = {
  maxExtrapolationSec: 0.75, // Up to 750ms extrapolation during transient player delays
  frameDropThresholdMs: 80,  // Frames taking > 80ms are handled as drops
  maxConsecutiveMissGraceSec: 0.35
};

/**
 * ROCKBRAZIL V13.9 — ROCKSYNC ENGINE
 *
 * Strict architectural isolation between:
 * 1. Player input & Hit Detection
 * 2. Note Judgments (Hits & Misses)
 * 3. Combo & Health Meter
 * 4. Musical Clock (Single Source of Truth)
 * 5. Highway Rendering Pipeline
 *
 * Prevents international & YouTube highway freezes caused by note errors.
 */
export class RockSyncEngine {
  private masterClock: UnifiedMasterClock;
  private config: RockSyncConfig;

  private lastFrameTimestamp = 0;
  private consecutiveMisses = 0;
  private totalMisses = 0;
  private lastReportedClockTime = 0;
  private clockStallCounter = 0;
  private frameCount = 0;
  private fpsCalculationTimestamp = 0;
  private currentFps = 60;

  // Decoupled event queues to prevent render blocking
  private pendingMissVisuals: { lane: number; time: number }[] = [];
  private isMutedState = false;

  private muteCallback: ((muted: boolean) => void) | null = null;

  public setMuteCallback(cb: (muted: boolean) => void): void {
    this.muteCallback = cb;
  }

  public get isAudioMuted(): boolean {
    return this.isMutedState;
  }

  public getState() {
    return {
      consecutiveMisses: this.consecutiveMisses,
      totalMisses: this.totalMisses,
      isAudioMuted: this.isMutedState,
      frozenStreakCount: this.clockStallCounter,
      clockJitterDetected: false
    };
  }


  constructor(masterClock: UnifiedMasterClock, config: Partial<RockSyncConfig> = {}) {
    this.masterClock = masterClock;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reset();
  }

  public reset(): void {
    this.lastFrameTimestamp = performance.now();
    this.consecutiveMisses = 0;
    this.totalMisses = 0;
    this.lastReportedClockTime = 0;
    this.clockStallCounter = 0;
    this.frameCount = 0;
    this.fpsCalculationTimestamp = performance.now();
    this.currentFps = 60;
    this.pendingMissVisuals = [];
    this.isMutedState = false;
  }

  /**
   * Called on every frame inside the game loop.
   * Manages clock progression, detects stalls, and ensures zero clock reset on misses.
   */
  public update(perfNow: number = performance.now()): {
    clockTime: number;
    shouldRender: boolean;
    isFrameDrop: boolean;
  } {
    const deltaMs = perfNow - this.lastFrameTimestamp;
    this.lastFrameTimestamp = perfNow;

    // Track FPS
    this.frameCount++;
    if (perfNow - this.fpsCalculationTimestamp >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (perfNow - this.fpsCalculationTimestamp));
      this.frameCount = 0;
      this.fpsCalculationTimestamp = perfNow;
    }

    const clockTime = this.masterClock.getTime();
    const isFrameDrop = deltaMs > this.config.frameDropThresholdMs;

    // Detect clock stall
    if (Math.abs(clockTime - this.lastReportedClockTime) < 0.0001 && !this.masterClock.isBufferingState && !this.masterClock.isPausedState() && !this.masterClock.isCountdownState()) {
      this.clockStallCounter++;
    } else {
      this.clockStallCounter = 0;
    }
    this.lastReportedClockTime = clockTime;

    return {
      clockTime,
      shouldRender: true,
      isFrameDrop
    };
  }

  /**
   * Processes a note miss with strict O(1) performance and ZERO impact on clock continuity.
   * Does NOT touch the DOM synchronously.
   * Does NOT send redundant postMessages to YouTube iframe.
   */
  public registerMiss(laneOrTime: number, note?: Partial<Note> | number): void {
    const lane = typeof note === 'object' && note !== null && typeof (note as any).lane === 'number'
      ? (note as any).lane
      : (laneOrTime >= 0 && laneOrTime <= 4 ? laneOrTime : 0);
    const time = typeof note === 'object' && note !== null && typeof (note as any).time === 'number'
      ? (note as any).time
      : laneOrTime;
    this.consecutiveMisses++;
    this.totalMisses++;
    if (this.consecutiveMisses === 1) {
      this.evaluateMuteTransition(true);
    }

    // Queue visual feedback for render loop without blocking
    if (this.pendingMissVisuals.length < 20) {
      this.pendingMissVisuals.push({ lane, time: (typeof note === "object" && note !== null && typeof (note as any).time === "number") ? (note as any).time : time });
    }
  }

  /**
   * Resets consecutive miss counter when a note is successfully hit.
   */
  public registerHit(result: HitResult, hitTime?: number): void {
    this.consecutiveMisses = 0;
    if (this.isMutedState) {
      this.evaluateMuteTransition(false);
    }
  }

  /**
   * Determines if muting should actually transition (debounced and guarded).
   * Returns true ONLY if the mute state actually changed.
   */
  public evaluateMuteTransition(shouldMute: boolean): boolean {
    if (this.isMutedState === shouldMute) {
      return false; // No change, do NOT call postMessage!
    }
    this.isMutedState = shouldMute;
    if (this.muteCallback) {
      this.muteCallback(shouldMute);
    }
    return true; // Transition required
  }

  /**
   * Returns queued miss visuals for batch rendering.
   */
  public flushPendingMissVisuals(): { lane: number; time: number }[] {
    const visuals = this.pendingMissVisuals;
    this.pendingMissVisuals = [];
    return visuals;
  }

  /**
   * Health and diagnostics reporting.
   */
  public getHealthReport(): SyncHealthReport {
    return {
      clockTime: this.lastReportedClockTime,
      lastFrameDeltaMs: performance.now() - this.lastFrameTimestamp,
      consecutiveMissCount: this.consecutiveMisses,
      isClockStalled: this.clockStallCounter > 15,
      isBufferRecovering: this.masterClock.isBufferingState,
      totalMissesProcessed: this.totalMisses,
      clockDriftMs: 0,
      fps: this.currentFps
    };
  }
}
