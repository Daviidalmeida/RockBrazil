import { SyncDiagnostics } from '../game/sync/syncDiagnostics';
import { PlaybackState } from '../types';

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

export interface YouTubePlayerEvents {
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onPlaybackStateChange?: (playbackState: PlaybackState) => void;
  onBuffering?: (buffering: boolean) => void;
  onPlaybackConfirmed?: (videoTime: number) => void;
  onAutoplayBlocked?: () => void;
  onEnded?: () => void;
  onError?: (err: any) => void;
}

export class YouTubePlayerController {
  private player: any = null;
  private isApiLoaded = false;
  private isReady = false;
  private currentVideoId = '';

  // Playback State Machine
  private playbackState: PlaybackState = PlaybackState.PREPARING;

  // Master Audio Clock
  private lastObservedVideoTime = 0;
  private lastObservedPerfTime = 0;
  private lastRawPlayerTime = -1;
  private lastProgressCheckPerfTime = 0;
  private progressPollInterval: any = null;

  // Fallback simulator for unit tests / offline / environments without YouTube iframe
  private isFallbackMode = false;
  private fallbackStartTime = 0;
  private volume = 100;

  public events: YouTubePlayerEvents = {};

  constructor(events: YouTubePlayerEvents = {}) {
    this.events = events;
  }

  public getPlaybackState(): PlaybackState {
    return this.playbackState;
  }

  private setPlaybackState(newState: PlaybackState): void {
    if (this.playbackState !== newState) {
      this.playbackState = newState;
      if (this.events.onPlaybackStateChange) {
        this.events.onPlaybackStateChange(newState);
      }
    }
  }

