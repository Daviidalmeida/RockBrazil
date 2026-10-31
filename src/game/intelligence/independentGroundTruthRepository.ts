import { Difficulty, Note } from '../../types';
import { IndependentGroundTruthRecord, GroundTruthEvent } from './types';

export class IndependentGroundTruthRepository {
  private static records: Map<string, IndependentGroundTruthRecord> = new Map();

  /**
   * Generates a unique key for indexing references by song, difficulty, and recording
   */
  private static makeKey(songId: string, difficulty: Difficulty, recordingId?: string): string {
    return recordingId ? `${songId}_${difficulty}_${recordingId}` : `${songId}_${difficulty}`;
  }

  /**
   * Registers an independent ground truth reference record.
   * Enforces provenance metadata and validates that synthetic benchmarks are clearly labeled.
   */
  public static registerRecord(record: IndependentGroundTruthRecord): boolean {
    if (!record || !record.songId || !record.difficulty || !record.provenance) {
      return false;
    }

    // Must have a valid provenance declaration
    if (!record.provenance.authorOrLab || !record.provenance.method) {
      return false;
    }

    const key = this.makeKey(record.songId, record.difficulty, record.recordingId);
    this.records.set(key, record);

    // Also index without recordingId for fallback lookup
    const fallbackKey = this.makeKey(record.songId, record.difficulty);
    if (!this.records.has(fallbackKey)) {
      this.records.set(fallbackKey, record);
    }

    return true;
  }

  /**
   * Retrieves a ground truth record by songId and difficulty.
   */
  public static getRecord(
    songId: string,
    difficulty: Difficulty,
    recordingId?: string
  ): IndependentGroundTruthRecord | null {
    if (recordingId) {
      const specific = this.records.get(this.makeKey(songId, difficulty, recordingId));
      if (specific) return specific;
    }
    return this.records.get(this.makeKey(songId, difficulty)) || null;
  }

  /**
   * Checks whether an independent, certified ground truth dataset is available for a song.
   */
  public static hasCertifiedIndependentReference(songId: string, difficulty: Difficulty): boolean {
    const record = this.getRecord(songId, difficulty);
    return Boolean(
      record &&
      record.provenance.isIndependent &&
      !record.provenance.isSynthetic &&
      record.validationStatus === 'CERTIFIED'
    );
  }

  /**
   * Strictly evaluates if a reference is circular relative to the chart being validated.
   *
   * A reference is circular if:
   * 1. It shares the same array instance in memory (same reference pointer).
   * 2. Its provenance explicitly identifies it was generated from the chart itself.
   * 3. Its provenance flag `isIndependent` is false.
   * 4. Its `sourceChartIdToExclude` matches the target song and difficulty.
   */
  public static detectCircularValidation(
    songId: string,
    difficulty: Difficulty,
    chartNotes: Note[],
    record?: IndependentGroundTruthRecord | null,
    referenceEvents?: GroundTruthEvent[] | null
  ): { isCircular: boolean; reason?: string } {
    if (!referenceEvents && !record) {
      return { isCircular: false };
    }

    // Check 1: Memory reference pointer identity
    if (chartNotes && referenceEvents && (chartNotes as any) === (referenceEvents as any)) {
      return {
        isCircular: true,
        reason: 'Ponteiro de memória idêntico: o conjunto de referência é exatamente a mesma instância do chart avaliado.'
      };
    }

    if (record) {
      // Check 2: Flagged as non-independent in provenance
      if (record.provenance && record.provenance.isIndependent === false) {
        return {
          isCircular: true,
          reason: `Origem não-independente declarada na proveniência: "${record.provenance.datasetName}".`
        };
      }

      // Check 3: Explicit chart exclusion tag
      if (
        record.provenance &&
        record.provenance.sourceChartIdToExclude &&
        record.provenance.sourceChartIdToExclude === `${songId}_${difficulty}`
      ) {
        return {
          isCircular: true,
          reason: `Referência derivada diretamente do chart interno de "${songId}" (${difficulty}).`
        };
      }

      // Check 4: Source description warns of chart derivation
      if (
        record.sourceDescription &&
        record.sourceDescription.toLowerCase().includes('raw_international_charts')
      ) {
        return {
          isCircular: true,
          reason: 'A referência tem como fonte declarada RAW_INTERNATIONAL_CHARTS, gerando validação circular.'
        };
      }
    }

    return { isCircular: false };
  }

  /**
   * Resets repository records (primarily used in test environments).
   */
  public static clear(): void {
    this.records.clear();
  }
}
