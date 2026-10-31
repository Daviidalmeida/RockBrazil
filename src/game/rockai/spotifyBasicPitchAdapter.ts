import {
  IsolatedGuitarStem,
  DetectedMusicalEvent,
  BasicPitchRawNote,
  TranscriptionMetadata
} from './contracts';
import { GuitarTranscriptionService } from './guitarTranscriptionService';
import { MusicalEventDetector } from './musicalEventDetector';

export interface SpotifyBasicPitchConfig {
  baseUrl: string;
  timeoutMs: number;
  onsetThreshold: number; // 0.0 to 1.0 (default 0.5)
  frameThreshold: number; // 0.0 to 1.0 (default 0.3)
  minNoteLengthMs: number; // Minimum note length in ms (default 50)
  autoFallbackToYin: boolean;
}

const DEFAULT_CONFIG: SpotifyBasicPitchConfig = {
  baseUrl: 'http://localhost:8000',
  timeoutMs: 60000,
  onsetThreshold: 0.5,
  frameThreshold: 0.3,
  minNoteLengthMs: 50,
  autoFallbackToYin: true
};

export interface BasicPitchTranscriptionOutput {
  events: DetectedMusicalEvent[];
  rawNotes: BasicPitchRawNote[];
  metadata: TranscriptionMetadata;
  midiDataUri?: string;
}

/**
 * ROCKBRAZIL V13.9.1 — SPOTIFY BASIC PITCH ADAPTER
 *
 * Implements real deep learning pitch transcription via Spotify Basic Pitch
 * (https://github.com/spotify/basic-pitch).
 *
 * Features:
 * - Real neural network inference for polyphonic pitch transcription.
 * - Raw MIDI notes with exact start_time, end_time, pitch_midi and confidence.
 * - Preservation of intermediate MIDI data for diagnostic analysis.
 * - Conversion to RockBrazil DetectedMusicalEvent contract without skipping difficulty builder.
 * - Explicit fallback classification: If offline, uses YIN and tags as YIN_DSP_FALLBACK (never as AI).
 */
export class SpotifyBasicPitchAdapter {
  private config: SpotifyBasicPitchConfig;

