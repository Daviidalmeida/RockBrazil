import { PlaybackState } from '../types';
import { AudioManager } from './audioManager';
import { YouTubePlayerController } from './youtubePlayer';

export type AudioSourceType = 'youtube' | 'audio-buffer' | 'procedural' | 'none';

export interface AudioPlaybackStatus {
  activeSource: AudioSourceType;
  playbackState: PlaybackState;
  volume: number;
  isAudible: boolean;
  isManualMuted: boolean;
  isBuffering: boolean;
  mediaTime: number;
  songId: string | null;
  error: string | null;
}

export interface AudioPlaybackListener {
  onStateChange?: (state: PlaybackState) => void;
  onBufferingChange?: (buffering: boolean) => void;
  onError?: (error: string) => void;
}

/**
 * ROCKBRAZIL V13.9.3 — AUDIO PLAYBACK CONTROLLER
 *
 * Robust, unified audio manager ensuring:
 * 1. Single active audio source per match (AudioBuffer vs YouTube vs Procedural).
 * 2. Stable, audible volume maintained throughout gameplay.
 * 3. Strict elimination of automatic muting on gameplay MISS or extra fret presses.
 * 4. Respect for manual user muting and volume controls.
 * 5. Accurate buffering detection with highway freeze & zero false misses.
 * 6. Clean lifecycle management preventing competing background players or AudioContext leaks.
 */
export class AudioPlaybackController {
  private audioManager: AudioManager;
  private ytPlayer: YouTubePlayerController;

  private activeSource: AudioSourceType = 'none';
  private currentState: PlaybackState = PlaybackState.READY;
  private currentSongId: string | null = null;

  private masterVolume: number = 0.85; // Default 85% audible
  private isManualMuted: boolean = false;
  private isCurrentlyBuffering: boolean = false;
  private lastErrorMessage: string | null = null;

  private listeners: AudioPlaybackListener[] = [];

  constructor(audioManager: AudioManager, ytPlayer: YouTubePlayerController) {
    this.audioManager = audioManager;
    this.ytPlayer = ytPlayer;
  }

  public addListener(listener: AudioPlaybackListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  public setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (!this.isManualMuted) {
      this.applyVolumeToActiveSource(this.masterVolume);
    }
  }

  public getVolume(): number {
    return this.masterVolume;
  }

  public setManualMute(muted: boolean): void {
    this.isManualMuted = muted;
    if (muted) {
      this.applyVolumeToActiveSource(0);
      this.ytPlayer.setMuted(true);
    } else {
      this.applyVolumeToActiveSource(this.masterVolume);
      this.ytPlayer.setMuted(false);
    }
  }

  public isMuted(): boolean {
    return this.isManualMuted;
  }

  /**
   * V13.9.3: Gameplay misses or extra presses MUST NEVER mute the audio!
   * Kept as a safe no-op to satisfy gameplay callers without silencing the track.
   */
  public handleGameplayMiss(): void {
    // Deliberate no-op: gameplay continues with audible sound.
  }

  public handleGameplayHit(): void {
    // Deliberate no-op: audio is already playing at audible level.
  }

  /**
   * Prepares and starts playback for YouTube official stream.
   * Guarantees local WebAudio and procedural synths are completely stopped.
   */
  public async playYouTube(videoId: string, songId: string): Promise<boolean> {
    this.stopLocalAudio();
    this.activeSource = 'youtube';
    this.currentSongId = songId;
    this.lastErrorMessage = null;

    try {
      await this.ytPlayer.loadVideo(videoId);
      const effectiveVol = this.isManualMuted ? 0 : this.masterVolume * 100;
      this.ytPlayer.setVolume(effectiveVol);
      this.ytPlayer.setMuted(this.isManualMuted);
      this.ytPlayer.play();
      this.setState(PlaybackState.PLAYING);
      return true;
    } catch (err: any) {
      this.lastErrorMessage = err?.message || 'Falha ao reproduzir vídeo do YouTube.';
      this.setState(PlaybackState.ERROR);
      this.notifyError(this.lastErrorMessage || 'Erro no YouTube');
      return false;
    }
  }

