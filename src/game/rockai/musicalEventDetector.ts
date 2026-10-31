import { PreparedAudio, DetectedMusicalEvent } from './contracts';

export class MusicalEventDetector {
  /**
   * Detects musical onsets, pick attacks, and sustains from audio.
   */
  public static detectEvents(audio: PreparedAudio): DetectedMusicalEvent[] {
    const pcm = audio.buffer instanceof Float32Array ? audio.buffer : audio.buffer.getChannelData(0);
    const sampleRate = audio.sampleRate;
    const duration = audio.duration;

    const frameSize = Math.floor(sampleRate * 0.025); // 25ms
    const hopSize = Math.floor(sampleRate * 0.010);   // 10ms
    const numFrames = Math.floor((pcm.length - frameSize) / hopSize);

    if (numFrames < 10) return [];

    // 1. Calculate Spectral Flux / Energy Derivative
    const flux = new Float32Array(numFrames);
    const energies = new Float32Array(numFrames);

    let prevEnergy = 0;
    for (let i = 0; i < numFrames; i++) {
      let sum = 0;
      const start = i * hopSize;
      for (let j = 0; j < frameSize; j++) {
        const val = pcm[start + j];
        sum += val * val;
      }
      const energy = Math.sqrt(sum / frameSize);
      energies[i] = energy;

      // Positive energy derivative (onsets)
      flux[i] = Math.max(0, energy - prevEnergy);
      prevEnergy = energy;
    }

    // 2. Adaptive Moving Average Threshold
    const windowSize = 30; // 300ms
    const thresholds = new Float32Array(numFrames);
    let runningSum = 0;

    for (let i = 0; i < numFrames; i++) {
      runningSum += flux[i];
      if (i >= windowSize) runningSum -= flux[i - windowSize];
      const count = Math.min(i + 1, windowSize);
      thresholds[i] = (runningSum / count) * 1.5 + 0.005;
    }

    // 3. Peak Picking (min 80ms distance between pick attacks)
    const minDistanceFrames = 8; // 80ms
    const candidateFrameIndices: number[] = [];

    for (let i = 2; i < numFrames - 2; i++) {
      if (
        flux[i] > thresholds[i] &&
        flux[i] > flux[i - 1] &&
        flux[i] > flux[i + 1]
      ) {
        const lastIdx = candidateFrameIndices[candidateFrameIndices.length - 1];
        if (lastIdx === undefined || (i - lastIdx) >= minDistanceFrames) {
          candidateFrameIndices.push(i);
        } else if (flux[i] > flux[lastIdx]) {
          candidateFrameIndices[candidateFrameIndices.length - 1] = i;
        }
      }
    }

    // 4. Construct Detected Musical Events
    const events: DetectedMusicalEvent[] = [];

    for (let k = 0; k < candidateFrameIndices.length; k++) {
      const frameIdx = candidateFrameIndices[k];
      const timeSec = Number(((frameIdx * hopSize) / sampleRate).toFixed(3));
      const nextTimeSec = k < candidateFrameIndices.length - 1 ? 
        (candidateFrameIndices[k + 1] * hopSize) / sampleRate : 
        duration;

      const onsetEnergy = energies[frameIdx];

      // Measure sustained resonance (duration)
      let sustainFrames = 0;
      const sustainCutoff = onsetEnergy * 0.40;
      for (let f = frameIdx + 1; f < numFrames; f++) {
        const curTime = (f * hopSize) / sampleRate;
        if (curTime >= nextTimeSec - 0.08) break;
        if (energies[f] >= sustainCutoff) {
          sustainFrames++;
        } else {
          break;
        }
      }

      const measuredDuration = Number(((sustainFrames * hopSize) / sampleRate).toFixed(3));
      // Only keep sustain if it holds for at least 300ms
      const finalDuration = measuredDuration >= 0.30 ? measuredDuration : 0;

      // Estimate intensity (0.0 to 1.0)
      const intensity = Number(Math.min(1.0, Math.max(0.2, onsetEnergy * 3.5)).toFixed(2));
      const confidence = Number(Math.min(1.0, Math.max(0.5, flux[frameIdx] * 4.0)).toFixed(2));

      events.push({
        time: timeSec,
        type: finalDuration > 0 ? 'riff' : 'single',
        duration: finalDuration,
        intensity,
        register: 'mid', // Will be refined by GuitarTranscriptionService
        confidence,
        isStrumAttack: true
      });
    }

    return events;
  }
}
