/**
 * RockBrazil Web Audio Procedural Rock Music Synthesizer
 * Generates 5 distinct original hard-rock tracks with drums, distorted guitar, bass, and lead guitar.
 */

export interface ProceduralTrackDef {
  id: string;
  title: string;
  artist: string;
  style: string;
  bpm: number;
  duration: number;
}

export const PROCEDURAL_TRACKS: ProceduralTrackDef[] = [
  {
    id: 'furia-tropical',
    title: 'Fúria Tropical',
    artist: 'RockBrazil Band',
    style: 'Hard Rock Brasil',
    bpm: 132,
    duration: 51.5
  },
  {
    id: 'trovao-meia-noite',
    title: 'Trovão da Meia-Noite',
    artist: 'Os Metaleiros',
    style: 'Heavy Metal Veloz',
    bpm: 148,
    duration: 46.0
  },
  {
    id: 'garagem-90',
    title: 'Garagem 90',
    artist: 'Distorção Pura',
    style: 'Grunge / Alt Rock',
    bpm: 116,
    duration: 48.0
  },
  {
    id: 'estrada-de-ferro',
    title: 'Estrada de Ferro',
    artist: 'Trem de Ferro',
    style: 'Blues Rock Boogie',
    bpm: 126,
    duration: 46.0
  },
  {
    id: 'sobrecarga',
    title: 'Sobrecarga',
    artist: 'Circuito Quebrado',
    style: 'Speed Punk Rock',
    bpm: 160,
    duration: 42.0
  }
];

export class RockSynth {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private isPaused = false;
  private songStartTime = 0;
  private pauseOffset = 0;
  private masterGain: GainNode | null = null;
  private distortionCurve: Float32Array | null = null;
  private scheduledNodes: AudioNode[] = [];
  private scheduledTimeouts: number[] = [];

  private currentTrackId = 'furia-tropical';
  private currentBpm = 132;
  private currentDuration = 51.5;

  constructor() {
    this.distortionCurve = this.makeDistortionCurve(52);
  }