  /**
   * Prepares and starts playback for local AudioBuffer.
   * Guarantees YouTube player is stopped.
   */
  public async playAudioBuffer(buffer: AudioBuffer, songId: string, startOffsetSec = 0): Promise<boolean> {
    this.stopYouTube();
    this.activeSource = 'audio-buffer';
    this.currentSongId = songId;
    this.lastErrorMessage = null;

    try {
      await this.audioManager.ensureResumed();
      this.audioManager.resetMuteOnMiss();
      await this.audioManager.playAudioBuffer(buffer, startOffsetSec);
      this.applyVolumeToActiveSource(this.isManualMuted ? 0 : this.masterVolume);
      this.setState(PlaybackState.PLAYING);
      return true;
    } catch (err: any) {
      this.lastErrorMessage = err?.message || 'Falha ao reproduzir áudio local.';
      this.setState(PlaybackState.ERROR);
      this.notifyError(this.lastErrorMessage || 'Erro no áudio local');
      return false;
    }
  }

  /**
   * Prepares and starts procedural synthetic playback.
   * Guarantees YouTube player is stopped.
   */
  public async playProcedural(trackId: string, songId: string, startOffsetSec = 0): Promise<boolean> {
    this.stopYouTube();
    this.activeSource = 'procedural';
    this.currentSongId = songId;
    this.lastErrorMessage = null;

    try {
      await this.audioManager.ensureResumed();
      this.audioManager.resetMuteOnMiss();
      await this.audioManager.playProceduralTrack(trackId, startOffsetSec);
      this.applyVolumeToActiveSource(this.isManualMuted ? 0 : this.masterVolume);
      this.setState(PlaybackState.PLAYING);
      return true;
    } catch (err: any) {
      this.lastErrorMessage = err?.message || 'Falha ao reproduzir trilha procedural.';
      this.setState(PlaybackState.ERROR);
      this.notifyError(this.lastErrorMessage || 'Erro na trilha procedural');
      return false;
    }
  }

  public pause(): void {
    if (this.activeSource === 'youtube') {
      this.ytPlayer.pause();
    } else {
      this.audioManager.pause();
    }
    this.setState(PlaybackState.PAUSED);
  }

  public resume(): void {
    if (this.activeSource === 'youtube') {
      this.ytPlayer.resume();
    } else {
      this.audioManager.resume();
    }
    this.setState(PlaybackState.PLAYING);
  }

  public stop(): void {
    this.stopYouTube();
    this.stopLocalAudio();
    this.activeSource = 'none';
    this.isCurrentlyBuffering = false;
    this.setState(PlaybackState.READY);
  }

  public getCurrentMediaTime(): number {
    if (this.activeSource === 'youtube') {
      return this.ytPlayer.getCurrentTime();
    }
    return this.audioManager.getCurrentTime();
  }

  public isBuffering(): boolean {
    if (this.activeSource === 'youtube') {
      return this.ytPlayer.isBuffering();
    }
    return false;
  }

  public getStatus(): AudioPlaybackStatus {
    const isBuffering = this.isBuffering();
    if (isBuffering !== this.isCurrentlyBuffering) {
      this.isCurrentlyBuffering = isBuffering;
      this.notifyBuffering(isBuffering);
    }

    return {
      activeSource: this.activeSource,
      playbackState: this.currentState,
      volume: this.masterVolume,
      isAudible: !this.isManualMuted && this.masterVolume > 0 && this.currentState === PlaybackState.PLAYING,
      isManualMuted: this.isManualMuted,
      isBuffering,
      mediaTime: this.getCurrentMediaTime(),
      songId: this.currentSongId,
      error: this.lastErrorMessage
    };
  }

  private stopYouTube(): void {
    try {
      this.ytPlayer.stop();
    } catch {
      // Ignore
    }
  }

  private stopLocalAudio(): void {
    try {
      this.audioManager.stop();
    } catch {
      // Ignore
    }
  }

  private applyVolumeToActiveSource(vol: number): void {
    if (this.activeSource === 'youtube') {
      this.ytPlayer.setVolume(vol * 100);
    } else {
      this.audioManager.setMasterVolume(vol);
    }
  }

  private setState(state: PlaybackState): void {
    this.currentState = state;
    for (const l of this.listeners) {
      l.onStateChange?.(state);
    }
  }

  private notifyBuffering(buffering: boolean): void {
    for (const l of this.listeners) {
      l.onBufferingChange?.(buffering);
    }
  }

  private notifyError(err: string): void {
    for (const l of this.listeners) {
      l.onError?.(err);
    }
  }
}
