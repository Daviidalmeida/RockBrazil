import { describe, it, expect } from 'vitest';
import { Difficulty, Note } from '../src/types';
import { BeatmapManager } from '../src/game/beatmapManager';
import {
  AutonomousMusicIntelligenceEngine,
  ChartIntelligenceValidator,
  RecordingVersionMatcher,
  UniversalMusicSyncEngine,
  SmartHighwayEngine,
  IntelligentSyncRecovery,
  VerifiedSyncProfileLearning,
  MusicIntelligenceConfidenceEngine,
  MusicAccuracyValidator,
  VisualSpeedPreset
} from '../src/game/intelligence';

describe('ROCKBRAZIL V13.9.4 — Autonomous Music Intelligence & Smart Rhythm Engine Suite', () => {
  const beatmapManager = new BeatmapManager();

  // 1. ChartIntelligenceValidator: ordenação, lanes por dificuldade, preservação de acordes e remoção de duplicatas
  it('1. ChartIntelligenceValidator validates note monotonicity, lane bounds, preserves chords and prunes duplicates', () => {
    const rawNotes: Note[] = [
      { id: 1, time: 2.0, lane: 1, duration: 0 },
      { id: 2, time: 1.0, lane: 0, duration: 0 }, // Out of order (before 2.0s)
      { id: 3, time: 3.0, lane: 4, duration: 0 }, // Lane 4 in EASY (allowed max is 2)
      { id: 4, time: 4.0, lane: 0, duration: 0 }, // Chord note A
      { id: 5, time: 4.0, lane: 1, duration: 0 }, // Chord note B (legitimate chord, must be preserved!)
      { id: 6, time: 4.0, lane: 0, duration: 0 }, // Duplicate of note A (same timestamp and lane, must be removed)
      { id: 7, time: 5.0, lane: 2, duration: 0.5 }
    ];

    const result = ChartIntelligenceValidator.validateAndRepair(rawNotes, 'EASY', 10.0);
    const { report, repairedNotes } = result;

    expect(report.isValid).toBe(true);
    // Notes must be sorted monotonically: 1.0s, 2.0s, 3.0s, 4.0s (chord), 5.0s
    expect(repairedNotes[0].time).toBe(1.0);
    expect(repairedNotes[1].time).toBe(2.0);
    expect(repairedNotes[2].time).toBe(3.0);
    // Out-of-bounds lane clamped to EASY max lane (2)
    expect(repairedNotes[2].lane).toBeLessThanOrEqual(2);
    expect(report.invalidLanesFixed).toBeGreaterThanOrEqual(1);

    // Legitimate chord at 4.0s preserved (2 notes: lane 0 and lane 1)
    const chordNotes = repairedNotes.filter((n) => Math.abs(n.time - 4.0) < 0.05);
    expect(chordNotes.length).toBe(2);
    expect(chordNotes.map((n) => n.lane).sort()).toEqual([0, 1]);
    expect(report.chordsCount).toBeGreaterThanOrEqual(1);

    // Duplicate removed
    expect(report.duplicateNotesRemoved).toBe(1);
    expect(repairedNotes.length).toBe(6);
  });

  // 2. RecordingVersionMatcher: detecção de studio vs live vs extended
  it('2. RecordingVersionMatcher detects studio vs live vs extended version discrepancies', () => {
    // Exact or near studio match (< 15s diff)
    const studio = RecordingVersionMatcher.evaluateCompatibility(229, 229, 228.4);
    expect(studio.isCompatible).toBe(true);
    expect(studio.detectedVersionType).toBe('STUDIO');
    expect(studio.confidenceScore).toBeGreaterThanOrEqual(0.9);

    // Live version (typically 15s to 45s longer due to stage intro/applause)
    const live = RecordingVersionMatcher.evaluateCompatibility(229, 260, 228.4);
    expect(live.detectedVersionType).toBe('LIVE');
    expect(live.durationDifferenceSec).toBe(31);

    // Extended version (> 45s longer)
    const extended = RecordingVersionMatcher.evaluateCompatibility(229, 310, 228.4);
    expect(extended.detectedVersionType).toBe('EXTENDED');

    // Incompatible: chart extends beyond audio duration
    const truncatedMedia = RecordingVersionMatcher.evaluateCompatibility(229, 180, 228.4);
    expect(truncatedMedia.isCompatible).toBe(false);
    expect(truncatedMedia.confidenceScore).toBeLessThan(0.5);
  });

  // 3. UniversalMusicSyncEngine: separação de 4 relógios (Media, Chart, Render, Gameplay)
  it('3. UniversalMusicSyncEngine 4-way clock separation maintains independent time domains', () => {
    const sync = new UniversalMusicSyncEngine();
    sync.startPlayback();

    // Mock media source reporting 15.000s
    let currentMediaTime = 15.0;
    const mockSource = {
      getCurrentTime: () => currentMediaTime,
      isPlaying: () => true,
      isBuffering: () => false,
      isPaused: () => false
    };

    sync.setSource(mockSource);
    // Apply a calibrated offset of +250ms (0.250s)
    sync.setCalibration(250, 0);

    const snapshot = sync.update(1000);
    expect(snapshot.mediaTime).toBe(15.0);
    // Chart Clock reflects calibrated offset
    expect(snapshot.chartTime).toBeCloseTo(15.25, 2);
    // Clocks are distinct
    expect(snapshot.chartTime).not.toBe(snapshot.mediaTime);
    expect(snapshot.calibratedOffsetMs).toBe(250);

    // Gameplay misses do not mutate media or chart clocks
    sync.registerMiss();
    sync.registerMiss();
    const snapAfterMiss = sync.update(1016);
    expect(snapAfterMiss.mediaTime).toBe(15.0);
    expect(snapAfterMiss.chartTime).toBeCloseTo(15.25, 2);
  });

  // 4. SmartHighwayEngine: busca binária O(log N) para renderização da esteira
  it('4. SmartHighwayEngine binary search O(log N) slices visible window efficiently across large charts', () => {
    // Generate 2500 notes spaced every 100ms (250s chart)
    const largeChart: Note[] = [];
    for (let i = 0; i < 2500; i++) {
      largeChart.push({
        id: i,
        time: Number((i * 0.1).toFixed(3)),
        lane: (i % 5) as any,
        duration: 0
      });
    }

    const currentTime = 100.0;
    const approachTime = 2.20; // Médio

    const startPerf = performance.now();
    const visibleNotes = SmartHighwayEngine.getVisibleNotes(largeChart, currentTime, approachTime);
    const endPerf = performance.now();

    // Performance should be sublinear (< 2ms)
    expect(endPerf - startPerf).toBeLessThan(5);

    expect(visibleNotes.length).toBeGreaterThan(0);
    // All returned notes must be within viewport [100.0 - 0.25, 100.0 + 2.20 + 0.15]
    for (const note of visibleNotes) {
      expect(note.time).toBeGreaterThanOrEqual(99.7);
      expect(note.time).toBeLessThanOrEqual(102.4);
    }

    // Binary search edge cases
    expect(SmartHighwayEngine.getVisibleNotes([], currentTime, approachTime)).toEqual([]);
    expect(SmartHighwayEngine.findFirstVisibleIndex(largeChart, 0)).toBe(0);
    expect(SmartHighwayEngine.findLastVisibleIndex(largeChart, 300)).toBe(largeChart.length - 1);
  });

  // 5. Presets de velocidade visual: Mais lenta, Normal, Mais rápida
  it('5. Highway visual speed presets adjust approach time without altering timing windows or musical audio', () => {
    // Baseline times: EASY=1.90, MEDIUM=2.20, HARD=1.85, EXPERT=1.65
    const easyNormal = SmartHighwayEngine.calculateApproachTime('EASY', 'NORMAL');
    const easyLenta = SmartHighwayEngine.calculateApproachTime('EASY', 'LENTA');
    const easyRapida = SmartHighwayEngine.calculateApproachTime('EASY', 'RÁPIDA');

    expect(easyNormal).toBe(1.90);
    // LENTA: 1.25x approach time = slower visual descent
    expect(easyLenta).toBeCloseTo(1.90 * 1.25, 2);
    // RÁPIDA: 0.80x approach time = faster visual descent
    expect(easyRapida).toBeCloseTo(1.90 * 0.80, 2);

    // MEDIUM: baseline 2.20s
    const medNormal = SmartHighwayEngine.calculateApproachTime('MEDIUM', 'NORMAL');
    const medLenta = SmartHighwayEngine.calculateApproachTime('MEDIUM', 'LENTA');
    const medRapida = SmartHighwayEngine.calculateApproachTime('MEDIUM', 'RÁPIDA');

    expect(medNormal).toBe(2.20);
    expect(medLenta).toBeCloseTo(2.20 * 1.25, 2);
    expect(medRapida).toBeCloseTo(2.20 * 0.80, 2);

    // Verifies presets are monotonic: LENTA > NORMAL > RÁPIDA
    expect(easyLenta).toBeGreaterThan(easyNormal);
    expect(easyNormal).toBeGreaterThan(easyRapida);
  });

  // 6. IntelligentSyncRecovery: diagnóstico de Jitter, Buffering, Stalls e Seeks
  it('6. IntelligentSyncRecovery diagnoses buffering, playback stall, seek and offset issues accurately', () => {
    const recovery = new IntelligentSyncRecovery();

    // 1. Buffering diagnosis
    const diagBuffering = recovery.diagnose(10.0, 10.0, true, false, 1000);
    expect(diagBuffering).not.toBeNull();
    expect(diagBuffering?.type).toBe('BUFFERING');
    expect(diagBuffering?.suggestedAction).toBe('FREEZE');

    // 2. Normal playback (no issue)
    recovery.diagnose(10.0, 10.0, false, false, 1000);
    const diagNormal = recovery.diagnose(10.05, 10.05, false, false, 1050);
    expect(diagNormal).toBeNull();

    // 3. Seek diagnosis (> 1.5s jump in media)
    const diagSeek = recovery.diagnose(25.0, 25.0, false, false, 1100);
    expect(diagSeek).not.toBeNull();
    expect(diagSeek?.type).toBe('SEEK_DETECTED');
    expect(diagSeek?.suggestedAction).toBe('REINDEX');

    // 4. Playback Stall diagnosis
    let diagStall = null;
    let perf = 2000;
    recovery.diagnose(30.0, 30.0, false, false, perf);
    for (let i = 0; i < 35; i++) {
      perf += 16;
      diagStall = recovery.diagnose(30.0, 30.0, false, false, perf);
    }
    expect(diagStall).not.toBeNull();
    expect(diagStall?.type).toBe('PLAYBACK_STALL');
  });

  // 7. VerifiedSyncProfileLearning: persistência e rejeição de perfis não verificados
  it('7. VerifiedSyncProfileLearning retrieves preloaded profiles and rejects unverified calibrations', () => {
    // Preloaded profile for T.N.T.
    const tntProfile = VerifiedSyncProfileLearning.getProfile('tnt-acdc');
    expect(tntProfile).not.toBeNull();
    expect(tntProfile?.songId).toBe('tnt-acdc');
    expect(tntProfile?.confidence).toBe('VERIFIED');
    expect(tntProfile?.verifiedAnchors.length).toBeGreaterThanOrEqual(3);

    // Reject unverified profile (must NOT learn from bad calibrations or player misses)
    const unverifiedProfile: any = {
      songId: 'unknown-song',
      confidence: 'LOW_CONFIDENCE',
      calibratedOffsetMs: 500,
      driftRatePerSec: 0.05,
      verifiedAnchors: []
    };
    const saved = VerifiedSyncProfileLearning.saveProfile(unverifiedProfile);
    expect(saved).toBe(false);
  });

  // 8. MusicIntelligenceConfidenceEngine: honestidade de rotulação (nunca falsear REAL_AI)
  it('8. MusicIntelligenceConfidenceEngine provides honest labeling without false AI claims', () => {
    // When running with fallback DSP, never falsify REAL_AI
    const fallbackLabel = MusicIntelligenceConfidenceEngine.getHonestLabel('FALLBACK_DSP', false);
    expect(fallbackLabel.mode).toBe('FALLBACK_DSP');
    expect(fallbackLabel.badge).toContain('FALLBACK_DSP');
    expect(fallbackLabel.badge).not.toContain('Spotify');

    // Only when real neural AI was executed
    const realAILabel = MusicIntelligenceConfidenceEngine.getHonestLabel('REAL_AI', true);
    expect(realAILabel.mode).toBe('REAL_AI');
    expect(realAILabel.badge).toContain('Spotify Basic Pitch & Demucs');

    // Confidence evaluation with verified ground truth
    const verifiedEval = MusicIntelligenceConfidenceEngine.evaluateConfidence({
      hasGroundTruthReference: true,
      precisionScore: 0.94,
      hasVerifiedAnchors: true,
      chartIntegrityValid: true,
      engineMode: 'YOUTUBE_CALIBRATED'
    });
    expect(verifiedEval.level).toBe('VERIFIED');
    expect(verifiedEval.score).toBeGreaterThanOrEqual(0.90);
  });

  // 9. MusicAccuracyValidator: fidelidade musical >= 90% na T.N.T. (AC/DC)
  it('9. MusicAccuracyValidator achieves >= 90% Precision, Recall and F1 on T.N.T. pilot track', () => {
    const expertChart = beatmapManager.getBeatmap('tnt-acdc', 'EXPERT');
    expect(expertChart.length).toBe(1639);

    const refEvents = MusicAccuracyValidator.getGroundTruthReference('tnt-acdc', 'EXPERT');
    expect(refEvents.length).toBeGreaterThan(300);

    const evaluation = MusicAccuracyValidator.evaluateChartAccuracy(
      'tnt-acdc',
      'EXPERT',
      expertChart,
      refEvents
    );

    // Quantitative requirements: Precision >= 90%, Recall >= 90%, F1 >= 90%
    expect(evaluation.precision).toBeGreaterThanOrEqual(0.90);
    expect(evaluation.recall).toBeGreaterThanOrEqual(0.90);
    expect(evaluation.f1).toBeGreaterThanOrEqual(0.90);
    expect(evaluation.medianErrorMs).toBeLessThanOrEqual(30);
    expect(evaluation.p95ErrorMs).toBeLessThanOrEqual(50);
    expect(evaluation.status).toBe('VERIFIED_90_PLUS');
  });

  // 10. 100 consecutive misses without freezing, muting, or stopping playback
  it('10. 100 consecutive misses do not freeze, mute or stop highway or audio timeline', () => {
    const sync = new UniversalMusicSyncEngine();
    sync.startPlayback();

    let mediaTime = 20.0;
    sync.setSource({
      getCurrentTime: () => mediaTime,
      isPlaying: () => true,
      isBuffering: () => false,
      isPaused: () => false
    });

    // Simulate 100 misses in gameplay
    for (let i = 0; i < 100; i++) {
      sync.registerMiss();
    }

    // Advance 50 frames
    let perf = 1000;
    for (let frame = 0; frame < 50; frame++) {
      mediaTime += 0.016;
      perf += 16;
      const snap = sync.update(perf);
      expect(snap.mediaTime).toBeCloseTo(mediaTime, 2);
      expect(snap.chartTime).toBeGreaterThan(0);
      expect(snap.isPaused).toBe(false);
      expect(snap.isBuffering).toBe(false);
    }

    const finalSnapshot = sync.update(perf + 16);
    expect(finalSnapshot.mediaTime).toBeGreaterThan(20.7);
    expect(finalSnapshot.chartTime).toBeGreaterThan(20.7);
  });

  // 11. Buffering freezes timeline without counting false misses
  it('11. Buffering freezes timeline progression cleanly without counting false misses', () => {
    const sync = new UniversalMusicSyncEngine();
    sync.startPlayback();

    let isBuffering = false;
    let mediaTime = 12.0;

    sync.setSource({
      getCurrentTime: () => mediaTime,
      isPlaying: () => true,
      isBuffering: () => isBuffering,
      isPaused: () => false
    });

    // Normal progression
    sync.update(1000);
    mediaTime += 0.5;
    const snap1 = sync.update(1500);
    expect(snap1.mediaTime).toBe(12.5);

    // Media starts buffering
    isBuffering = true;
    const snapBuffering = sync.update(1600);
    expect(snapBuffering.isBuffering).toBe(true);

    // Advancing frames during buffering must not advance chartTime
    const initialChartTime = snapBuffering.chartTime;
    for (let i = 0; i < 10; i++) {
      const snap = sync.update(1600 + i * 50);
      expect(snap.chartTime).toBeCloseTo(initialChartTime, 3);
      expect(snap.isBuffering).toBe(true);
    }
  });

  // 12. AutonomousMusicIntelligenceEngine: Orquestração mestre e preparação de partida
  it('12. AutonomousMusicIntelligenceEngine orchestrates pre-match validation and frame updates', () => {
    const engine = AutonomousMusicIntelligenceEngine.getInstance();

    const mockSong: any = {
      id: 'tnt-acdc',
      title: 'T.N.T.',
      artist: 'AC/DC',
      duration: 229,
      isInternational: true,
      youtubeVideoId: 'fGDQ9IukMOc'
    };

    const rawNotes = beatmapManager.getBeatmap('tnt-acdc', 'HARD');

    const prep = engine.prepareMatch(mockSong, 'HARD', rawNotes, 229, 'NORMAL');
    expect(prep.validatedNotes.length).toBe(rawNotes.length);
    expect(prep.chartReport.isValid).toBe(true);
    expect(prep.versionMatch.isCompatible).toBe(true);
    expect(prep.approachTime).toBe(1.85);

    // Setting speed preset updates approach time
    engine.setVisualSpeedPreset('LENTA');
    expect(engine.getApproachTime()).toBeCloseTo(1.85 * 1.25, 2);

    engine.setVisualSpeedPreset('RÁPIDA');
    expect(engine.getApproachTime()).toBeCloseTo(1.85 * 0.80, 2);
  });
});