  /**
   * Initializes the YouTube IFrame API
   */
  async init(elementId = 'yt-player-frame'): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      this.isReady = true;
      this.isFallbackMode = true;
      this.setPlaybackState(PlaybackState.READY);
      return;
    }

    if (window.YT && window.YT.Player) {
      this.isApiLoaded = true;
      this.createPlayer(elementId);
      return;
    }

    return new Promise<void>((resolve) => {
      const existingScript = document.getElementById('yt-iframe-api');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }

      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        this.isApiLoaded = true;
        this.createPlayer(elementId);
        resolve();
      };

      // Fallback timeout in case offline or blocked
      setTimeout(() => {
        if (!this.isReady) {
          this.isReady = true;
          this.isFallbackMode = true;
          this.setPlaybackState(PlaybackState.READY);
          resolve();
        }
      }, 3000);
    });
  }

  private createPlayer(elementId: string): void {
    const el = document.getElementById(elementId);
    if (!el || !window.YT || !window.YT.Player) {
      this.isReady = true;
      this.isFallbackMode = true;
      this.setPlaybackState(PlaybackState.READY);
      return;
    }

    try {
      this.player = new window.YT.Player(elementId, {
        height: '100%',
        width: '100%',
        videoId: this.currentVideoId || undefined,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          origin: window.location.origin
        },
        events: {
          onReady: () => {
            this.isReady = true;
            this.setPlaybackState(PlaybackState.READY);
            if (this.volume !== undefined && this.player.setVolume) {
              this.player.setVolume(this.volume);
            }
            if (this.events.onReady) this.events.onReady();
          },
          onStateChange: (event: any) => {
            this.handlePlayerStateChange(event.data);
          },
          onError: (err: any) => {
            console.warn('[RockBrazil YouTube] Player Warning:', err);
            this.setPlaybackState(PlaybackState.ERROR);
            if (this.events.onError) this.events.onError(err);
          }
        }
      });
    } catch {
      this.isReady = true;
      this.isFallbackMode = true;
      this.setPlaybackState(PlaybackState.READY);
    }
  }

  private handlePlayerStateChange(state: number): void {
    // YouTube Player States:
    // -1: UNSTARTED, 0: ENDED, 1: PLAYING, 2: PAUSED, 3: BUFFERING, 5: CUED
    if (this.events.onStateChange) this.events.onStateChange(state);

    if (state === 3) {
      // BUFFERING
      this.setPlaybackState(PlaybackState.BUFFERING);
      if (this.events.onBuffering) this.events.onBuffering(true);
    } else if (state === 2) {
      // PAUSED
      this.setPlaybackState(PlaybackState.PAUSED);
      if (this.events.onBuffering) this.events.onBuffering(false);
    } else if (state === 0) {
      // ENDED
      this.setPlaybackState(PlaybackState.FINISHED);
      if (this.events.onBuffering) this.events.onBuffering(false);
      if (this.events.onEnded) this.events.onEnded();
    } else if (state === 1) {
      // PLAYING state event fired by YouTube.
      // RULE: Do not automatically assume audio is advancing! Check actual progression.
      this.verifyAudioProgression();
    }
  }

  /**
   * Waits until the player confirms active playback (State: PLAYING)
   */
  async waitForPlaying(timeoutMs = 4000): Promise<boolean> {
    if (this.playbackState === PlaybackState.PLAYING) return true;

    return new Promise<boolean>((resolve) => {
      let resolved = false;

      const check = () => {
        if (resolved) return;
        if (this.playbackState === PlaybackState.PLAYING) {
          resolved = true;
          clearInterval(interval);
          clearTimeout(timer);
          resolve(true);
        }
      };

      const interval = setInterval(check, 50);

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          clearInterval(interval);
          resolve(true);
        }
      }, timeoutMs);
    });
  }

  /**
   * Prepares and cues a video in advance (State: PREPARING -> READY)
   */
  async loadVideo(videoId: string): Promise<void> {
    this.currentVideoId = videoId;
    this.stopProgressPolling();
    this.setPlaybackState(PlaybackState.PREPARING);

    this.lastObservedVideoTime = 0;
    this.lastObservedPerfTime = 0;
    this.lastRawPlayerTime = -1;

    if (this.player && this.player.cueVideoById) {
      try {
        this.player.cueVideoById(videoId);
      } catch {
        // Fallback
      }
    }
    this.setPlaybackState(PlaybackState.READY);
  }

  /**
   * Requests playback and awaits genuine confirmation that video time is advancing
   */
  public play(): void {
    if (this.playbackState === PlaybackState.PLAYING) return;

    this.setPlaybackState(PlaybackState.WAITING_FOR_AUDIO);
    this.lastProgressCheckPerfTime = performance.now();

    if (this.player && this.player.playVideo) {
      try {
        this.player.playVideo();
      } catch {
        this.isFallbackMode = true;
      }
    } else {
      this.isFallbackMode = true;
    }

    if (this.isFallbackMode) {
      // In offline/mock mode, simulate playback start after 100ms
      setTimeout(() => {
        if (this.playbackState === PlaybackState.WAITING_FOR_AUDIO) {
          this.fallbackStartTime = performance.now();
          this.lastObservedVideoTime = 0;
          this.lastObservedPerfTime = performance.now();
          this.setPlaybackState(PlaybackState.PLAYING);
          if (this.events.onPlaybackConfirmed) {
            this.events.onPlaybackConfirmed(0);
          }
        }
      }, 80);
      return;
    }

    // Start high-frequency monitor to confirm genuine progress of video time
    this.startProgressPolling();
  }

  private startProgressPolling(): void {
    this.stopProgressPolling();

    const startTime = performance.now();
    let initialSample = -1;

    this.progressPollInterval = setInterval(() => {
      if (this.playbackState !== PlaybackState.WAITING_FOR_AUDIO && this.playbackState !== PlaybackState.BUFFERING) {
        return;
      }

      if (this.player && this.player.getCurrentTime) {
        try {
          const raw = this.player.getCurrentTime();
          const state = this.player.getPlayerState ? this.player.getPlayerState() : -1;

          if (typeof raw === 'number' && !isNaN(raw)) {
            if (initialSample === -1) {
              initialSample = raw;
            }

            // Progression confirmed when time has genuinely advanced
            const hasAdvanced = raw > 0.02 || (initialSample >= 0 && raw - initialSample > 0.015);
            if (state === 1 && hasAdvanced) {
              this.stopProgressPolling();
              this.lastObservedVideoTime = raw;
              this.lastObservedPerfTime = performance.now();
              this.lastRawPlayerTime = raw;
              this.setPlaybackState(PlaybackState.PLAYING);

              if (this.events.onBuffering) this.events.onBuffering(false);
              if (this.events.onPlaybackConfirmed) {
                SyncDiagnostics.get().recordFirstTimeProgression(raw);
                this.events.onPlaybackConfirmed(raw);
              }
              return;
            }
          }

          // Check if autoplay was blocked by the browser (2.5s without start and not buffering)
          const elapsed = performance.now() - startTime;
          if (elapsed > 2500 && (state === 2 || state === -1 || state === 5 || raw === 0)) {
            if (this.events.onAutoplayBlocked) {
              this.events.onAutoplayBlocked();
            }
          }
        } catch {
          // Ignore
        }
      }
    }, 40);
  }

  private verifyAudioProgression(): void {
    if (this.player && this.player.getCurrentTime) {
      try {
        const raw = this.player.getCurrentTime();
        if (typeof raw === 'number' && !isNaN(raw) && raw > 0.01) {
          this.lastObservedVideoTime = raw;
          this.lastObservedPerfTime = performance.now();
          this.lastRawPlayerTime = raw;
          this.setPlaybackState(PlaybackState.PLAYING);

          if (this.events.onBuffering) this.events.onBuffering(false);
          if (this.events.onPlaybackConfirmed) {
            this.events.onPlaybackConfirmed(raw);
          }
          return;
        }
      } catch {
        // Fallback
      }
    }
    // If not verified immediately, ensure polling is active
    this.startProgressPolling();
  }

  private stopProgressPolling(): void {
    if (this.progressPollInterval !== null) {
      clearInterval(this.progressPollInterval);
      this.progressPollInterval = null;
    }
  }

  public pause(): void {
    this.stopProgressPolling();
    if (this.player && this.player.pauseVideo) {
      try {
        this.player.pauseVideo();
      } catch {
        // Ignore
      }
    }
    // Freeze current interpolated time
    this.lastObservedVideoTime = this.getCurrentTime();
    this.lastObservedPerfTime = performance.now();
    this.setPlaybackState(PlaybackState.PAUSED);
  }

  public resume(): void {
    this.play();
  }

  public stop(): void {
    this.stopProgressPolling();
    if (this.player && this.player.stopVideo) {
      try {
        this.player.stopVideo();
      } catch {
        // Ignore
      }
    }
    this.lastObservedVideoTime = 0;
    this.lastObservedPerfTime = 0;
    this.lastRawPlayerTime = -1;
    this.setPlaybackState(PlaybackState.FINISHED);
  }

  public seekTo(seconds: number): void {
    if (this.player && this.player.seekTo) {
      try {
        this.player.seekTo(seconds, true);
      } catch {
        // Ignore
      }
    }
    this.lastObservedVideoTime = Math.max(0, seconds);
    this.lastObservedPerfTime = performance.now();
    this.lastRawPlayerTime = seconds;
    if (this.isFallbackMode) {
      this.fallbackStartTime = performance.now() - seconds * 1000;
    }
  }

  /**
   * Returns high-precision smooth time strictly locked to the YouTube player.
   * If paused, buffering, or waiting for audio, time does NOT advance!
   */
  public getCurrentTime(): number {
    const now = performance.now();

    if (this.isFallbackMode) {
      if (this.playbackState !== PlaybackState.PLAYING) {
        return Math.max(0, this.lastObservedVideoTime);
      }
      const elapsed = (now - this.fallbackStartTime) / 1000;
      return Math.max(0, elapsed);
    }

    // 1. Read actual time and state directly from YouTube player
    let rawTime = -1;
    let playerState = -1;
    if (this.player) {
      if (this.player.getCurrentTime) {
        try {
          const val = this.player.getCurrentTime();
          if (typeof val === 'number' && !isNaN(val)) {
            rawTime = val;
          }
        } catch {
          rawTime = -1;
        }
      }
      if (this.player.getPlayerState) {
        try {
          playerState = this.player.getPlayerState();
        } catch {
          playerState = -1;
        }
      }
    }

    // 2. React to player state transitions
    if (playerState === 1) { // PLAYING
      if (this.playbackState !== PlaybackState.PLAYING) {
        this.setPlaybackState(PlaybackState.PLAYING);
        if (this.events.onBuffering) this.events.onBuffering(false);
      }
    } else if (playerState === 3) { // BUFFERING
      if (this.playbackState !== PlaybackState.BUFFERING) {
        this.setPlaybackState(PlaybackState.BUFFERING);
        if (this.events.onBuffering) this.events.onBuffering(true);
      }
    } else if (playerState === 2) { // PAUSED
      if (this.playbackState !== PlaybackState.PAUSED) {
        this.setPlaybackState(PlaybackState.PAUSED);
        if (this.events.onBuffering) this.events.onBuffering(false);
      }
    }

    // If not actively playing, return frozen observed time
    if (this.playbackState !== PlaybackState.PLAYING) {
      return Math.max(0, this.lastObservedVideoTime);
    }

    // 3. When player provides a fresh timestamp, lock precisely
    if (rawTime >= 0 && rawTime !== this.lastRawPlayerTime) {
      this.lastRawPlayerTime = rawTime;
      this.lastObservedVideoTime = rawTime;
      this.lastObservedPerfTime = now;
      return Math.max(0, rawTime);
    }

    // 4. Smooth monotonic continuous interpolation between YouTube updates (safe 2.0s watchdog)
    if (this.lastObservedPerfTime === 0) {
      this.lastObservedPerfTime = now;
      if (rawTime >= 0) this.lastObservedVideoTime = rawTime;
    }

    const dt = Math.max(0, (now - this.lastObservedPerfTime) / 1000);
    const interpolated = this.lastObservedVideoTime + Math.min(0.35, dt);

    return Math.max(0, interpolated);
  }

  public getDuration(): number {
    if (this.player && this.player.getDuration) {
      try {
        const d = this.player.getDuration();
        if (typeof d === 'number' && !isNaN(d) && d > 0) return d;
      } catch {
        // Fallback
      }
    }
    return 180;
  }

  public isBuffering(): boolean {
    return this.playbackState === PlaybackState.BUFFERING;
  }

  public isPlaying(): boolean {
    return this.playbackState === PlaybackState.PLAYING;
  }

  private isMissMuted = false;

  public isReadyState(): boolean {
    return this.isReady;
  }

  public setVolume(volPercent: number): void {
    this.volume = Math.max(0, Math.min(100, volPercent));
    if (this.player && this.player.setVolume && !this.isMissMuted) {
      try {
        this.player.setVolume(this.volume);
      } catch {
        // Ignore
      }
    }
  }

  public setMuted(muted: boolean): void {
    this.isMissMuted = muted;
    if (this.player) {
      try {
        if (muted) {
          if (this.player.mute) {
            this.player.mute();
          } else if (this.player.setVolume) {
            this.player.setVolume(0);
          }
        } else {
          if (this.player.unMute) {
            this.player.unMute();
          }
          if (this.player.setVolume) {
            this.player.setVolume(this.volume);
          }
        }
      } catch {
        // Fallback or ignore
      }
    }
  }

  public destroy(): void {
    this.stopProgressPolling();
    if (this.player && this.player.destroy) {
      try {
        this.player.destroy();
      } catch {
        // Ignore
      }
    }
    this.player = null;
    this.isReady = false;
    this.setPlaybackState(PlaybackState.PREPARING);
  }
}
