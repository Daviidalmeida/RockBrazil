import { BeatmapByDifficulty, Note, Difficulty } from '../../types';
import {
  PreparedAudio,
  IsolatedGuitarStem,
  AutochartQualityMetrics,
  TranscriptionMetadata,
  RockAIEngineMode,
  DetectedMusicalEvent
} from './contracts';
import { TempoAndBeatAnalyzer } from './tempoAndBeatAnalyzer';
import { MusicalEventDetector } from './musicalEventDetector';
import { SpotifyBasicPitchAdapter, BasicPitchTranscriptionOutput } from './spotifyBasicPitchAdapter';
import { DifficultyChartBuilder } from './difficultyChartBuilder';

export interface ChartGenerationOutput {
  charts: BeatmapByDifficulty;
  bpm: number;
  metrics: AutochartQualityMetrics;
  transcriptionMetadata: TranscriptionMetadata;
  engineMode: RockAIEngineMode;
  midiDataUri?: string;
  detectedEvents: DetectedMusicalEvent[];
}

export class ChartGenerationEngine {
  /**
   * Generates the 4 charts and calculates quality metrics from isolated guitar stem.
   * Leverages Spotify Basic Pitch for neural transcription and fallback YIN when offline.
   */
  public static async generateFromStem(
    stem: IsolatedGuitarStem,
    basicPitchAdapter?: SpotifyBasicPitchAdapter
  ): Promise<ChartGenerationOutput> {
    const adapter = basicPitchAdapter || new SpotifyBasicPitchAdapter();
    const audio = stem.audio;

    // 1. Tempo & Beat Grid
    const tempo = TempoAndBeatAnalyzer.analyze(audio);

    // 2. Real Spotify Basic Pitch Transcription (with YIN fallback if offline)
    const transcriptionRes: BasicPitchTranscriptionOutput = await adapter.transcribe(stem);
    let events = transcriptionRes.events;

    // If Basic Pitch found zero events (e.g. silent audio), supplement with onset detector
    if (events.length === 0) {
      const fallbackEvents = MusicalEventDetector.detectEvents(audio);
      events = fallbackEvents;
    }

    // 3. Build 4 Difficulties using strict physical rules
    const charts = DifficultyChartBuilder.buildCharts(events, tempo, audio.duration);

    // 4. Calculate Quality Metrics
    const metrics = this.calculateMetrics(charts, events, audio.duration);

    // 5. Determine Engine Mode
    const isSeparationAI = stem.metadata.isRealAI;
    const isTranscriptionAI = transcriptionRes.metadata.isRealAI;

    let engineMode: RockAIEngineMode = 'FALLBACK_DSP';
    if (isSeparationAI && isTranscriptionAI) {
      engineMode = 'REAL_AI';
    } else if (isSeparationAI || isTranscriptionAI) {
      engineMode = 'HYBRID';
    }

    return {
      charts,
      bpm: tempo.bpm,
      metrics,
      transcriptionMetadata: transcriptionRes.metadata,
      engineMode,
      midiDataUri: transcriptionRes.midiDataUri,
      detectedEvents: events
    };
  }

  /**
   * Synchronous / legacy fallback generator directly from audio.
   */
  public static generate(audio: PreparedAudio): {
    charts: BeatmapByDifficulty;
    bpm: number;
    metrics: AutochartQualityMetrics;
    transcriptionMetadata: TranscriptionMetadata;
    engineMode: RockAIEngineMode;
  } {
    const tempo = TempoAndBeatAnalyzer.analyze(audio);
    const rawEvents = MusicalEventDetector.detectEvents(audio);
    const charts = DifficultyChartBuilder.buildCharts(rawEvents, tempo, audio.duration);
    const metrics = this.calculateMetrics(charts, rawEvents, audio.duration);

    return {
      charts,
      bpm: tempo.bpm,
      metrics,
      transcriptionMetadata: {
        engine: 'YIN_DSP_FALLBACK',
        modelName: 'YIN-Pitch-Estimator (FALLBACK)',
        version: '1.0.0',
        isRealAI: false,
        polyphonic: false,
        notesDetectedCount: rawEvents.length
      },
      engineMode: 'FALLBACK_DSP'
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
      events.reduce((sum, e) => sum + (e.confidence || 0.8), 0) / events.length : 
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
