import { Note, Difficulty } from '../../../types';
import { RockSyncProfile, ValidationStatus, SyncMethod, ChartSourceProviderId } from '../types';
import { RockSyncProfileRepository } from './rockSyncProfileRepository';
import { RockSyncIntroDetectorV2 } from './rockSyncIntroDetectorV2';
import { RockSyncQualityGate, QualityGateEvaluation } from './rockSyncQualityGate';

export interface IntelligentMatchInput {
  songId: string;
  title: string;
  artist: string;
  chartId: string;
  chartVersion?: string;
  chartSource: ChartSourceProviderId;
  notes: Note[];
  chartDurationSec: number;
  bpm: number;
  declaredOffsetMs?: number;
  youtubeVideoId: string;
  youtubeTitle?: string;
  youtubeChannel?: string;
  youtubeDurationSec: number;
  difficulty?: Difficulty;
}

export interface IntelligentMatchResult {
  profile: RockSyncProfile;
  evaluation: QualityGateEvaluation;
  recommendedAction: 'AUTOMATIC_APPLY' | 'REQUIRES_ADMIN_REVIEW' | 'REJECT';
  explanation: string;
}

/**
 * ROCKBRAZIL V14.1 — ROCKSYNC INTELLIGENT MATCHER
 *
 * Seleciona e calibra a melhor combinação entre:
 * CHART EXISTENTE + VERSÃO DA GRAVAÇÃO + VÍDEO DO YOUTUBE.
 */
export class RockSyncIntelligentMatcher {
  private repository: RockSyncProfileRepository;

  constructor(repository: RockSyncProfileRepository = RockSyncProfileRepository.getInstance()) {
    this.repository = repository;
  }

  /**
   * Avalia e gera o perfil de sincronização para o trio Chart + Gravação + Vídeo.
   */
  public match(input: IntelligentMatchInput): IntelligentMatchResult {
    const diff: Difficulty = input.difficulty || 'HARD';

    // 1. Verifica se já existe perfil canônico ou homologado no repositório
    const existing = this.repository.getProfile(input.songId, input.chartId, input.youtubeVideoId, diff);

    // 2. Executa a auditoria de introdução V2
    const introAnalysis = RockSyncIntroDetectorV2.analyze({
      songId: input.songId,
      title: input.title,
      artist: input.artist,
      notes: input.notes,
      chartDurationSec: input.chartDurationSec,
      declaredChartOffsetMs: input.declaredOffsetMs || existing?.offsetMs,
      youtubeVideoId: input.youtubeVideoId,
      youtubeDurationSec: input.youtubeDurationSec
    });

    // 3. Avalia no Quality Gate
    const evaluation = RockSyncQualityGate.evaluate({
      songId: input.songId,
      title: input.title,
      artist: input.artist,
      notes: input.notes,
      chartDurationSec: input.chartDurationSec,
      youtubeVideoId: input.youtubeVideoId,
      youtubeDurationSec: input.youtubeDurationSec,
      existingProfile: existing
    });

    // 4. Monta o perfil de sincronização com offset comprovado
    const finalOffsetMs = existing?.validationStatus === 'VERIFIED'
      ? existing.offsetMs
      : introAnalysis.suggestedOffsetMs;

    let syncMethod: SyncMethod = 'STUDIO_TIMESTAMP_ALIGNED';
    if (Math.abs(introAnalysis.durationDifferenceSec) > 1.5) {
      syncMethod = 'OFFICIAL_VIDEO_ALIGNMENT';
    }

    let validationStatus: ValidationStatus = 'AUTO_MATCHED';
    if (evaluation.gateStatus === 'SYNC_VERIFIED') {
      validationStatus = 'VERIFIED';
    } else if (evaluation.gateStatus === 'SYNC_INCOMPATIBLE') {
      validationStatus = 'NEEDS_REVIEW';
    } else if (evaluation.gateStatus === 'SYNC_PROVISIONAL') {
      validationStatus = 'AUTO_MATCHED';
    } else {
      validationStatus = 'NEEDS_REVIEW';
    }

    const profile: RockSyncProfile = {
      songId: input.songId,
      chartId: input.chartId,
      chartVersion: input.chartVersion || '1.0',
      chartSource: input.chartSource,
      recordingId: `rec-${input.songId}-${input.youtubeVideoId}`,
      youtubeVideoId: input.youtubeVideoId,
      difficulty: diff,
      offsetMs: finalOffsetMs,
      timeScale: 1.0,
      syncMethod,
      evidenceSource: introAnalysis.auditNotes,
      validationStatus,
      notes: evaluation.summary,
      updatedAt: new Date().toISOString()
    };

    // Salva no repositório
    this.repository.saveProfile(profile);

    let recommendedAction: 'AUTOMATIC_APPLY' | 'REQUIRES_ADMIN_REVIEW' | 'REJECT' = 'REQUIRES_ADMIN_REVIEW';
    if (evaluation.gateStatus === 'SYNC_VERIFIED') {
      recommendedAction = 'AUTOMATIC_APPLY';
    } else if (evaluation.gateStatus === 'SYNC_INCOMPATIBLE') {
      recommendedAction = 'REJECT';
    }

    return {
      profile,
      evaluation,
      recommendedAction,
      explanation: evaluation.summary
    };
  }
}
