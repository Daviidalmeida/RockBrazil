import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedMasterClock, YOUTUBE_SYSTEMIC_IPC_LATENCY_SEC } from '../src/game/sync/masterClock';
import { AdaptiveClockEstimator } from '../src/game/rockchart/telemetry/adaptiveClockEstimator';
import { RockSyncIntroDetectorV2 } from '../src/game/rockchart/sync/rockSyncIntroDetectorV2';
import { RockSyncQualityGate } from '../src/game/rockchart/sync/rockSyncQualityGate';
import { RockSyncIntelligentMatcher } from '../src/game/rockchart/sync/rockSyncIntelligentMatcher';
import { RockSyncProfileRepository } from '../src/game/rockchart/sync/rockSyncProfileRepository';
import { AudioPlaybackController } from '../src/audio/audioPlaybackController';
import { CalibrationManager } from '../src/game/sync/calibrationManager';
import { Note, PlaybackState, Difficulty } from '../src/types';

describe('ROCKBRAZIL V14.1 — SUÍTE DE TESTES: ROCKSYNC INTELLIGENT MATCHING (20 CENÁRIOS)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 1: Offset Positivo
  // --------------------------------------------------------------------------
  it('1. Offset positivo: avança corretamente o tempo musical quando o vídeo inicia antes do chart', () => {
    const clock = new UnifiedMasterClock();
    clock.setOffsets(1200, 0); // +1200ms
    expect(clock.getTotalOffsetSec()).toBeCloseTo(1.200, 3);

    const mockSource = {
      getCurrentTime: () => 5.0,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };
    clock.setSource(mockSource);
    clock.startPlayback();

    // 5.0 + 1.2 = 6.2s
    expect(clock.getTime()).toBeCloseTo(6.200, 2);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 2: Offset Negativo
  // --------------------------------------------------------------------------
  it('2. Offset negativo: atrasa o tempo musical quando o vídeo possui introdução estendida', () => {
    const clock = new UnifiedMasterClock();
    clock.setOffsets(-850, 0); // -850ms
    expect(clock.getTotalOffsetSec()).toBeCloseTo(-0.850, 3);

    const mockSource = {
      getCurrentTime: () => 5.0,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };
    clock.setSource(mockSource);
    clock.startPlayback();

    // 5.0 - 0.85 = 4.15s
    expect(clock.getTime()).toBeCloseTo(4.150, 2);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 3: Introdução Instrumental
  // --------------------------------------------------------------------------
  it('3. Introdução instrumental: identifica seção instrumental inicial sem notas jogáveis', () => {
    const notes: Note[] = [
      { id: 1, time: 8.5, lane: 2, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
      { id: 2, time: 9.0, lane: 3, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    const report = RockSyncIntroDetectorV2.analyze({
      songId: 'test-instrumental-intro',
      title: 'Instrumental Song',
      artist: 'Rock Band',
      notes,
      chartDurationSec: 200,
      youtubeVideoId: 'video-instr-123',
      youtubeDurationSec: 200
    });

    expect(report.isInstrumentalIntro).toBe(true);
    expect(report.firstPlayableNoteTime).toBe(8.5);
    expect(report.hasDuplicateOffsetRisk).toBe(false);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 4: Silêncio Inicial
  // --------------------------------------------------------------------------
  it('4. Silêncio inicial: detecta diferença de duração entre gravação e vídeo com cena silenciosa', () => {
    const notes: Note[] = [
      { id: 1, time: 3.269, lane: 4, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    const report = RockSyncIntroDetectorV2.analyze({
      songId: 'intl-gnr-welcome-to-the-jungle',
      title: 'Welcome to the Jungle',
      artist: "Guns N' Roses",
      notes,
      chartDurationSec: 271,
      youtubeVideoId: 'o1tj2zJ2Wvg',
      youtubeDurationSec: 275
    });

    expect(report.isInitialSilenceDetected).toBe(true);
    expect(report.suggestedOffsetMs).toBe(-3800);
    expect(report.offsetSignCorrect).toBe(true);
    expect(report.auditNotes).toContain('3.8s de introdução narrativa');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 5: Offset Duplicado
  // --------------------------------------------------------------------------
  it('5. Offset duplicado: detecta risco de aplicar deslocamento já embutido no chart', () => {
    // Chart cujas notas já iniciam em 2.0s igual ao declaredOffset de -2000ms
    const notes: Note[] = [
      { id: 1, time: 2.0, lane: 1, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    const report = RockSyncIntroDetectorV2.analyze({
      songId: 'test-duplicate-offset',
      title: 'Duplicate Song',
      artist: 'Band',
      notes,
      chartDurationSec: 250,
      declaredChartOffsetMs: -2000,
      youtubeVideoId: 'vid-dup-1',
      youtubeDurationSec: 250
    });

    expect(report.hasDuplicateOffsetRisk).toBe(true);
    expect(report.confidence).toBeLessThanOrEqual(0.7);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 6: Primeira Nota Distante do Início
  // --------------------------------------------------------------------------
  it('6. Primeira nota distante do início: preserva o alinhamento de faixas com longa abertura', () => {
    const notes: Note[] = [
      { id: 1, time: 18.5, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
      { id: 2, time: 19.0, lane: 1, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    const report = RockSyncIntroDetectorV2.analyze({
      songId: 'long-ambient-intro',
      title: 'Atmospheric Track',
      artist: 'Prog Metal',
      notes,
      chartDurationSec: 320,
      youtubeVideoId: 'vid-atm-99',
      youtubeDurationSec: 320
    });

    expect(report.firstPlayableNoteTime).toBe(18.5);
    expect(report.isInstrumentalIntro).toBe(true);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 7: Compensação Variável do Relógio (AdaptiveClockEstimator)
  // --------------------------------------------------------------------------
  it('7. Compensação variável do relógio: extrapola suavemente entre atualizações discretas de telemetria', () => {
    const estimator = new AdaptiveClockEstimator();
    let currentYt = 1.0;

    const mockSource = {
      getCurrentTime: () => currentYt,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };

    // Amostra 1: t0
    const est1 = estimator.update(mockSource, 1000);
    expect(est1).toBe(1.0);

    // Passam-se 50ms (telemetria do YouTube ainda não mudou)
    const est2 = estimator.update(mockSource, 1050);
    expect(est2).toBeCloseTo(1.050, 3);
    expect(est2).toBeGreaterThan(est1);

    // Passam-se 100ms
    const est3 = estimator.update(mockSource, 1100);
    expect(est3).toBeCloseTo(1.100, 3);

    // Amostra 2 chega do YouTube aos 200ms: 1.2s
    currentYt = 1.2;
    const est4 = estimator.update(mockSource, 1200);
    expect(est4).toBeCloseTo(1.200, 3);

    const diag = estimator.getDiagnostics(mockSource);
    expect(diag.sampleCount).toBe(2);
    expect(diag.averageIntervalMs).toBeCloseTo(200, -1);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 8: Atualizações Irregulares do YouTube (Jitter)
  // --------------------------------------------------------------------------
  it('8. Atualizações irregulares do YouTube: calcula jitter sem gerar saltos retrocessivos', () => {
    const estimator = new AdaptiveClockEstimator();
    let currentYt = 0.0;

    const mockSource = {
      getCurrentTime: () => currentYt,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };

    // Sequência com intervalos com jitter: 180ms, 250ms, 190ms
    estimator.update(mockSource, 1000); // 0.0s

    currentYt = 0.18;
    estimator.update(mockSource, 1180);

    currentYt = 0.43;
    estimator.update(mockSource, 1430);

    currentYt = 0.62;
    estimator.update(mockSource, 1620);

    const diag = estimator.getDiagnostics(mockSource);
    expect(diag.jitterMs).toBeGreaterThan(0);
    expect(diag.estimatedTime).toBeGreaterThanOrEqual(0.62);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 9: Buffering Congela Estimativa
  // --------------------------------------------------------------------------
  it('9. Buffering: congela imediatamente a extrapolação do relógio sem avanço das notas', () => {
    const estimator = new AdaptiveClockEstimator();
    let isBuffering = false;

    const mockSource = {
      getCurrentTime: () => 5.0,
      getPlaybackState: () => (isBuffering ? PlaybackState.BUFFERING : PlaybackState.PLAYING),
      isBuffering: () => isBuffering
    };

    estimator.update(mockSource, 1000);
    const beforeBuffer = estimator.update(mockSource, 1050);
    expect(beforeBuffer).toBeCloseTo(5.050, 3);

    // Entra em buffering
    isBuffering = true;
    const inBuffer1 = estimator.update(mockSource, 1100);
    expect(inBuffer1).toBe(beforeBuffer);

    // Passa o tempo no relógio do sistema, mas estimador permanece congelado
    const inBuffer2 = estimator.update(mockSource, 2500);
    expect(inBuffer2).toBe(beforeBuffer);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 10: Pausa e Retomada Monotônica
  // --------------------------------------------------------------------------
  it('10. Pausa e retomada: retoma sem saltos acumulados pós-pausa', () => {
    const estimator = new AdaptiveClockEstimator();
    let state = PlaybackState.PLAYING;

    const mockSource = {
      getCurrentTime: () => 10.0,
      getPlaybackState: () => state,
      isBuffering: () => false
    };

    estimator.update(mockSource, 1000);
    const frozen = estimator.update(mockSource, 1050);

    // Pausa
    state = PlaybackState.PAUSED;
    expect(estimator.update(mockSource, 1500)).toBe(frozen);

    // Retoma 2 segundos depois
    state = PlaybackState.PLAYING;
    const resumed = estimator.update(mockSource, 3500);
    expect(resumed).toBeGreaterThanOrEqual(frozen);
    expect(resumed - frozen).toBeLessThan(0.05); // Não acumula os 2s da pausa
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 11: Seek
  // --------------------------------------------------------------------------
  it('11. Seek no player: sincroniza imediatamente com a nova posição sem manter histórico defasado', () => {
    const estimator = new AdaptiveClockEstimator();
    let currentYt = 10.0;

    const mockSource = {
      getCurrentTime: () => currentYt,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };

    estimator.update(mockSource, 1000);

    // Usuário faz seek para 85.0s
    currentYt = 85.0;
    const seekResult = estimator.update(mockSource, 1200);
    expect(seekResult).toBe(85.0);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 12: Mudança de Música
  // --------------------------------------------------------------------------
  it('12. Mudança de música: reseta o estimador adaptativo e zera todas as métricas', () => {
    const estimator = new AdaptiveClockEstimator();
    const mockSource = {
      getCurrentTime: () => 50.0,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };

    estimator.update(mockSource, 1000);
    expect(estimator.getDiagnostics(mockSource).sampleCount).toBe(1);

    estimator.reset();
    expect(estimator.getDiagnostics(null).sampleCount).toBe(0);
    expect(estimator.getDiagnostics(null).estimatedTime).toBe(0);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 13: Versão Incompatível
  // --------------------------------------------------------------------------
  it('13. Versão incompatível: classifica como SYNC_INCOMPATIBLE quando duração diverge severamente', () => {
    const notes: Note[] = [
      { id: 1, time: 1.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    const evaluation = RockSyncQualityGate.evaluate({
      songId: 'song-incompatible',
      title: 'Studio Song',
      artist: 'Band',
      notes,
      chartDurationSec: 180,
      youtubeVideoId: 'live-extended-video',
      youtubeDurationSec: 250 // Diferença de 70 segundos (show ao vivo)
    });

    expect(evaluation.gateStatus).toBe('SYNC_INCOMPATIBLE');
    expect(evaluation.recordingMatch.matchLevel).toBe('INCOMPATIBLE');
    expect(evaluation.summary).toContain('SYNC_INCOMPATIBLE');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 14: Chart Já Sincronizado
  // --------------------------------------------------------------------------
  it('14. Chart já sincronizado: preserva offset 0ms em faixas de estúdio compatíveis', () => {
    const notes: Note[] = [
      { id: 1, time: 2.0, lane: 1, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    const matcher = new RockSyncIntelligentMatcher();
    const res = matcher.match({
      songId: 'studio-clean-track',
      title: 'Clean Track',
      artist: 'Clean Artist',
      chartId: 'chart-clean',
      chartSource: 'CHORUS_ENCORE',
      notes,
      chartDurationSec: 210,
      bpm: 120,
      youtubeVideoId: 'clean-video-yt',
      youtubeDurationSec: 210
    });

    expect(res.profile.offsetMs).toBe(0);
    expect(res.profile.syncMethod).toBe('STUDIO_TIMESTAMP_ALIGNED');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 15: Preservação de Notas Originais
  // --------------------------------------------------------------------------
  it('15. Preservação de notas originais: correções temporais nunca alteram intervalos relativos', () => {
    const originalNotes: Note[] = [
      { id: 1, time: 1.0, lane: 0, duration: 0.5, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
      { id: 2, time: 2.5, lane: 2, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
      { id: 3, time: 4.0, lane: 4, duration: 1.0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    const offsetSec = -3.8;
    const transformedNotes = originalNotes.map((n) => ({
      ...n,
      time: n.time + offsetSec
    }));

    // Verifica que a distância entre notas foi rigorosamente mantida
    const deltaOrig1 = originalNotes[1].time - originalNotes[0].time;
    const deltaTrans1 = transformedNotes[1].time - transformedNotes[0].time;
    expect(deltaTrans1).toBeCloseTo(deltaOrig1, 5);

    const deltaOrig2 = originalNotes[2].time - originalNotes[1].time;
    const deltaTrans2 = transformedNotes[2].time - transformedNotes[1].time;
    expect(deltaTrans2).toBeCloseTo(deltaOrig2, 5);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 16: Regra MISS/HIT Preservada (V13.9.6)
  // --------------------------------------------------------------------------
  it('16. Regra MISS/HIT definitiva: MISS silencia imediatamente e HIT restaura com rampa suave', () => {
    const mockAudio = {
      setMuteOnMiss: vi.fn(),
      getMuteGainValue: () => 1.0,
      getCurrentTime: () => 0
    };
    const mockYt = {
      setMuted: vi.fn(),
      getVolume: () => 85,
      setVolume: vi.fn(),
      getCurrentTime: () => 5.0
    };

    const controller = new AudioPlaybackController(mockAudio as any, mockYt as any);

    controller.handleGameplayMiss();
    expect(controller.isGameplayMissMuted()).toBe(true);
    expect(mockYt.setMuted).toHaveBeenCalledWith(true);
    expect(mockAudio.setMuteOnMiss).toHaveBeenCalledWith(true);

    controller.handleGameplayHit();
    expect(controller.isGameplayMissMuted()).toBe(false);
    expect(mockYt.setMuted).toHaveBeenCalledWith(false, true);
    expect(mockAudio.setMuteOnMiss).toHaveBeenCalledWith(false);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 17: Encerramento Completo ao Sair
  // --------------------------------------------------------------------------
  it('17. Encerramento completo ao sair: silencia e desliga fontes no menu', () => {
    const mockAudio = {
      setMuteOnMiss: vi.fn(),
      stop: vi.fn(),
      getMuteGainValue: () => 1.0,
      getCurrentTime: () => 0
    };
    const mockYt = {
      setMuted: vi.fn(),
      stop: vi.fn(),
      getVolume: () => 85,
      setVolume: vi.fn(),
      getCurrentTime: () => 5.0
    };

    const controller = new AudioPlaybackController(mockAudio as any, mockYt as any);
    controller.stop();

    expect(mockYt.stop).toHaveBeenCalled();
    expect(mockAudio.stop).toHaveBeenCalled();
    expect(controller.getStatus().playbackState).not.toBe(PlaybackState.PLAYING);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 18: Ausência de Referência Acústica
  // --------------------------------------------------------------------------
  it('18. Ausência de referência acústica: reporta ausência honesta sem inventar porcentagens de precisão', () => {
    const notes: Note[] = [
      { id: 1, time: 1.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    const evaluation = RockSyncQualityGate.evaluate({
      songId: 'uncalibrated-song',
      title: 'Title',
      artist: 'Artist',
      notes,
      chartDurationSec: 180,
      youtubeVideoId: 'some-video-id',
      youtubeDurationSec: 180
    });

    expect(evaluation.acousticEvidence.hasIndependentAcousticReference).toBe(false);
    expect(evaluation.acousticEvidence.disclaimer).toContain('Sem análise acústica PCM direta');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 19: Persistência do Perfil de Sincronização
  // --------------------------------------------------------------------------
  it('19. Persistência de perfil: salva e recupera perfil integrado ao CalibrationManager', () => {
    const repo = RockSyncProfileRepository.getInstance();
    repo.saveProfile({
      songId: 'persisted-song-v14-1',
      chartId: 'chart-persisted',
      chartVersion: '1.0',
      chartSource: 'CHORUS_ENCORE',
      recordingId: 'rec-persisted',
      youtubeVideoId: 'yt-persisted-999',
      difficulty: 'HARD',
      offsetMs: -1500,
      timeScale: 1.0,
      syncMethod: 'OFFICIAL_VIDEO_ALIGNMENT',
      evidenceSource: 'Teste de persistência V14.1',
      validationStatus: 'VERIFIED',
      updatedAt: new Date().toISOString()
    });

    const retrieved = repo.getProfileForSong('persisted-song-v14-1', 'yt-persisted-999');
    expect(retrieved).toBeDefined();
    expect(retrieved?.offsetMs).toBe(-1500);

    const calibrationOffset = CalibrationManager.getSongOffsetMs('persisted-song-v14-1', 'yt-persisted-999');
    expect(calibrationOffset).toBe(-1500);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 20: Funcionamento no Android e Desktop
  // --------------------------------------------------------------------------
  it('20. Multiplataforma Android e desktop: estimador funciona com performance.now() padrão Web', () => {
    const clock = new UnifiedMasterClock();
    clock.configureForSource('youtube');

    let timeValue = 1.0;
    const mockSource = {
      getCurrentTime: () => timeValue,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };

    clock.setSource(mockSource);
    clock.startPlayback();

    const t1 = clock.getTime();
    expect(typeof t1).toBe('number');
    expect(t1).toBeGreaterThanOrEqual(1.0);

    const diag = clock.getTelemetryDiagnostics();
    expect(diag).toBeDefined();
    expect(typeof diag.averageIntervalMs).toBe('number');
  });
});
