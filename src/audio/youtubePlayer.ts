declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

export interface YouTubePlayerEvents {
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onBuffering?: (buffering: boolean) => void;
  onEnded?: () => void;
  onError?: (err: any) => void;
}

export class YouTubePlayerController {
  private player: any = null;
  private isApiLoaded = false;
  private isReady = false;
  private currentVideoId = '';
  private buffering = false;
  private fallbackCurrentTime = 0;
  private fallbackStartTime = 0;
  private isFallbackPlaying = false;
  private volume = 100;

  public events: YouTubePlayerEvents = {};

  constructor(events: YouTubePlayerEvents = {}) {
    this.events = events;
  }

  /**
   * Initializes the YouTube IFrame API
   */
  async init(elementId = 'yt-player-frame'): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      this.isReady = true;
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
          resolve();
        }
      }, 3500);
    });
  }

  private createPlayer(elementId: string): void {
    const el = document.getElementById(elementId);
    if (!el || !window.YT || !window.YT.Player) {
      this.isReady = true;
      return;
    }

    try {
      this.player = new window.YT.Player(elementId, {
        height: '100%',
        width: '100%',
        videoId: this.currentVideoId || 'aXJ_Ub1xbhw',
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
            if (this.volume !== undefined && this.player.setVolume) {
              this.player.setVolume(this.volume);
            }
            if (this.events.onReady) this.events.onReady();
          },
          onStateChange: (event: any) => {
            const state = event.data;
            if (state === 3) {
              // BUFFERING
              this.buffering = true;
              if (this.events.onBuffering) this.events.onBuffering(true);
            } else {
              if (this.buffering) {
                this.buffering = false;
                if (this.events.onBuffering) this.events.onBuffering(false);
              }
            }

            if (state === 0) {
              // ENDED
              if (this.events.onEnded) this.events.onEnded();
            }

            if (this.events.onStateChange) this.events.onStateChange(state);
          },
          onError: (err: any) => {
            console.warn('YouTube Player Warning:', err);
            if (this.events.onError) this.events.onError(err);
          }
        }
      });
    } catch (e) {
      this.isReady = true;
    }
  }

  async loadVideo(videoId: string): Promise<void> {
    this.currentVideoId = videoId;
    this.fallbackCurrentTime = 0;
    this.isFallbackPlaying = false;
    this.buffering = false;

    if (this.player && this.player.cueVideoById) {
      try {
        this.player.cueVideoById(videoId);
      } catch {
        // Ignore
      }
    }
  }

  play(): void {
    if (this.player && this.player.playVideo) {
      try {
        this.player.playVideo();
      } catch {
        // Fallback simulation
      }
    }
    this.fallbackStartTime = performance.now();
    this.isFallbackPlaying = true;
  }

  pause(): void {
    if (this.player && this.player.pauseVideo) {
      try {
        this.player.pauseVideo();
      } catch {
        // Ignore
      }
    }
    if (this.isFallbackPlaying) {
      this.fallbackCurrentTime += (performance.now() - this.fallbackStartTime) / 1000;
      this.isFallbackPlaying = false;
    }
  }

  resume(): void {
    this.play();
  }

  stop(): void {
    if (this.player && this.player.stopVideo) {
      try {
        this.player.stopVideo();
      } catch {
        // Ignore
      }
    }
    this.isFallbackPlaying = false;
    this.fallbackCurrentTime = 0;
    this.buffering = false;
  }

  seekTo(seconds: number): void {
    if (this.player && this.player.seekTo) {
      try {
        this.player.seekTo(seconds, true);
      } catch {
        // Ignore
      }
    }
    this.fallbackCurrentTime = seconds;
    this.fallbackStartTime = performance.now();
  }

  getCurrentTime(): number {
    if (this.player && this.player.getCurrentTime) {
      try {
        const t = this.player.getCurrentTime();
        if (typeof t === 'number' && !isNaN(t) && t > 0) {
          return t;
        }
      } catch {
        // Fallback
      }
    }

    if (this.isFallbackPlaying) {
      return this.fallbackCurrentTime + (performance.now() - this.fallbackStartTime) / 1000;
    }
    return this.fallbackCurrentTime;
  }

  getDuration(): number {
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

  isBuffering(): boolean {
    return this.buffering;
  }

  setVolume(volPercent: number): void {
    this.volume = Math.max(0, Math.min(100, volPercent));
    if (this.player && this.player.setVolume) {
      try {
        this.player.setVolume(this.volume);
      } catch {
        // Ignore
      }
    }
  }

  destroy(): void {
    if (this.player && this.player.destroy) {
      try {
        this.player.destroy();
      } catch {
        // Ignore
      }
    }
    this.player = null;
    this.isReady = false;
  }
}
