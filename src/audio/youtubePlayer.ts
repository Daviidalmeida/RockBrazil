import { SyncDiagnostics } from '../game/sync/syncDiagnostics';
import { PlaybackState } from '../types';

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

export interface YouTubeErrorDetails {
  code: number | string;
  title: string;
  message: string;
  canRetry: boolean;
  isEmbedBlocked: boolean;
}

export function parseYouTubeError(errCode: any): YouTubeErrorDetails {
  const code = typeof errCode === 'object' && errCode !== null ? (errCode.data ?? errCode.code ?? errCode) : errCode;
  const numCode = Number(code);

  switch (numCode) {
    case 2:
      return {
        code: 2,
        title: 'Parâmetro Inválido (Código 2)',
        message: 'O identificador do vídeo do YouTube contém caracteres inválidos ou formato incorreto.',
        canRetry: true,
        isEmbedBlocked: false
      };
    case 5:
      return {
        code: 5,
        title: 'Erro de Reprodução HTML5 (Código 5)',
        message: 'Não foi possível reproduzir este conteúdo no player HTML5 do navegador.',
        canRetry: true,
        isEmbedBlocked: false
      };
    case 100:
      return {
        code: 100,
        title: 'Vídeo Não Encontrado (Código 100)',
        message: 'O vídeo solicitado foi removido ou configurado como privado no YouTube.',
        canRetry: false,
        isEmbedBlocked: true
      };
    case 101:
    case 150:
      return {
        code: numCode,
        title: 'Incorporação Desativada (Código ' + numCode + ')',
        message: 'O proprietário deste vídeo desativou a reprodução incorporada em sites externos.',
        canRetry: false,
        isEmbedBlocked: true
      };
    case 153:
      return {
        code: 153,
        title: 'Restrição de Política de Origem (Código 153)',
        message: 'A política de segurança de origem ou cabeçalho Referrer restringiu o acesso ao player.',
        canRetry: true,
        isEmbedBlocked: false
      };
    default:
      return {
        code: code ?? 'UNKNOWN',
        title: 'Aviso do YouTube',
        message: 'Ocorreu uma instabilidade na reprodução do YouTube. Verifique sua conexão e tente novamente.',
        canRetry: true,
        isEmbedBlocked: false
      };
  }
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

export interface YouTubePlayerEvents {
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onPlaybackStateChange?: (state: PlaybackState) => void;
  onBuffering?: (buffering: boolean) => void;
  onPlaybackConfirmed?: (videoTime: number) => void;
  onAutoplayBlocked?: () => void;
  onEnded?: () => void;
  onError?: (err: any, details?: YouTubeErrorDetails) => void;
}

let apiPromise: Promise<void> | null = null;
function loadAPI(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('API_UNAVAILABLE'));
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const timer = setTimeout(() => finish(new Error('API_TIMEOUT')), 15000);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      if (error) {
        apiPromise = null;
        if (typeof document !== 'undefined') {
          document.getElementById('yt-iframe-api')?.remove();
        }
        reject(error);
      } else {
        resolve();
      }
    };
    window.onYouTubeIframeAPIReady = () => {
      try { previous?.(); } finally { finish(); }
    };
    if (typeof document !== 'undefined') {
      let tag = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
      if (!tag) {
        tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      tag.id = 'yt-iframe-api';
      tag.onerror = () => finish(new Error('API_TIMEOUT'));
    }
    if (window.YT?.Player) finish();
  });
  return apiPromise;
}

export class YouTubePlayerController {
  private player: any = null;
  private isReady = false;
  private currentVideoId = '';
  private pendingElementId = 'yt-player-frame';
  private playbackState = PlaybackState.UNINITIALIZED;
  private initPromise: Promise<void> | null = null;
  private progressPollInterval: any = null;
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

  constructor(events: YouTubePlayerEvents = {}) {
    this.events = events;
  }

  public getPlaybackState(): PlaybackState {
    return this.playbackState;
  }

