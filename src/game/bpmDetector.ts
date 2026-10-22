/**
 * Client-side Web Audio BPM & Beat Analyzer
 * Analyzes audio energy peaks to estimate tempo and beat timestamps as a reference
 */

export interface AnalysisResult {
  estimatedBpm: number;
  confidence: number;
  beatOffsets: number[];
}

export function detectBpmFromAudioBuffer(buffer: AudioBuffer): AnalysisResult {
  const channelData = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;

  // We analyze the first 60 seconds (or entire song if shorter)
  const maxSeconds = Math.min(60, buffer.duration);
  const samplesToAnalyze = Math.floor(maxSeconds * sampleRate);

  // Downsample to 22050 Hz or calculate RMS energy envelopes in 20ms blocks
  const blockSize = Math.floor(sampleRate * 0.02); // 20ms window
  const blockCount = Math.floor(samplesToAnalyze / blockSize);
  const energy: number[] = new Float64Array(blockCount) as any;

  for (let i = 0; i < blockCount; i++) {
    let sum = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      const val = channelData[start + j];
      sum += val * val;
    }
    energy[i] = Math.sqrt(sum / blockSize);
  }

  // Detect sudden energy rises (flux / transients)
  const flux: number[] = new Float64Array(blockCount) as any;
  for (let i = 1; i < blockCount; i++) {
    const diff = energy[i] - energy[i - 1];
    flux[i] = diff > 0 ? diff : 0;
  }

  // Find local peaks
  const peaks: number[] = [];
  let avgFlux = 0;
  for (let i = 0; i < blockCount; i++) avgFlux += flux[i];
  avgFlux /= blockCount;
  const threshold = avgFlux * 1.5;

  for (let i = 2; i < blockCount - 2; i++) {
    if (flux[i] > threshold && flux[i] > flux[i - 1] && flux[i] > flux[i + 1]) {
      const timeInSec = (i * blockSize) / sampleRate;
      peaks.push(timeInSec);
    }
  }

  // Calculate interval histogram for BPM candidates between 75 and 185 BPM
  const intervalCounts: Map<number, number> = new Map();
  for (let i = 0; i < peaks.length - 1; i++) {
    for (let j = i + 1; j < Math.min(i + 8, peaks.length); j++) {
      const delta = peaks[j] - peaks[i];
      if (delta >= 0.32 && delta <= 0.85) { // corresponds to 70 to 187 BPM
        const bpm = Math.round(60 / delta);
        intervalCounts.set(bpm, (intervalCounts.get(bpm) || 0) + 1);
      }
    }
  }

  // Find most frequent BPM
  let bestBpm = 120;
  let maxCount = 0;
  intervalCounts.forEach((count, bpm) => {
    if (count > maxCount) {
      maxCount = count;
      bestBpm = bpm;
    }
  });

  // Clamp to common rock BPM range (80-175)
  while (bestBpm < 80) bestBpm *= 2;
  while (bestBpm > 185) bestBpm = Math.round(bestBpm / 2);

  const beatOffsets: number[] = [];
  const beatInterval = 60 / bestBpm;
  const firstBeat = peaks.length > 0 ? peaks[0] % beatInterval : 0;
  for (let t = firstBeat; t < buffer.duration; t += beatInterval) {
    beatOffsets.push(Number(t.toFixed(3)));
  }

  return {
    estimatedBpm: bestBpm,
    confidence: Math.min(1.0, maxCount / 20),
    beatOffsets
  };
}