  constructor(config: Partial<SpotifyBasicPitchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public async checkHealth(): Promise<{
    available: boolean;
    version?: string;
    model?: string;
    error?: string;
  }> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.config.baseUrl}/health`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(id);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        available: Boolean(data.basic_pitch_available),
        version: data.basic_pitch_version || '0.2.7',
        model: 'Spotify-Basic-Pitch-v1'
      };
    } catch (e: any) {
      return {
        available: false,
        error: e.message || 'Servidor de IA desconectado'
      };
    }
  }

  public async transcribe(stem: IsolatedGuitarStem): Promise<BasicPitchTranscriptionOutput> {
    const health = await this.checkHealth();

    if (!health.available) {
      if (this.config.autoFallbackToYin) {
        console.warn('[SpotifyBasicPitchAdapter] Spotify Basic Pitch offline. Utilizando fallback YIN.');
        return this.transcribeWithYinFallback(stem);
      }
      throw new Error(
        'Serviço oficial do Spotify Basic Pitch indisponível no endpoint local (http://localhost:8000).'
      );
    }

    try {
      const pcm = stem.audio.buffer instanceof Float32Array ? 
        stem.audio.buffer : 
        stem.audio.buffer.getChannelData(0);

      // Transmit to Python backend running official Spotify Basic Pitch predict()
      const payload = {
        sample_rate: stem.audio.sampleRate,
        duration: stem.audio.duration,
        onset_threshold: this.config.onsetThreshold,
        frame_threshold: this.config.frameThreshold,
        min_note_len_ms: this.config.minNoteLengthMs,
        samples: Array.from(pcm) // V13.9.2: Process full duration without artificial truncation
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(`${this.config.baseUrl}/api/v1/transcribe/basic-pitch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Erro na inferência Basic Pitch: HTTP ${response.status}`);
      }

      const resJson = await response.json();
      const rawNotes: BasicPitchRawNote[] = resJson.notes || [];

      // Convert raw Basic Pitch notes to DetectedMusicalEvent[]
      const events = this.convertBasicPitchToEvents(rawNotes, stem.audio.duration);

      const metadata: TranscriptionMetadata = {
        engine: 'SPOTIFY_BASIC_PITCH',
        modelName: 'Spotify-Basic-Pitch',
        version: health.version || '0.2.7',
        isRealAI: true,
        polyphonic: true,
        notesDetectedCount: rawNotes.length,
        midiExportedPath: resJson.midi_path,
        averageConfidence: resJson.average_confidence || 0.85
      };

      return {
        events,
        rawNotes,
        metadata,
        midiDataUri: resJson.midi_base64 ? `data:audio/midi;base64,${resJson.midi_base64}` : undefined
      };
    } catch (err: any) {
      if (this.config.autoFallbackToYin) {
        console.warn('[SpotifyBasicPitchAdapter] Falha na inferência Basic Pitch. Recorrendo a YIN.', err);
        return this.transcribeWithYinFallback(stem);
      }
      throw err;
    }
  }

  private convertBasicPitchToEvents(notes: BasicPitchRawNote[], maxDuration: number): DetectedMusicalEvent[] {
    // Sort chronologically by start time
    notes.sort((a, b) => a.startTime - b.startTime);

    const events: DetectedMusicalEvent[] = [];
    const chordWindowSec = 0.040; // 40ms window to group simultaneous notes into chords

    let i = 0;
    while (i < notes.length) {
      const current = notes[i];
      if (current.startTime >= maxDuration) {
        i++;
        continue;
      }

      // Check if subsequent notes fall within chord window
      const chordGroup = [current];
      let j = i + 1;
      while (j < notes.length && Math.abs(notes[j].startTime - current.startTime) <= chordWindowSec) {
        chordGroup.push(notes[j]);
        j++;
      }

      const duration = Number(Math.max(0, current.endTime - current.startTime).toFixed(3));
      const register = this.classifyRegister(current.pitchMidi);

      if (chordGroup.length > 1) {
        // Polyphonic chord event
        const midiNotes = chordGroup.map(n => n.pitchMidi);
        const avgConfidence = chordGroup.reduce((acc, n) => acc + n.confidence, 0) / chordGroup.length;

        events.push({
          time: Number(current.startTime.toFixed(3)),
          type: 'chord',
          duration: duration > 0.3 ? duration : 0,
          intensity: Math.min(1.0, 0.6 + chordGroup.length * 0.1),
          pitchHz: this.midiToHz(current.pitchMidi),
          midiNote: current.pitchMidi,
          register,
          confidence: Number(avgConfidence.toFixed(2)),
          isStrumAttack: true,
          chordNotes: midiNotes
        });
      } else {
        // Monophonic note or melodic riff event
        events.push({
          time: Number(current.startTime.toFixed(3)),
          type: duration > 0.35 ? 'single' : (current.confidence > 0.75 ? 'riff' : 'single'),
          duration: duration > 0.3 ? duration : 0,
          intensity: Math.min(1.0, Math.max(0.3, current.confidence)),
          pitchHz: this.midiToHz(current.pitchMidi),
          midiNote: current.pitchMidi,
          register,
          confidence: Number(current.confidence.toFixed(2)),
          isStrumAttack: true
        });
      }

      i = j;
    }

    return events;
  }

  private classifyRegister(midi: number): 'low' | 'mid' | 'high' {
    if (midi < 52) return 'low'; // Below E3
    if (midi < 69) return 'mid'; // E3 to A4
    return 'high';               // Above A4
  }

  private midiToHz(midi: number): number {
    return Number((440 * Math.pow(2, (midi - 69) / 12)).toFixed(2));
  }

  private transcribeWithYinFallback(stem: IsolatedGuitarStem): BasicPitchTranscriptionOutput {
    // Detect raw onsets first
    const rawEvents = MusicalEventDetector.detectEvents(stem.audio);
    const events: DetectedMusicalEvent[] = GuitarTranscriptionService.transcribe(stem.audio, rawEvents);

    const rawNotes: BasicPitchRawNote[] = events.map((e: DetectedMusicalEvent) => ({
      pitchMidi: e.midiNote || 60,
      startTime: e.time,
      endTime: e.time + e.duration,
      duration: e.duration,
      confidence: e.confidence
    }));

    const metadata: TranscriptionMetadata = {
      engine: 'YIN_DSP_FALLBACK',
      modelName: 'YIN-Pitch-Estimator (FALLBACK)',
      version: '1.0.0',
      isRealAI: false,
      polyphonic: false,
      notesDetectedCount: events.length,
      averageConfidence: 0.65
    };

    return {
      events,
      rawNotes,
      metadata
    };
  }
}
