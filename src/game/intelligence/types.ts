import { Difficulty, Lane, Note } from '../../types';

export type ProblemType =
  | 'CLOCK_JITTER'
  | 'BUFFERING'
  | 'PLAYBACK_STALL'
  | 'SEEK_DETECTED'
  | 'OFFSET_MISMATCH'
  | 'DRIFT_DETECTED'
  | 'CHART_INVALID'
  | 'RECORDING_MISMATCH'
  | 'MEDIA_UNAVAILABLE';

export type ConfidenceLevel =
  | 'VERIFIED'
  | 'HIGH_CONFIDENCE'
  | 'LOW_CONFIDENCE'
  | 'UNAVAILABLE';

export type AccuracyStatus =
  | 'VERIFIED_90_PLUS'
  | 'BELOW_TARGET'
  | 'INSUFFICIENT_EVIDENCE'
  | 'INCOMPATIBLE_RECORDING'
  | 'CIRCULAR_VALIDATION_REJECTED';

export type VisualSpeedPreset = 'LENTA' | 'NORMAL' | 'RÁPIDA';

export interface VerifiedSyncProfile {
  songId: string;
  recordingId: string;
  playbackSource: 'youtube' | 'local_audio' | 'synthetic';
  chartVersion: string;
  calibratedOffsetMs: number;
  driftRatePerSec: number;
  verifiedAnchors: { mediaTime: number; chartTime: number }[];
  confidence: ConfidenceLevel;
  calibratedAt: number;
  algorithmVersion: string;
}

export interface ChartIntegrityReport {
  isValid: boolean;
  issues: string[];
  noteCount: number;
  firstNoteTime: number;
  lastNoteTime: number;
  chordsCount: number;
  sustainsCount: number;
  maxDensityPerSecond: number;
  suspiciousGapsCount: number;
  duplicateNotesRemoved: number;
  outOfOrderFixed: number;
  invalidLanesFixed: number;
}

export interface GroundTruthProvenance {
  authorOrLab: string;
  date: string;
  method: 'MANUAL_TRANSCRIPTION' | 'STEM_ACOUSTIC_DECONVOLUTION' | 'STUDIO_MASTER_SCORE' | 'SYNTHETIC_BENCHMARK';
  datasetName: string;
  datasetUrl?: string;
  isIndependent: boolean;
  isSynthetic?: boolean;
  sourceChartIdToExclude?: string;
}

export interface GroundTruthEvent {
  time: number;
  lane?: Lane;
  duration?: number;
  label?: string;
  isAccent?: boolean;
  isChord?: boolean;
  pitch?: string;
}

export interface IndependentGroundTruthRecord {
  songId: string;
  recordingId: string;
  difficulty: Difficulty;
  sourceType: 'INDEPENDENT_MANUAL_TRANSCRIPTION' | 'VALIDATED_STEM_ANALYSIS' | 'AUTHORIZED_DATASET' | 'SYNTHETIC_BENCHMARK';
  sourceDescription: string;
  annotationVersion: string;
  recordingFingerprint?: string;
  events: GroundTruthEvent[];
  provenance: GroundTruthProvenance;
  validationStatus: 'CERTIFIED' | 'PROVISIONAL' | 'SYNTHETIC_BENCHMARK' | 'UNVERIFIED';
}

export interface TemporalAccuracyMetrics {
  medianErrorMs: number;
  p95ErrorMs: number;
  maxErrorMs: number;
  within20msPercent: number;
  within50msPercent: number;
}

export interface MusicalFidelityMetrics {
  chordPrecision: number;
  sustainMatchPercent: number;
  extraNotesCount: number;
  missingNotesCount: number;
  laneDistributionScore: number;
}

export interface AccuracyEvaluationResult {
  songId: string;
  difficulty: Difficulty;
  totalNotes: number;
  referenceEventsCount: number;
  matchedPairsCount: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  medianErrorMs: number;
  p95ErrorMs: number;
  maxErrorMs: number;
  status: AccuracyStatus;
  details: string;

  // Granular metrics (V13.9.4.1)
  temporalAccuracy?: TemporalAccuracyMetrics;
  musicalFidelity?: MusicalFidelityMetrics;
  eventPrecision?: number;
  eventRecall?: number;
  playabilityScore?: number;
  isCircularValidationBlocked?: boolean;
  provenanceDescription?: string;
}

export interface ClockStateSnapshot {
  mediaTime: number;
  chartTime: number;
  renderTime: number;
  isBuffering: boolean;
  isPaused: boolean;
  appliedOffsetMs: number;
  calibratedOffsetMs?: number;
  driftRatePerSec: number;
  fps: number;
}
