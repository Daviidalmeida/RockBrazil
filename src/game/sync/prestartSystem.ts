export interface PreStartEvents {
  onCountdownTick: (count: number) => void;
  onCountdownRock: () => void;
  onSynchronizingWait: () => void;
  onGameStart: () => void;
  onAutoplayBlocked?: () => void;
  onPlaybackFailed?: (reason: string) => void;
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
  private timer: any = null;
  private currentCount = 3;
  private isWaitingForAudio = false;
  private currentSessionId = 0;
  private checkInterval: any = null;
  private hasStartedCountdown = false;
  private hasEnteredPlaying = false;

  /**
   * Initializes and starts the pre-start sequence for a match session.
   * Enforces exactly one countdown sequence per session.
   */
  public async prepareAndStart(
    sessionId: number,
    resources: PreStartResourceProvider,
    events: PreStartEvents
  ): Promise<void> {
    this.cancel();
    this.currentSessionId = sessionId;
    this.hasStartedCountdown = false;
    this.hasEnteredPlaying = false;

    // 1. Prepare controllable resources (Chart + Renderer)
    const chartReady = await resources.prepareChart();
    if (!chartReady || this.currentSessionId !== sessionId) {
      return;
    }

    resources.prepareRenderer();

    // 2. Prepare audio player (cued / prerolled)
    try {
      const audioReady = await resources.prepareAudio();
      if (!audioReady || this.currentSessionId !== sessionId) return;
    } catch {
      if (this.currentSessionId === sessionId) {
        this.cancel();
        events.onPlaybackFailed?.('AUDIO_PREPARATION_FAILED');
      }
      return;
    }

    // 3. Begin synchronized 3-second countdown (3... 2... 1... ROCK!)
    if (this.hasStartedCountdown) return;
    this.hasStartedCountdown = true;

    this.currentCount = 3;
    events.onCountdownTick(this.currentCount);

    const intervalFn = typeof window !== 'undefined' ? window.setInterval : setInterval;
    this.timer = intervalFn(async () => {
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
          if (!this.hasEnteredPlaying) {
            this.hasEnteredPlaying = true;
            events.onGameStart();
          }
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
    const maxAttempts = 120; // 12 seconds max wait (at 100ms intervals)

    const intervalFn = typeof window !== 'undefined' ? window.setInterval : setInterval;
    this.checkInterval = intervalFn(() => {
      if (this.currentSessionId !== sessionId) {
        this.cancel();
        return;
      }

      attempts++;

      if (resources.isAudioPlaying()) {
        this.cancel();
        if (!this.hasEnteredPlaying) {
          this.hasEnteredPlaying = true;
          events.onGameStart();
        }
      } else if (attempts >= maxAttempts) {
        // Safe timeout: NEVER start match if audio is unconfirmed!
        // Do NOT advance notes and do NOT penalize player.
        this.cancel();
        this.isWaitingForAudio = false;

        if (events.onAutoplayBlocked) {
          events.onAutoplayBlocked();
        } else if (events.onPlaybackFailed) {
          events.onPlaybackFailed('AUDIO_START_TIMEOUT');
        } else {
          events.onSynchronizingWait();
        }
      }
    }, 100);
  }

  /**
   * Allows retrying audio start if unblocking is requested by the player.
   */
  public retryAudio(
    sessionId: number,
    resources: PreStartResourceProvider,
    events: PreStartEvents
  ): void {
    if (this.currentSessionId !== sessionId) return;
    this.cancel();
    this.currentSessionId = sessionId;
    this.isWaitingForAudio = true;
    resources.startAudioPlayback();
    this.waitForAudioAdvance(sessionId, resources, events);
  }

  /**
   * Immediately notifies that audio playback is confirmed advancing
   */
  public notifyPlaybackConfirmed(sessionId: number, events: PreStartEvents): void {
    if (this.currentSessionId !== sessionId || this.hasEnteredPlaying) return;
    this.hasEnteredPlaying = true;
    this.cancel();
    events.onGameStart();
  }

  /**
   * Cancels any active countdown or polling
   */
  public cancel(): void {
    this.currentSessionId = -1;
    this.hasStartedCountdown = false;
    this.hasEnteredPlaying = false;
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
}
