import { Note, Difficulty } from '../../../types';
import { RockSyncProfile, ValidationStatus } from '../types';
import { RockSyncIntroDetectorV2, IntroAnalysisReport } from './rockSyncIntroDetectorV2';
import { TelemetryDiagnostics } from '../telemetry/adaptiveClockEstimator';

export type QualityGateState = 'SYNC_VERIFIED' | 'SYNC_PROVISIONAL' | 'SYNC_NOT_VERIFIED' | 'SYNC_INCOMPATIBLE';

export interface QualityGateEvaluation {
  songId: string;
  youtubeVideoId: string;
  gateStatus: QualityGateState;
  chartIntegrity: {
    valid: boolean;
    noteCount: number;
    issues: string[];
  };
  clockStability: {
    isStable: boolean;
    averageIntervalMs: number;
    jitterMs: number;
    assessment: string;
  };
  recordingMatch: {
    matchLevel: 'EXACT' | 'PROVISIONAL' | 'INCOMPATIBLE';
    durationDiffSec: number;
    reason: string;
  };
  temporalEvidence: {
    introAnalysis: IntroAnalysisReport;
    appliedOffsetMs: number;
    evidenceSource: string;
  };
  acousticEvidence: {
    hasIndependentAcousticReference: boolean;
    disclaimer: string;
  };
  summary: string;
}

/**
 * ROCKBRAZIL V14.1 — ROCKSYNC QUALITY GATE
 *
 * Avaliador multi-critério de prontidão de sincronização.
 * Garante que nenhuma música seja liberada com alegações falsas de IA acústica
 * e isola rigorosamente as dimensões estrutural, temporal e de gravação.
 */
export class RockSyncQualityGate {
  /**
   * Avalia a sincronização de um par Chart + Gravação YouTube.
   */
  public static evaluate(params: {
    songId: string;
    title: string;
    artist: string;
    notes: Note[];
    chartDurationSec: number;
    youtubeVideoId: string;
    youtubeDurationSec: number;
    existingProfile?: RockSyncProfile | null;
    telemetry?: TelemetryDiagnostics | null;
  }): QualityGateEvaluation {
    const {
      songId,
      title,
      artist,
      notes,
      chartDurationSec,
      youtubeVideoId,
      youtubeDurationSec,
      existingProfile,
      telemetry
    } = params;

    // 1. Integridade do Chart
    const issues: string[] = [];
    if (!notes || notes.length === 0) {
      issues.push('Chart vazio de notas.');
    }
    const hasNegativeTimes = notes.some((n) => n.time < 0);
    if (hasNegativeTimes) {
      issues.push('Notas com timestamps negativos detectadas.');
    }
    const invalidLanes = notes.filter((n) => n.lane < 0 || n.lane > 4);
    if (invalidLanes.length > 0) {
      issues.push(`${invalidLanes.length} notas em lanes inválidas (< 0 ou > 4).`);
    }

    const chartIntegrityValid = issues.length === 0 && notes.length >= 10;

    // 2. Estabilidade do Relógio / Telemetria
    const jitter = telemetry ? telemetry.jitterMs : 0;
    const avgInterval = telemetry ? telemetry.averageIntervalMs : 200;
    const isClockStable = jitter < 150; // Jitter dentro dos limites aceitáveis do navegador

    // 3. Correspondência de Gravação
    const durationDiffSec = youtubeDurationSec - chartDurationSec;
    let matchLevel: 'EXACT' | 'PROVISIONAL' | 'INCOMPATIBLE' = 'PROVISIONAL';
    let matchReason = '';

    // Se a diferença de duração for colossal (> 20s), é provável que seja um show ao vivo ou versão estendida incompatível
    if (Math.abs(durationDiffSec) > 25.0) {
      matchLevel = 'INCOMPATIBLE';
      matchReason = `Divergência severa de duração (${durationDiffSec.toFixed(1)}s): versão ao vivo ou gravação incompatível com o chart de estúdio.`;
    } else if (Math.abs(durationDiffSec) <= 2.0) {
      matchLevel = 'EXACT';
      matchReason = 'Duração compatível com a versão original de estúdio.';
    } else {
      matchLevel = 'PROVISIONAL';
      matchReason = `Diferença de ${durationDiffSec.toFixed(1)}s: clipe oficial ou introdução estendida detectada.`;
    }

    // 4. Evidência Temporal (Intro Detector V2)
    const introAnalysis = RockSyncIntroDetectorV2.analyze({
      songId,
      title,
      artist,
      notes,
      chartDurationSec,
      youtubeVideoId,
      youtubeDurationSec,
      declaredChartOffsetMs: existingProfile?.offsetMs
    });

    // 5. Evidência Acústica Independente (Honestidade estrita)
    // A API do YouTube IFrame NÃO fornece stream PCM para escuta direta
    const acousticEvidence = {
      hasIndependentAcousticReference: false,
      disclaimer:
        'Sem análise acústica PCM direta do IFrame (restrição da API oficial do YouTube). ' +
        'Alinhamento validado por telemetria temporal, duração de gravação e marcos de introdução auditados.'
    };

    // 6. Decisão de Estado do Quality Gate
    let gateStatus: QualityGateState = 'SYNC_NOT_VERIFIED';

    if (!chartIntegrityValid || matchLevel === 'INCOMPATIBLE') {
      gateStatus = 'SYNC_INCOMPATIBLE';
    } else if (existingProfile && existingProfile.validationStatus === 'VERIFIED') {
      gateStatus = 'SYNC_VERIFIED';
    } else if (introAnalysis.confidence >= 0.9 && isClockStable) {
      gateStatus = 'SYNC_VERIFIED';
    } else if (matchLevel === 'PROVISIONAL' || matchLevel === 'EXACT') {
      gateStatus = 'SYNC_PROVISIONAL';
    } else {
      gateStatus = 'SYNC_NOT_VERIFIED';
    }

    const summary =
      `[QualityGate V14.1] Status: ${gateStatus} | ` +
      `Chart: ${notes.length} notas (${chartIntegrityValid ? 'OK' : 'ERRO'}) | ` +
      `Gravação: ${matchLevel} (Diff ${durationDiffSec.toFixed(1)}s) | ` +
      `Offset Aplicado: ${introAnalysis.suggestedOffsetMs}ms | ` +
      `Relógio: Jitter ${jitter}ms`;

    return {
      songId,
      youtubeVideoId,
      gateStatus,
      chartIntegrity: {
        valid: chartIntegrityValid,
        noteCount: notes.length,
        issues
      },
      clockStability: {
        isStable: isClockStable,
        averageIntervalMs: avgInterval,
        jitterMs: jitter,
        assessment: isClockStable ? 'Estável com extrapolação adaptativa ativa' : 'Jitter elevado na telemetria'
      },
      recordingMatch: {
        matchLevel,
        durationDiffSec,
        reason: matchReason
      },
      temporalEvidence: {
        introAnalysis,
        appliedOffsetMs: introAnalysis.suggestedOffsetMs,
        evidenceSource: introAnalysis.auditNotes
      },
      acousticEvidence,
      summary
    };
  }
}
