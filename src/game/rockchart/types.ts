import { Difficulty, Note, BeatmapByDifficulty, SongMetadata } from '../../types';

export type ChartSourceProviderId = 'CHORUS_ENCORE' | 'RHYTHMVERSE' | 'ROCKBRAZIL_INTERNAL' | 'COMMUNITY_UPLOAD';

export interface ChartSearchResult {
  id: string;
  provider: ChartSourceProviderId;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  charter: string;
  durationSec: number;
  bpm: number;
  difficulties: Difficulty[];
  hasFullEMHX: boolean;
  format: '.chart' | '.mid' | '.sng' | '.zip' | 'ini';
  sourceUrl: string;
  directDownloadUrl?: string;
  hasGuitar: boolean;
  hasSolo?: boolean;
  hasLyrics?: boolean;
  version?: string;
  fileHash?: string;
  notesCount?: Partial<Record<Difficulty, number>>;
}

export interface ChartProviderDetails extends ChartSearchResult {
  instrumentBreakdown: {
    guitar: boolean;
    bass: boolean;
    drums: boolean;
    keys: boolean;
  };
  tempoChangesCount: number;
  licenseTerms: string;
  isApiAutomated: boolean;
  administrativeImportRequired: boolean;
}

export interface ChartProvider {
  readonly providerId: ChartSourceProviderId;
  readonly displayName: string;
  readonly websiteUrl: string;

  isLiveApiAvailable(): boolean;
  getTermsNotice(): string;
  getDirectWebSearchUrl(artist: string, title: string): string;

  search(query: { artist?: string; title?: string }): Promise<ChartSearchResult[]>;
  getChartDetails(chartId: string): Promise<ChartProviderDetails | null>;
}

export type ValidationStatus =
  | 'PENDING'
  | 'AUTO_MATCHED'
  | 'NEEDS_REVIEW'
  | 'VERIFIED'
  | 'INCOMPATIBLE';

export type SyncMethod =
  | 'ACOUSTIC_GROUND_TRUTH'
  | 'STUDIO_TIMESTAMP_ALIGNED'
  | 'OFFICIAL_VIDEO_ALIGNMENT'
  | 'MANUAL_CALIBRATION'
  | 'AUTO_MATCHED'
  | 'SYNC_NOT_VERIFIED';

export interface RockSyncProfile {
  songId: string;
  chartId: string;
  chartVersion: string;
  chartSource: ChartSourceProviderId;
  recordingId: string;
  youtubeVideoId: string;
  difficulty: Difficulty;
  offsetMs: number;
  timeScale: number;
  segmentCorrections?: { segmentStartSec: number; offsetDeltaMs: number }[];
  syncMethod: SyncMethod;
  evidenceSource: string;
  validationStatus: ValidationStatus;
  notes?: string;
  updatedAt: string;
}

export interface RawChartData {
  fileFormat: '.chart' | '.mid' | '.ini' | '.zip';
  rawContent: string | ArrayBuffer | Uint8Array;
  charter?: string;
  resolution?: number;
  extractedMetadata?: Record<string, string | number>;
}

export interface RockChartImportResult {
  songId: string;
  title: string;
  artist: string;
  bpm: number;
  durationSec: number;
  originalRawData: RawChartData;
  derivedCharts: BeatmapByDifficulty;
  difficultiesPresent: Difficulty[];
  hasChords: boolean;
  hasSustains: boolean;
  totalNotesPerDifficulty: Record<Difficulty, number>;
  sourceProvider: ChartSourceProviderId;
  importTimestamp: string;
}

export interface StructuralValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  duplicateNotesCount: number;
  outOfDurationCount: number;
  invalidLanesCount: number;
  negativeTimeCount: number;
  excessiveChordSizeCount: number;
}

export interface TemporalValidation {
  valid: boolean;
  tempoMapPointsCount: number;
  abruptBpmChangesCount: number;
  monotonicTimeGuaranteed: boolean;
  driftRatePerSec: number;
}

export interface MusicalAccuracyValidation {
  hasCertifiedGroundTruth: boolean;
  groundTruthSource: string;
  precision: number;
  recall: number;
  f1Score: number;
  averageTimeDiffMs: number;
  status: 'CERTIFIED_90_PLUS' | 'UNCERTIFIED_EVALUATION' | 'NO_INDEPENDENT_REFERENCE';
  isCircularValidationBlocked: boolean;
}

export interface RockChartValidationReport {
  songId: string;
  overallStatus: ValidationStatus;
  structural: StructuralValidation;
  temporal: TemporalValidation;
  musicalAccuracy: MusicalAccuracyValidation;
  summary: string;
  readyForCatalog: boolean;
  evaluatedAt: string;
}

export interface AdminCredentials {
  email: string;
  token?: string;
  sessionExpiry?: number;
  role: 'SUPER_ADMIN' | 'CATALOG_EDITOR' | 'USER';
}
