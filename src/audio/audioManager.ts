import { RockSynth, PROCEDURAL_TRACKS } from './rockSynth';
import { GameSettings } from '../types';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private synth: RockSynth;
  private settings: GameSettings;

  // Audio File playback
  private activeBufferSource: AudioBufferSourceNode | null = null;
  private fileGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private fileStartTime = 0;
  private filePauseOffset = 0;
  private isFilePlaying = false;
  private isFilePaused = false;
  private currentAudioBuffer: AudioBuffer | null = null;
  private isUsingProcedural = true;

  constructor(settings: GameSettings) {
    this.settings = settings;
    this.synth = new RockSynth();
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

  /**
   * Play a procedural track by ID
   */
  playProceduralTrack(trackId: string, offset = 0): void {
    this.stop();
    this.isUsingProcedural = true;
    this.synth.setVolume(this.settings.musicVolume);
    this.synth.startTrack(trackId, offset);
  }

  /**
   * Play an AudioBuffer (imported MP3 or TNT.mp3)
   */
  playAudioBuffer(buffer: AudioBuffer, offset = 0): void {
    this.stop();
    this.isUsingProcedural = false;
    this.currentAudioBuffer = buffer;
    if (!this.ctx) return;

    this.fileStartTime = this.ctx.currentTime - offset;
    this.filePauseOffset = offset;
    this.isFilePlaying = true;
    this.isFilePaused = false;

    this.fileGainNode = this.ctx.createGain();
    this.fileGainNode.gain.setValueAtTime(this.settings.musicVolume, this.ctx.currentTime);
    this.fileGainNode.connect(this.ctx.destination);

    this.activeBufferSource = this.ctx.createBufferSource();
    this.activeBufferSource.buffer = buffer;
    this.activeBufferSource.connect(this.fileGainNode);
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
          this.activeBufferSource.stop();
          this.activeBufferSource.disconnect();
        } catch {
          // Ignore
        }
        this.activeBufferSource = null;
      }
    }
  }

  resume(): void {
    if (this.isUsingProcedural) {
      this.synth.resumeTrack();
    } else {
      if (!this.isFilePlaying || !this.isFilePaused || !this.currentAudioBuffer) return;
      this.playAudioBuffer(this.currentAudioBuffer, this.filePauseOffset);
    }
  }

  stop(): void {
    this.synth.stopTrack();
    this.isFilePlaying = false;
    this.isFilePaused = false;
    this.filePauseOffset = 0;

    if (this.activeBufferSource) {
      try {
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
  }

  /**
   * Decodes an MP3 File from input
   */
  async decodeAudioFile(file: File): Promise<AudioBuffer> {
    await this.init();
    if (!this.ctx) throw new Error('AudioContext not available');
    const arrayBuffer = await file.arrayBuffer();
    return await this.ctx.decodeAudioData(arrayBuffer);
  }

  /**
   * Fetches and decodes an audio file from URL
   */
  async decodeAudioUrl(url: string): Promise<AudioBuffer> {
    await this.init();
    if (!this.ctx) throw new Error('AudioContext not available');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return await this.ctx.decodeAudioData(arrayBuffer);
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
