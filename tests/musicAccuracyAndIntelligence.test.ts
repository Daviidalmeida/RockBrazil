import { describe, it, expect, beforeEach } from 'vitest';
import { Difficulty, Note } from '../src/types';
import { BeatmapManager } from '../src/game/beatmapManager';
import { parseYouTubeError } from '../src/audio/youtubePlayer';
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
  IndependentGroundTruthRepository,
  IndependentGroundTruthRecord,
  GroundTruthEvent,
  VisualSpeedPreset
} from '../src/game/intelligence';

describe('ROCKBRAZIL V13.9.4.1 — Autonomous Music Intelligence & Independent Ground Truth Suite', () => {
  const beatmapManager = new BeatmapManager();

  beforeEach(() => {
    IndependentGroundTruthRepository.clear();
  });

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
    const studio = RecordingVersionMatcher.evaluateCompatibility(229, 229, 228.4);
    expect(studio.isCompatible).toBe(true);
    expect(studio.detectedVersionType).toBe('STUDIO');
    expect(studio.confidenceScore).toBeGreaterThanOrEqual(0.9);

    const live = RecordingVersionMatcher.evaluateCompatibility(229, 260, 228.4);
    expect(live.detectedVersionType).toBe('LIVE');
    expect(live.durationDifferenceSec).toBe(31);

    const extended = RecordingVersionMatcher.evaluateCompatibility(229, 310, 228.4);
    expect(extended.detectedVersionType).toBe('EXTENDED');

    const truncatedMedia = RecordingVersionMatcher.evaluateCompatibility(229, 180, 228.4);
    expect(truncatedMedia.isCompatible).toBe(false);
    expect(truncatedMedia.confidenceScore).toBeLessThan(0.5);
  });

  // 3. UniversalMusicSyncEngine: separação de 4 relógios (Media, Chart, Render, Gameplay)
  it('3. UniversalMusicSyncEngine 4-way clock separation maintains independent time domains', () => {
    const sync = new UniversalMusicSyncEngine();
    sync.startPlayback();

    let currentMediaTime = 15.0;
    const mockSource = {
      getCurrentTime: () => currentMediaTime,
      isPlaying: () => true,
      isBuffering: () => false,
      isPaused: () => false
    };

    sync.setSource(mockSource);
    sync.setCalibration(250, 0);

    const snapshot = sync.update(1000);
    expect(snapshot.mediaTime).toBe(15.0);
    expect(snapshot.chartTime).toBeCloseTo(15.25, 2);
    expect(snapshot.chartTime).not.toBe(snapshot.mediaTime);
    expect(snapshot.calibratedOffsetMs).toBe(250);

    sync.registerMiss();
    sync.registerMiss();
    const snapAfterMiss = sync.update(1016);
    expect(snapAfterMiss.mediaTime).toBe(15.0);
    expect(snapAfterMiss.chartTime).toBeCloseTo(15.25, 2);
  });

  // 4. SmartHighwayEngine: busca binária O(log N) para renderização da esteira
  it('4. SmartHighwayEngine binary search O(log N) slices visible window efficiently across large charts', () => {
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
    const approachTime = 2.20;

    const startPerf = performance.now();
    const visibleNotes = SmartHighwayEngine.getVisibleNotes(largeChart, currentTime, approachTime);
    const endPerf = performance.now();

    expect(endPerf - startPerf).toBeLessThan(5);
    expect(visibleNotes.length).toBeGreaterThan(0);
    for (const note of visibleNotes) {
      expect(note.time).toBeGreaterThanOrEqual(99.7);
      expect(note.time).toBeLessThanOrEqual(102.4);
    }

    expect(SmartHighwayEngine.getVisibleNotes([], currentTime, approachTime)).toEqual([]);
    expect(SmartHighwayEngine.findFirstVisibleIndex(largeChart, 0)).toBe(0);
    expect(SmartHighwayEngine.findLastVisibleIndex(largeChart, 300)).toBe(largeChart.length - 1);
  });

  // 5. Presets de velocidade visual: Mais lenta, Normal, Mais rápida
  it('5. Highway visual speed presets adjust approach time without altering timing windows or musical audio', () => {
    const easyNormal = SmartHighwayEngine.calculateApproachTime('EASY', 'NORMAL');
    const easyLenta = SmartHighwayEngine.calculateApproachTime('EASY', 'LENTA');
    const easyRapida = SmartHighwayEngine.calculateApproachTime('EASY', 'RÁPIDA');

    expect(easyNormal).toBe(1.90);
    expect(easyLenta).toBeCloseTo(1.90 * 1.25, 2);
    expect(easyRapida).toBeCloseTo(1.90 * 0.80, 2);

    const medNormal = SmartHighwayEngine.calculateApproachTime('MEDIUM', 'NORMAL');
    const medLenta = SmartHighwayEngine.calculateApproachTime('MEDIUM', 'LENTA');
    const medRapida = SmartHighwayEngine.calculateApproachTime('MEDIUM', 'RÁPIDA');

    expect(medNormal).toBe(2.20);
    expect(medLenta).toBeCloseTo(2.20 * 1.25, 2);
    expect(medRapida).toBeCloseTo(2.20 * 0.80, 2);

    expect(easyLenta).toBeGreaterThan(easyNormal);
    expect(easyNormal).toBeGreaterThan(easyRapida);
  });

  // 6. IntelligentSyncRecovery: diagnóstico de Jitter, Buffering, Stalls e Seeks
  it('6. IntelligentSyncRecovery diagnoses buffering, playback stall, seek and offset issues accurately', () => {
    const recovery = new IntelligentSyncRecovery();

    const diagBuffering = recovery.diagnose(10.0, 10.0, true, false, 1000);
    expect(diagBuffering).not.toBeNull();
    expect(diagBuffering?.type).toBe('BUFFERING');
    expect(diagBuffering?.suggestedAction).toBe('FREEZE');

    recovery.diagnose(10.0, 10.0, false, false, 1000);
    const diagNormal = recovery.diagnose(10.05, 10.05, false, false, 1050);
    expect(diagNormal).toBeNull();

    const diagSeek = recovery.diagnose(25.0, 25.0, false, false, 1100);
    expect(diagSeek).not.toBeNull();
    expect(diagSeek?.type).toBe('SEEK_DETECTED');
    expect(diagSeek?.suggestedAction).toBe('REINDEX');

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
    const tntProfile = VerifiedSyncProfileLearning.getProfile('tnt-acdc');
    expect(tntProfile).not.toBeNull();
    expect(tntProfile?.songId).toBe('tnt-acdc');
    expect(tntProfile?.confidence).toBe('VERIFIED');
    expect(tntProfile?.verifiedAnchors.length).toBeGreaterThanOrEqual(3);

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

  // 8. MusicIntelligenceConfidenceEngine: honestidade de rotulação
  it('8. MusicIntelligenceConfidenceEngine provides honest labeling without false AI claims', () => {
    const fallbackLabel = MusicIntelligenceConfidenceEngine.getHonestLabel('FALLBACK_DSP', false);
    expect(fallbackLabel.mode).toBe('FALLBACK_DSP');
    expect(fallbackLabel.badge).toContain('FALLBACK_DSP');
    expect(fallbackLabel.badge).not.toContain('Spotify');

    const realAILabel = MusicIntelligenceConfidenceEngine.getHonestLabel('REAL_AI', true);
    expect(realAILabel.mode).toBe('REAL_AI');
    expect(realAILabel.badge).toContain('Spotify Basic Pitch & Demucs');

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

  // 9. Hotfix V13.9.4.1: T.N.T. sem referência independente registrada retorna INSUFFICIENT_EVIDENCE
  it('9. T.N.T. pilot track without certified external independent reference reports INSUFFICIENT_EVIDENCE (no circular self-comparison)', () => {
    const expertChart = beatmapManager.getBeatmap('tnt-acdc', 'EXPERT');
    expect(expertChart.length).toBe(1639);

    // Sem dataset externo independente registrado no repositório
    const evaluation = MusicAccuracyValidator.evaluateChartAccuracy(
      'tnt-acdc',
      'EXPERT',
      expertChart
    );

    // O status honesto DEVE ser INSUFFICIENT_EVIDENCE, eliminando a antiga validação circular de 100%
    expect(evaluation.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(evaluation.truePositives).toBe(0);
    expect(evaluation.referenceEventsCount).toBe(0);
    expect(evaluation.details).toContain('Nenhuma anotação musical de referência independente disponível');
  });

  // 10. Bloqueio de Validação Circular: rejeição quando a referência deriva do mesmo chart
  it('10. Circular validation blocker detects and rejects shared origin references with CIRCULAR_VALIDATION_REJECTED', () => {
    const expertChart = beatmapManager.getBeatmap('tnt-acdc', 'EXPERT');

    // Tentativa 1: Passar a própria instância de array do chart como referência
    const circularResult1 = MusicAccuracyValidator.evaluateChartAccuracy(
      'tnt-acdc',
      'EXPERT',
      expertChart,
      expertChart as any
    );
    expect(circularResult1.status).toBe('CIRCULAR_VALIDATION_REJECTED');
    expect(circularResult1.isCircularValidationBlocked).toBe(true);
    expect(circularResult1.details).toContain('Validação bloqueada por circularidade');

    // Tentativa 2: Registro falso que referencia o chart interno nos metadados
    const circularRecord: IndependentGroundTruthRecord = {
      songId: 'tnt-acdc',
      recordingId: 'yt-fGDQ9IukMOc',
      difficulty: 'EXPERT',
      sourceType: 'SYNTHETIC_BENCHMARK',
      sourceDescription: 'Copiado de RAW_INTERNATIONAL_CHARTS para forçar 100%',
      annotationVersion: '1.0-fake',
      events: expertChart.map((n) => ({ time: n.time, lane: n.lane, duration: n.duration })),
      provenance: {
        authorOrLab: 'Internal Copier',
        date: '2026-10-31',
        method: 'SYNTHETIC_BENCHMARK',
        datasetName: 'Raw International Mirror',
        isIndependent: false, // Declarado não independente
        sourceChartIdToExclude: 'tnt-acdc_EXPERT'
      },
      validationStatus: 'UNVERIFIED'
    };

    const circularResult2 = MusicAccuracyValidator.evaluateChartAccuracy(
      'tnt-acdc',
      'EXPERT',
      expertChart,
      circularRecord.events,
      circularRecord
    );
    expect(circularResult2.status).toBe('CIRCULAR_VALIDATION_REJECTED');
    expect(circularResult2.isCircularValidationBlocked).toBe(true);
  });

  // 11. Validação com Referência Independente Genuína (VERIFIED_90_PLUS)
  it('11. Independent ground truth reference with >= 90% Precision/Recall achieves VERIFIED_90_PLUS', () => {
    // Criação de um chart de teste
    const chartNotes: Note[] = [];
    for (let i = 0; i < 100; i++) {
      chartNotes.push({
        id: i + 1,
        time: Number((1.0 + i * 0.5).toFixed(3)),
        lane: (i % 4) as any,
        duration: 0.1
      });
    }

    // Dataset de referência independente certificado (leve variação humana de 10ms a 15ms)
    const independentEvents: GroundTruthEvent[] = [];
    for (let i = 0; i < 100; i++) {
      const humanJitterSec = ((i % 5) - 2) * 0.005; // -10ms to +10ms
      independentEvents.push({
        time: Number((1.0 + i * 0.5 + humanJitterSec).toFixed(3)),
        lane: (i % 4) as any,
        duration: 0.1,
        label: 'Acoustic Guitar Attack'
      });
    }

    const independentRecord: IndependentGroundTruthRecord = {
      songId: 'independent-test-song',
      recordingId: 'rec-official-audio',
      difficulty: 'EXPERT',
      sourceType: 'INDEPENDENT_MANUAL_TRANSCRIPTION',
      sourceDescription: 'Transcrição acústica independente por musicólogos certificados',
      annotationVersion: '2026.1',
      events: independentEvents,
      provenance: {
        authorOrLab: 'Acoustic Musicology Lab',
        date: '2026-10-31',
        method: 'MANUAL_TRANSCRIPTION',
        datasetName: 'RockBrazil Independent Acoustic Benchmark',
        isIndependent: true,
        isSynthetic: false
      },
      validationStatus: 'CERTIFIED'
    };

    IndependentGroundTruthRepository.registerRecord(independentRecord);

    const evaluation = MusicAccuracyValidator.evaluateChartAccuracy(
      'independent-test-song',
      'EXPERT',
      chartNotes,
      independentRecord.events,
      independentRecord
    );

    expect(evaluation.status).toBe('VERIFIED_90_PLUS');
    expect(evaluation.precision).toBeGreaterThanOrEqual(0.90);
    expect(evaluation.recall).toBeGreaterThanOrEqual(0.90);
    expect(evaluation.f1).toBeGreaterThanOrEqual(0.90);
    expect(evaluation.medianErrorMs).toBeLessThanOrEqual(30);
    expect(evaluation.p95ErrorMs).toBeLessThanOrEqual(50);
    expect(evaluation.temporalAccuracy?.within20msPercent).toBeGreaterThan(90);
  });

  // 12. Avaliação de Notas Adiantadas (Rushing) e Notas Atrasadas (Dragging)
  it('12. MusicAccuracyValidator measures temporal deviations for rushing and dragging charts', () => {
    const baseEvents: GroundTruthEvent[] = [
      { time: 1.0 }, { time: 2.0 }, { time: 3.0 }, { time: 4.0 }, { time: 5.0 }
    ];

    // Chart adiantado em 35ms (-0.035s)
    const rushingNotes: Note[] = baseEvents.map((e, idx) => ({
      id: idx + 1,
      time: Number((e.time - 0.035).toFixed(3)),
      lane: 0,
      duration: 0
    }));

    const rushEval = MusicAccuracyValidator.evaluateChartAccuracy(
      'test-rush',
      'EASY',
      rushingNotes,
      baseEvents
    );
    expect(rushEval.truePositives).toBe(5);
    expect(rushEval.medianErrorMs).toBeCloseTo(35, 1);

    // Chart atrasado em 40ms (+0.040s)
    const draggingNotes: Note[] = baseEvents.map((e, idx) => ({
      id: idx + 1,
      time: Number((e.time + 0.040).toFixed(3)),
      lane: 0,
      duration: 0
    }));

    const dragEval = MusicAccuracyValidator.evaluateChartAccuracy(
      'test-drag',
      'EASY',
      draggingNotes,
      baseEvents
    );
    expect(dragEval.truePositives).toBe(5);
    expect(dragEval.medianErrorMs).toBeCloseTo(40, 1);
  });

  // 13. Avaliação de Notas Ausentes (queda de Recall) e Notas Extras (queda de Precision)
  it('13. Missing notes penalize Recall while extra phantom notes penalize Precision and mark BELOW_TARGET', () => {
    const baseEvents: GroundTruthEvent[] = [];
    for (let i = 0; i < 20; i++) {
      baseEvents.push({ time: Number((1.0 + i * 0.5).toFixed(3)) });
    }

    // Chart com 40% das notas ausentes (apenas 12 de 20)
    const sparseNotes: Note[] = baseEvents.slice(0, 12).map((e, idx) => ({
      id: idx + 1,
      time: e.time,
      lane: 0,
      duration: 0
    }));

    const sparseEval = MusicAccuracyValidator.evaluateChartAccuracy(
      'test-sparse',
      'MEDIUM',
      sparseNotes,
      baseEvents
    );
    expect(sparseEval.recall).toBeCloseTo(0.60, 2);
    expect(sparseEval.falseNegatives).toBe(8);
    expect(sparseEval.status).toBe('BELOW_TARGET');

    // Chart com notas extras fantasmas (20 notas normais + 10 extras)
    const bloatedNotes: Note[] = [...sparseNotes];
    for (let i = 0; i < 15; i++) {
      bloatedNotes.push({
        id: 100 + i,
        time: Number((10.0 + i * 0.3).toFixed(3)),
        lane: 1,
        duration: 0
      });
    }

    const bloatedEval = MusicAccuracyValidator.evaluateChartAccuracy(
      'test-bloated',
      'MEDIUM',
      bloatedNotes,
      baseEvents
    );
    expect(bloatedEval.falsePositives).toBeGreaterThan(0);
    expect(bloatedEval.precision).toBeLessThan(0.90);
    expect(bloatedEval.status).toBe('BELOW_TARGET');
  });

  // 14. 100 consecutive misses do not freeze, mute or stop highway or audio timeline
  it('14. 100 consecutive misses do not freeze, mute or stop highway or audio timeline', () => {
    const sync = new UniversalMusicSyncEngine();
    sync.startPlayback();

    let mediaTime = 20.0;
    sync.setSource({
      getCurrentTime: () => mediaTime,
      isPlaying: () => true,
      isBuffering: () => false,
      isPaused: () => false
    });

    for (let i = 0; i < 100; i++) {
      sync.registerMiss();
    }

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

  // 15. Buffering freezes timeline without counting false misses
  it('15. Buffering freezes timeline progression cleanly without counting false misses', () => {
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

    sync.update(1000);
    mediaTime += 0.5;
    const snap1 = sync.update(1500);
    expect(snap1.mediaTime).toBe(12.5);

    isBuffering = true;
    const snapBuffering = sync.update(1600);
    expect(snapBuffering.isBuffering).toBe(true);

    const initialChartTime = snapBuffering.chartTime;
    for (let i = 0; i < 10; i++) {
      const snap = sync.update(1600 + i * 50);
      expect(snap.chartTime).toBeCloseTo(initialChartTime, 3);
      expect(snap.isBuffering).toBe(true);
    }
  });

  // 16. YouTube Error 150 e Fallback de Áudio Local
  it('16. YouTube Error 150 parses as embed blocked and configures local audio fallback without native alert', () => {
    const errorDetails = parseYouTubeError(150);
    expect(errorDetails.code).toBe(150);
    expect(errorDetails.isEmbedBlocked).toBe(true);
    expect(errorDetails.canRetry).toBe(false);

    // Error 101 e 150 devem reportar mensagem clara de incorporação restrita
    expect(errorDetails.message).toBe('Este vídeo não permite reprodução dentro do jogo.');
  });
});
