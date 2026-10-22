import { AudioImporter } from './audioImporter';
import { AudioAnalyzer } from './audioAnalyzer';
import { GuitarDetector, GuitarEvent } from './guitarDetector';
import { DifficultyGenerator } from './difficultyGenerator';
import { ChartCache } from './chartCache';
import { BeatmapByDifficulty } from '../../types';

export interface AnalysisPipelineResult {
  hash: string;
  buffer: AudioBuffer;
  charts: BeatmapByDifficulty;
  eventsCount: number;
  duration: number;
  fromCache: boolean;
}

export class GuitarPipeline {
  static async process(file: File, ctx: AudioContext): Promise<AnalysisPipelineResult> {
    // 1. Calculate file hash
    const hash = await AudioImporter.computeFileHash(file);

    // 2. Decode audio buffer
    const buffer = await AudioImporter.decodeAudio(ctx, file);

    // 3. Check if charts already cached for this exact file
    const cachedCharts = await ChartCache.get(hash);
    if (cachedCharts) {
      return {
        hash,
        buffer,
        charts: cachedCharts,
        eventsCount: cachedCharts.EXPERT.length,
        duration: buffer.duration,
        fromCache: true
      };
    }

    // 4. Run band-limited spectral analysis focusing on guitar frequencies
    const frames = AudioAnalyzer.analyzeBuffer(buffer, 15);

    // 5. Detect guitar onsets, riffs, chords, sustains and pauses
    const events: GuitarEvent[] = GuitarDetector.detectEvents(frames);

    if (events.length === 0) {
      throw new Error('Não foi possível identificar eventos de guitarra suficientes na música. O arquivo pode estar corrompido ou ter volume muito baixo.');
    }

    // 6. Generate the 4 difficulties from the single guitar analysis
    const charts = DifficultyGenerator.generateAllDifficulties(events);

    // 7. Store in cache
    await ChartCache.set(hash, charts);

    return {
      hash,
      buffer,
      charts,
      eventsCount: events.length,
      duration: buffer.duration,
      fromCache: false
    };
  }
}