  private setPlaybackState(state: PlaybackState): void {
    if (state === this.playbackState) return;
    this.playbackState = state;
    this.events.onPlaybackStateChange?.(state);
  }

  private fail(code: number | string): void {
    this.stopProgressPolling();
    this.setPlaybackState(PlaybackState.ERROR);
    this.events.onBuffering?.(true);
    if (this.events.onError) {
      if (this.events.onError.length >= 2) {
        const details = parseYouTubeError(code);
        this.events.onError(code, details);
      } else {
        this.events.onError(code);
      }
    }
  }

  private readState(): number {
    try {
      return typeof this.player?.getPlayerState === 'function' ? this.player.getPlayerState() : -1;
    } catch {
      return -1;
    }
  }

  private readRawTime(): number {
    try {
      const t = typeof this.player?.getCurrentTime === 'function' ? this.player.getCurrentTime() : -1;
      return typeof t === 'number' && !isNaN(t) ? t : -1;
    } catch {
      return -1;
    }
  }

  public ensureTargetElement(elementId: string): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    let existing = document.getElementById(elementId);
    if (!existing) {
      const container = document.getElementById('yt-player-container');
      if (container) {
        existing = document.createElement('div');
        existing.id = elementId;
        if (typeof (container as any).insertBefore === 'function') {
          (container as any).insertBefore(existing, (container as any).firstChild);
        } else if (typeof container.appendChild === 'function') {
          container.appendChild(existing);
        }
      }
    }
    return existing;
  }

  public async init(elementId = 'yt-player-frame', videoId?: string): Promise<void> {
    if (this.isReady && (!videoId || videoId === this.currentVideoId)) return;
    if (this.initPromise) return this.initPromise;

    const generation = this.generation;
    this.setPlaybackState(PlaybackState.LOADING);

    this.initPromise = (async () => {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        this.setPlaybackState(PlaybackState.ERROR);
        throw new Error('API_UNAVAILABLE');
      }

      await loadAPI();
      if (generation !== this.generation) throw new Error('PLAYER_DESTROYED');

      this.ensureTargetElement(elementId);
      if (!document.getElementById(elementId)) {
        this.setPlaybackState(PlaybackState.ERROR);
        throw new Error('PLAYER_CONTAINER_MISSING');
      }

      this.pendingElementId = elementId;
      if (videoId) this.currentVideoId = videoId;

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.fail('API_TIMEOUT');
          reject(new Error('API_TIMEOUT'));
        }, 15000);

        try {
          const originUrl = (typeof window !== 'undefined' && window.location) ? window.location.origin : undefined;
          const config: any = {
            height: '100%',
            width: '100%',
            playerVars: {
              autoplay: 0,
              controls: 1,
              disablekb: 1,
              fs: 0,
              rel: 0,
              playsinline: 1,
              enablejsapi: 1,
              modestbranding: 1
            },
            events: {
              onReady: (event: any) => {
                clearTimeout(timer);
                if (generation !== this.generation) return;
                this.isReady = true;
                this.setPlaybackState(PlaybackState.READY);
                try {
                  const iframe = this.player?.getIframe?.() || event?.target?.getIframe?.() || (typeof document !== 'undefined' ? document.querySelector(`#${elementId} iframe`) : null);
                  if (iframe?.setAttribute) {
                    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
                    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                  }
                  event?.target?.setVolume?.(this.volume);
                  event?.target?.unMute?.();
                } catch {
                  // Ignore
                }
                this.events.onReady?.();
                resolve();
              },
              onStateChange: (event: any) => {
                if (generation !== this.generation) return;
                this.handlePlayerStateChange(event.data);
              },
              onError: (event: any) => {
                clearTimeout(timer);
                const code = event?.data ?? event;
                this.fail(code);
                reject(new Error(youtubeErrorMessage(code)));
              }
            }
          };

          if (originUrl) {
            config.playerVars.origin = originUrl;
          }
          if (videoId) {
            config.videoId = videoId;
          }

          this.player = new window.YT.Player(elementId, config);
        } catch (err) {
          clearTimeout(timer);
          this.fail('PLAYER_CREATION_FAILED');
          reject(err);
        }
      });
    })();

    return this.initPromise;
  }

  public async loadVideo(videoId: string): Promise<void> {
    if (!videoId) return;
    this.currentVideoId = videoId;
    this.lastObservedVideoTime = 0;
    this.lastObservedPerfTime = 0;
    this.lastRawPlayerTime = -1;
    this.initialSample = -1;
    this.blockedNotified = false;

    if (!this.player || !this.isReady) {
      await this.init(this.pendingElementId, videoId);
      return;
    }

    try {
      if (typeof this.player.cueVideoById === 'function') {
        this.player.cueVideoById(videoId);
      } else if (typeof this.player.loadVideoById === 'function') {
        this.player.loadVideoById({ videoId, startSeconds: 0 });
      }
      this.setPlaybackState(PlaybackState.READY);
    } catch {
      await this.init(this.pendingElementId, videoId);
    }
  }

  public handlePlayerStateChange(state: number): void {
    this.events.onStateChange?.(state);
    switch (state) {
      case -1: // UNSTARTED
        break;
      case 0: // ENDED
        this.stopProgressPolling();
        this.setPlaybackState(PlaybackState.ENDED);
        this.events.onEnded?.();
        break;
      case 1: // PLAYING
        if (this.playbackState !== PlaybackState.PLAYING) {
          this.verifyAudioProgression();
          this.startProgressPolling();
        }
        break;
      case 2: // PAUSED
        this.stopProgressPolling();
        this.setPlaybackState(PlaybackState.PAUSED);
        this.events.onBuffering?.(false);
        break;
      case 3: // BUFFERING
        {
          const raw = this.readRawTime();
          if (raw >= 0) this.lastObservedVideoTime = raw;
          this.lastObservedPerfTime = performance.now();
          this.initialSample = raw;
          this.setPlaybackState(PlaybackState.BUFFERING);
          this.events.onBuffering?.(true);
          this.startProgressPolling();
        }
        break;
      case 5: // CUED
        this.setPlaybackState(PlaybackState.READY);
        break;
    }
  }

  private notifyBlocked(): void {
    if (this.blockedNotified) return;
    this.blockedNotified = true;
    this.setPlaybackState(PlaybackState.WAITING_USER_GESTURE);
    this.events.onAutoplayBlocked?.();
  }

  private verifyAudioProgression(): void {
    const raw = this.readRawTime();
    if (raw < 0 || this.readState() !== 1) return;
    if (this.initialSample < 0 || raw < this.initialSample) {
      this.initialSample = raw;
      return;
    }
    if (raw - this.initialSample <= 0.015) return;

    const wasConfirmed = this.playbackState === PlaybackState.PLAYING;
    this.lastObservedVideoTime = raw;
    this.lastRawPlayerTime = raw;
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
    this.waitingSince = performance.now();
    this.progressPollInterval = setInterval(() => {
      const state = this.readState();
      if (state === 1) {
        this.verifyAudioProgression();
        if (this.playbackState === PlaybackState.PLAYING && performance.now() - this.lastObservedPerfTime > 500) {
          this.setPlaybackState(PlaybackState.BUFFERING);
          this.events.onBuffering?.(true);
        }
      } else if (state === 2 || state === 3) {
        if (this.playbackState === PlaybackState.PLAYING) {
          this.handlePlayerStateChange(state);
        }
      }
      if (this.playbackState !== PlaybackState.PLAYING && performance.now() - this.waitingSince > 2500) {
        this.notifyBlocked();
      }
    }, 40);
  }

  private stopProgressPolling(): void {
    if (this.progressPollInterval !== null) {
      clearInterval(this.progressPollInterval);
      this.progressPollInterval = null;
    }
  }

  public prime(): void {
    // Preparação sob gesto do usuário para navegadores móveis
  }

  public play(): void {
    if (this.playbackState === PlaybackState.PLAYING) return;
    if (!this.player?.playVideo) {
      this.fail('PLAYER_NOT_READY');
      return;
    }
    this.initialSample = this.readRawTime();
    this.waitingSince = performance.now();
    this.blockedNotified = false;
    this.setPlaybackState(PlaybackState.WAITING_FOR_AUDIO);
    this.events.onBuffering?.(true);
    try {
      this.player.playVideo();
      this.startProgressPolling();
    } catch {
      this.fail('PLAYBACK_FAILED');
    }
  }

  public async waitForPlaying(timeoutMs = 4000): Promise<boolean> {
    if (this.isPlaying()) return true;
    if (this.playbackState === PlaybackState.ERROR) return false;

    return new Promise(resolve => {
      const interval = setInterval(() => {
        if (this.isPlaying() || this.playbackState === PlaybackState.ERROR) {
          clearInterval(interval);
          clearTimeout(timer);
          resolve(this.isPlaying());
        }
      }, 40);
      const timer = setTimeout(() => {
        clearInterval(interval);
        resolve(false);
      }, timeoutMs);
    });
  }

  public pause(): void {
    const raw = this.readRawTime();
    if (raw >= 0) this.lastObservedVideoTime = raw;
    this.stopProgressPolling();
    this.player?.pauseVideo?.();
    this.setPlaybackState(PlaybackState.PAUSED);
    this.events.onBuffering?.(true);
  }

  public resume(): void {
    this.play();
  }

  public stop(): void {
    this.stopProgressPolling();
    this.setPlaybackState(PlaybackState.ENDED);
    this.player?.stopVideo?.();
    this.lastObservedVideoTime = 0;
    this.lastObservedPerfTime = 0;
    this.lastRawPlayerTime = -1;
    this.initialSample = -1;
  }

  public seekTo(seconds: number): void {
    const target = Math.max(0, seconds);
    this.player?.seekTo?.(target, true);
    this.lastObservedVideoTime = target;
    this.lastObservedPerfTime = performance.now();
    this.lastRawPlayerTime = target;
    this.initialSample = target;
    if (this.isPlaying()) {
      this.setPlaybackState(PlaybackState.BUFFERING);
      this.events.onBuffering?.(true);
    }
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
      this.lastRawPlayerTime = raw;
      this.lastObservedVideoTime = raw;
      this.lastObservedPerfTime = performance.now();
      return raw;
    }
    return Math.max(0, this.lastObservedVideoTime + Math.min(0.1, Math.max(0, (performance.now() - this.lastObservedPerfTime) / 1000)));
  }

  public getDuration(): number {
    try {
      const d = this.player?.getDuration?.();
      return typeof d === 'number' && !isNaN(d) ? d : 0;
    } catch {
      return 0;
    }
  }

  public isBuffering(): boolean {
    return [PlaybackState.BUFFERING, PlaybackState.WAITING_FOR_AUDIO, PlaybackState.PAUSED, PlaybackState.ERROR].includes(this.playbackState);
  }

  public isPlaying(): boolean {
    return this.playbackState === PlaybackState.PLAYING;
  }

  public isReadyState(): boolean {
    return this.isReady;
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(100, volume));
    this.player?.setVolume?.(this.isMissMuted ? 0 : this.volume);
  }

  public setMuted(muted: boolean): void {
    this.isMissMuted = muted;
    if (muted) {
      this.player?.mute?.();
    } else {
      this.player?.unMute?.();
    }
    this.player?.setVolume?.(muted ? 0 : this.volume);
  }

  public destroy(): void {
    this.generation++;
    this.stopProgressPolling();
    this.player?.destroy?.();
    this.player = null;
    this.isReady = false;
    this.initPromise = null;
    this.setPlaybackState(PlaybackState.UNINITIALIZED);
  }
}
