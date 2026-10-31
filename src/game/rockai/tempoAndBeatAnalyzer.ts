import { PreparedAudio, TempoAnalysisResult } from './contracts';

export class TempoAndBeatAnalyzer {
  /**
   * Analyzes audio PCM energy envelope and autocorrelation to estimate BPM and generate beat timestamps.
   */
    public static analyze(audioOrPcm: PreparedAudio | Float32Array, maybeSampleRate?: number, maybeDuration?: number): TempoAnalysisResult {
    let pcm: Float32Array;
    let sampleRate = 44100;
    let duration = 30;

    if (audioOrPcm instanceof Float32Array) {
      pcm = audioOrPcm;
      sampleRate = maybeSampleRate || 44100;
      duration = maybeDuration || (pcm.length / sampleRate);
    } else {
      const audio = audioOrPcm;
      pcm = audio.buffer instanceof Float32Array
        ? audio.buffer
        : (typeof (audio.buffer as any)?.getChannelData === 'function'
            ? (audio.buffer as any).getChannelData(0)
            : new Float32Array(0));
      sampleRate = audio.sampleRate;
      duration = audio.duration;
    }

    // 1. Calculate energy envelope in 20ms frames (~50 frames/sec)
    const frameSize = Math.floor(sampleRate * 0.02);
    const hopSize = Math.floor(sampleRate * 0.01);
    const numFrames = Math.floor((pcm.length - frameSize) / hopSize);

    if (numFrames < 50) {
      return {
        bpm: 120,
        isVariableBpm: false,
        beatIntervalSec: 0.5,
        downbeats: [0],
        beats: [0, 0.5, 1.0, 1.5, 2.0]
      };
    }

    const envelope = new Float32Array(numFrames);
    for (let i = 0; i < numFrames; i++) {
      let sum = 0;
      const start = i * hopSize;
      for (let j = 0; j < frameSize; j++) {
        const val = pcm[start + j];
        sum += val * val;
      }
      envelope[i] = Math.sqrt(sum / frameSize);
    }

    // 2. Autocorrelation over BPM range 70 to 190 BPM
    const minBpm = 70;
    const maxBpm = 190;
    const framesPerSec = sampleRate / hopSize;
    const minLag = Math.floor(framesPerSec * (60 / maxBpm));
    const maxLag = Math.floor(framesPerSec * (60 / minBpm));

    let bestLag = Math.floor(framesPerSec * (60 / 120));
    let maxCorr = -1;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      let count = 0;
      for (let i = 0; i < numFrames - lag; i += 2) {
        corr += envelope[i] * envelope[i + lag];
        count++;
      }
      if (count > 0) {
        const normCorr = corr / count;
        if (normCorr > maxCorr) {
          maxCorr = normCorr;
          bestLag = lag;
        }
      }
    }

    // Estimated BPM
    let estimatedBpm = Math.round((60 * framesPerSec) / bestLag);
    if (estimatedBpm < 70) estimatedBpm *= 2;
    if (estimatedBpm > 190) estimatedBpm = Math.round(estimatedBpm / 2);
    if (isNaN(estimatedBpm) || estimatedBpm <= 0) estimatedBpm = 120;

    const beatIntervalSec = 60 / estimatedBpm;

    // 3. Find first downbeat (peak energy onset in the first 4 seconds)
    let firstBeatSec = 0;
    let maxInitialEnergy = -1;
    const searchFrames = Math.min(numFrames, Math.floor(4.0 * framesPerSec));
    for (let i = 0; i < searchFrames; i++) {
      if (envelope[i] > maxInitialEnergy) {
        maxInitialEnergy = envelope[i];
        firstBeatSec = i / framesPerSec;
      }
    }

    // 4. Generate beat and downbeat grid across total duration
    const beats: number[] = [];
    const downbeats: number[] = [];

    let current = firstBeatSec % beatIntervalSec;
    let beatIndex = 0;

    while (current < duration) {
      const rounded = Number(current.toFixed(4));
      beats.push(rounded);
      if (beatIndex % 4 === 0) {
        downbeats.push(rounded);
      }
      current += beatIntervalSec;
      beatIndex++;
    }

    return {
      bpm: estimatedBpm,
      isVariableBpm: false,
      beatIntervalSec: Number(beatIntervalSec.toFixed(4)),
      downbeats,
      beats
    };
  }
}
