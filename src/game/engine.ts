import { Note, Lane, HitJudgment, HitResult, GameStats, Difficulty, GameSettings } from '../types';

export class GameEngine {
  private notes: Note[] = [];
  private activePressedLanes: Set<Lane> = new Set();
  private lastSustainTickTime = 0;
  private difficulty: Difficulty = 'MEDIUM';
  private settings: GameSettings;

  // Game Statistics
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private rockMeter = 50; // starts at 50%
  private perfectCount = 0;
  private greatCount = 0;
  private goodCount = 0;
  private missCount = 0;
  private isDead = false;

  // Event callbacks
  public onHit?: (result: HitResult) => void;
  public onMiss?: (lane: Lane, note: Note) => void;
  public onSustainTick?: (lane: Lane, scoreGained: number) => void;
  public onGameOver?: (stats: GameStats) => void;

  constructor(notes: Note[], difficulty: Difficulty = 'MEDIUM', settings: GameSettings) {
    this.difficulty = difficulty;
    this.settings = settings;
    this.reset(notes, difficulty);
  }

  updateSettings(settings: GameSettings): void {
    this.settings = settings;
  }

  reset(notes: Note[], difficulty: Difficulty = this.difficulty): void {
    this.notes = notes.map((n) => ({ ...n }));
    this.difficulty = difficulty;
    this.activePressedLanes.clear();
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.rockMeter = 50; // Initial 50% life
    this.perfectCount = 0;
    this.greatCount = 0;
    this.goodCount = 0;
    this.missCount = 0;
    this.isDead = false;
    this.lastSustainTickTime = 0;
  }

  // Timing windows based on difficulty
  private getWindows(): { perfect: number; great: number; good: number } {
    switch (this.difficulty) {
      case 'EASY':
        return { perfect: 0.060, great: 0.120, good: 0.180 };
      case 'HARD':
        return { perfect: 0.035, great: 0.070, good: 0.100 };
      case 'EXPERT':
        return { perfect: 0.025, great: 0.050, good: 0.075 };
      case 'MEDIUM':
      default:
        return { perfect: 0.045, great: 0.090, good: 0.140 };
    }
  }

  // Life gain/loss rates scaled by difficulty
  private getLifeRates(): { gain: number; loss: number } {
    switch (this.difficulty) {
      case 'EASY':
        return { gain: 5.0, loss: 4.0 };
      case 'HARD':
        return { gain: 3.0, loss: 10.0 };
      case 'EXPERT':
        return { gain: 2.0, loss: 15.0 };
      case 'MEDIUM':
      default:
        return { gain: 4.0, loss: 7.0 };
    }
  }

  getMultiplier(): number {
    if (this.combo >= 30) return 4;
    if (this.combo >= 20) return 3;
    if (this.combo >= 10) return 2;
    return 1;
  }

  getAccuracy(): number {
    const total = this.perfectCount + this.greatCount + this.goodCount + this.missCount;
    if (total === 0) return 100;
    const weighted = this.perfectCount * 1.0 + this.greatCount * 0.75 + this.goodCount * 0.5;
    return Math.round((weighted / total) * 100);
  }

  calculateStars(): number {
    const acc = this.getAccuracy();
    if (acc >= 95) return 5;
    if (acc >= 85) return 4;
    if (acc >= 70) return 3;
    if (acc >= 55) return 2;
    return 1;
  }

  getStats(): GameStats {
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
      totalNotes: this.notes.length,
      stars: this.calculateStars(),
      accuracy: this.getAccuracy()
    };
  }

  getNotes(): Note[] {
    return this.notes;
  }

  isLanePressed(lane: Lane): boolean {
    return this.activePressedLanes.has(lane);
  }

  private adjustTime(rawTime: number): number {
    return rawTime - (this.settings.audioOffsetMs / 1000);
  }

  /**
   * Called when player presses a lane button
   */
  handleLanePress(lane: Lane, rawCurrentTime: number): HitResult | null {
    if (this.isDead) return null;
    this.activePressedLanes.add(lane);

    const currentTime = this.adjustTime(rawCurrentTime);
    const windows = this.getWindows();
    const rates = this.getLifeRates();

    let candidate: Note | null = null;
    let minDiff = Infinity;

    for (const note of this.notes) {
      if (note.lane === lane && !note.hit && !note.missed) {
        const diff = Math.abs(currentTime - note.time);
        if (diff <= windows.good && diff < minDiff) {
          minDiff = diff;
          candidate = note;
        }
      }
    }

    if (candidate) {
      let judgment: HitJudgment = 'GOOD';
      let baseScore = 50;

      if (minDiff <= windows.perfect) {
        judgment = 'PERFECT';
        baseScore = 100;
        this.perfectCount++;
        this.rockMeter = Math.min(100, this.rockMeter + rates.gain);
      } else if (minDiff <= windows.great) {
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

      candidate.hit = true;
      candidate.judgment = judgment;

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
        timeDiff: minDiff
      };

      if (this.onHit) {
        this.onHit(result);
      }

      return result;
    }

    return null;
  }

  handleLaneRelease(lane: Lane, rawCurrentTime: number): void {
    this.activePressedLanes.delete(lane);
    const currentTime = this.adjustTime(rawCurrentTime);

    for (const note of this.notes) {
      if (note.lane === lane && note.hit && note.duration > 0 && !note.sustainCompleted) {
        note.sustainCompleted = true;
      }
    }
  }

  /**
   * Main per-frame update loop
   */
  update(rawCurrentTime: number): void {
    if (this.isDead) return;

    const currentTime = this.adjustTime(rawCurrentTime);
    const windows = this.getWindows();
    const rates = this.getLifeRates();

    // 1. Check for missed notes
    for (const note of this.notes) {
      if (!note.hit && !note.missed && currentTime > note.time + windows.good) {
        note.missed = true;
        note.judgment = 'MISS';
        this.combo = 0;
        this.missCount++;
        this.rockMeter = Math.max(0, this.rockMeter - rates.loss);

        if (this.onMiss) {
          this.onMiss(note.lane, note);
        }

        // Check for Game Over (Life reaches 0)
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
    if (currentTime - this.lastSustainTickTime >= SUSTAIN_TICK_INTERVAL) {
      this.lastSustainTickTime = currentTime;

      for (const note of this.notes) {
        if (note.hit && note.duration > 0 && !note.sustainCompleted) {
          const sustainEnd = note.time + note.duration;

          if (this.activePressedLanes.has(note.lane) && currentTime <= sustainEnd) {
            const multiplier = this.getMultiplier();
            const tickScore = 15 * multiplier;
            this.score += tickScore;
            this.rockMeter = Math.min(100, this.rockMeter + 0.6);

            if (this.onSustainTick) {
              this.onSustainTick(note.lane, tickScore);
            }
          }

          if (currentTime >= sustainEnd) {
            note.sustainCompleted = true;
          }
        }
      }
    }
  }
}
