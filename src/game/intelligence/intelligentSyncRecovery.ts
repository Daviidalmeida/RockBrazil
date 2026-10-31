import { ProblemType } from './types';

export interface SyncIssueDiagnostic {
  type: ProblemType;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  description: string;
  suggestedAction: 'SMOOTH' | 'FREEZE' | 'REINDEX' | 'CALIBRATE' | 'NOTIFY_USER' | 'IGNORE';
}

export class IntelligentSyncRecovery {
  private lastObservedTime = 0;
  private lastObservedPerf = 0;
  private stallCounter = 0;

  /**
   * Evaluates the current media and clock state to classify any active synchronization anomaly.
   */
  public diagnose(
    mediaTime: number,
    chartTime: number,
    isBuffering: boolean,
    isPaused: boolean,
    currentPerfTime: number
  ): SyncIssueDiagnostic | null {
    if (isBuffering) {
      return {
        type: 'BUFFERING',
        severity: 'INFO',
        description: 'Mídia em processo de carregamento (buffering). Timeline congelada sem penalização.',
        suggestedAction: 'FREEZE'
      };
    }

    if (isPaused) {
      return null;
    }

    const perfDeltaSec = Math.max(0.001, (currentPerfTime - this.lastObservedPerf) / 1000);
    const mediaDelta = mediaTime - this.lastObservedTime;

    this.lastObservedTime = mediaTime;
    this.lastObservedPerf = currentPerfTime;

    // Detect Seek (> 1.5s discontinuity in media progression)
    if (Math.abs(mediaDelta) > 1.5 && Math.abs(mediaDelta - perfDeltaSec) > 1.0) {
      return {
        type: 'SEEK_DETECTED',
        severity: 'WARNING',
        description: `Salto de reprodução detectado (${mediaDelta > 0 ? '+' : ''}${mediaDelta.toFixed(2)}s). Reindexando notas da esteira.`,
        suggestedAction: 'REINDEX'
      };
    }

    // Detect Playback Stall (media playing but time frozen for > 1.0s)
    if (Math.abs(mediaDelta) < 0.001 && perfDeltaSec < 0.25) {
      this.stallCounter++;
      if (this.stallCounter > 30) {
        // ~500ms of frozen time while supposedly playing
        return {
          type: 'PLAYBACK_STALL',
          severity: 'WARNING',
          description: 'Mídia reporta reprodução, mas timestamp está estagnado.',
          suggestedAction: 'FREEZE'
        };
      }
    } else {
      this.stallCounter = 0;
    }

    // Detect high Clock Jitter (temporal error oscillating between 40ms and 150ms)
    const syncErrorMs = (chartTime - mediaTime) * 1000;
    if (Math.abs(syncErrorMs) > 150) {
      return {
        type: 'OFFSET_MISMATCH',
        severity: 'WARNING',
        description: `Divergência de fase temporal detectada (${syncErrorMs.toFixed(1)}ms).`,
        suggestedAction: 'CALIBRATE'
      };
    }

    return null;
  }

  /**
   * Calculates a linear drift rate given two or more verified time anchors.
   */
  public static calculateLinearDriftRate(
    anchors: { mediaTime: number; chartTime: number }[]
  ): number {
    if (!anchors || anchors.length < 2) return 0;

    const first = anchors[0];
    const last = anchors[anchors.length - 1];
    const duration = last.mediaTime - first.mediaTime;

    if (duration < 10) return 0; // Insufficient temporal distance to measure drift reliably

    const mediaDrift = (last.chartTime - first.chartTime) - duration;
    const rate = mediaDrift / duration;

    // Bounded safety limit: maximum 10ms per second
    return Math.max(-0.01, Math.min(0.01, rate));
  }
}
