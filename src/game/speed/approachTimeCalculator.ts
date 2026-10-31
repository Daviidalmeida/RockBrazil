import { Difficulty, NoteSpeedPreset } from '../../types';

export type DifficultySpeedKey = Difficulty;
export type SpeedPreset = NoteSpeedPreset;

/**
 * ROCKBRAZIL V13.8.5 — FONTE ÚNICA DA VERDADE PARA TEMPO DE APROXIMAÇÃO (APPROACH TIME)
 *
 * Elimina totalmente multiplicadores duplicados ou conflitantes.
 * Retorna o tempo em segundos que uma nota leva para viajar do horizonte até a linha de acerto.
 *
 * Calibração V13.8.5:
 * - FÁCIL (EASY): 1.90s (anteriormente 2.20s — agilizado para leitura dinâmica sem lentidão de rastilho)
 * - MÉDIO (MEDIUM): 2.20s (anteriormente 2.00s — desacelerado para garantir conforto em 4 pistas e acordes)
 * - DIFÍCIL (HARD): 1.85s (preservado)
 * - EXPERT: 1.65s (preservado)
 */
export const BASE_APPROACH_TIMES: Record<Difficulty, number> = {
  EASY: 1.90,
  MEDIUM: 2.20,
  HARD: 1.85,
  EXPERT: 1.65
};

export const SPEED_PRESET_DELTAS: Record<NoteSpeedPreset, number> = {
  LENTA: 0.35,
  NORMAL: 0.0,
  RÁPIDA: -0.30
};

export function clampApproachTime(time: number): number {
  return Math.max(0.80, Math.min(3.50, Number(time.toFixed(3))));
}

export function getApproachTimeForDifficulty(difficulty: Difficulty): number {
  return BASE_APPROACH_TIMES[difficulty] ?? 1.85;
}

export function calculateApproachTime(
  difficulty: Difficulty,
  multiplier: number = 1.0,
  preset?: NoteSpeedPreset
): number {
  const base = getApproachTimeForDifficulty(difficulty);

  // Se houver preset explícito LENTA ou RÁPIDA com multiplicador neutro (1.0)
  if (preset && preset !== 'NORMAL' && Math.abs(multiplier - 1.0) < 0.001) {
    if (preset === 'LENTA') {
      return clampApproachTime(base + SPEED_PRESET_DELTAS.LENTA);
    }
    if (preset === 'RÁPIDA') {
      return clampApproachTime(Math.max(1.20, base + SPEED_PRESET_DELTAS.RÁPIDA));
    }
  }

  // Se houver multiplicador numérico da barra de configurações (slider)
  const clampedMultiplier = Math.max(0.6, Math.min(2.5, multiplier));
  const rawApproach = base / clampedMultiplier;
  return clampApproachTime(rawApproach);
}
