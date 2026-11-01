import {
  RockChartValidationReport,
  StructuralValidation,
  TemporalValidation,
  MusicalAccuracyValidation,
  ValidationStatus
} from '../types';
import { Difficulty, Note } from '../../../types';
import { IndependentGroundTruthRepository } from '../../intelligence/independentGroundTruthRepository';
import { MusicAccuracyValidator } from '../../intelligence/musicAccuracyValidator';

export class RockChartValidator {
  /**
   * Validação isolada da estrutura de notas (pistas, timestamps, acordes, limites)
   */
  public static validateBeatmapStructure(
    notes: Note[],
    difficulty: Difficulty = 'EXPERT',
    durationSec = 9999
  ): { isValid: boolean; errors: string[]; warnings: string[] } {
    const result = this.validateStructural(difficulty, notes, durationSec);
    return {
      isValid: result.valid,
      errors: result.errors,
      warnings: result.warnings
    };
  }

  /**
   * Executa a auditoria completa do chart dividida estritamente em:
   * 1. Validação Estrutural
   * 2. Validação Temporal
   * 3. Validação Musical Independente (sem circularidade)
   */
  public static validate(
    songId: string,
    difficulty: Difficulty,
    notes: Note[],
    durationSec: number,
    tempoMap?: { tick: number; bpm: number; timeSec?: number }[]
  ): RockChartValidationReport {
    const structural = this.validateStructural(difficulty, notes, durationSec);
    const temporal = this.validateTemporal(notes, tempoMap);
    const musicalAccuracy = this.validateMusicalAccuracy(songId, difficulty, notes);

    let overallStatus: ValidationStatus = 'AUTO_MATCHED';
    let readyForCatalog = true;

    if (!structural.valid || !temporal.valid) {
      overallStatus = 'INCOMPATIBLE';
      readyForCatalog = false;
    } else if (musicalAccuracy.status === 'CERTIFIED_90_PLUS') {
      overallStatus = 'VERIFIED';
      readyForCatalog = true;
    } else if (structural.warnings.length > 0 || temporal.abruptBpmChangesCount > 0) {
      overallStatus = 'NEEDS_REVIEW';
      readyForCatalog = false;
    }

    const summary = `Status: ${overallStatus} | Notas: ${notes.length} | Estrutural: ${structural.valid ? 'OK' : 'FALHA'} | Temporal: ${temporal.valid ? 'OK' : 'FALHA'} | Musical: ${musicalAccuracy.status}`;

    return {
      songId,
      overallStatus,
      structural,
      temporal,
      musicalAccuracy,
      summary,
      readyForCatalog,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * 1. VALIDAÇÃO ESTRUTURAL
   */
  private static validateStructural(
    difficulty: Difficulty,
    notes: Note[],
    durationSec: number
  ): StructuralValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    let duplicateNotesCount = 0;
    let outOfDurationCount = 0;
    let invalidLanesCount = 0;
    let negativeTimeCount = 0;
    let excessiveChordSizeCount = 0;

    const maxAllowedLane = difficulty === 'EASY' ? 2 : (difficulty === 'MEDIUM' ? 3 : 4);
    const maxChordNotes = difficulty === 'EASY' || difficulty === 'MEDIUM' ? 3 : 4;

    const seenLaneTime = new Set<string>();
    const chordSizeMap = new Map<number, number>();

    if (notes.length === 0) {
      errors.push(`O chart não contém nenhuma nota jogável para a dificuldade ${difficulty}.`);
    }

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];

      // Tempo negativo
      if (n.time < 0) {
        negativeTimeCount++;
        errors.push(`Nota #${n.id} com timestamp negativo: ${n.time}s`);
      }

      // Fora da duração
      if (durationSec > 0 && n.time > durationSec + 5.0) {
        outOfDurationCount++;
        errors.push(`Nota #${n.id} ultrapassa duração informada: ${n.time}s > ${durationSec}s`);
      }

      // Pista inválida
      if (n.lane < 0 || n.lane > maxAllowedLane) {
        invalidLanesCount++;
        errors.push(`Pista inválida para ${difficulty} na nota #${n.id ?? i}: ${n.lane} (máximo permitido: ${maxAllowedLane})`);
      }

      // Duplicata exata na mesma pista e timestamp (tolerância 5ms)
      const key = `${n.lane}_${Math.round(n.time * 200) / 200}`;
      if (seenLaneTime.has(key)) {
        duplicateNotesCount++;
        errors.push(`Evento duplicado na pista ${n.lane} no timestamp ${n.time}s`);
      }
      seenLaneTime.add(key);

      // Tamanho de acordes
      const chordBucket = Math.round(n.time * 40) / 40;
      const count = (chordSizeMap.get(chordBucket) || 0) + 1;
      chordSizeMap.set(chordBucket, count);
      if (count > maxChordNotes) {
        excessiveChordSizeCount++;
      }

      // Ordem cronológica
      if (i > 0 && n.time < notes[i - 1].time) {
        errors.push(`Timestamp fora de ordem cronológica na posição #${i}: ${n.time}s < ${notes[i - 1].time}s`);
        warnings.push(`Notas fora de ordem cronológica detectadas na posição #${i}`);
      }
    }

