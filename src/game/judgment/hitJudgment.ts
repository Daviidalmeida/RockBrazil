import { Note, Lane, HitJudgment, HitResult, GameStats, Difficulty, GameSettings } from '../../types';
import { ChartTimeline } from '../timeline/chartTimeline';

export interface JudgmentWindows {
  perfect: number;
  great: number;
  good: number;
}

export interface LifeRates {
  gain: number;
  loss: number;
}

/**
 * ROCKBRAZIL BETA V6 — HIT JUDGMENT SYSTEM
 * Evaluates player inputs against chart timestamps on the unified musical timeline.
 * - Precision windows adapted by difficulty (PERFECT, GREAT, GOOD, MISS).
 * - Multiplier and combo escalation.
 * - Industrial Rock Performance Meter (0% to 100%).
 * - Zero frame stalls or loop blocking.
 */
export class HitJudgmentSystem {
  private chartTimeline: ChartTimeline;
  private difficulty: Difficulty = 'MEDIUM';
  private settings: GameSettings;

  // Stats
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private rockMeter = 50; // starts at 50%
  private perfectCount = 0;
  private greatCount = 0;
  private goodCount = 0;
  private missCount = 0;
  private isDead = false;
  private lastSustainTickTime = 0;

  // Callbacks
  public onHit?: (result: HitResult) => void;
  public onMiss?: (lane: Lane, note: Note) => void;
  public onSustainTick?: (lane: Lane, scoreGained: number) => void;
  public onGameOver?: (stats: GameStats) => void;

  constructor(chartTimeline: ChartTimeline, difficulty: Difficulty = 'MEDIUM', settings: GameSettings) {
    this.chartTimeline = chartTimeline;
    this.difficulty = difficulty;
    this.settings = settings;
    this.reset();
  }

  public getWindows(): JudgmentWindows {
    switch (this.difficulty) {
      case 'EASY':
        return { perfect: 0.080, great: 0.140, good: 0.200 };
      case 'MEDIUM':
        return { perfect: 0.065, great: 0.110, good: 0.160 };
      case 'HARD':
        return { perfect: 0.045, great: 0.090, good: 0.140 };
      case 'EXPERT':
        return { perfect: 0.040, great: 0.075, good: 0.120 };
      default:
        return { perfect: 0.050, great: 0.090, good: 0.140 };
    }
  }

  public getLifeRates(): LifeRates {
    switch (this.difficulty) {
      case 'EASY':
        return { gain: 3.5, loss: 4.0 };
      case 'MEDIUM':
        return { gain: 2.8, loss: 5.5 };
      case 'HARD':
        return { gain: 2.2, loss: 7.0 };
      case 'EXPERT':
        return { gain: 1.8, loss: 8.5 };
      default:
        return { gain: 2.5, loss: 6.0 };
    }
  }

  public getMultiplier(): number {
    if (this.combo >= 30) return 4;
    if (this.combo >= 20) return 3;
    if (this.combo >= 10) return 2;
    return 1;
  }

  public judgeLanePress(lane: Lane, musicTime: number): HitResult | null {
    if (this.isDead) return null;

    const windows = this.getWindows();
    const candidate = this.chartTimeline.findCandidateNote(lane, musicTime, windows.good);

    if (candidate) {
      const note = candidate.note;
      const diff = candidate.diff;
      const rates = this.getLifeRates();

      let judgment: HitJudgment = 'GOOD';
      let baseScore = 50;

      if (diff <= windows.perfect) {
        judgment = 'PERFECT';
        baseScore = 100;
        this.perfectCount++;
        this.rockMeter = Math.min(100, this.rockMeter + rates.gain);
      } else if (diff <= windows.great) {
        judgment = 'GREAT';
        baseScore = 75;
        this.greatCount++;
        this.rockMeter = Math.min(100, this.rockMeter + rates.gain * 0.75);
      } else {
        judgment = 'GOOD';
        baseScore = 50;
        this.goodCount++;
        this.rockMeter = Math.min(100, this.rockMeter + rates.gain * 0.4);
      }

      note.hit = true;
      note.judgment = judgment;

      this.combo++;
      if (this.combo > this.maxCombo) {
        this.maxCombo = this.combo;
      }
      const multiplier = this.getMultiplier();
      const scoreGained = baseScore * multiplier;
      this.score += scoreGained;

      const result: HitResult = {
        lane,
        judgment,
        scoreGained,
        combo: this.combo,
        multiplier,
        timeDiff: diff
      };

      if (this.onHit) {
        this.onHit(result);
      }

      return result;
    }

    return null;
  }

