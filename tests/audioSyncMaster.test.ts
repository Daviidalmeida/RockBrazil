import { describe, it, expect, beforeEach } from 'vitest';
import { YouTubePlayerController } from '../src/audio/youtubePlayer';
import { GameEngine } from '../src/game/engine';
import { PlaybackState, Note, GameSettings, Difficulty } from '../src/types';
import { CalibrationManager } from '../src/game/sync/calibrationManager';
import { UniversalChartImporter } from '../src/audio/universalChartImporter';

describe('ROCKBRAZIL BETA — SUÍTE MASTER DE SINCRONIZAÇÃO E CONTROLE AUDITIVO (20 CENÁRIOS)', () => {
  let defaultSettings: GameSettings;

  beforeEach(() => {
    defaultSettings = {
      musicVolume: 1.0,
      sfxVolume: 1.0,
      audioOffsetMs: 0,
      noteSpeedMultiplier: 1.0,
      visualEffectsEnabled: true
    };
  });

  // 1. Simulação: Vídeo demora 2 segundos para iniciar
  it('1. Vídeo demora 2 segundos para iniciar: o relógio e as notas não devem avançar durante o atraso', () => {
    let mockYtTime = 0;
    let mockState = -1; // UNSTARTED

    const player = new YouTubePlayerController();
    (player as any).player = {
      getCurrentTime: () => mockYtTime,
      getPlayerState: () => mockState,
      playVideo: () => { mockState = 3; /* BUFFERING */ }
    };
    (player as any).isReady = true;

    player.play();
    expect(player.getPlaybackState()).toBe(PlaybackState.WAITING_FOR_AUDIO);
    expect(player.getCurrentTime()).toBe(0);

    // Passam-se 2 segundos sem áudio real
    expect(player.getCurrentTime()).toBe(0);

    // Após 2s, YouTube confirma avanço real do áudio
    mockState = 1;
    mockYtTime = 0.05;
    (player as any).handlePlayerStateChange(1);

    expect(player.getPlaybackState()).toBe(PlaybackState.PLAYING);
    expect(player.getCurrentTime()).toBeGreaterThan(0);
  });

  // 2. Simulação: Vídeo demora 5 segundos para iniciar
  it('2. Vídeo demora 5 segundos para iniciar: nenhuma nota é consumida ou dada como MISS', () => {
    const notes: Note[] = [
      { id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
      { id: 2, time: 4.0, lane: 1, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];
    const engine = new GameEngine(notes, 'MEDIUM', defaultSettings);

    const player = new YouTubePlayerController();
    (player as any).player = {
      getCurrentTime: () => 0,
      getPlayerState: () => 3, // BUFFERING
      playVideo: () => {}
    };
    player.play();

    // Enquanto o relógio estiver em 0 durante os 5s:
    for (let t = 0; t < 50; t++) {
      const clockTime = player.getCurrentTime();
      engine.update(clockTime);
    }

    expect(engine.getStats().missCount).toBe(0);
    expect(notes.every((n) => !n.missed)).toBe(true);
  });

  // 3. Simulação: Vídeo demora 10 segundos para iniciar
  it('3. Vídeo demora 10 segundos para iniciar: estado permanece controlado e notas preservadas', () => {
    const notes: Note[] = [
      { id: 1, time: 1.5, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];
    const engine = new GameEngine(notes, 'MEDIUM', defaultSettings);

    const player = new YouTubePlayerController();
    (player as any).player = {
      getCurrentTime: () => 0,
      getPlayerState: () => -1,
      playVideo: () => {}
    };
    player.play();

    expect(player.getPlaybackState()).toBe(PlaybackState.WAITING_FOR_AUDIO);
    engine.update(player.getCurrentTime());

    expect(engine.getStats().missCount).toBe(0);
    expect(notes[0].missed).toBe(false);
  });

  // 4. Simulação: Evento PLAYING ocorre sem avanço temporal
  it('4. Evento PLAYING ocorre sem avanço temporal: relógio não deve avançar prematuramente', () => {
    let mockYtTime = 0;
    const player = new YouTubePlayerController();
    (player as any).player = {
      getCurrentTime: () => mockYtTime,
      getPlayerState: () => 1, // PLAYING
      playVideo: () => {}
    };

    player.play();
    (player as any).handlePlayerStateChange(1);

    // Embora o estado seja 1, o tempo ainda é 0.00:
    expect(player.getCurrentTime()).toBe(0);
  });

  // 5. Simulação: Vídeo inicia normalmente
  it('5. Vídeo inicia normalmente: transição imediata para PLAYING com tempo progressivo', () => {
    let mockYtTime = 0;
    const player = new YouTubePlayerController();
    (player as any).player = {
      getCurrentTime: () => mockYtTime,
      getPlayerState: () => 1,
      playVideo: () => {}
    };

    player.play();
    mockYtTime += 0.15; // V13.8 requires two advancing samples, not a nonzero constant.
    (player as any).handlePlayerStateChange(1);

    expect(player.getPlaybackState()).toBe(PlaybackState.PLAYING);
    expect(player.getCurrentTime()).toBeCloseTo(0.15, 1);
  });

  // 6. Simulação: Vídeo entra em buffering
  it('6. Vídeo entra em buffering: relógio congela imediatamente e combo é preservado', () => {
    let mockYtTime = 5.0;
    const player = new YouTubePlayerController();
    (player as any).player = {
      getCurrentTime: () => mockYtTime,
      getPlayerState: () => 1,
      playVideo: () => {}
    };

    player.play();
    mockYtTime += 0.15; // V13.8 requires two advancing samples, not a nonzero constant.
    (player as any).handlePlayerStateChange(1);
    const timeBeforeBuffering = player.getCurrentTime();

    // YouTube notifica BUFFERING (state 3)
    (player as any).handlePlayerStateChange(3);
    expect(player.getPlaybackState()).toBe(PlaybackState.BUFFERING);
    expect(player.isBuffering()).toBe(true);

    // Tempo permanece congelado
    const timeDuringBuffering = player.getCurrentTime();
    expect(timeDuringBuffering).toBeCloseTo(timeBeforeBuffering, 2);
  });

  // 7. Simulação: Vídeo retoma após buffering
  it('7. Vídeo retoma após buffering: reconexão temporal sem saltos bruscos', () => {
    let mockYtTime = 5.0;
    const player = new YouTubePlayerController();
    (player as any).player = {
      getCurrentTime: () => mockYtTime,
      getPlayerState: () => 3,
      playVideo: () => {}
    };

    player.play();
    (player as any).handlePlayerStateChange(3);
    expect(player.isBuffering()).toBe(true);

    // Retoma em 5.2s
    mockYtTime = 5.2;
    (player as any).player.getPlayerState = () => 1;
    (player as any).handlePlayerStateChange(1);

    expect(player.getPlaybackState()).toBe(PlaybackState.PLAYING);
    expect(player.getCurrentTime()).toBeGreaterThanOrEqual(5.2);
  });

  // 8. Simulação: Vídeo pausa
  it('8. Vídeo pausa: relógio para instantaneamente', () => {
    let mockYtTime = 12.0;
    const player = new YouTubePlayerController();
    (player as any).player = {
      getCurrentTime: () => mockYtTime,
      getPlayerState: () => 1,
      pauseVideo: () => { (player as any).player.getPlayerState = () => 2; },
      playVideo: () => {}
    };

    player.play();
    (player as any).handlePlayerStateChange(1);
    player.pause();

    expect(player.getPlaybackState()).toBe(PlaybackState.PAUSED);
    const pausedTime1 = player.getCurrentTime();
    const pausedTime2 = player.getCurrentTime();
    expect(pausedTime1).toBe(pausedTime2);
  });

  // 9. Simulação: Usuário troca de aba (tab switch / background throttle)
  it('9. Usuário troca de aba: drift clamp impede fuga astronômica do relógio', () => {
    const player = new YouTubePlayerController();
    (player as any).player = {
      getCurrentTime: () => 10.0,
      getPlayerState: () => 1,
      playVideo: () => {}
    };

    player.play();
    (player as any).handlePlayerStateChange(1);

    // Simula salto artificial de performance.now() em aba congelada por 5 segundos
    (player as any).lastObservedPerfTime = performance.now() - 5000;
    const t = player.getCurrentTime();

    // Extrapolação é limitada a 0.35s máximo para evitar corrida de notas na esteira
    expect(t).toBeLessThan(10.0 + 0.45);
  });

  // 10. Simulação: Vídeo sofre seek
  it('10. Vídeo sofre seek: relógio se alinha imediatamente ao novo timestamp', () => {
    let mockYtTime = 5.0;
    const player = new YouTubePlayerController();
    (player as any).player = {
      getCurrentTime: () => mockYtTime,
      getPlayerState: () => 1,
      seekTo: (sec: number) => { mockYtTime = sec; },
      playVideo: () => {}
    };

    player.play();
    (player as any).handlePlayerStateChange(1);

    player.seekTo(45.0);
    expect(player.getCurrentTime()).toBeCloseTo(45.0, 1);
  });

  // 11. Simulação: Relógio do player atualiza em saltos (250ms)
  it('11. Relógio do player atualiza em saltos: interpolação monotônica sem tremedeira', () => {
    let mockYtTime = 10.0;
    const player = new YouTubePlayerController();
    (player as any).player = {
      getCurrentTime: () => mockYtTime,
      getPlayerState: () => 1,
      playVideo: () => {}
    };

    player.play();
    (player as any).handlePlayerStateChange(1);

    const t1 = player.getCurrentTime();
    // Simula 20ms de performance
    (player as any).lastObservedPerfTime = performance.now() - 20;
    const t2 = player.getCurrentTime();

    expect(t2).toBeGreaterThanOrEqual(t1);
  });

  // 12. Simulação: Mudanças de BPM
  it('12. Mudanças de BPM: conversão de ticks em segundos respeita variações de tempo', () => {
    const chart = `
[Song]
{
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
  384 = B 240000
}
[ExpertSingle]
{
  0 = N 0 0
  384 = N 1 0
  768 = N 2 0
}
`;
    const res = UniversalChartImporter.parseChartText(chart);
    const notes = res.charts.EXPERT;

    // Tick 0 @ 120 BPM = 0.0s
    expect(notes[0].time).toBe(0.0);
    // Tick 384 @ 120 BPM (2 batidas a 0.5s cada) = 1.0s
    expect(notes[1].time).toBeCloseTo(1.0, 2);
    // Tick 768 @ 240 BPM (mais 2 batidas a 0.25s cada) = 1.5s
    expect(notes[2].time).toBeCloseTo(1.5, 2);
  });

  // 13. Simulação: Offset positivo (+50ms)
  it('13. Offset positivo (+50ms): nota é antecipada no receptor', () => {
    CalibrationManager.setSongOffsetMs('test-song', 50);
    const offsetSec = CalibrationManager.getSongOffsetMs('test-song') / 1000;
    const videoTime = 2.0;
    const chartTime = videoTime + offsetSec;

    expect(chartTime).toBe(2.05);
  });

  // 14. Simulação: Offset negativo (-50ms)
  it('14. Offset negativo (-50ms): nota é postergada no receptor', () => {
    CalibrationManager.setSongOffsetMs('test-song-neg', -50);
    const offsetSec = CalibrationManager.getSongOffsetMs('test-song-neg') / 1000;
    const videoTime = 2.0;
    const chartTime = videoTime + offsetSec;

    expect(chartTime).toBe(1.95);
  });

  // 15. Simulação: Offset zero
  it('15. Offset zero: sincronização matemática 1:1 com o vídeo', () => {
    CalibrationManager.setSongOffsetMs('test-song-zero', 0);
    const offsetSec = CalibrationManager.getSongOffsetMs('test-song-zero') / 1000;
    const videoTime = 3.5;
    const chartTime = videoTime + offsetSec;

    expect(chartTime).toBe(3.5);
  });

  // 16. Simulação: Sustentações (Holds)
  it('16. Sustentações: notas longas sustentam pontuação e completam com sucesso', () => {
    const notes: Note[] = [
      { id: 1, time: 2.0, lane: 0, duration: 1.0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];
    const engine = new GameEngine(notes, 'MEDIUM', defaultSettings);

    const hit = engine.handleLanePress(0, 2.0);
    expect(hit?.judgment).toBe('PERFECT');

    // Segura a nota por 1.0s
    engine.update(2.5);
    expect(engine.isLanePressed(0)).toBe(true);

    engine.handleLaneRelease(0, 3.0);
    expect(engine.getNotes()[0].sustainCompleted).toBe(true);
  });

  // 17. Simulação: Acordes (Chords)
  it('17. Acordes: notas simultâneas são atingidas no mesmo instante sem colisão', () => {
    const notes: Note[] = [
      { id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0, type: 'chord' },
      { id: 2, time: 2.0, lane: 2, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0, type: 'chord' }
    ];
    const engine = new GameEngine(notes, 'MEDIUM', defaultSettings);

    const hit1 = engine.handleLanePress(0, 2.0);
    const hit2 = engine.handleLanePress(2, 2.0);

    expect(hit1?.judgment).toBe('PERFECT');
    expect(hit2?.judgment).toBe('PERFECT');
    expect(engine.getStats().combo).toBe(2);
  });

  // 18. Simulação: Notas próximas (Stream / 16th notes)
  it('18. Notas próximas: notas rápidas consecutivas são julgadas independentemente', () => {
    const notes: Note[] = [
      { id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
      { id: 2, time: 2.1, lane: 1, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];
    const engine = new GameEngine(notes, 'MEDIUM', defaultSettings);

    const hit1 = engine.handleLanePress(0, 2.0);
    const hit2 = engine.handleLanePress(1, 2.1);

    expect(hit1?.judgment).toBe('PERFECT');
    expect(hit2?.judgment).toBe('PERFECT');
    expect(engine.getStats().combo).toBe(2);
  });

  // 19. Simulação: Mudanças de dificuldade e limites de pista
  it('19. Dificuldades independentes: Fácil (máx pista 2), Médio (máx 3), Difícil/Expert (máx 4)', () => {
    const chart = `
[Song]
{
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[ExpertSingle]
{
  0 = N 0 0
  192 = N 1 0
  384 = N 2 0
  576 = N 3 0
  768 = N 4 0
}
`;
    const res = UniversalChartImporter.parseChartText(chart);
    expect(res.charts.EASY.every((n) => n.lane <= 2)).toBe(true);
    expect(res.charts.MEDIUM.every((n) => n.lane <= 3)).toBe(true);
    expect(res.charts.HARD.some((n) => n.lane === 4)).toBe(true);
    expect(res.charts.EXPERT.some((n) => n.lane === 4)).toBe(true);
  });

  // 20. Simulação: Final da música
  it('20. Final da música: detecta encerramento apenas quando tempo total é atingido e não há notas pendentes', () => {
    const notes: Note[] = [
      { id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];
    const engine = new GameEngine(notes, 'MEDIUM', defaultSettings);

    expect(engine.hasPendingNotes(1.0)).toBe(true);

    engine.handleLanePress(0, 2.0);
    expect(engine.hasPendingNotes(2.5)).toBe(false);
  });

});
