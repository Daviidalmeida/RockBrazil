import { Note, Lane, HitJudgment, HitResult, GameStats, Difficulty, GameSettings } from '../types';
import { ChartTimeline } from './timeline/chartTimeline';

export class GameEngine {
  private notes: Note[] = [];
  private activePressedLanes: Set<Lane> = new Set();
  private lastSustainTickTime = 0;
  private activeNoteStartIndex = 0;
  private difficulty: Difficulty = 'MEDIUM';
  private settings: GameSettings;
  private chartTimeline: ChartTimeline = new ChartTimeline([], 'MEDIUM');

  // Game Statistics
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private rockMeter = 50; // starts at 50%
  private perfectCount = 0;
  private greatCount = 0;
  private goodCount = 0;
  private missCount = 0;
  private extraPressCount = 0;
  private isDead = false;

  // Event callbacks
  public onHit?: (result: HitResult) => void;
  public onMiss?: (lane: Lane, note: Note) => void;
  public onSustainTick?: (lane: Lane, scoreGained: number) => void;
  public onGameOver?: (stats: GameStats) => void;
  public onMuteRequested?: (muted: boolean) => void;

  constructor(notes: Note[], difficulty: Difficulty = 'MEDIUM', settings: GameSettings) {
    this.difficulty = difficulty;
    this.settings = settings;
    this.reset(notes, difficulty);
  }

  updateSettings(settings: GameSettings): void {
    this.settings = settings;
  }

  reset(notes: Note[], difficulty: Difficulty = this.difficulty): void {
    this.notes = notes.map((n) => ({
      ...n,
      hit: false,
      missed: false,
      sustainCompleted: false,
      sustainHeldTime: 0
    }));
    this.difficulty = difficulty;
    this.activePressedLanes.clear();
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.extraPressCount = 0;
    this.rockMeter = 50; // Initial 50% life
    this.perfectCount = 0;
    this.greatCount = 0;
    this.goodCount = 0;
    this.missCount = 0;
    this.isDead = false;
    this.lastSustainTickTime = 0;
    this.activeNoteStartIndex = 0;
    if (this.settings.muteOnMiss) {
      this.onMuteRequested?.(false);
    }
    this.chartTimeline.loadNotes(this.notes, difficulty);
  }

  public getChartTimeline(): ChartTimeline {
    return this.chartTimeline;
  }

  /**
   * Returns true if there are still notes that have not been hit or missed
   */
  getLastNoteEndTime(): number {
    if (this.notes.length === 0) return 0;
    let maxTime = 0;
    for (const note of this.notes) {
      const end = note.time + (note.duration || 0);
      if (end > maxTime) maxTime = end;
    }
    return maxTime;
  }

  /**
   * Força a conclusão de todas as notas pendentes quando o áudio termina,
   * garantindo que a precisão e pontuação sejam consolidadas sem travar o jogo.
   */
  forceCompleteAllPendingNotes(finalTime?: number): void {
    const time = finalTime !== undefined ? finalTime : this.getLastNoteEndTime() + 0.5;
    for (const note of this.notes) {
      if (!note.hit && !note.missed) {
        note.missed = true;
        note.judgment = 'MISS';
        this.missCount++;
      }
      if (note.hit && note.duration > 0 && !note.sustainCompleted) {
        note.sustainCompleted = true;
      }
    }
    this.combo = 0;
    this.activeNoteStartIndex = this.notes.length;
  }