    if (excessiveChordSizeCount > 0) {
      warnings.push(`Detectados acordes com mais de ${maxChordNotes} notas para a dificuldade ${difficulty}`);
    }

    const valid = errors.length === 0 && notes.length > 0;

    return {
      valid,
      errors,
      warnings,
      duplicateNotesCount,
      outOfDurationCount,
      invalidLanesCount,
      negativeTimeCount,
      excessiveChordSizeCount
    };
  }

  /**
   * 2. VALIDAÇÃO TEMPORAL
   */
  private static validateTemporal(
    notes: Note[],
    tempoMap?: { tick: number; bpm: number; timeSec?: number }[]
  ): TemporalValidation {
    let abruptBpmChangesCount = 0;
    let monotonicTimeGuaranteed = true;

    for (let i = 1; i < notes.length; i++) {
      if (notes[i].time < notes[i - 1].time) {
        monotonicTimeGuaranteed = false;
        break;
      }
    }

    const pointsCount = tempoMap?.length || 1;
    if (tempoMap && tempoMap.length > 1) {
      for (let i = 1; i < tempoMap.length; i++) {
        const prev = tempoMap[i - 1].bpm;
        const curr = tempoMap[i].bpm;
        if (prev > 0) {
          const ratio = Math.abs(curr - prev) / prev;
          if (ratio > 0.6) {
            abruptBpmChangesCount++;
          }
        }
      }
    }

    const valid = monotonicTimeGuaranteed && abruptBpmChangesCount === 0;

    return {
      valid,
      tempoMapPointsCount: pointsCount,
      abruptBpmChangesCount,
      monotonicTimeGuaranteed,
      driftRatePerSec: 0
    };
  }

  /**
   * 3. VALIDAÇÃO MUSICAL INDEPENDENTE
   */
  private static validateMusicalAccuracy(
    songId: string,
    difficulty: Difficulty,
    notes: Note[]
  ): MusicalAccuracyValidation {
    const record = IndependentGroundTruthRepository.getRecord(songId, difficulty);

    if (!record) {
      return {
        hasCertifiedGroundTruth: false,
        groundTruthSource: 'Nenhuma referência externa independente certificada disponível.',
        precision: 0,
        recall: 0,
        f1Score: 0,
        averageTimeDiffMs: 0,
        status: 'NO_INDEPENDENT_REFERENCE',
        isCircularValidationBlocked: false
      };
    }

    const evalResult = MusicAccuracyValidator.evaluateChartAccuracy(songId, difficulty, notes, null, record);

    if (evalResult.status === 'CIRCULAR_VALIDATION_REJECTED') {
      return {
        hasCertifiedGroundTruth: false,
        groundTruthSource: 'Validação circular bloqueada: O chart não pode ser comparado contra si mesmo.',
        precision: 0,
        recall: 0,
        f1Score: 0,
        averageTimeDiffMs: 0,
        status: 'UNCERTIFIED_EVALUATION',
        isCircularValidationBlocked: true
      };
    }

    const isCertified = evalResult.f1 >= 0.90 && evalResult.status === 'VERIFIED_90_PLUS';

    return {
      hasCertifiedGroundTruth: true,
      groundTruthSource: evalResult.provenanceDescription || evalResult.details || 'Repositório de Ground Truth Independente',
      precision: Math.round(evalResult.precision * 1000) / 1000,
      recall: Math.round(evalResult.recall * 1000) / 1000,
      f1Score: Math.round(evalResult.f1 * 1000) / 1000,
      averageTimeDiffMs: Math.round(evalResult.medianErrorMs),
      status: isCertified ? 'CERTIFIED_90_PLUS' : 'UNCERTIFIED_EVALUATION',
      isCircularValidationBlocked: false
    };
  }
}
