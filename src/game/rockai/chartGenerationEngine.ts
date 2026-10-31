import { BeatmapByDifficulty, Note, Difficulty } from '../../types';
import { PreparedAudio, AutochartQualityMetrics } from './contracts';
import { TempoAndBeatAnalyzer } from './tempoAndBeatAnalyzer';
import { MusicalEventDetector } from './musicalEventDetector';
import { GuitarTranscriptionService } from './guitarTranscriptionService';
import { DifficultyChartBuilder } from './difficultyChartBuilder';

export class ChartGenerationEngine {
  /**
   * Generates the 4 charts and calculates quality metrics from prepared audio.
   */
  public static generate(audio: PreparedAudio): {
    charts: BeatmapByDifficulty;
    bpm: number;
    metrics: AutochartQualityMetrics;
  } {
    // 1. Tempo & Beat Grid
    const tempo = TempoAndBeatAnalyzer.analyze(audio);

    // 2. Event Detection
    const rawEvents = MusicalEventDetector.detectEvents(audio);

    // 3. Guitar Transcription & Pitch Register
    const transcribedEvents = GuitarTranscriptionService.transcribe(audio, rawEvents);

    // 4. Build 4 Difficulties
    const charts = DifficultyChartBuilder.buildCharts(transcribedEvents, tempo, audio.duration);

    // 5. Calculate Metrics
    const metrics = this.calculateMetrics(charts, transcribedEvents, audio.duration);

    return {
      charts,
      bpm: tempo.bpm,
      metrics
    };
  }

  private static calculateMetrics(
    charts: BeatmapByDifficulty,
    events: any[],
    duration: number
  ): AutochartQualityMetrics {
    const difficulties: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];

    const totalNotes: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0, EXPERT: 0 };
    const chordsCount: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0, EXPERT: 0 };
    const sustainsCount: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0, EXPERT: 0 };
    const avgDensity: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0, EXPERT: 0 };
    const peakDensity: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0, EXPERT: 0 };

    for (const diff of difficulties) {
      const notes = charts[diff];
      totalNotes[diff] = notes.length;
      sustainsCount[diff] = notes.filter(n => n.duration > 0).length;

      // Group by timestamp to count chords
      const timeGroups = new Map<number, number>();
      for (const n of notes) {
        timeGroups.set(n.time, (timeGroups.get(n.time) || 0) + 1);
      }

      let chords = 0;
      timeGroups.forEach((count) => {
        if (count > 1) chords++;
      });
      chordsCount[diff] = chords;

      avgDensity[diff] = duration > 0 ? Number((notes.length / duration).toFixed(2)) : 0;

      // Peak density in 1-second rolling windows
      let maxInWindow = 0;
      for (let t = 0; t < duration; t += 0.5) {
        const inWin = notes.filter(n => n.time >= t && n.time < t + 1.0).length;
        if (inWin > maxInWindow) maxInWindow = inWin;
      }
      peakDensity[diff] = maxInWindow;
    }

    const avgConfidence = events.length > 0 ? 
      events.reduce((sum, e) => sum + e.confidence, 0) / events.length : 
      0.80;

    const warnings: string[] = [];
    if (totalNotes.EASY > totalNotes.MEDIUM) {
      warnings.push('Atenção: Contagem de notas no FÁCIL superior ao MÉDIO.');
    }
    if (totalNotes.EXPERT < 20 && duration > 30) {
      warnings.push('Densidade muito baixa detectada para a dificuldade EXPERT.');
    }

    return {
      totalNotes,
      chordsCount,
      sustainsCount,
      averageDensityNotesPerSec: avgDensity,
      peakDensityNotesPerSec: peakDensity,
      transcriptionConfidence: Number(avgConfidence.toFixed(2)),
      discardedArtifactsCount: 0,
      lowConfidenceSections: [],
      gameplayWarnings: warnings,
      isValidForGameplay: totalNotes.HARD > 0
    };
  }
}
