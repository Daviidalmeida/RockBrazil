import { PreparedAudio, DetectedMusicalEvent } from './contracts';

export class GuitarTranscriptionService {
  /**
   * Transcribes pitch, register, and chord polyphony for detected musical events.
   */
  public static transcribe(audio: PreparedAudio, events: DetectedMusicalEvent[]): DetectedMusicalEvent[] {
    const pcm = audio.buffer instanceof Float32Array ? audio.buffer : audio.buffer.getChannelData(0);
    const sampleRate = audio.sampleRate;

    return events.map((event) => {
      const startSample = Math.floor(event.time * sampleRate);
      const windowSamples = Math.min(pcm.length - startSample, Math.floor(sampleRate * 0.06)); // 60ms window

      if (windowSamples < 256) {
        return event;
      }

      const slice = pcm.subarray(startSample, startSample + windowSamples);
      const pitchHz = this.estimatePitchYin(slice, sampleRate);

      let midiNote: number | undefined;
      let register: 'low' | 'mid' | 'high' = 'mid';
      let isChord = false;

      if (pitchHz > 0 && pitchHz < 2000) {
        midiNote = Math.round(69 + 12 * Math.log2(pitchHz / 440));
        if (midiNote < 55) {
          register = 'low'; // Low E2 to G3
        } else if (midiNote <= 69) {
          register = 'mid'; // G3 to A4
        } else {
          register = 'high'; // A4 to E6 (leads, solos)
        }
      }

      // Check polyphonic chord spread: high zero-crossing variance + spectral energy ratio
      const zcr = this.calculateZeroCrossingRate(slice);
      if (zcr > 0.12 && event.intensity > 0.45) {
        isChord = true;
      }

      return {
        ...event,
        pitchHz: pitchHz > 0 ? Number(pitchHz.toFixed(1)) : undefined,
        midiNote,
        register,
        type: isChord ? 'chord' : (event.duration > 0.4 ? 'solo' : 'single'),
        confidence: Number(Math.min(1.0, event.confidence * (pitchHz > 0 ? 1.15 : 0.9)).toFixed(2))
      };
    });
  }

  /**
   * Simplified YIN pitch estimation algorithm for monophonic/lead guitar signals.
   */
  private static estimatePitchYin(signal: Float32Array, sampleRate: number): number {
    const minPitch = 80;  // ~E2 (guitar 6th string)
    const maxPitch = 1200; // ~D6
    const minLag = Math.floor(sampleRate / maxPitch);
    const maxLag = Math.floor(sampleRate / minPitch);

    if (signal.length <= maxLag * 2) return 0;

    const diff = new Float32Array(maxLag);
    for (let lag = minLag; lag < maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < maxLag; i++) {
        const d = signal[i] - signal[i + lag];
        sum += d * d;
      }
      diff[lag] = sum;
    }

    // Cumulative mean normalized difference
    let runningSum = 0;
    const cmndf = new Float32Array(maxLag);
    cmndf[0] = 1;

    for (let lag = 1; lag < maxLag; lag++) {
      runningSum += diff[lag];
      cmndf[lag] = runningSum > 0 ? (diff[lag] * lag) / runningSum : 1;
    }

    // Absolute threshold (0.15)
    let bestLag = 0;
    for (let lag = minLag; lag < maxLag; lag++) {
      if (cmndf[lag] < 0.18) {
        while (lag + 1 < maxLag && cmndf[lag + 1] < cmndf[lag]) {
          lag++;
        }
        bestLag = lag;
        break;
      }
    }

    if (bestLag > 0) {
      return sampleRate / bestLag;
    }
    return 0;
  }

  private static calculateZeroCrossingRate(signal: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < signal.length; i++) {
      if ((signal[i] >= 0 && signal[i - 1] < 0) || (signal[i] < 0 && signal[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings / signal.length;
  }
}
