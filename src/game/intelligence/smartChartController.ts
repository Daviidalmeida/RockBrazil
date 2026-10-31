import { Difficulty, Note } from '../../types';
import { ChartIntelligenceValidator } from './chartIntelligenceValidator';
import { ChartIntegrityReport } from './types';

export class SmartChartController {
  private validatedCharts = new Map<string, { notes: Note[]; report: ChartIntegrityReport }>();

  /**
   * Validates and prepares chart notes before gameplay commences.
   */
  public prepareChart(
    songId: string,
    difficulty: Difficulty,
    rawNotes: Note[],
    songDurationSec?: number
  ): { notes: Note[]; report: ChartIntegrityReport } {
    const cacheKey = `${songId}_${difficulty}`;
    const cached = this.validatedCharts.get(cacheKey);

    if (cached && cached.notes.length === rawNotes.length) {
      return cached;
    }

    const { report, repairedNotes } = ChartIntelligenceValidator.validateAndRepair(
      rawNotes,
      difficulty,
      songDurationSec
    );

    const result = { notes: repairedNotes, report };
    this.validatedCharts.set(cacheKey, result);
    return result;
  }

  /**
   * Verifies coherence across the 4 difficulties for a given song.
   */
  public verifyDifficultyProgression(chartsByDiff: Record<Difficulty, Note[]>): {
    isCoherent: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    const easy = chartsByDiff.EASY || [];
    const medium = chartsByDiff.MEDIUM || [];
    const hard = chartsByDiff.HARD || [];
    const expert = chartsByDiff.EXPERT || [];

    // Monotonic note count progression check
    if (easy.length > 0 && medium.length > 0 && easy.length > medium.length) {
      issues.push(`Incoerência: Fácil (${easy.length}) tem mais notas que Médio (${medium.length}).`);
    }
    if (medium.length > 0 && hard.length > 0 && medium.length > hard.length) {
      issues.push(`Incoerência: Médio (${medium.length}) tem mais notas que Difícil (${hard.length}).`);
    }
    if (hard.length > 0 && expert.length > 0 && hard.length > expert.length) {
      issues.push(`Incoerência: Difícil (${hard.length}) tem mais notas que Expert (${expert.length}).`);
    }

    // Lane count verification
    for (const n of easy) {
      if (n.lane > 2) {
        issues.push(`Fácil contém nota na pista ${n.lane} (máximo permitido: 2).`);
        break;
      }
    }
    for (const n of medium) {
      if (n.lane > 3) {
        issues.push(`Médio contém nota na pista ${n.lane} (máximo permitido: 3).`);
        break;
      }
    }

    return {
      isCoherent: issues.length === 0,
      issues
    };
  }

  public clearCache(): void {
    this.validatedCharts.clear();
  }
}
