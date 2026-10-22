export type Lane = 0 | 1 | 2 | 3 | 4;

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';

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
  score: number;
  stars: number;
  accuracy: number;
  maxCombo: number;
}

export interface SongMetadata {
  id: string;
  title: string;
  artist: string;
  duration: number; // Seconds
  bpm: number;
  style: string;
  type: 'procedural' | 'audio-file';
  proceduralTrackId?: string;
  audioUrl?: string;
  audioBuffer?: AudioBuffer;
  requiresFile?: string; // e.g. "TNT.mp3"
  isAvailable: boolean;
  records: Record<Difficulty, SongRecord | null>;
}

export interface GameSettings {
  musicVolume: number; // 0.0 to 1.0
  sfxVolume: number;   // 0.0 to 1.0
  audioOffsetMs: number; // -200 to +200 ms
  noteSpeedMultiplier: number; // 0.8 to 2.0
  visualEffectsEnabled: boolean;
}

export type BeatmapByDifficulty = Record<Difficulty, Note[]>;