  async init(): Promise<void> {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  get audioContext(): AudioContext | null {
    return this.ctx;
  }

  get bpm(): number {
    return this.currentBpm;
  }

  get totalDuration(): number {
    return this.currentDuration;
  }

  getCurrentTime(): number {
    if (!this.ctx || !this.isPlaying) return 0;
    if (this.isPaused) return this.pauseOffset;
    return Math.max(0, this.ctx.currentTime - this.songStartTime);
  }

  setVolume(volume: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime);
    }
  }

  private makeDistortionCurve(amount = 50): Float32Array {
    const k = amount;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  // Sound generator methods
  private scheduleKick(time: number, isDouble = false): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(isDouble ? 160 : 140, time);
    osc.frequency.exponentialRampToValueAtTime(36, time + 0.11);

    gain.gain.setValueAtTime(isDouble ? 0.85 : 1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + (isDouble ? 0.15 : 0.22));

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.24);
    this.scheduledNodes.push(osc, gain);
  }

  private scheduleSnare(time: number, isHeavy = false): void {
    if (!this.ctx || !this.masterGain) return;
    const dur = isHeavy ? 0.22 : 0.17;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(isHeavy ? 1000 : 1300, time);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(isHeavy ? 0.85 : 0.7, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.frequency.setValueAtTime(isHeavy ? 210 : 185, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.08);

    oscGain.gain.setValueAtTime(0.5, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + dur);
    osc.start(time);
    osc.stop(time + 0.12);
    this.scheduledNodes.push(noise, osc, noiseGain, oscGain);
  }

  private scheduleHiHat(time: number, isOpen = false): void {
    if (!this.ctx || !this.masterGain) return;
    const duration = isOpen ? 0.24 : 0.045;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(isOpen ? 0.35 : 0.22, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + duration);
    this.scheduledNodes.push(noise, gain);
  }

  private scheduleCrash(time: number): void {
    if (!this.ctx || !this.masterGain) return;
    const duration = 1.6;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(4500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.0005, time + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + duration);
    this.scheduledNodes.push(noise, gain);
  }

  private scheduleGuitarChord(time: number, freqs: number[], duration: number, isPalm = false): void {
    if (!this.ctx || !this.masterGain || !this.distortionCurve) return;

    const distortion = this.ctx.createWaveShaper();
    distortion.curve = this.distortionCurve as any;
    distortion.oversample = '4x';

    const cabinet = this.ctx.createBiquadFilter();
    cabinet.type = 'lowpass';
    cabinet.frequency.setValueAtTime(isPalm ? 1800 : 3800, time);
    cabinet.Q.setValueAtTime(1.8, time);

    const chordGain = this.ctx.createGain();
    chordGain.gain.setValueAtTime(isPalm ? 0.3 : 0.45, time);
    const fadeOutTime = isPalm ? Math.min(duration, 0.15) : duration;
    chordGain.gain.setValueAtTime(isPalm ? 0.3 : 0.45, time + fadeOutTime * 0.7);
    chordGain.gain.exponentialRampToValueAtTime(0.001, time + fadeOutTime);

    distortion.connect(cabinet);
    cabinet.connect(chordGain);
    chordGain.connect(this.masterGain);

    freqs.forEach((freq) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);
      osc.detune.setValueAtTime((Math.random() - 0.5) * 8, time);

      osc.connect(distortion);
      osc.start(time);
      osc.stop(time + fadeOutTime + 0.05);
      this.scheduledNodes.push(osc);
    });

    this.scheduledNodes.push(distortion, cabinet, chordGain);
  }

  private scheduleLeadNote(time: number, freq: number, duration: number): void {
    if (!this.ctx || !this.masterGain || !this.distortionCurve) return;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(5.5, time);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(freq * 0.025, time);
    lfo.connect(osc.frequency);

    const distortion = this.ctx.createWaveShaper();
    distortion.curve = this.distortionCurve as any;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, time);
    filter.Q.setValueAtTime(2.0, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.setValueAtTime(0.35, time + duration * 0.75);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(distortion);
    distortion.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    lfo.start(time + 0.05);
    lfo.stop(time + duration);
    osc.start(time);
    osc.stop(time + duration);

    this.scheduledNodes.push(osc, lfo, lfoGain, distortion, filter, gain);
  }

  private scheduleBass(time: number, freq: number, duration: number): void {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + duration);
    this.scheduledNodes.push(osc, filter, gain);
  }

  /**
   * Starts a procedural rock track
   */
  startTrack(trackId = 'furia-tropical', offsetSeconds = 0): void {
    if (!this.ctx) return;
    this.stopTrack();

    const trackDef = PROCEDURAL_TRACKS.find((t) => t.id === trackId) || PROCEDURAL_TRACKS[0];
    this.currentTrackId = trackDef.id;
    this.currentBpm = trackDef.bpm;
    this.currentDuration = trackDef.duration;

    const currentCtxTime = this.ctx.currentTime;
    this.isPlaying = true;
    this.isPaused = false;
    this.pauseOffset = offsetSeconds;
    this.songStartTime = currentCtxTime - offsetSeconds;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, currentCtxTime);
    this.masterGain.connect(this.ctx.destination);

    const startT = this.songStartTime;
    const b = 60 / this.currentBpm;
    const m = b * 4;

    switch (this.currentTrackId) {
      case 'trovao-meia-noite':
        this.buildTrackTrovao(startT, b, m, currentCtxTime);
        break;
      case 'garagem-90':
        this.buildTrackGaragem(startT, b, m, currentCtxTime);
        break;
      case 'estrada-de-ferro':
        this.buildTrackEstrada(startT, b, m, currentCtxTime);
        break;
      case 'sobrecarga':
        this.buildTrackSobrecarga(startT, b, m, currentCtxTime);
        break;
      case 'furia-tropical':
      default:
        this.buildTrackFuria(startT, b, m, currentCtxTime);
        break;
    }
  }

  // --- Track 1: Fúria Tropical (132 BPM, 51.5s) ---
  private buildTrackFuria(startT: number, b: number, m: number, currentCtxTime: number): void {
    const E5 = [82.4, 123.5, 164.8];
    const G5 = [98.0, 146.8, 196.0];
    const A5 = [110.0, 164.8, 220.0];
    const B5 = [123.5, 185.0, 246.9];
    const C5 = [130.8, 196.0, 261.6];
    const D5 = [146.8, 220.0, 293.7];

    const BassE = 41.2;
    const BassG = 49.0;
    const BassA = 55.0;
    const BassB = 61.7;
    const BassC = 65.4;
    const BassD = 73.4;

    const totalMeasures = 28;

    for (let bar = 0; bar < totalMeasures; bar++) {
      const barT = startT + bar * m;
      if (bar === 0) {
        for (let beat = 0; beat < 4; beat++) {
          const t = barT + beat * b;
          if (t >= currentCtxTime) this.scheduleHiHat(t, beat === 3);
        }
        continue;
      }
      if ([1, 4, 12, 20, 24].includes(bar) && barT >= currentCtxTime) {
        this.scheduleCrash(barT);
      }
      for (let eighth = 0; eighth < 8; eighth++) {
        const t = barT + eighth * (b / 2);
        if (t < currentCtxTime) continue;
        this.scheduleHiHat(t, eighth === 4 || eighth === 7);
        if (eighth === 0 || eighth === 4 || eighth === 5) this.scheduleKick(t);
        if (eighth === 2 || eighth === 6) this.scheduleSnare(t);
      }
    }

    // Intro (Bars 1-3)
    for (let bar = 1; bar < 4; bar++) {
      const barT = startT + bar * m;
      if (barT >= currentCtxTime) {
        this.scheduleGuitarChord(barT, E5, b * 1.5);
        this.scheduleBass(barT, BassE, b * 1.5);
        this.scheduleGuitarChord(barT + b * 2, G5, b);
        this.scheduleBass(barT + b * 2, BassG, b);
        this.scheduleGuitarChord(barT + b * 3, A5, b);
        this.scheduleBass(barT + b * 3, BassA, b);
      }
    }

    // Verse (Bars 4-11)
    const verseChords = [
      { chord: E5, bass: BassE, dur: b },
      { chord: E5, bass: BassE, dur: b * 0.8 },
      { chord: G5, bass: BassG, dur: b },
      { chord: A5, bass: BassA, dur: b }
    ];
    for (let bar = 4; bar < 12; bar++) {
      const barT = startT + bar * m;
      verseChords.forEach((step, idx) => {
        const t = barT + idx * b;
        if (t >= currentCtxTime) {
          this.scheduleGuitarChord(t, step.chord, step.dur);
          this.scheduleBass(t, step.bass, step.dur);
        }
      });
      const tOff = barT + b * 3.5;
      if (tOff >= currentCtxTime) {
        this.scheduleGuitarChord(tOff, bar % 2 === 0 ? B5 : E5, b * 0.4, true);
      }
    }

    // Chorus (Bars 12-19)
    const chorusProgression = [
      { chord: C5, bass: BassC, dur: b * 2 },
      { chord: D5, bass: BassD, dur: b * 2 },
      { chord: E5, bass: BassE, dur: b * 3 },
      { chord: G5, bass: BassG, dur: b },
      { chord: C5, bass: BassC, dur: b * 2 },
      { chord: D5, bass: BassD, dur: b * 2 },
      { chord: A5, bass: BassA, dur: b * 2 },
      { chord: B5, bass: BassB, dur: b * 2 }
    ];
    chorusProgression.forEach((step, idx) => {
      const t = startT + (12 + idx) * m;
      if (t >= currentCtxTime) {
        this.scheduleGuitarChord(t, step.chord, step.dur);
        this.scheduleBass(t, step.bass, step.dur);
      }
      const t2 = t + b * 2;
      if (t2 >= currentCtxTime && step.dur < b * 3) {
        this.scheduleGuitarChord(t2, step.chord, b * 1.8);
      }
    });

    // Solo (Bars 20-23)
    const soloLicks = [
      { beat: 0, freq: 329.6, dur: b * 0.8 },
      { beat: 1, freq: 392.0, dur: b * 0.8 },
      { beat: 2, freq: 440.0, dur: b * 0.8 },
      { beat: 3, freq: 493.8, dur: b * 0.8 },
      { beat: 4, freq: 587.3, dur: b * 0.8 },
      { beat: 5, freq: 659.2, dur: b * 1.5 },
      { beat: 7, freq: 587.3, dur: b * 0.8 },
      { beat: 8, freq: 493.8, dur: b * 0.8 },
      { beat: 9, freq: 440.0, dur: b * 0.8 },
      { beat: 10, freq: 392.0, dur: b * 1.2 },
      { beat: 12, freq: 440.0, dur: b * 0.8 },
      { beat: 13, freq: 493.8, dur: b * 0.8 },
      { beat: 14, freq: 659.2, dur: b * 2.0 }
    ];
    const soloStartT = startT + 20 * m;
    soloLicks.forEach((note) => {
      const t = soloStartT + note.beat * b;
      if (t >= currentCtxTime) this.scheduleLeadNote(t, note.freq, note.dur);
    });
    for (let bar = 20; bar < 24; bar++) {
      const barT = startT + bar * m;
      if (barT >= currentCtxTime) {
        this.scheduleGuitarChord(barT, E5, m * 0.95);
        this.scheduleBass(barT, BassE, m * 0.95);
      }
    }

    // Outro (Bars 24-27)
    for (let bar = 24; bar < 27; bar++) {
      const barT = startT + bar * m;
      if (barT >= currentCtxTime) {
        this.scheduleGuitarChord(barT, E5, b * 1.5);
        this.scheduleGuitarChord(barT + b * 2, G5, b);
        this.scheduleGuitarChord(barT + b * 3, A5, b);
        this.scheduleBass(barT, BassE, b * 1.5);
        this.scheduleBass(barT + b * 2, BassG, b);
        this.scheduleBass(barT + b * 3, BassA, b);
      }
    }
    const finalT = startT + 27 * m;
    if (finalT >= currentCtxTime) {
      this.scheduleCrash(finalT);
      this.scheduleGuitarChord(finalT, E5, b * 4);
      this.scheduleBass(finalT, BassE, b * 4);
    }
  }

  // --- Track 2: Trovão da Meia-Noite (Heavy Metal, 148 BPM, 46.0s) ---
  private buildTrackTrovao(startT: number, b: number, m: number, currentCtxTime: number): void {
    const D5 = [73.4, 110.0, 146.8];
    const F5 = [87.3, 130.8, 174.6];
    const G5 = [98.0, 146.8, 196.0];
    const A5 = [110.0, 164.8, 220.0];
    const Bb5 = [116.5, 174.6, 233.1];

    const BassD = 36.7;
    const BassF = 43.7;
    const BassG = 49.0;
    const BassA = 55.0;

    const totalBars = 28;
    for (let bar = 0; bar < totalBars; bar++) {
      const barT = startT + bar * m;
      if (barT >= currentCtxTime && (bar === 1 || bar === 9 || bar === 17 || bar === 25)) {
        this.scheduleCrash(barT);
      }
      // Double bass metal drum groove
      for (let s = 0; s < 16; s++) {
        const t = barT + s * (b / 4);
        if (t < currentCtxTime) continue;
        if (s % 2 === 0) this.scheduleHiHat(t, s === 8);
        if (s === 0 || s === 2 || s === 6 || s === 8 || s === 10 || s === 14) {
          this.scheduleKick(t, true);
        }
        if (s === 4 || s === 12) {
          this.scheduleSnare(t, true);
        }
      }

      // Fast metal riffs
      if (bar >= 1 && barT >= currentCtxTime) {
        const chord = bar % 4 === 1 ? D5 : bar % 4 === 2 ? F5 : bar % 4 === 3 ? G5 : A5;
        const bass = bar % 4 === 1 ? BassD : bar % 4 === 2 ? BassF : bar % 4 === 3 ? BassG : BassA;
        this.scheduleGuitarChord(barT, chord, b * 1.5);
        this.scheduleBass(barT, bass, b * 1.5);
        this.scheduleGuitarChord(barT + b * 2, D5, b * 0.8, true);
        this.scheduleGuitarChord(barT + b * 3, Bb5, b * 0.8);
      }
    }
  }

  // --- Track 3: Garagem 90 (Grunge / Alt Rock, 116 BPM, 48.0s) ---
  private buildTrackGaragem(startT: number, b: number, m: number, currentCtxTime: number): void {
    const E5 = [82.4, 123.5, 164.8];
    const G5 = [98.0, 146.8, 196.0];
    const A5 = [110.0, 164.8, 220.0];
    const C5 = [130.8, 196.0, 261.6];
    const D5 = [146.8, 220.0, 293.7];

    const BassE = 41.2;
    const BassG = 49.0;
    const BassA = 55.0;
    const BassC = 65.4;

    const totalBars = 23;
    for (let bar = 0; bar < totalBars; bar++) {
      const barT = startT + bar * m;
      if (barT >= currentCtxTime && (bar === 1 || bar === 8 || bar === 16)) {
        this.scheduleCrash(barT);
      }
      // Sludgy grunge drum pattern
      for (let s = 0; s < 8; s++) {
        const t = barT + s * (b / 2);
        if (t < currentCtxTime) continue;
        this.scheduleHiHat(t, s === 2 || s === 6);
        if (s === 0 || s === 3 || s === 4) this.scheduleKick(t);
        if (s === 2 || s === 6) this.scheduleSnare(t, true);
      }

      // Heavy grunge guitar chords
      if (bar >= 1 && barT >= currentCtxTime) {
        const chord = bar % 4 === 1 ? E5 : bar % 4 === 2 ? G5 : bar % 4 === 3 ? C5 : D5;
        const bass = bar % 4 === 1 ? BassE : bar % 4 === 2 ? BassG : bar % 4 === 3 ? BassC : BassE;
        this.scheduleGuitarChord(barT, chord, b * 2);
        this.scheduleBass(barT, bass, b * 2);
        this.scheduleGuitarChord(barT + b * 2, A5, b * 1.8);
      }
    }
  }

  // --- Track 4: Estrada de Ferro (Blues Rock Boogie, 126 BPM, 46.0s) ---
  private buildTrackEstrada(startT: number, b: number, m: number, currentCtxTime: number): void {
    const A5 = [110.0, 164.8, 220.0];
    const C5 = [130.8, 196.0, 261.6];
    const D5 = [146.8, 220.0, 293.7];
    const E5 = [82.4, 123.5, 164.8];

    const BassA = 55.0;
    const BassC = 65.4;
    const BassD = 73.4;
    const BassE = 41.2;

    const totalBars = 24;
    for (let bar = 0; bar < totalBars; bar++) {
      const barT = startT + bar * m;
      if (barT >= currentCtxTime && (bar === 1 || bar === 12 || bar === 20)) {
        this.scheduleCrash(barT);
      }
      // Shuffle swing groove
      for (let beat = 0; beat < 4; beat++) {
        const t1 = barT + beat * b;
        const t2 = barT + beat * b + b * 0.66; // swing eighth
        if (t1 >= currentCtxTime) {
          this.scheduleHiHat(t1, false);
          if (beat === 0 || beat === 2) this.scheduleKick(t1);
          if (beat === 1 || beat === 3) this.scheduleSnare(t1);
        }
        if (t2 >= currentCtxTime) this.scheduleHiHat(t2, false);
      }

      // Boogie shuffle chords
      if (bar >= 1 && barT >= currentCtxTime) {
        const chord = bar % 4 === 1 ? A5 : bar % 4 === 2 ? D5 : bar % 4 === 3 ? E5 : A5;
        const bass = bar % 4 === 1 ? BassA : bar % 4 === 2 ? BassD : bar % 4 === 3 ? BassE : BassA;
        this.scheduleGuitarChord(barT, chord, b * 1.2);
        this.scheduleBass(barT, bass, b * 1.2);
        this.scheduleGuitarChord(barT + b * 2, C5, b * 0.8);
        this.scheduleGuitarChord(barT + b * 3, chord, b * 0.8);
      }
    }
  }

  // --- Track 5: Sobrecarga (Speed Punk Rock, 160 BPM, 42.0s) ---
  private buildTrackSobrecarga(startT: number, b: number, m: number, currentCtxTime: number): void {
    const C5 = [130.8, 196.0, 261.6];
    const G5 = [98.0, 146.8, 196.0];
    const A5 = [110.0, 164.8, 220.0];
    const F5 = [87.3, 130.8, 174.6];

    const BassC = 65.4;
    const BassG = 49.0;
    const BassA = 55.0;
    const BassF = 43.7;

    const totalBars = 28;
    for (let bar = 0; bar < totalBars; bar++) {
      const barT = startT + bar * m;
      if (barT >= currentCtxTime && (bar === 1 || bar === 8 || bar === 16 || bar === 24)) {
        this.scheduleCrash(barT);
      }
      // Fast straight punk beat
      for (let s = 0; s < 8; s++) {
        const t = barT + s * (b / 2);
        if (t < currentCtxTime) continue;
        this.scheduleHiHat(t, s % 2 === 1);
        if (s === 0 || s === 2 || s === 4 || s === 6) this.scheduleKick(t);
        if (s === 2 || s === 6) this.scheduleSnare(t, true);
      }

      // Fast punk power chords
      if (bar >= 1 && barT >= currentCtxTime) {
        const chord = bar % 4 === 1 ? C5 : bar % 4 === 2 ? G5 : bar % 4 === 3 ? A5 : F5;
        const bass = bar % 4 === 1 ? BassC : bar % 4 === 2 ? BassG : bar % 4 === 3 ? BassA : BassF;
        for (let beat = 0; beat < 4; beat++) {
          const t = barT + beat * b;
          if (t >= currentCtxTime) {
            this.scheduleGuitarChord(t, chord, b * 0.9);
            this.scheduleBass(t, bass, b * 0.9);
          }
        }
      }
    }
  }

  pauseTrack(): void {
    if (!this.isPlaying || this.isPaused || !this.ctx) return;
    this.isPaused = true;
    this.pauseOffset = this.ctx.currentTime - this.songStartTime;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  resumeTrack(): void {
    if (!this.isPlaying || !this.isPaused || !this.ctx) return;
    this.startTrack(this.currentTrackId, this.pauseOffset);
  }

  stopTrack(): void {
    this.isPlaying = false;
    this.isPaused = false;
    this.pauseOffset = 0;

    this.scheduledNodes.forEach((node) => {
      try {
        if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
          (node as AudioScheduledSourceNode).stop();
        }
        node.disconnect();
      } catch {
        // Ignore
      }
    });
    this.scheduledNodes = [];

    this.scheduledTimeouts.forEach((tid) => clearTimeout(tid));
    this.scheduledTimeouts = [];

    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        // Ignore
      }
      this.masterGain = null;
    }
  }
}
