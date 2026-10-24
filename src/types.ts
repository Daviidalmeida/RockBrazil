export type Lane = 0 | 1 | 2 | 3 | 4;

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';

export function getLanesForDifficulty(diff: Difficulty): Lane[] {
  switch (diff) {
    case 'EASY':
      return [0, 1, 2];
    case 'MEDIUM':
      return [0, 1, 2, 3];
    case 'HARD':
    case 'EXPERT':
    default:
      return [0, 1, 2, 3, 4];
  }
}

export type HitJudgment = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export interface Note {
  id: number;
  time: number; // Seconds relative to song start
  lane: Lane;
  duration: number; // 0 for tap, > 0 for sustain
  hit: boolean;
  missed: boolean;
  sustainCompleted: boolean;
  sustainHeldTime: number;
  judgment?: HitJudgment;
}

export interface HitResult {
  lane: Lane;
  judgment: HitJudgment;
  scoreGained: number;
  combo: number;
  multiplier: number;
  timeDiff: number;
  isSustainTick?: boolean;
}

export enum GameState {
  MENU = 'MENU',
  SONG_SELECT = 'SONG_SELECT',
  HOW_TO_PLAY = 'HOW_TO_PLAY',
  SETTINGS = 'SETTINGS',
  NOTE_EDITOR = 'NOTE_EDITOR',
  COUNTDOWN = 'COUNTDOWN',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
  RESULTS = 'RESULTS'
}

export interface GameStats {
  score: number;
  combo: number;
  maxCombo: number;
  multiplier: number;
  rockMeter: number; // 0 to 100
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  missCount: number;
  totalNotes: number;
  stars?: number;
  accuracy?: number;
}

export interface SongRecord {
  // Legacy aliases for backwards compatibility
  score: number;
  stars: number;
  accuracy: number;
  maxCombo: number;

  // V5.3 Enhanced Personal Record Fields
  bestScore: number;
  lastScore: number;
  bestStars: number;
  lastStars: number;
  bestMaxCombo: number;
  lastMaxCombo: number;
  bestAccuracy: number;
  lastAccuracy: number;
  bestDate: number;
  lastDate: number;
  playCount: number;
}

export interface SongMetadata {
  id: string;
  title: string;
  artist: string;
  duration: number; // Seconds
  bpm: number;
  style: string;
  type: 'procedural' | 'audio-file' | 'youtube';
  proceduralTrackId?: string;
  audioUrl?: string;
  audioBuffer?: AudioBuffer;
  requiresFile?: string; // e.g. "TNT.mp3"
  isAvailable: boolean;
  records: Record<Difficulty, SongRecord | null>;

  // V5.4 YouTube & Official Catalog Integration
  group?: number | 'bonus';
  encore?: boolean;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  youtubeChannel?: string;
  youtubeDuration?: string;
  matchConfidence?: number;
  embeddingStatus?: 'ELIGIBLE_OFFICIAL' | 'VERIFIED' | 'COMMUNITY';
  reviewStatus?: 'VERIFIED' | 'PENDING' | 'REJECTED';
  licenseStatus?: 'EMBED_ALLOWED' | 'EMBED_RESTRICTED';
  chartStatus?: 'SMART_CHART_READY' | 'CUSTOM' | 'MIDI';
}

export interface GameSettings {
  musicVolume: number; // 0.0 to 1.0
  sfxVolume: number;   // 0.0 to 1.0
  audioOffsetMs: number; // -200 to +200 ms
  noteSpeedMultiplier: number; // 0.8 to 2.0
  visualEffectsEnabled: boolean;
}

export type BeatmapByDifficulty = Record<Difficulty, Note[]>;
