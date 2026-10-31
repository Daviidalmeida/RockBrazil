import { Difficulty, Lane, Note } from '../../types';
import { ChartIntegrityReport } from './types';

export class ChartIntelligenceValidator {
  /**
   * Maximum allowed lane index per difficulty
   */
  public static readonly MAX_LANES_BY_DIFF: Record<Difficulty, Lane> = {
    EASY: 2,
    MEDIUM: 3,
    HARD: 4,
    EXPERT: 4
  };

  /**
   * Validates and performs non-destructive repair of a beatmap.
   * Preserves legitimate chords, corrects out-of-order timestamps,
   * clamps lane boundaries, and resolves redundant duplicates.
   */
  public static validateAndRepair(
    notes: Note[],
    difficulty: Difficulty,
    songDurationSec?: number
  ): { report: ChartIntegrityReport; repairedNotes: Note[]; originalBackup: Note[] } {
    const originalBackup = notes.map((n) => ({ ...n }));
    const issues: string[] = [];

    if (!notes || notes.length === 0) {
      return {
        report: {
          isValid: false,
          issues: ['Chart vazio: nenhuma nota fornecida.'],
          noteCount: 0,
          firstNoteTime: 0,
          lastNoteTime: 0,
          chordsCount: 0,
          sustainsCount: 0,
          maxDensityPerSecond: 0,
          suspiciousGapsCount: 0,
          duplicateNotesRemoved: 0,
          outOfOrderFixed: 0,
          invalidLanesFixed: 0
        },
        repairedNotes: [],
        originalBackup
      };
    }

    const maxLane = this.MAX_LANES_BY_DIFF[difficulty] ?? 4;
    let outOfOrderFixed = 0;
    let invalidLanesFixed = 0;
    let duplicateNotesRemoved = 0;

    // 1. Sort notes chronologically (stable sort preserving chord groupings)
    const sorted = [...notes].sort((a, b) => {
      if (Math.abs(a.time - b.time) < 0.001) {
        return a.lane - b.lane;
      }
      return a.time - b.time;
    });

    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].time > sorted[i + 1].time) {
        outOfOrderFixed++;
      }
    }

    // 2. Validate lane bounds and deduplicate identical (time + lane) collisions
    const cleanedNotes: Note[] = [];
    const seenMap = new Map<string, boolean>();

    for (let i = 0; i < sorted.length; i++) {
      const src = sorted[i];
      let lane = src.lane;

      if (lane < 0 || lane > maxLane) {
        invalidLanesFixed++;
        lane = Math.max(0, Math.min(maxLane, lane)) as Lane;
      }

      // Check duplicate on exact same timestamp & lane (< 20ms apart)
      const roundedTime = Math.round(src.time * 100) / 100;
      const key = `${roundedTime}_${lane}`;

      if (seenMap.has(key)) {
        duplicateNotesRemoved++;
        continue;
      }
      seenMap.set(key, true);

      // Normalize sustain duration
      let duration = src.duration ?? 0;
      if (duration < 0.05) {
        duration = 0;
      } else if (songDurationSec && src.time + duration > songDurationSec) {
        duration = Math.max(0, songDurationSec - src.time);
      }

      cleanedNotes.push({
        ...src,
        id: i + 1,
        time: Number(src.time.toFixed(3)),
        lane,
        duration: Number(duration.toFixed(3)),
        timeMs: Math.round(src.time * 1000),
        durationMs: Math.round(duration * 1000)
      });
    }

    // 3. Count chords and sustains
    const timeBuckets = new Map<number, number>();
    let sustainsCount = 0;

    for (const note of cleanedNotes) {
      const t = Math.round(note.time * 50) / 50; // 20ms quantization for chords
      timeBuckets.set(t, (timeBuckets.get(t) || 0) + 1);
      if (note.duration >= 0.05) {
        sustainsCount++;
      }
    }

    let chordsCount = 0;
    for (const count of timeBuckets.values()) {
      if (count > 1) chordsCount++;
    }

    // 4. Density analysis (max notes in any 1-second rolling window)
    let maxDensity = 0;
    let windowStart = 0;

    for (let i = 0; i < cleanedNotes.length; i++) {
      while (cleanedNotes[i].time - cleanedNotes[windowStart].time > 1.0) {
        windowStart++;
      }
      const density = i - windowStart + 1;
      if (density > maxDensity) maxDensity = density;
    }

    if (maxDensity > 25) {
      issues.push(`Densidade extrema detectada: pico de ${maxDensity} notas/segundo.`);
    }

    // 5. Gap analysis (> 45s between notes)
    let suspiciousGaps = 0;
    for (let i = 0; i < cleanedNotes.length - 1; i++) {
      const gap = cleanedNotes[i + 1].time - (cleanedNotes[i].time + cleanedNotes[i].duration);
      if (gap > 45) {
        suspiciousGaps++;
        issues.push(`Lacuna prolongada de ${gap.toFixed(1)}s detectada entre ${cleanedNotes[i].time.toFixed(1)}s e ${cleanedNotes[i + 1].time.toFixed(1)}s.`);
      }
    }

    const firstNoteTime = cleanedNotes.length > 0 ? cleanedNotes[0].time : 0;
    const lastNoteTime = cleanedNotes.length > 0 ? cleanedNotes[cleanedNotes.length - 1].time : 0;

    if (outOfOrderFixed > 0) issues.push(`Corrigidas ${outOfOrderFixed} notas fora de ordem cronológica.`);
    if (invalidLanesFixed > 0) issues.push(`Ajustadas ${invalidLanesFixed} notas com pistas incompatíveis com ${difficulty}.`);
    if (duplicateNotesRemoved > 0) issues.push(`Removidas ${duplicateNotesRemoved} notas duplicadas na mesma pista.`);

    const isValid = cleanedNotes.length > 0 && maxDensity <= 28;

    return {
      report: {
        isValid,
        issues,
        noteCount: cleanedNotes.length,
        firstNoteTime,
        lastNoteTime,
        chordsCount,
        sustainsCount,
        maxDensityPerSecond: maxDensity,
        suspiciousGapsCount: suspiciousGaps,
        duplicateNotesRemoved,
        outOfOrderFixed,
        invalidLanesFixed
      },
      repairedNotes: cleanedNotes,
      originalBackup
    };
  }
}
