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
  onPlaybackStateChange?: (state: PlaybackState) => void;
  onBuffering?: (buffering: boolean) => void;
  onPlaybackConfirmed?: (videoTime: number) => void;
  onAutoplayBlocked?: () => void;
  onEnded?: () => void;
  onError?: (err: any) => void;
}

export function youtubeErrorMessage(code: number | string): string {
  if (typeof code === 'string' && /^\d+$/.test(code)) code = Number(code);
  switch (code) {
    case 2: return 'O identificador deste vídeo é inválido.';
    case 5: return 'O navegador não conseguiu reproduzir este vídeo em HTML5.';
    case 100: return 'Este vídeo foi removido ou está privado.';
    case 101: case 150: return 'O proprietário não permite incorporar este vídeo no jogo.';
    case 153: return 'O YouTube recusou a identificação da origem. Abra o jogo pelo endereço HTTPS oficial.';
    case 'CHART_VIDEO_MISMATCH': return 'A duração deste vídeo não cobre o chart, ou ainda não foi informada pelo YouTube. A versão da gravação precisa ser conferida antes de jogar.';
    case 'API_TIMEOUT': return 'A API do YouTube não respondeu. Verifique a conexão ou os bloqueadores e tente novamente.';
    default: return 'Não foi possível iniciar o YouTube. Verifique a conexão e tente novamente.';
  }
}

// One API load shared by all controllers; failures can be retried. No offline playback simulation.
let apiPromise: Promise<void> | null = null;
function loadAPI(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const timer = setTimeout(() => finish(new Error('API_TIMEOUT')), 15000);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      if (error) {
        apiPromise = null;
        document.getElementById('yt-iframe-api')?.remove();
        reject(error);
      } else resolve();
    };
    window.onYouTubeIframeAPIReady = () => {
      try { previous?.(); } finally { finish(); }
    };
    let tag = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!tag) {
      tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    tag.id = 'yt-iframe-api';
    tag.onerror = () => finish(new Error('API_TIMEOUT'));
    // Handles the API arriving between the first check and callback registration.
    if (window.YT?.Player) finish();
  });
  return apiPromise;
}

export class YouTubePlayerController {
  private player: any = null;
  private isReady = false;
  private currentVideoId = '';
  private playbackState = PlaybackState.PREPARING;
  private initPromise: Promise<void> | null = null;
  private progressPollInterval: ReturnType<typeof setInterval> | null = null;
  private lastObservedVideoTime = 0;
  private lastObservedPerfTime = 0;
  private lastRawPlayerTime = -1;
  private initialSample = -1;
  private waitingSince = 0;
  private blockedNotified = false;
  private volume = 100;
  private isMissMuted = false;
  private generation = 0;
  public events: YouTubePlayerEvents;

  constructor(events: YouTubePlayerEvents = {}) { this.events = events; }
  public getPlaybackState(): PlaybackState { return this.playbackState; }
  private setPlaybackState(state: PlaybackState): void {
    if (state === this.playbackState) return;
    this.playbackState = state;
    this.events.onPlaybackStateChange?.(state);
  }
  private fail(code: number | string): void {
    this.stopProgressPolling();
    this.setPlaybackState(PlaybackState.ERROR);
    this.events.onBuffering?.(true);
    this.events.onError?.(code);
  }

