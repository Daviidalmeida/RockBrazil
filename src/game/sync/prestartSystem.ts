import { PlaybackState } from '../../types';

export interface PreStartEvents {
  onCountdownTick: (count: number) => void;
  onCountdownRock: () => void;
  onSynchronizingWait: () => void;
  onGameStart: () => void;
  onAutoplayBlocked?: () => void;
}

export interface PreStartResourceProvider {
  prepareChart: () => Promise<boolean> | boolean;
  prepareRenderer: () => void;
  prepareAudio: () => Promise<boolean> | boolean;
  startAudioPlayback: () => void;
  isAudioPlaying: () => boolean;
  isAudioBuffering: () => boolean;
}

/**
 * RockBrazil Pre-Start System
 * Manages resource preparation and the 3-second countdown (3... 2... 1... ROCK!).
 * Ensures audio stream and visual notes enter the highway in exact synchrony.
 */
export class PreStartSystem {
  private timer: number | null = null;
  private currentCount = 3;
  private isWaitingForAudio = false;
  private currentSessionId = 0;
  private checkInterval: number | null = null;

  /**
   * Initializes and starts the pre-start sequence for a match session.
   */
  public async prepareAndStart(
    sessionId: number,
    resources: PreStartResourceProvider,
    events: PreStartEvents
  ): Promise<void> {
    this.cancel();
    this.currentSessionId = sessionId;

    // 1. Prepare controllable resources (Chart + Renderer)
    const chartReady = await resources.prepareChart();
    if (this.currentSessionId !== sessionId) return;

    resources.prepareRenderer();

    // 2. Prepare audio player (cued / prerolled)
    await resources.prepareAudio();
    if (this.currentSessionId !== sessionId) return;

    // 3. Begin synchronized 3-second countdown (3... 2... 1... ROCK!)
    this.currentCount = 3;
    events.onCountdownTick(this.currentCount);

    this.timer = window.setInterval(async () => {
      if (this.currentSessionId !== sessionId) {
        this.cancel();
        return;
      }

      this.currentCount--;

      if (this.currentCount > 0) {
        events.onCountdownTick(this.currentCount);
      } else if (this.currentCount === 0) {
        // "ROCK!" triggered
        events.onCountdownRock();

        // Trigger audio playback
        resources.startAudioPlayback();

        // Check if playback is immediately verified
        if (resources.isAudioPlaying()) {
          this.cancel();
          events.onGameStart();
        } else {
          // Video still buffering: hold in synchronized wait without penalizing player
          this.isWaitingForAudio = true;
          this.waitForAudioAdvance(sessionId, resources, events);
        }
      }
    }, 1000);
  }

  /**
   * Holds the game in a synchronized wait state if YouTube is buffering at "ROCK!"
   */
  private waitForAudioAdvance(
    sessionId: number,
    resources: PreStartResourceProvider,
    events: PreStartEvents
  ): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    events.onSynchronizingWait();

    let attempts = 0;
    const maxAttempts = 150; // 15 seconds max wait

    this.checkInterval = window.setInterval(() => {
      if (this.currentSessionId !== sessionId) {
        this.cancel();
        return;
      }

      attempts++;

      if (resources.isAudioPlaying()) {
        this.cancel();
        events.onGameStart();
      } else if (attempts >= maxAttempts) {
        // Fallback: start anyway to prevent freeze
        this.cancel();
        events.onGameStart();
      }
    }, 100);
  }

  /**
   * Immediately notifies that audio playback is confirmed advancing
   */
  public notifyPlaybackConfirmed(sessionId: number, events: PreStartEvents): void {
    if (this.currentSessionId !== sessionId) return;
    this.cancel();
    events.onGameStart();
  }

  /**
   * Cancels any active countdown or polling
   */
  public cancel(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isWaitingForAudio = false;
  }

  public getSessionId(): number {
    return this.currentSessionId;
  }
}