  public handleLaneRelease(lane: Lane, musicTime: number): void {
    const notes = this.chartTimeline.getNotesByLane(lane);
    for (const note of notes) {
      if (note.hit && note.duration > 0 && !note.sustainCompleted && musicTime >= note.time) {
        note.sustainCompleted = true;
      }
    }
  }

  /**
   * Per-frame update for checking missed notes and advancing sustains.
   */
  public update(musicTime: number, activePressedLanes: Set<Lane>): void {
    if (this.isDead) return;

    const windows = this.getWindows();
    const rates = this.getLifeRates();

    // 1. Check for missed notes within active window
    const activeNotes = this.chartTimeline.getNotesInWindow(musicTime, 0.5, windows.good + 0.1);
    for (const note of activeNotes) {
      if (!note.hit && !note.missed && musicTime > note.time + windows.good) {
        note.missed = true;
        note.judgment = 'MISS';
        this.combo = 0;
        this.missCount++;
        this.rockMeter = Math.max(0, this.rockMeter - rates.loss);

        if (this.onMiss) {
          this.onMiss(note.lane, note);
        }

        if (this.rockMeter <= 0) {
          this.isDead = true;
          this.rockMeter = 0;
          if (this.onGameOver) {
            this.onGameOver(this.getStats());
          }
          return;
        }
      }
    }

    // 2. Sustain notes tracking
    const SUSTAIN_TICK_INTERVAL = 0.08;
    if (musicTime - this.lastSustainTickTime >= SUSTAIN_TICK_INTERVAL) {
      this.lastSustainTickTime = musicTime;

      for (const note of activeNotes) {
        if (note.hit && note.duration > 0 && !note.sustainCompleted) {
          const sustainEnd = note.time + note.duration;

          if (activePressedLanes.has(note.lane) && musicTime <= sustainEnd) {
            const multiplier = this.getMultiplier();
            const tickScore = 15 * multiplier;
            this.score += tickScore;
            this.rockMeter = Math.min(100, this.rockMeter + 0.6);

            if (this.onSustainTick) {
              this.onSustainTick(note.lane, tickScore);
            }
          }

          if (musicTime >= sustainEnd) {
            note.sustainCompleted = true;
          }
        }
      }
    }
  }

  public getStats(): GameStats {
    const totalNotes = this.chartTimeline.getTotalNotesCount();
    const hits = this.perfectCount + this.greatCount + this.goodCount;
    const accuracy = totalNotes > 0 ? (hits / totalNotes) * 100 : 100;

    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      multiplier: this.getMultiplier(),
      rockMeter: this.rockMeter,
      perfectCount: this.perfectCount,
      greatCount: this.greatCount,
      goodCount: this.goodCount,
      missCount: this.missCount,
      totalNotes,
      accuracy: Math.round(accuracy * 10) / 10
    };
  }

  public isAlive(): boolean {
    return !this.isDead;
  }

  public reset(difficulty: Difficulty = this.difficulty): void {
    this.difficulty = difficulty;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.rockMeter = 50;
    this.perfectCount = 0;
    this.greatCount = 0;
    this.goodCount = 0;
    this.missCount = 0;
    this.isDead = false;
    this.lastSustainTickTime = 0;
  }
}
