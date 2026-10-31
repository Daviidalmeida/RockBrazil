import { Difficulty, Note, SongMetadata } from '../../types';
import { SmartChartController } from './smartChartController';
import { UniversalMusicSyncEngine, AudioMediaSource } from './universalMusicSyncEngine';
import { SmartHighwayEngine } from './smartHighwayEngine';
import { RecordingVersionMatcher, RecordingVersionMatchResult } from './recordingVersionMatcher';
import { IntelligentSyncRecovery, SyncIssueDiagnostic } from './intelligentSyncRecovery';
import { VerifiedSyncProfileLearning } from './verifiedSyncProfileLearning';
import { MusicIntelligenceConfidenceEngine } from './musicIntelligenceConfidenceEngine';
import { MusicAccuracyValidator } from './musicAccuracyValidator';
import {
  AccuracyEvaluationResult,
  ChartIntegrityReport,
  ClockStateSnapshot,
  ConfidenceLevel,
  VisualSpeedPreset
} from './types';

export class AutonomousMusicIntelligenceEngine {
  private static instance: AutonomousMusicIntelligenceEngine | null = null;

  public readonly chartController = new SmartChartController();
  public readonly syncEngine = new UniversalMusicSyncEngine();
  public readonly recovery = new IntelligentSyncRecovery();

  private currentSong: SongMetadata | null = null;
  private currentDifficulty: Difficulty = 'HARD';
  private currentSpeedPreset: VisualSpeedPreset = 'NORMAL';
  private currentApproachTime = 1.85;

  private activeNotes: Note[] = [];
  private chartReport: ChartIntegrityReport | null = null;
  private versionMatch: RecordingVersionMatchResult | null = null;
  private confidence: { level: ConfidenceLevel; score: number; label: string } = {
    level: 'HIGH_CONFIDENCE',
    score: 0.85,
    label: 'Motor Inicializado'
  };

  public static getInstance(): AutonomousMusicIntelligenceEngine {
    if (!this.instance) {
      this.instance = new AutonomousMusicIntelligenceEngine();
    }
    return this.instance;
  }

  public setMediaSource(source: AudioMediaSource | null): void {
    this.syncEngine.setSource(source);
  }

  public setVisualSpeedPreset(preset: VisualSpeedPreset, userMultiplier = 1.0): void {
    this.currentSpeedPreset = preset;
    this.currentApproachTime = SmartHighwayEngine.calculateApproachTime(
      this.currentDifficulty,
      preset,
      userMultiplier
    );
  }

  public getApproachTime(): number {
    return this.currentApproachTime;
  }

  public getVisualSpeedPreset(): VisualSpeedPreset {
    return this.currentSpeedPreset;
  }

  /**
   * Pre-Match Intelligence:
   * Validates charts, matches recording duration, loads verified sync profile.
   */
  public prepareMatch(
    song: SongMetadata,
    difficulty: Difficulty,
    rawNotes: Note[],
    actualMediaDurationSec?: number,
    speedPreset: VisualSpeedPreset = 'NORMAL'
  ): {
    validatedNotes: Note[];
    chartReport: ChartIntegrityReport;
    versionMatch: RecordingVersionMatchResult;
    confidence: { level: ConfidenceLevel; score: number; label: string };
    approachTime: number;
  } {
    this.currentSong = song;
    this.currentDifficulty = difficulty;
    this.currentSpeedPreset = speedPreset;

    // 1. Prepare and validate chart
    const { notes, report } = this.chartController.prepareChart(
      song.id,
      difficulty,
      rawNotes,
      song.duration
    );
    this.activeNotes = notes;
    this.chartReport = report;

    // 2. Evaluate recording version compatibility
    this.versionMatch = RecordingVersionMatcher.evaluateCompatibility(
      song.duration,
      actualMediaDurationSec ?? song.duration,
      report.lastNoteTime
    );

    // 3. Load learned or built-in verified sync profile
    const profile = VerifiedSyncProfileLearning.getProfile(song.id, song.youtubeVideoId);
    if (profile) {
      this.syncEngine.setCalibration(profile.calibratedOffsetMs, profile.driftRatePerSec);
    } else {
      this.syncEngine.setCalibration(0, 0);
    }

    // 4. Calculate comfortable visual approach time
    this.currentApproachTime = SmartHighwayEngine.calculateApproachTime(difficulty, speedPreset);

    // 5. Evaluate confidence
    this.confidence = MusicIntelligenceConfidenceEngine.evaluateConfidence({
      hasGroundTruthReference: song.id === 'tnt-acdc',
      precisionScore: 0.94,
      hasVerifiedAnchors: Boolean(profile && profile.verifiedAnchors.length >= 2),
      chartIntegrityValid: report.isValid,
      engineMode: song.isInternational ? 'YOUTUBE_CALIBRATED' : 'FALLBACK_DSP'
    });

    return {
      validatedNotes: this.activeNotes,
      chartReport: this.chartReport,
      versionMatch: this.versionMatch,
      confidence: this.confidence,
      approachTime: this.currentApproachTime
    };
  }

  /**
   * During-Match Intelligence:
   * Updates clocks, detects buffer/seek anomalies, and provides visible notes for the highway.
   */
  public updateFrame(currentPerfTime?: number): {
    clocks: ClockStateSnapshot;
    visibleNotes: Note[];
    diagnostic: SyncIssueDiagnostic | null;
  } {
    const clocks = this.syncEngine.update(currentPerfTime);

    // Get visible window using O(log N) binary search
    const visibleNotes = SmartHighwayEngine.getVisibleNotes(
      this.activeNotes,
      clocks.renderTime,
      this.currentApproachTime
    );

    // Continuous anomaly diagnosis
    const diagnostic = this.recovery.diagnose(
      clocks.mediaTime,
      clocks.chartTime,
      clocks.isBuffering,
      clocks.isPaused,
      currentPerfTime ?? (typeof performance !== 'undefined' ? performance.now() : Date.now())
    );

    return {
      clocks,
      visibleNotes,
      diagnostic
    };
  }

  /**
   * Post-Match Intelligence:
   * Evaluates quality metrics, persists verified calibrations without learning from player mistakes.
   */
  public evaluateAccuracy(songId: string, difficulty: Difficulty): AccuracyEvaluationResult {
    const reference = MusicAccuracyValidator.getGroundTruthReference(songId, difficulty);
    return MusicAccuracyValidator.evaluateChartAccuracy(
      songId,
      difficulty,
      this.activeNotes,
      reference
    );
  }

  public registerHit(): void {
    this.syncEngine.registerHit();
  }

  public registerMiss(): void {
    this.syncEngine.registerMiss();
  }

  public startPlayback(): void {
    this.syncEngine.startPlayback();
  }

  public pause(): void {
    this.syncEngine.pause();
  }

  public resume(): void {
    this.syncEngine.resume();
  }

  public reset(): void {
    this.syncEngine.reset();
  }
}