  public async init(elementId = 'yt-player-frame'): Promise<void> {
    if (this.isReady) return;
    if (this.initPromise) return this.initPromise;
    const generation = this.generation;
    this.initPromise = (async () => {
      if (typeof window === 'undefined' || typeof document === 'undefined') throw new Error('API_UNAVAILABLE');
      await loadAPI();
      if (generation !== this.generation) throw new Error('PLAYER_DESTROYED');
      if (!document.getElementById(elementId)) throw new Error('PLAYER_CONTAINER_MISSING');
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('API_TIMEOUT')), 15000);
        this.player = new window.YT.Player(elementId, {
          height: '100%', width: '100%',
          playerVars: {
            autoplay: 0, controls: 1, disablekb: 1, fs: 0, rel: 0, playsinline: 1, enablejsapi: 1,
            origin: window.location.origin
          },
          events: {
            onReady: () => {
              clearTimeout(timer);
              if (generation !== this.generation) return reject(new Error('PLAYER_DESTROYED'));
              const frame = this.player.getIframe?.();
              frame?.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
              frame?.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
              frame?.setAttribute('title', 'Reprodutor YouTube da música');
              this.isReady = true;
              this.player.setVolume?.(this.volume);
              this.setMuted(this.isMissMuted);
              this.setPlaybackState(PlaybackState.READY);
              this.events.onReady?.();
              resolve();
            },
            onStateChange: (event: any) => { if (generation === this.generation) this.handlePlayerStateChange(event.data); },
            onAutoplayBlocked: () => { if (generation === this.generation) this.notifyBlocked(); },
            onError: (event: any) => {
              if (generation !== this.generation) return;
              clearTimeout(timer);
              if (this.isReady) this.fail(event.data);
              reject(new Error(String(event.data)));
            }
          }
        });
      });
    })();
    try { await this.initPromise; }
    catch (error) {
      if (generation === this.generation) this.generation++;
      this.initPromise = null;
      if (this.playbackState !== PlaybackState.ERROR) this.fail(error instanceof Error ? error.message : 'API_TIMEOUT');
      this.player?.destroy?.();
      this.player = null;
      this.isReady = false;
      if (typeof document !== 'undefined' && !document.getElementById(elementId)) {
        const el = document.createElement('div'); el.id = elementId;
        document.getElementById('yt-player-container')?.prepend(el);
      }
      throw error;
    }
  }

  public async loadVideo(videoId: string): Promise<void> {
    this.stopProgressPolling();
    this.currentVideoId = videoId;
    this.setPlaybackState(PlaybackState.PREPARING);
    this.lastObservedVideoTime = 0; this.lastObservedPerfTime = 0; this.lastRawPlayerTime = -1;
    await this.init();
    this.player.cueVideoById({ videoId, startSeconds: 0 });
    this.setMuted(false);
    this.setPlaybackState(PlaybackState.READY);
  }

  // Never play/pause speculatively: a delayed countdown cannot retain browser user activation.
  public prime(): void { /* Actual playback is requested by play(), or by tapping the iframe. */ }
  public play(): void {
    if (this.playbackState === PlaybackState.PLAYING) return;
    if (!this.player?.playVideo) { this.fail('PLAYER_NOT_READY'); return; }
    this.initialSample = this.readRawTime();
    this.waitingSince = performance.now(); this.blockedNotified = false;
    this.setPlaybackState(PlaybackState.WAITING_FOR_AUDIO);
    this.events.onBuffering?.(true);
    try { this.player.playVideo(); this.startProgressPolling(); }
    catch { this.fail('PLAYBACK_FAILED'); }
  }
  private readRawTime(): number {
    try {
      const raw = this.player?.getCurrentTime?.();
      return typeof raw === 'number' && Number.isFinite(raw) ? raw : -1;
    } catch { return -1; }
  }
  private readState(): number {
    try { return this.player?.getPlayerState?.() ?? -1; } catch { return -1; }
  }
  private notifyBlocked(): void {
    if (this.blockedNotified) return;
    this.blockedNotified = true;
    this.events.onAutoplayBlocked?.();
  }
  private handlePlayerStateChange(state: number): void {
    this.events.onStateChange?.(state);
    if (this.playbackState === PlaybackState.ERROR || this.playbackState === PlaybackState.FINISHED) return;
    if (state === 0) {
      this.stopProgressPolling(); this.setPlaybackState(PlaybackState.FINISHED);
      this.events.onBuffering?.(false); this.events.onEnded?.();
    } else if (state === 2 || state === 3) {
      const raw = this.readRawTime();
      if (raw >= 0) this.lastObservedVideoTime = raw;
      this.lastObservedPerfTime = performance.now();
      this.initialSample = raw;
      this.setPlaybackState(state === 3 ? PlaybackState.BUFFERING : PlaybackState.PAUSED);
      this.events.onBuffering?.(true);
      if (state === 3) this.startProgressPolling();
    } else if (state === 1) {
      if (this.playbackState !== PlaybackState.PLAYING) {
        this.setPlaybackState(PlaybackState.WAITING_FOR_AUDIO);
        // Two samples must advance, including when resuming at a nonzero timestamp.
        this.verifyAudioProgression();
        this.startProgressPolling();
      }
    }
  }
  private verifyAudioProgression(): void {
    const raw = this.readRawTime();
    if (raw < 0 || this.readState() !== 1) return;
    if (this.initialSample < 0 || raw < this.initialSample) { this.initialSample = raw; return; }
    if (raw - this.initialSample <= 0.015) return;
    const wasConfirmed = this.playbackState === PlaybackState.PLAYING;
    this.lastObservedVideoTime = raw; this.lastRawPlayerTime = raw;
    this.lastObservedPerfTime = performance.now();
    this.initialSample = raw;
    this.setPlaybackState(PlaybackState.PLAYING);
    this.events.onBuffering?.(false);
    if (!wasConfirmed) {
      SyncDiagnostics.get().recordFirstTimeProgression(raw);
      this.events.onPlaybackConfirmed?.(raw);
    }
  }
  private startProgressPolling(): void {
    if (this.progressPollInterval !== null) return;
    this.progressPollInterval = setInterval(() => {
      const state = this.readState();
      if (state === 1) {
        this.verifyAudioProgression();
        // Stop judgments while stalled; never extrapolate indefinitely.
        if (this.playbackState === PlaybackState.PLAYING && performance.now() - this.lastObservedPerfTime > 500) {
          this.setPlaybackState(PlaybackState.BUFFERING); this.events.onBuffering?.(true);
        }
      } else if (state === 2 || state === 3) {
        if (this.playbackState === PlaybackState.PLAYING) this.handlePlayerStateChange(state);
      }
      if (this.playbackState !== PlaybackState.PLAYING && performance.now() - this.waitingSince > 2500) this.notifyBlocked();
    }, 40);
  }
  private stopProgressPolling(): void {
    if (this.progressPollInterval !== null) clearInterval(this.progressPollInterval);
    this.progressPollInterval = null;
  }
  public async waitForPlaying(timeoutMs = 4000): Promise<boolean> {
    if (this.isPlaying()) return true;
    if (this.playbackState === PlaybackState.ERROR) return false;
    return new Promise(resolve => {
      const interval = setInterval(() => {
        if (this.isPlaying() || this.playbackState === PlaybackState.ERROR) {
          clearInterval(interval); clearTimeout(timer); resolve(this.isPlaying());
        }
      }, 40);
      const timer = setTimeout(() => { clearInterval(interval); resolve(false); }, timeoutMs);
    });
  }
  public pause(): void {
    const raw = this.readRawTime();
    if (raw >= 0) this.lastObservedVideoTime = raw;
    this.stopProgressPolling(); this.player?.pauseVideo?.();
    this.setPlaybackState(PlaybackState.PAUSED); this.events.onBuffering?.(true);
  }
  public resume(): void { this.play(); }
  public stop(): void {
    this.stopProgressPolling();
    this.setPlaybackState(PlaybackState.FINISHED);
    this.player?.stopVideo?.();
    this.lastObservedVideoTime = 0; this.lastObservedPerfTime = 0;
    this.lastRawPlayerTime = -1; this.initialSample = -1;
  }
  public seekTo(seconds: number): void {
    const target = Math.max(0, seconds);
    this.player?.seekTo?.(target, true);
    this.lastObservedVideoTime = target; this.lastObservedPerfTime = performance.now();
    this.lastRawPlayerTime = target; this.initialSample = target;
    if (this.isPlaying()) { this.setPlaybackState(PlaybackState.BUFFERING); this.events.onBuffering?.(true); }
  }
  public getCurrentTime(): number {
    if (this.playbackState !== PlaybackState.PLAYING) return Math.max(0, this.lastObservedVideoTime);
    const state = this.readState();
    if (state !== 1) {
      if (state === 2 || state === 3) this.handlePlayerStateChange(state);
      return Math.max(0, this.lastObservedVideoTime);
    }
    const raw = this.readRawTime();
    if (raw >= 0 && raw !== this.lastRawPlayerTime) {
      this.lastRawPlayerTime = raw; this.lastObservedVideoTime = raw; this.lastObservedPerfTime = performance.now();
      return raw;
    }
    return Math.max(0, this.lastObservedVideoTime + Math.min(0.1, Math.max(0, (performance.now() - this.lastObservedPerfTime) / 1000)));
  }
  public getDuration(): number { return this.player?.getDuration?.() || 0; }
  public isBuffering(): boolean { return [PlaybackState.BUFFERING, PlaybackState.WAITING_FOR_AUDIO, PlaybackState.PAUSED, PlaybackState.ERROR].includes(this.playbackState); }
  public isPlaying(): boolean { return this.playbackState === PlaybackState.PLAYING; }
  public isReadyState(): boolean { return this.isReady; }
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(100, volume)); this.player?.setVolume?.(this.isMissMuted ? 0 : this.volume);
  }
  public setMuted(muted: boolean): void {
    this.isMissMuted = muted;
    if (muted) this.player?.mute?.(); else this.player?.unMute?.();
    this.player?.setVolume?.(muted ? 0 : this.volume);
  }
  public destroy(): void {
    this.generation++; this.stopProgressPolling(); this.player?.destroy?.();
    this.player = null; this.isReady = false; this.initPromise = null;
    this.setPlaybackState(PlaybackState.PREPARING);
  }
}
