import { Note, HitJudgment } from '../../types';

export interface NoteAlignmentTelemetry {
  noteId: number;
  lane: number;
  noteTimestamp: number;
  currentMusicalTime: number;
  judgmentTime: number;
  rendererTime: number;
  visualY: number;
  receptorY: number;
  distanceToLinePx: number;
  timeUntilHitMs: number;
  judgmentResult: string;
  isCrossingLine: boolean;
  isWithinJudgmentWindow: boolean;
  alignmentErrorMs: number;
}

export interface HighwaySyncSummary {
  totalRecorded: number;
  alignedAtStrikeCount: number;
  maxDistanceAtHitPx: number;
  meanDistanceAtHitPx: number;
  maxTimeErrorMs: number;
  singleClockConfirmed: boolean;
}

/**
 * ROCKBRAZIL V14.2 — HIGHWAY SYNC DIAGNOSTICS
 *
 * Instrumentação de desenvolvimento para validação de alinhamento entre
 * a esteira visual (GameRenderer) e o motor de julgamento (GameEngine).
 *
 * Exclusivo para ambiente de teste e desenvolvimento.
 * NUNCA exibido aos jogadores normais durante gameplay comum.
 */
export class HighwaySyncDiagnostics {
  private static instance: HighwaySyncDiagnostics;
  private isEnabled = false;
  private logs: NoteAlignmentTelemetry[] = [];
  private readonly maxLogs = 500;

  public static get(): HighwaySyncDiagnostics {
    if (!HighwaySyncDiagnostics.instance) {
      HighwaySyncDiagnostics.instance = new HighwaySyncDiagnostics();
    }
    return HighwaySyncDiagnostics.instance;
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  public get isActive(): boolean {
    return this.isEnabled;
  }

  public clear(): void {
    this.logs = [];
  }

  /**
   * Registra a telemetria precisa de uma nota observada no frame atual
   */
  public recordNoteObservation(
    note: Note,
    currentMusicalTime: number,
    judgmentTime: number,
    rendererTime: number,
    visualY: number,
    receptorY: number,
    judgmentResult: HitJudgment | 'PENDING' = 'PENDING'
  ): void {
    if (!this.isEnabled) return;

    const timeUntilHitMs = (note.time - currentMusicalTime) * 1000;
    const distanceToLinePx = visualY - receptorY;
    const alignmentErrorMs = Math.abs(rendererTime - judgmentTime) * 1000;
    const isCrossingLine = Math.abs(distanceToLinePx) <= 1.5;
    const isWithinJudgmentWindow = Math.abs(timeUntilHitMs) <= 140; // max window (MEDIUM/GOOD)

    const telemetry: NoteAlignmentTelemetry = {
      noteId: note.id,
      lane: note.lane,
      noteTimestamp: Number(note.time.toFixed(4)),
      currentMusicalTime: Number(currentMusicalTime.toFixed(4)),
      judgmentTime: Number(judgmentTime.toFixed(4)),
      rendererTime: Number(rendererTime.toFixed(4)),
      visualY: Number(visualY.toFixed(2)),
      receptorY: Number(receptorY.toFixed(2)),
      distanceToLinePx: Number(distanceToLinePx.toFixed(2)),
      timeUntilHitMs: Number(timeUntilHitMs.toFixed(2)),
      judgmentResult,
      isCrossingLine,
      isWithinJudgmentWindow,
      alignmentErrorMs: Number(alignmentErrorMs.toFixed(3))
    };

    this.logs.push(telemetry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  public getRecentLogs(limit = 50): NoteAlignmentTelemetry[] {
    return this.logs.slice(-limit);
  }

  public getSummary(): HighwaySyncSummary {
    if (this.logs.length === 0) {
      return {
        totalRecorded: 0,
        alignedAtStrikeCount: 0,
        maxDistanceAtHitPx: 0,
        meanDistanceAtHitPx: 0,
        maxTimeErrorMs: 0,
        singleClockConfirmed: true
      };
    }

    let maxDist = 0;
    let distSum = 0;
    let maxTimeErr = 0;
    let hitCount = 0;
    let alignedAtStrikeCount = 0;

    for (const log of this.logs) {
      maxTimeErr = Math.max(maxTimeErr, log.alignmentErrorMs);
      if (log.isCrossingLine) {
        alignedAtStrikeCount++;
      }
      if (log.judgmentResult !== 'PENDING') {
        hitCount++;
        const absDist = Math.abs(log.distanceToLinePx);
        distSum += absDist;
        if (absDist > maxDist) maxDist = absDist;
      }
    }

    return {
      totalRecorded: this.logs.length,
      alignedAtStrikeCount,
      maxDistanceAtHitPx: Number(maxDist.toFixed(2)),
      meanDistanceAtHitPx: hitCount > 0 ? Number((distSum / hitCount).toFixed(2)) : 0,
      maxTimeErrorMs: Number(maxTimeErr.toFixed(3)),
      singleClockConfirmed: maxTimeErr < 0.001
    };
  }
}