  hasPendingNotes(rawCurrentTime: number): boolean {
    const currentTime = this.adjustTime(rawCurrentTime);
    const windows = this.getWindows();
    return this.notes.some((n) => {
      if (!n.hit && !n.missed && currentTime <= n.time + windows.good) return true;
      if (n.hit && n.duration > 0 && !n.sustainCompleted && currentTime < n.time + n.duration) return true;
      return false;
    });
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

  getHitsCount(): number {
    return this.perfectCount + this.greatCount + this.goodCount;
  }

  getMissCount(): number {
    return this.missCount;
  }

  /**
   * FASE 5 — Novo Cálculo Oficial de Precisão V12:
   * Precisão = (Acertos / Total de notas julgáveis) × 100
   * Onde Total de notas julgáveis = Acertos + Erros
   *
   * Se o jogador acertar todas as notas julgáveis, a precisão é 100%,
   * independentemente da classificação interna (Bom, Ótimo ou Perfeito).
   * Sem divisão por zero: músicas sem notas julgáveis retornam 0%.
   */
  getAccuracy(): number {
    const hits = this.getHitsCount();
    const total = hits + this.missCount + this.extraPressCount;
    if (total === 0) return 0;
    return Math.max(0, Math.round((hits / total) * 100));
  }

  /**
   * Precisão ponderada interna preservada para distribuição justa de estrelas
   */
  private getWeightedPrecision(): number {
    const total = this.perfectCount + this.greatCount + this.goodCount + this.missCount + this.extraPressCount;
    if (total === 0) return 0;
    const weighted = this.perfectCount * 1.0 + this.greatCount * 0.75 + this.goodCount * 0.5;
    return Math.max(0, Math.round((weighted / total) * 100));
  }

  calculateStars(): number {
    const weightedAcc = this.getWeightedPrecision();
    if (weightedAcc >= 95) return 5;
    if (weightedAcc >= 85) return 4;
    if (weightedAcc >= 70) return 3;
    if (weightedAcc >= 55) return 2;
    return 1;
  }

  getStats(): GameStats {
    const hits = this.getHitsCount();
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
      extraPressCount: this.extraPressCount,
      totalNotes: this.notes.length,
      stars: this.calculateStars(),
      accuracy: this.getAccuracy(),
      hitsCount: hits,
      playableNotesCount: hits + this.missCount + this.extraPressCount
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

    for (let i = this.activeNoteStartIndex; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.time > currentTime + windows.good) {
        break;
      }
      if (note.lane === lane && !note.hit && !note.missed) {
        const diff = Math.abs(currentTime - note.time);
        const isEarlyStartup = note.time <= 0.35 && currentTime <= 0.35;
        if ((diff <= windows.good || isEarlyStartup) && diff < minDiff) {
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

      while (
        this.activeNoteStartIndex < this.notes.length &&
        (this.notes[this.activeNoteStartIndex].hit || this.notes[this.activeNoteStartIndex].missed) &&
        (!this.notes[this.activeNoteStartIndex].duration || this.notes[this.activeNoteStartIndex].sustainCompleted)
      ) {
        this.activeNoteStartIndex++;
      }

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

      if (this.settings.muteOnMiss) {
        this.onMuteRequested?.(false);
      }

      return result;
    }

    // V13.7: Penalização de toque incorreto / entrada extra sem nota na pista
    this.extraPressCount++;
    this.combo = 0; // Quebra o combo imediatamente
    this.rockMeter = Math.max(0, this.rockMeter - rates.loss * 0.5);

    if (this.settings.muteOnMiss) {
      this.onMuteRequested?.(true);
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

    // Advance active note pointer past notes that are fully completed
    while (
      this.activeNoteStartIndex < this.notes.length &&
      (this.notes[this.activeNoteStartIndex].hit || this.notes[this.activeNoteStartIndex].missed) &&
      (!this.notes[this.activeNoteStartIndex].duration ||
        this.notes[this.activeNoteStartIndex].sustainCompleted ||
        currentTime > this.notes[this.activeNoteStartIndex].time + this.notes[this.activeNoteStartIndex].duration + 0.2)
    ) {
      this.activeNoteStartIndex++;
    }

    // 1. Check for missed notes
    for (let i = this.activeNoteStartIndex; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.time > currentTime + windows.good) {
        break;
      }
      // V8 Startup Grace: early notes (time <= 0.35s) cannot be missed before 0.40s,
      // giving the player reaction time after playback starts without an auto-miss from startup latency
      const missThreshold = note.time <= 0.35 ? Math.max(note.time + windows.good, 0.40) : note.time + windows.good;

      if (!note.hit && !note.missed && currentTime > missThreshold) {
        note.missed = true;
        note.judgment = 'MISS';
        this.combo = 0;
        this.missCount++;
        this.rockMeter = Math.max(0, this.rockMeter - rates.loss);

        if (this.onMiss) {
          this.onMiss(note.lane, note);
        }

        if (this.settings.muteOnMiss) {
          this.onMuteRequested?.(true);
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
