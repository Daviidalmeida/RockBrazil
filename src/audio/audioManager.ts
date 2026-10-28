import { createCrowdSamples, CrowdIntensity } from './crowdReaction';
import { RockSynth, PROCEDURAL_TRACKS } from './rockSynth';
import { GameSettings, PlaybackState } from '../types';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private synth: RockSynth;
  private settings: GameSettings;

  // Audio File playback
  private activeBufferSource: AudioBufferSourceNode | null = null;
  private fileGainNode: GainNode | null = null;
  private muteGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private fileStartTime = 0;
  private filePauseOffset = 0;
  private isFilePlaying = false;
  private isFilePaused = false;
  private isMissMuted = false;
  private currentAudioBuffer: AudioBuffer | null = null;
  private isUsingProcedural = true;
  private onEndedCallback: (() => void) | null = null;
  private isUnlocked = false;
  private crowdSource: AudioBufferSourceNode | null = null;
  private crowdPlayed = false;

  constructor(settings: GameSettings) {
    this.settings = settings;
    this.synth = new RockSynth();
    this.setupLifecycleListeners();
  }

  private setupLifecycleListeners(): void {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.ctx && this.ctx.state === 'suspended' && this.isFilePlaying && !this.isFilePaused) {
        this.ctx.resume().catch((err) => console.warn('[AudioManager] visibilitychange resume failed:', err));
      }
    });
  }

  public static isAppleDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  }

  public static isOggSupported(): boolean {
    if (typeof Audio === 'undefined') return false;
    const a = new Audio();
    const canOgg = a.canPlayType('audio/ogg; codecs="vorbis"');
    const canOpus = a.canPlayType('audio/ogg; codecs="opus"');
    return Boolean(canOgg || canOpus);
  }

  /**
   * Synchronously and robustly unlocks iOS Safari / WebKit AudioContext.
   * Plays a 1-sample silent buffer to force the iOS hardware CoreAudio bus to engage.
   */
  async unlockAudioContext(): Promise<void> {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn('[AudioManager] unlock resume error:', err);
      }
    }

    if (!this.isUnlocked && this.ctx.state === 'running') {
      try {
        const silentBuffer = this.ctx.createBuffer(1, 1, 22050);
        const source = this.ctx.createBufferSource();
        source.buffer = silentBuffer;
        source.connect(this.ctx.destination);
        source.start(0);
        this.isUnlocked = true;
      } catch (err) {
        console.warn('[AudioManager] silent buffer unlock error:', err);
      }
    }
  }

  async init(): Promise<void> {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // Will be resumed on user gesture
      }
    }
    await this.synth.init(this.ctx);

    if (!this.sfxGainNode) {
      this.sfxGainNode = this.ctx.createGain();
      this.sfxGainNode.gain.setValueAtTime(this.settings.sfxVolume, this.ctx.currentTime);
      this.sfxGainNode.connect(this.ctx.destination);
    }
  }

  /**
   * Guarantees AudioContext exists and is in 'running' state
   */
  async ensureResumed(): Promise<void> {
    if (!this.ctx) {
      await this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn('AudioContext.resume() aguardando gesto do usuário:', err);
      }
    }
  }

  get audioContext(): AudioContext | null {
    return this.ctx;
  }

  get isProcedural(): boolean {
    return this.isUsingProcedural;
  }

  updateSettings(settings: GameSettings): void {
    this.settings = settings;
    this.synth.setVolume(settings.musicVolume);
    if (this.fileGainNode && this.ctx) {
      this.fileGainNode.gain.setValueAtTime(settings.musicVolume, this.ctx.currentTime);
    }
    if (this.sfxGainNode && this.ctx) {
      this.sfxGainNode.gain.setValueAtTime(settings.sfxVolume, this.ctx.currentTime);
    }
  }

  /**
   * Returns current song playback time in seconds (including offset adjustment)
   */
  getCurrentTime(): number {
    let rawTime = 0;
    if (this.isUsingProcedural) {
      rawTime = this.synth.getCurrentTime();
    } else {
      if (!this.ctx || !this.isFilePlaying) return 0;
      if (this.isFilePaused) return this.filePauseOffset;
      rawTime = Math.max(0, this.ctx.currentTime - this.fileStartTime);
    }
    return rawTime;
  }

  getPlaybackState(): PlaybackState {
    if (this.isFilePaused) return PlaybackState.PAUSED;
    if (this.isFilePlaying || (this.isUsingProcedural && this.synth.getCurrentTime() > 0)) {
      return PlaybackState.PLAYING;
    }
    return PlaybackState.READY;
  }

  setOnEnded(callback: () => void): void {
    this.onEndedCallback = callback;
  }

  isPlaying(): boolean {
    return this.getPlaybackState() === PlaybackState.PLAYING;
  }

  isBuffering(): boolean {
    return false;
  }

  /**
   * Play a procedural track by ID
   */
  async playProceduralTrack(trackId: string, offset = 0): Promise<void> {
    this.stop();
    this.isUsingProcedural = true;
    await this.ensureResumed();
    this.synth.setVolume(this.settings.musicVolume);
    this.synth.startTrack(trackId, offset);
  }

  /**
   * Play an AudioBuffer (imported MP3, AutoChart stems, or loaded file)
   */
  async playAudioBuffer(buffer: AudioBuffer, offset = 0): Promise<void> {
    this.stop();
    this.isUsingProcedural = false;
    this.currentAudioBuffer = buffer;
    await this.ensureResumed();
    if (!this.ctx) return;

    this.fileStartTime = this.ctx.currentTime - offset;
    this.filePauseOffset = offset;
    this.isFilePlaying = true;
    this.isFilePaused = false;

    this.fileGainNode = this.ctx.createGain();
    this.fileGainNode.gain.setValueAtTime(this.settings.musicVolume, this.ctx.currentTime);
    this.fileGainNode.connect(this.ctx.destination);

    // V13: Estágio de ganho isolado para silenciar ao errar sem afetar o volume do usuário
    this.muteGainNode = this.ctx.createGain();
    const initialMute = this.isMissMuted ? 0.0001 : 1.0;
    this.muteGainNode.gain.setValueAtTime(initialMute, this.ctx.currentTime);
    this.muteGainNode.connect(this.fileGainNode);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.muteGainNode);

    source.onended = () => {
      if (this.activeBufferSource === source) {
        this.isFilePlaying = false;
        if (this.onEndedCallback) {
          try {
            this.onEndedCallback();
          } catch (err) {
            console.error("[AudioManager] onEnded error:", err);
          }
        }
      }
    };

    this.activeBufferSource = source;
    this.activeBufferSource.start(0, offset);
  }

  pause(): void {
    if (this.isUsingProcedural) {
      this.synth.pauseTrack();
    } else {
      if (!this.isFilePlaying || this.isFilePaused || !this.ctx) return;
      this.isFilePaused = true;
      this.filePauseOffset = this.ctx.currentTime - this.fileStartTime;
      if (this.activeBufferSource) {
        try {
          this.activeBufferSource.onended = null;
          this.activeBufferSource.stop();
          this.activeBufferSource.disconnect();
        } catch {
          // Ignore
        }
        this.activeBufferSource = null;
      }
    }
  }

  async resume(): Promise<void> {
    await this.ensureResumed();
    if (this.isUsingProcedural) {
      this.synth.resumeTrack();
    } else {
      if (!this.isFilePlaying || !this.isFilePaused || !this.currentAudioBuffer) return;
      await this.playAudioBuffer(this.currentAudioBuffer, this.filePauseOffset);
    }
  }

  stop(): void {
    this.crowdSource?.stop();
    this.crowdSource = null;
    this.crowdPlayed = false;
    this.synth.stopTrack();
    this.isFilePlaying = false;
    this.isFilePaused = false;
    this.filePauseOffset = 0;
    this.fileStartTime = 0;

    if (this.activeBufferSource) {
      try {
        this.activeBufferSource.onended = null;
        this.activeBufferSource.stop();
        this.activeBufferSource.disconnect();
      } catch {
        // Ignore
      }
      this.activeBufferSource = null;
    }

    if (this.fileGainNode) {
      try {
        this.fileGainNode.disconnect();
      } catch {
        // Ignore
      }
      this.fileGainNode = null;
    }

    if (this.muteGainNode) {
      try {
        this.muteGainNode.disconnect();
      } catch {
        // Ignore
      }
      this.muteGainNode = null;
    }
  }

  /**
   * V13: Silenciar música ao errar (Mute on Miss).
   * Aplica transição suave (25ms) para evitar estalos de áudio sem causar atraso perceptível.
   */
  setMuteOnMiss(muted: boolean): void {
    if (this.isMissMuted === muted && this.muteGainNode) {
      return;
    }
    this.isMissMuted = muted;

    if (this.muteGainNode && this.ctx) {
      const t = this.ctx.currentTime;
      const target = muted ? 0.0001 : 1.0;
      this.muteGainNode.gain.cancelScheduledValues(t);
      this.muteGainNode.gain.setValueAtTime(this.muteGainNode.gain.value, t);
      this.muteGainNode.gain.linearRampToValueAtTime(target, t + 0.025);
    }

    if (this.isUsingProcedural) {
      this.synth.setMuted(muted);
    }
  }

  /**
   * Restaura o volume musical ao iniciar, reiniciar ou despausar.
   */
  resetMuteOnMiss(): void {
    this.isMissMuted = false;
    if (this.muteGainNode && this.ctx) {
      const t = this.ctx.currentTime;
      this.muteGainNode.gain.cancelScheduledValues(t);
      this.muteGainNode.gain.setValueAtTime(1.0, t);
    }

    if (this.isUsingProcedural) {
      this.synth.setMuted(false);
    }
  }

  get isMuted(): boolean {
    return this.isMissMuted;
  }

  /**
   * Safe in-memory audio decoding supporting all modern and legacy browsers
   */
  async decodeAudioBufferData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    await this.ensureResumed();
    if (!this.ctx) throw new Error('AudioContext não disponível');

    return new Promise<AudioBuffer>((resolve, reject) => {
      // Use slice(0) to prevent arrayBuffer detachment issues
      const copy = arrayBuffer.slice(0);
      const onError = (err: any) => {
        console.error('[AudioManager] Falha em decodeAudioData:', err, {
          isApple: AudioManager.isAppleDevice(),
          isOggSupported: AudioManager.isOggSupported(),
          bytes: copy.byteLength
        });
        reject(err);
      };

      const res = this.ctx!.decodeAudioData(
        copy,
        (buf) => resolve(buf),
        onError
      );
      if (res && typeof res.then === 'function') {
        res.then(resolve).catch(onError);
      }
    });
  }

  /**
   * Decodes an MP3 File from input
   */
  async decodeAudioFile(file: File): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    return await this.decodeAudioBufferData(arrayBuffer);
  }

  /**
   * Fetches and decodes an audio file from URL (respecting base path)
   */
  async decodeAudioUrl(url: string): Promise<AudioBuffer> {
    await this.ensureResumed();
    let finalUrl = url;
    const base = import.meta.env.BASE_URL || '/';
    if (url.startsWith('/') && !url.startsWith(base)) {
      finalUrl = base.replace(/\/$/, '') + url;
    }

    const res = await fetch(finalUrl);
    if (!res.ok) throw new Error(`HTTP error ${res.status} ao carregar áudio de ${finalUrl}`);
    const arrayBuffer = await res.arrayBuffer();
    return await this.decodeAudioBufferData(arrayBuffer);
  }

  // --- Sound Effects Synthesizer ---
  playSfxHit(): void {
    if (!this.ctx || !this.sfxGainNode || this.settings.sfxVolume <= 0) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.05);

    gain.gain.setValueAtTime(0.25 * this.settings.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGainNode);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  playSfxMiss(): void {
    if (!this.ctx || !this.sfxGainNode || this.settings.sfxVolume <= 0) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.16);

    gain.gain.setValueAtTime(0.3 * this.settings.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    osc.connect(gain);
    gain.connect(this.sfxGainNode);
    osc.start(t);
    osc.stop(t + 0.17);
  }

  playSfxCountdown(): void {
    if (!this.ctx || !this.sfxGainNode || this.settings.sfxVolume <= 0) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);

    gain.gain.setValueAtTime(0.35 * this.settings.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain);
    gain.connect(this.sfxGainNode);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  playSfxRockStart(): void {
    if (!this.ctx || !this.sfxGainNode || this.settings.sfxVolume <= 0) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(1600, t + 0.18);

    gain.gain.setValueAtTime(0.4 * this.settings.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(gain);
    gain.connect(this.sfxGainNode);
    osc.start(t);
    osc.stop(t + 0.23);
  }

  playSfxGameOver(): void {
    if (!this.ctx || !this.sfxGainNode || this.settings.sfxVolume <= 0) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.6);

    gain.gain.setValueAtTime(0.5 * this.settings.sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

    osc.connect(gain);
    gain.connect(this.sfxGainNode);
    osc.start(t);
    osc.stop(t + 0.7);
  }

  playCrowdReaction(stars: number, fullCombo: boolean, cleared = true): void {
    if (!cleared || this.crowdPlayed || this.settings.sfxVolume <= 0 || !this.ctx ||
        this.ctx.state !== 'running' || !this.sfxGainNode) return;
    this.crowdPlayed = true;
    const intensity: CrowdIntensity = fullCombo ? 'FULL_COMBO' : stars >= 5 ? 'FIVE_STARS' : 'NORMAL';
    const channels = createCrowdSamples(this.ctx.sampleRate, intensity);
    const buffer = this.ctx.createBuffer(2, channels[0].length, this.ctx.sampleRate);
    channels.forEach((channel, index) => buffer.copyToChannel(new Float32Array(channel), index));
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.55, now + 0.14);
    gain.gain.setValueAtTime(0.55, now + buffer.duration - 0.65);
    gain.gain.linearRampToValueAtTime(0, now + buffer.duration);
    source.connect(gain); gain.connect(this.sfxGainNode);
    this.crowdSource = source;
    source.onended = () => {
      source.disconnect(); gain.disconnect();
      if (this.crowdSource === source) this.crowdSource = null;
    };
    source.start();
  }

  playSfxVictory(): void {
    if (!this.ctx || !this.sfxGainNode || this.settings.sfxVolume <= 0) return;
    const freqs = [523.25, 659.25, 783.99, 1046.5]; // C, E, G, C
    freqs.forEach((f, i) => {
      if (!this.ctx || !this.sfxGainNode) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime + i * 0.1;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);

      gain.gain.setValueAtTime(0.3 * this.settings.sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

      osc.connect(gain);
      gain.connect(this.sfxGainNode);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  }
}
