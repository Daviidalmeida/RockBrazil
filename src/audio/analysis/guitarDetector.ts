import { AnalysisFrame } from './audioAnalyzer';

export interface GuitarEvent {
  time: number;
  type: 'chord' | 'riff' | 'solo' | 'single';
  duration: number; // > 0 for sustains
  intensity: number; // 0.0 to 1.0
  register: 'low' | 'mid' | 'high'; // Pitch register for lane distribution
}

export class GuitarDetector {
  static detectEvents(frames: AnalysisFrame[]): GuitarEvent[] {
    if (frames.length === 0) return [];

    // 1. Calculate adaptive threshold using moving average of spectral flux
    const windowSize = 25; // ~375ms window
    const thresholds: number[] = new Array(frames.length);

    let runningSum = 0;
    for (let i = 0; i < frames.length; i++) {
      runningSum += frames[i].spectralFlux;
      if (i >= windowSize) {
        runningSum -= frames[i - windowSize].spectralFlux;
      }
      const count = Math.min(i + 1, windowSize);
      const avg = runningSum / count;
      thresholds[i] = avg * 1.6 + 0.008; // dynamic threshold + noise gate
    }

    // 2. Identify candidate onsets where flux exceeds threshold and is local peak
    const rawOnsets: { frameIdx: number; time: number; flux: number }[] = [];
    const minOnsetDistanceFrames = 6; // ~90ms minimum interval between distinct guitar pick attacks

    for (let i = 2; i < frames.length - 2; i++) {
      const f = frames[i];
      const isPeak = f.spectralFlux > thresholds[i] &&
                     f.spectralFlux > frames[i - 1].spectralFlux &&
                     f.spectralFlux > frames[i + 1].spectralFlux;

      // Ensure guitar energy is prominent compared to sub-bass
      const isGuitarDominant = f.guitarEnergy > f.lowSubEnergy * 0.45;

      if (isPeak && isGuitarDominant) {
        const last = rawOnsets[rawOnsets.length - 1];
        if (!last || (i - last.frameIdx) >= minOnsetDistanceFrames) {
          rawOnsets.push({ frameIdx: i, time: f.time, flux: f.spectralFlux });
        } else if (f.spectralFlux > last.flux) {
          // Replace with higher peak in same small window
          rawOnsets[rawOnsets.length - 1] = { frameIdx: i, time: f.time, flux: f.spectralFlux };
        }
      }
    }

    // 3. Classify event type, register, and calculate sustain duration
    const events: GuitarEvent[] = [];

    for (let idx = 0; idx < rawOnsets.length; idx++) {
      const onset = rawOnsets[idx];
      const frame = frames[onset.frameIdx];

      // Next onset time (used to bound sustain duration)
      const nextTime = idx < rawOnsets.length - 1 ? rawOnsets[idx + 1].time : frames[frames.length - 1].time;
      const maxPossibleDuration = Math.max(0, nextTime - onset.time - 0.08);

      // Measure sustained resonance: count how long guitarEnergy stays above 40% of onset energy
      let sustainDuration = 0;
      const peakGuitarEnergy = frame.guitarEnergy;
      const sustainThreshold = peakGuitarEnergy * 0.42;

      let heldFrames = 0;
      for (let j = onset.frameIdx + 1; j < frames.length; j++) {
        if (frames[j].time >= nextTime - 0.05) break;
        if (frames[j].guitarEnergy >= sustainThreshold) {
          heldFrames++;
        } else {
          break;
        }
      }

      const measuredDuration = (heldFrames * 15) / 1000;
      if (measuredDuration >= 0.35 && maxPossibleDuration >= 0.35) {
        sustainDuration = Math.min(measuredDuration, maxPossibleDuration, 3.5);
      }

      // Determine pitch register based on ratio of attack energy to body energy
      const attackRatio = frame.pickAttackEnergy / (frame.guitarEnergy + 0.0001);
      let register: 'low' | 'mid' | 'high' = 'mid';
      if (attackRatio < 0.6) {
        register = 'low';
      } else if (attackRatio > 1.3) {
        register = 'high';
      }

      // Determine type: chord vs riff vs solo vs single note
      let type: 'chord' | 'riff' | 'solo' | 'single' = 'single';
      if (frame.guitarEnergy > 0.18 && register !== 'high') {
        type = 'chord';
      } else if (register === 'high') {
        type = 'solo';
      } else if (idx > 0 && (onset.time - rawOnsets[idx - 1].time) < 0.28) {
        type = 'riff';
      }

      events.push({
        time: onset.time,
        type,
        duration: Number(sustainDuration.toFixed(3)),
        intensity: Math.min(1.0, frame.guitarEnergy * 3.5),
        register
      });
    }

    return events;
  }
}
