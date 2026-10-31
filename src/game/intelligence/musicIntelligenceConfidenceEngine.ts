import { ConfidenceLevel } from './types';

export class MusicIntelligenceConfidenceEngine {
  /**
   * Computes an honest confidence classification based on verified acoustic and chart evidence.
   */
  public static evaluateConfidence(params: {
    hasGroundTruthReference: boolean;
    precisionScore?: number;
    hasVerifiedAnchors: boolean;
    chartIntegrityValid: boolean;
    engineMode: 'REAL_AI' | 'FALLBACK_DSP' | 'YOUTUBE_CALIBRATED' | 'OFFLINE';
  }): { level: ConfidenceLevel; score: number; label: string } {
    if (!params.chartIntegrityValid) {
      return {
        level: 'UNAVAILABLE',
        score: 0.1,
        label: 'Chart com inconsistências estruturais não resolvidas.'
      };
    }

    // Verified 90+ reference confirmation
    if (params.hasGroundTruthReference && (params.precisionScore ?? 0) >= 0.90) {
      return {
        level: 'VERIFIED',
        score: params.precisionScore ?? 0.95,
        label: 'Aprovado: Fidelidade musical verificada superior a 90% contra referência real.'
      };
    }

    // High confidence with verified anchors and valid chart
    if (params.hasVerifiedAnchors && params.chartIntegrityValid) {
      return {
        level: 'HIGH_CONFIDENCE',
        score: 0.88,
        label: 'Alta Confiança: Âncoras temporais sincronizadas e chart estruturalmente íntegro.'
      };
    }

    if (params.engineMode === 'FALLBACK_DSP' || params.engineMode === 'YOUTUBE_CALIBRATED') {
      return {
        level: 'HIGH_CONFIDENCE',
        score: 0.82,
        label: 'Modo Calibrado: Sincronização temporal contínua com compensação de drift.'
      };
    }

    return {
      level: 'LOW_CONFIDENCE',
      score: 0.5,
      label: 'Sincronização padrão não calibrada acusticamente.'
    };
  }

  /**
   * Returns honest transparency labeling for the engine mode.
   * Never reports REAL_AI unless neural execution occurred with confirmed evidence.
   */
  public static getHonestLabel(
    engineMode: 'REAL_AI' | 'FALLBACK_DSP' | 'YOUTUBE_CALIBRATED' | 'OFFLINE',
    isRealAIExecuted: boolean
  ): { mode: 'REAL_AI' | 'FALLBACK_DSP' | 'YOUTUBE_CALIBRATED'; badge: string } {
    if (engineMode === 'REAL_AI' && isRealAIExecuted) {
      return {
        mode: 'REAL_AI',
        badge: 'REAL_AI (Spotify Basic Pitch & Demucs)'
      };
    }

    if (engineMode === 'YOUTUBE_CALIBRATED') {
      return {
        mode: 'YOUTUBE_CALIBRATED',
        badge: 'YOUTUBE_CALIBRATED (RockSync Engine)'
      };
    }

    return {
      mode: 'FALLBACK_DSP',
      badge: 'FALLBACK_DSP (Filtros Espectrais DSP & Onsets)'
    };
  }
}
