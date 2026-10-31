export interface RecordingVersionMatchResult {
  isCompatible: boolean;
  confidenceScore: number;
  durationDifferenceSec: number;
  expectedDurationSec: number;
  actualDurationSec: number;
  detectedVersionType: 'STUDIO' | 'LIVE' | 'EXTENDED' | 'SHORT' | 'UNKNOWN';
  reason: string;
}

export class RecordingVersionMatcher {
  /**
   * Compares the expected chart musical duration against the actual media duration.
   */
  public static evaluateCompatibility(
    expectedDurationSec: number,
    actualDurationSec: number,
    chartLastNoteTimeSec?: number
  ): RecordingVersionMatchResult {
    if (!expectedDurationSec || expectedDurationSec <= 0) {
      return {
        isCompatible: true,
        confidenceScore: 0.7,
        durationDifferenceSec: 0,
        expectedDurationSec,
        actualDurationSec,
        detectedVersionType: 'UNKNOWN',
        reason: 'Duração esperada não fornecida; compatibilidade neutra.'
      };
    }

    if (!actualDurationSec || actualDurationSec <= 0) {
      return {
        isCompatible: true,
        confidenceScore: 0.7,
        durationDifferenceSec: 0,
        expectedDurationSec,
        actualDurationSec,
        detectedVersionType: 'UNKNOWN',
        reason: 'Duração da mídia aguardando carregamento.'
      };
    }

    const diff = Math.abs(actualDurationSec - expectedDurationSec);
    let detectedVersionType: RecordingVersionMatchResult['detectedVersionType'] = 'STUDIO';

    if (diff > 45) {
      detectedVersionType = actualDurationSec > expectedDurationSec ? 'EXTENDED' : 'SHORT';
    } else if (diff > 15) {
      detectedVersionType = 'LIVE';
    }

    // Check if chart extends beyond actual media duration
    if (chartLastNoteTimeSec && chartLastNoteTimeSec > actualDurationSec + 1.0) {
      return {
        isCompatible: false,
        confidenceScore: 0.2,
        durationDifferenceSec: diff,
        expectedDurationSec,
        actualDurationSec,
        detectedVersionType,
        reason: `Incompatível: o chart possui notas até ${chartLastNoteTimeSec.toFixed(1)}s, ultrapassando a mídia de ${actualDurationSec.toFixed(1)}s.`
      };
    }

    // High compatibility if difference is under 5 seconds (standard clip lead-in/lead-out)
    if (diff <= 5.0) {
      return {
        isCompatible: true,
        confidenceScore: 0.98,
        durationDifferenceSec: diff,
        expectedDurationSec,
        actualDurationSec,
        detectedVersionType: 'STUDIO',
        reason: 'Gravação perfeitamente alinhada com a versão oficial de estúdio.'
      };
    }

    // Moderate compatibility if difference is under 15 seconds
    if (diff <= 15.0) {
      return {
        isCompatible: true,
        confidenceScore: 0.85,
        durationDifferenceSec: diff,
        expectedDurationSec,
        actualDurationSec,
        detectedVersionType,
        reason: `Diferença moderada de ${diff.toFixed(1)}s tolerada (introdução ou encerramento visual).`
      };
    }

    // Incompatible recording version detected
    return {
      isCompatible: false,
      confidenceScore: 0.4,
      durationDifferenceSec: diff,
      expectedDurationSec,
      actualDurationSec,
      detectedVersionType,
      reason: `Versão da gravação divergente (diferença de ${diff.toFixed(1)}s). Provável versão Ao Vivo ou estendida.`
    };
  }
}
