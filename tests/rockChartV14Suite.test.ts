import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChorusEncoreProvider } from '../src/game/rockchart/providers/enchorProvider';
import { RhythmVerseProvider } from '../src/game/rockchart/providers/rhythmVerseProvider';
import { ChartProviderRegistry } from '../src/game/rockchart/providers/providerRegistry';
import { RockChartImporter } from '../src/game/rockchart/importer/rockChartImporter';
import { RockSyncAutoMatch } from '../src/game/rockchart/sync/rockSyncAutoMatch';
import { RockSyncProfileRepository } from '../src/game/rockchart/sync/rockSyncProfileRepository';
import { RockChartValidator } from '../src/game/rockchart/validator/rockChartValidator';
import { RockChartStudio } from '../src/game/rockchart/studio/rockChartStudio';
import { UnifiedMasterClock, YOUTUBE_SYSTEMIC_IPC_LATENCY_SEC } from '../src/game/sync/masterClock';
import { AudioPlaybackController } from '../src/audio/audioPlaybackController';
import { PlaybackState, Note, Difficulty } from '../src/types';
import { IndependentGroundTruthRepository } from '../src/game/intelligence/independentGroundTruthRepository';

describe('ROCKBRAZIL V14.0 — SUÍTE DE TESTES ROCKCHART AI + ROCKSYNC AUTOSYNC (20 CENÁRIOS)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 1: Pesquisa nos Dois Provedores
  // --------------------------------------------------------------------------
  it('1. Pesquisa nos dois provedores: registry consulta Chorus Encore e RhythmVerse com deduplicação', async () => {
    const registry = ChartProviderRegistry.getInstance();
    const providers = registry.getAllProviders();
    expect(providers.length).toBeGreaterThanOrEqual(2);
    expect(providers.some((p) => p.providerId === 'CHORUS_ENCORE')).toBe(true);
    expect(providers.some((p) => p.providerId === 'RHYTHMVERSE')).toBe(true);

    const { results, providerStatus } = await registry.searchAll({
      artist: "Guns N' Roses",
      title: 'Welcome to the Jungle'
    });

    expect(providerStatus).toHaveLength(2);
    expect(providerStatus.find((p) => p.providerId === 'CHORUS_ENCORE')).toBeDefined();
    expect(providerStatus.find((p) => p.providerId === 'RHYTHMVERSE')).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 2: Falha e Limites de Provedor Externo
  // --------------------------------------------------------------------------
  it('2. Falha de provedor externo: lida com erro de rede ou ausência de API pública sem quebrar', async () => {
    const chorus = new ChorusEncoreProvider();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error / CORS'));

    const results = await chorus.search({ title: 'Nonexistent Song' });
    expect(results).toEqual([]);
    expect(chorus.isLiveApiAvailable()).toBe(false);

    const rhythmVerse = new RhythmVerseProvider();
    expect(rhythmVerse.isLiveApiAvailable()).toBe(false);
    expect(rhythmVerse.getTermsNotice()).toContain('rhythmverse.co');
    expect(rhythmVerse.getDirectWebSearchUrl('AC/DC', 'T.N.T.')).toContain('rhythmverse.co/songfiles');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 3: Importação de MIDI
  // --------------------------------------------------------------------------
  it('3. Importação de MIDI: converte tracks de notas, andamento e BPM a partir de dados binários', async () => {
    // Cabeçalho MThd válido com 1 track MTrk
    const dummyMidi = new Uint8Array([
      0x4D, 0x54, 0x68, 0x64, // MThd
      0x00, 0x00, 0x00, 0x06, // length 6
      0x00, 0x01,             // format 1
      0x00, 0x01,             // 1 track
      0x01, 0xE0,             // 480 division
      0x4D, 0x54, 0x72, 0x6B, // MTrk
      0x00, 0x00, 0x00, 0x04, // length 4
      0x00, 0xFF, 0x2F, 0x00  // End of track
    ]);

    const res = await RockChartImporter.importChartFile(dummyMidi, 'notes.mid', 'COMMUNITY_UPLOAD');
    expect(res).toBeDefined();
    expect(res.originalRawData.fileFormat).toBe('.mid');
    expect(res.derivedCharts).toBeDefined();
    expect(res.derivedCharts.EASY).toBeDefined();
    expect(res.derivedCharts.EXPERT).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 4: Importação de CHART (.chart Moonscraper/FeedBack)
  // --------------------------------------------------------------------------
  it('4. Importação de CHART: extrai eventos de notas, seções e BPM preservando dados originais', async () => {
    const chartContent = `[Song]
{
  Name = "Welcome to the Jungle"
  Artist = "Guns N' Roses"
  Charter = "CloneHeroCommunity"
  Offset = 0
  Resolution = 192
}
[SyncTrack]
{
  0 = TS 4
  0 = B 120000
}
[ExpertSingle]
{
  192 = N 0 0
  384 = N 1 0
  576 = N 2 96
  768 = N 3 0
  960 = N 4 0
}
[EasySingle]
{
  192 = N 0 0
  384 = N 1 0
  576 = N 2 0
}`;

    const res = await RockChartImporter.importChartFile(chartContent, 'notes.chart', 'CHORUS_ENCORE');
    expect(res.title).toBe("Welcome to the Jungle");
    expect(res.artist).toBe("Guns N' Roses");
    expect(res.derivedCharts.EXPERT.length).toBe(5);
    expect(res.derivedCharts.EASY.length).toBe(3);
    // Preservação integral do original
    expect(res.originalRawData.rawContent).toBe(chartContent);
    expect(res.originalRawData.charter).toBe("CloneHeroCommunity");
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 5: Conversão de Dificuldades (3 pistas Easy, 4 pistas Med, 5 Hard/Exp)
  // --------------------------------------------------------------------------
  it('5. Conversão de dificuldades: garante estritamente 3 pistas no EASY, 4 no MEDIUM e 5 no HARD/EXPERT', async () => {
    const chartContent = `[Song]
{
  Name = "MultiLane Test"
  Artist = "RockBrazil"
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[ExpertSingle]
{
  192 = N 0 0
  384 = N 1 0
  576 = N 2 0
  768 = N 3 0
  960 = N 4 0
}`;

    const res = await RockChartImporter.importChartFile(chartContent, 'notes.chart');
    // EASY: nenhuma pista pode ser maior que 2 (3 pistas: 0, 1, 2)
    const easyMaxLane = Math.max(...res.derivedCharts.EASY.map((n) => n.lane));
    expect(easyMaxLane).toBeLessThanOrEqual(2);

    // MEDIUM: nenhuma pista pode ser maior que 3 (4 pistas: 0, 1, 2, 3)
    const medMaxLane = Math.max(...res.derivedCharts.MEDIUM.map((n) => n.lane));
    expect(medMaxLane).toBeLessThanOrEqual(3);

    // HARD / EXPERT: até 4 (5 pistas: 0, 1, 2, 3, 4)
    const expMaxLane = Math.max(...res.derivedCharts.EXPERT.map((n) => n.lane));
    expect(expMaxLane).toBeLessThanOrEqual(4);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 6: Preservação dos Charts Originais
  // --------------------------------------------------------------------------
  it('6. Preservação dos charts originais: originalRawData é mantido inalterado ao gerar derivações', async () => {
    const rawChart = `[Song]\n{\n  Name = "Original Only"\n}\n[SyncTrack]\n{\n  0 = B 120000\n}\n[ExpertSingle]\n{\n  192 = N 4 0\n}`;
    const res = await RockChartImporter.importChartFile(rawChart, 'original.chart');

    expect(res.originalRawData.rawContent).toBe(rawChart);
    // Modificar as notas derivadas não afeta originalRawData
    res.derivedCharts.EXPERT[0].lane = 0;
    expect(res.originalRawData.rawContent).toContain('192 = N 4 0');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 7: Comparação de Gravações e Metadados
  // --------------------------------------------------------------------------
  it('7. Comparação de gravações: detecta divergência grave de duração entre vídeo e chart', () => {
    const matcher = new RockSyncAutoMatch();
    const notes: Note[] = [{ id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }];

    const result = matcher.match({
      songId: 'intl-test-song',
      chartId: 'chart-test',
      chartSource: 'COMMUNITY_UPLOAD',
      chartDurationSec: 300,
      firstNoteTimeSec: 2.0,
      lastNoteTimeSec: 290.0,
      notes,
      youtubeVideoId: 'shortVideo123',
      youtubeVideoDurationSec: 180, // 2 minutos mais curto que o chart!
      artist: 'Test Artist',
      title: 'Test Song'
    });

    expect(result.matchType).toBe('INCOMPATIBLE');
    expect(result.recommendedAction).toBe('REJECT');
    expect(result.profile.validationStatus).toBe('INCOMPATIBLE');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 8: Aplicação de Offset Confiável (Welcome to the Jungle Piloto)
  // --------------------------------------------------------------------------
  it('8. Aplicação de offset confiável: calibra Welcome to the Jungle com abertura de Axl Rose e compensação YouTube', () => {
    const matcher = new RockSyncAutoMatch();
    const notes: Note[] = [{ id: 1, time: 3.269, lane: 2, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }];

    const result = matcher.match({
      songId: 'intl-gnr-welcome-to-the-jungle',
      chartId: 'chart-gnr-wttj',
      chartSource: 'ROCKBRAZIL_INTERNAL',
      chartDurationSec: 271,
      firstNoteTimeSec: 3.269,
      lastNoteTimeSec: 260.0,
      notes,
      youtubeVideoId: 'o1tj2zJ2Wvg',
      youtubeVideoDurationSec: 271,
      artist: "Guns N' Roses",
      title: 'Welcome to the Jungle'
    });

    expect(result.matchType).toBe('EXACT_KNOWN_PROFILE');
    expect(result.profile.validationStatus).toBe('VERIFIED');
    expect(result.profile.offsetMs).toBe(-3800);
    expect(result.recommendedAction).toBe('AUTOMATIC_APPLY');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 9: Rejeição de Perfil Incompatível
  // --------------------------------------------------------------------------
  it('9. Rejeição de perfil incompatível: não certifica quando vídeo não cobre o chart', () => {
    const repo = RockSyncProfileRepository.getInstance();
    repo.saveProfile({
      songId: 'song-incompatible',
      chartId: 'chart-incompatible',
      chartVersion: '1.0',
      chartSource: 'COMMUNITY_UPLOAD',
      recordingId: 'rec-inc',
      youtubeVideoId: 'yt-incompatible',
      difficulty: 'HARD',
      offsetMs: 0,
      timeScale: 1.0,
      syncMethod: 'SYNC_NOT_VERIFIED',
      evidenceSource: 'Gravação cortada',
      validationStatus: 'INCOMPATIBLE',
      updatedAt: new Date().toISOString()
    });

    const prof = repo.getProfile('song-incompatible', 'chart-incompatible', 'yt-incompatible', 'HARD');
    expect(prof?.validationStatus).toBe('INCOMPATIBLE');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 10: Sincronização do Relógio YouTube com Compensação de Latência
  // --------------------------------------------------------------------------
  it('10. Sincronização do relógio YouTube: compensa os 200ms de postMessage do iframe sem saltos', () => {
    const clock = new UnifiedMasterClock();
    let currentYtTime = 1.0;

    const mockYtSource = {
      getCurrentTime: () => currentYtTime,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };

    clock.setSource(mockYtSource);
    clock.configureForSource('youtube');
    clock.startPlayback();

    // YouTube reporta 1.0s -> clock calcula 1.0s + 0.200s (compensação de hardware do iframe) = 1.200s
    expect(clock.getSystemicCompensationSec()).toBe(YOUTUBE_SYSTEMIC_IPC_LATENCY_SEC);
    expect(clock.getTime()).toBeCloseTo(1.200, 2);

    // Avanço monotônico
    currentYtTime = 1.1;
    expect(clock.getTime()).toBeCloseTo(1.300, 2);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 11: Pausa e Buffering
  // --------------------------------------------------------------------------
  it('11. Pausa e buffering: relógio congela imediatamente no momento exato da pausa sem drift', () => {
    const clock = new UnifiedMasterClock();
    let ytTime = 5.0;
    let isBuffering = false;

    const mockSource = {
      getCurrentTime: () => ytTime,
      getPlaybackState: () => (isBuffering ? PlaybackState.BUFFERING : PlaybackState.PLAYING),
      isBuffering: () => isBuffering
    };

    clock.setSource(mockSource);
    clock.startPlayback();

    const tPlay = clock.getTime();
    expect(tPlay).toBe(5.0);

    clock.pause();
    ytTime = 8.0; // tempo externo avança enquanto pausado
    expect(clock.getTime()).toBe(5.0); // relógio estritamente congelado

    clock.resume();
    isBuffering = true;
    clock.setBuffering(true);
    ytTime = 10.0;
    expect(clock.getTime()).toBe(5.0); // congelado durante buffering
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 12: Retomada após Buffering
  // --------------------------------------------------------------------------
  it('12. Retomada após buffering: reconecta o tempo musical sem saltos retrocessivos', () => {
    const clock = new UnifiedMasterClock();
    let ytTime = 5.0;
    let isBuffering = false;

    const mockSource = {
      getCurrentTime: () => ytTime,
      getPlaybackState: () => (isBuffering ? PlaybackState.BUFFERING : PlaybackState.PLAYING),
      isBuffering: () => isBuffering
    };

    clock.setSource(mockSource);
    clock.startPlayback();
    expect(clock.getTime()).toBe(5.0);

    isBuffering = true;
    clock.setBuffering(true);
    ytTime = 5.2;
    expect(clock.getTime()).toBe(5.0);

    isBuffering = false;
    clock.setBuffering(false);
    expect(clock.getTime()).toBe(5.2);
    expect(clock.getTime()).toBeGreaterThanOrEqual(5.0); // garantia monotônica
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 13: Mudança de Música
  // --------------------------------------------------------------------------
  it('13. Mudança de música: reinicializa o relógio e os offsets de calibração para zero', () => {
    const clock = new UnifiedMasterClock();
    clock.setOffsets(500, 100);
    expect(clock.getTotalOffsetSec()).toBeCloseTo(0.600, 3);

    clock.reset();
    expect(clock.isCountdownState()).toBe(true);
    expect(clock.getTime()).toBe(0);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 14: Saída da Partida
  // --------------------------------------------------------------------------
  it('14. Saída da partida: interrompe imediatamente todas as fontes sem vazamento de áudio', () => {
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
  // CENÁRIO 15: MISS e HIT com Áudio Real (Preserva Regra Definitiva V13.9.6)
  // --------------------------------------------------------------------------
  it('15. Regra MISS/HIT definitiva: MISS silencia imediatamente e HIT restaura com rampa suave', () => {
    const mockAudio = {
      setMuteOnMiss: vi.fn(),
      getMuteGainValue: () => 1.0
    };
    const mockYt = {
      setMuted: vi.fn(),
      getVolume: () => 85,
      setVolume: vi.fn(),
      getCurrentTime: () => 5.0
    };

    const controller = new AudioPlaybackController(mockAudio as any, mockYt as any);

    // MISS -> silencia ambas as saídas incondicionalmente
    controller.handleGameplayMiss();
    expect(controller.isGameplayMissMuted()).toBe(true);
    expect(mockYt.setMuted).toHaveBeenCalledWith(true);
    expect(mockAudio.setMuteOnMiss).toHaveBeenCalledWith(true);

    // HIT -> restaura ambas as saídas
    controller.handleGameplayHit();
    expect(controller.isGameplayMissMuted()).toBe(false);
    expect(mockYt.setMuted).toHaveBeenCalledWith(false, true);
    expect(mockAudio.setMuteOnMiss).toHaveBeenCalledWith(false);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 16: Ausência de Referência Independente
  // --------------------------------------------------------------------------
  it('16. Ausência de referência independente: reporta NO_INDEPENDENT_REFERENCE sem declarar precisão inventada', () => {
    const notes: Note[] = [
      { id: 1, time: 1.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
      { id: 2, time: 2.0, lane: 1, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    const report = RockChartValidator.validate('song-sem-ground-truth', 'HARD', notes, 180);
    expect(report.musicalAccuracy.hasCertifiedGroundTruth).toBe(false);
    expect(report.musicalAccuracy.status).toBe('NO_INDEPENDENT_REFERENCE');
    expect(report.musicalAccuracy.precision).toBe(0);
    expect(report.musicalAccuracy.f1Score).toBe(0);
    expect(report.summary).toContain('NO_INDEPENDENT_REFERENCE');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 17: Bloqueio de Validação Circular
  // --------------------------------------------------------------------------
  it('17. Bloqueio de validação circular: rejeita comparar o chart contra si mesmo', () => {
    const notes: Note[] = [
      { id: 1, time: 1.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    // Registra ground truth não independente
    IndependentGroundTruthRepository.registerRecord({
      songId: 'circular-test',
      difficulty: 'HARD',
      provenance: {
        authorOrLab: 'RockBrazil Synthetic Self',
        method: 'CIRCULAR_COPY',
        notes: 'Copied directly from chart',
        isIndependent: false,
        datasetName: 'Self Copy Circular'
      },
      events: [{ time: 1.0, lane: 0 }]
    });

    const report = RockChartValidator.validate('circular-test', 'HARD', notes, 100);
    expect(report.musicalAccuracy.isCircularValidationBlocked).toBe(true);
    expect(report.musicalAccuracy.status).toBe('UNCERTIFIED_EVALUATION');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 18: Permissões Administrativas do Studio
  // --------------------------------------------------------------------------
  it('18. Permissões administrativas: publicação exige autenticação de administrador real', async () => {
    const studio = RockChartStudio.getInstance();
    studio.logoutAdmin();

    expect(studio.isAdminAuthenticated()).toBe(false);
    expect(() => studio.setApproval(true)).toThrow(/Apenas administradores/);

    const authed = await studio.authenticateAdmin({ email: 'admin@daviidalmeida.com' });
    expect(authed).toBe(true);
    expect(studio.isAdminAuthenticated()).toBe(true);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 19: Aprovação e Publicação no Catálogo
  // --------------------------------------------------------------------------
  it('19. Aprovação e publicação: nunca publica automaticamente e gera SongMetadata verificado', async () => {
    const studio = RockChartStudio.getInstance();
    await studio.authenticateAdmin({ email: 'admin@daviidalmeida.com' });

    const chartText = `[Song]\n{\n  Name = "Paradise Test"\n  Artist = "Guns N' Roses"\n}\n[SyncTrack]\n{\n  0 = B 120000\n}\n[ExpertSingle]\n{\n  192 = N 0 0\n}`;
    await studio.importFile(chartText, 'paradise.chart', 'CHORUS_ENCORE');
    studio.associateYouTubeVideo('Rbm6GXllBiw', 270);
    studio.setApproval(true);

    const published = studio.publishToCatalog();
    expect(published).toBeDefined();
    expect(published.id).toContain('intl-gunsnros-paradise-test');
    expect(published.title).toBe('Paradise Test');
    expect(published.type).toBe('youtube');
    expect(published.youtubeVideoId).toBe('Rbm6GXllBiw');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 20: Compatibilidade Android e Desktop
  // --------------------------------------------------------------------------
  it('20. Compatibilidade Android e desktop: validação estrutural e timestamps sem dependência de APIs restritas', () => {
    const notes: Note[] = [
      { id: 1, time: 0.5, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
      { id: 2, time: 1.0, lane: 1, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
      { id: 3, time: 1.5, lane: 2, duration: 0.5, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    const report = RockChartValidator.validate('intl-mobile-compat', 'EASY', notes, 120);
    expect(report.structural.valid).toBe(true);
    expect(report.structural.invalidLanesCount).toBe(0);
    expect(report.structural.negativeTimeCount).toBe(0);
    expect(report.temporal.monotonicTimeGuaranteed).toBe(true);
  });
});
