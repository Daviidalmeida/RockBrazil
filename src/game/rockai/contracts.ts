import { Note, Lane, Difficulty, BeatmapByDifficulty, SongMetadata } from '../../types';

export type RockAIJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type AlignmentStatus = 'NAO_CALIBRADO' | 'EM_TESTE' | 'VALIDADO_PELO_USUARIO';

export type RockAIEngineMode = 'REAL_AI' | 'HYBRID' | 'FALLBACK_DSP';

export interface YouTubeValidationResult {
  isValid: boolean;
  videoId: string | null;
  canonicalUrl: string | null;
  error?: string;
}

export interface SongMetadataInput {
  title: string;
  artist: string;
  category: string;
  youtubeUrl: string;
  youtubeVideoId?: string;
  audioFile?: File | Blob | ArrayBuffer;
  audioFileName?: string;
}

export interface PreparedAudio {
  name: string;
  format: string;
  duration: number;
  sampleRate: number;
  channels: number;
  buffer: AudioBuffer | Float32Array;
  peaks: number[]; // Downsampled waveform peaks for visual editor (0.0 to 1.0)
}

export interface StemSeparationMetadata {
  modelName: string; // e.g. "htdemucs_6s" or "RockAI-HarmonicDspSeparator-v1 (FALLBACK)"
  modelVersion: string;
  targetInstrument: 'guitar';
  qualityEstimate: number; // 0.0 to 1.0
  duration: number;
  processingTimeMs: number;
  interferenceWarnings: string[];
  isRealAI: boolean;
  device?: 'cpu' | 'cuda' | 'mps';
  separationModel: 'HTDEMUCS_6S' | 'DSP_BANDPASS_FALLBACK';
}

export interface IsolatedGuitarStem {
  audio: PreparedAudio;
  metadata: StemSeparationMetadata;
}

export interface BasicPitchRawNote {
  pitchMidi: number;
  startTime: number;
  endTime: number;
  duration: number;
  confidence: number;
  amplitude?: number;
}

export interface TranscriptionMetadata {
  engine: 'SPOTIFY_BASIC_PITCH' | 'YIN_DSP_FALLBACK';
  modelName: string;
  version: string;
  isRealAI: boolean;
  polyphonic: boolean;
  notesDetectedCount: number;
  midiExportedPath?: string;
  averageConfidence?: number;
}

export interface DetectedMusicalEvent {
  time: number;
  type: 'single' | 'chord' | 'riff' | 'solo';
  duration: number; // > 0 for sustains
  intensity: number; // 0.0 to 1.0
  pitchHz?: number;
  midiNote?: number;
  register: 'low' | 'mid' | 'high';
  confidence: number; // 0.0 to 1.0
  isStrumAttack: boolean;
  chordNotes?: number[]; // MIDI note numbers in chord
}

export interface TempoAnalysisResult {
  bpm: number;
  isVariableBpm: boolean;
  beatIntervalSec: number;
  downbeats: number[];
  beats: number[];
}

export interface AutochartQualityMetrics {
  totalNotes: Record<Difficulty, number>;
  chordsCount: Record<Difficulty, number>;
  sustainsCount: Record<Difficulty, number>;
  averageDensityNotesPerSec: Record<Difficulty, number>;
  peakDensityNotesPerSec: Record<Difficulty, number>;
  transcriptionConfidence: number;
  discardedArtifactsCount: number;
  lowConfidenceSections: { startTime: number; endTime: number; reason: string }[];
  gameplayWarnings: string[];
  isValidForGameplay: boolean;
}

export interface AutochartGenerationResult {
  songId: string;
  title: string;
  artist: string;
  youtubeVideoId: string;
  duration: number;
  bpm: number;
  charts: BeatmapByDifficulty;
  qualityMetrics: AutochartQualityMetrics;
  alignment: {
    chartVideoOffsetMs: number;
    status: AlignmentStatus;
  };
  stemMetadata: StemSeparationMetadata;
  transcriptionMetadata: TranscriptionMetadata;
  engineMode: RockAIEngineMode;
  generatedAt: string;
  midiExport?: string; // Base64 or MIDI events JSON
}

export interface RockAIJobProgress {
  jobId: string;
  status: RockAIJobStatus;
  currentStep: string;
  progressPercent: number; // 0 to 100
  error?: string;
  result?: AutochartGenerationResult;
  engineMode?: RockAIEngineMode;
}

export type JobProgressCallback = (progress: RockAIJobProgress) => void;
