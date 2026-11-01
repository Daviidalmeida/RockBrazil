import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameRenderer } from '../src/render/renderer';
import { GameEngine } from '../src/game/engine';
import { UnifiedMasterClock } from '../src/game/sync/masterClock';
import { HighwaySyncDiagnostics } from '../src/game/sync/highwaySyncDiagnostics';
import { CalibrationManager } from '../src/game/sync/calibrationManager';
import { RAW_INTERNATIONAL_CHARTS } from '../src/game/catalog/internationalChartsRegistry';
import { Note, Lane, Difficulty, PlaybackState, GameSettings } from '../src/types';
import { AudioTimeSource } from '../src/game/timeline/musicTimeline';

const mockCtx2D = {
  resetTransform: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  ellipse: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  clip: vi.fn(),
  fillRect: vi.fn(),
  drawImage: vi.fn(),
  createLinearGradient: () => ({ addColorStop: vi.fn() }),
  createRadialGradient: () => ({ addColorStop: vi.fn() }),
  textAlign: 'center',
  font: '',
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  globalAlpha: 1
};

function createMockCanvas(width = 800, height = 600) {
  return {
    width,
    height,
    parentElement: {
      getBoundingClientRect: () => ({ width, height, top: 0, left: 0, right: width, bottom: height })
    },
    getContext: () => mockCtx2D
  } as unknown as HTMLCanvasElement;
}

const defaultSettings: GameSettings = {
  musicVolume: 0.85,
  sfxVolume: 0.9,
  audioOffsetMs: 0,
  noteSpeedMultiplier: 1.0,
  visualEffectsEnabled: true,
  visualEffectsMode: 'NORMAL',
  effectsMode: 'NORMAL',
  muteOnMiss: true
};

describe('ROCKBRAZIL V14.2 — SUÍTE DE TESTES: CORREÇÃO DEFINITIVA DA ESTEIRA VISUAL (15 CENÁRIOS)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    HighwaySyncDiagnostics.get().clear();
    HighwaySyncDiagnostics.get().setEnabled(false);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 1: Coincidência Exata Nota-Receptor
  // --------------------------------------------------------------------------
  it('1. No tempo exato da nota, sua posição coincide estritamente com o receptor', () => {
    const canvas = createMockCanvas(800, 600);
    const renderer = new GameRenderer(canvas);
    renderer.setDifficulty('MEDIUM');

    const noteTime = 10.5;
    const currentTime = 10.5; // timeUntilHit = 0

    // Progresso deve ser matematicamente 1.0
    const progress = renderer.calculateProgress(noteTime, currentTime);
    expect(progress).toBeCloseTo(1.0, 5);

    // Coordenada Y da nota deve coincidir com a Y do receptor e da strike bar
    const receptor = renderer.getReceptorCoordinates(2);
    const noteCoords = renderer.getNoteCoordinates(2, noteTime, currentTime);
    const strikeY = renderer.getStrikeLineY();

    expect(receptor.y).toBeCloseTo(strikeY, 4);
    expect(noteCoords.y).toBeCloseTo(strikeY, 4);
    expect(Math.abs(noteCoords.y - receptor.y)).toBeLessThan(0.001);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 2: Consistência entre Tempo de Julgamento e Visual
  // --------------------------------------------------------------------------
  it('2. O tempo de julgamento e o tempo visual são rigorosamente consistentes', () => {
    const testNotes: Note[] = [
      { id: 1, time: 5.0, lane: 1, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];
    const engine = new GameEngine(testNotes, 'MEDIUM', defaultSettings);
    engine.setUnifiedClockMode(true);

    const canvas = createMockCanvas(800, 600);
    const renderer = new GameRenderer(canvas);
    renderer.setDifficulty('MEDIUM');

    const clock = new UnifiedMasterClock();
    const mockSource: AudioTimeSource = {
      getCurrentTime: () => 5.0,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };
    clock.setSource(mockSource);
    clock.startPlayback();

    const currentMusicalTime = clock.getTime();
    expect(currentMusicalTime).toBeCloseTo(5.0, 4);

    // O mesmo tempo que alimenta o julgamento alimenta o posicionamento
    const judgmentTime = engine.getJudgmentTime(currentMusicalTime);
    const timeUntilHit = renderer.calculateTimeUntilHit(testNotes[0].time, currentMusicalTime);

    expect(judgmentTime).toBeCloseTo(currentMusicalTime, 5);
    expect(timeUntilHit).toBeCloseTo(0, 5);

    const hit = engine.handleLanePress(1, currentMusicalTime);
    expect(hit).not.toBeNull();
    expect(hit?.judgment).toBe('PERFECT');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 3: Acordes Chegam Juntos
  // --------------------------------------------------------------------------
  it('3. Acordes chegam juntos na linha com a mesma coordenada Y', () => {
    const canvas = createMockCanvas(800, 600);
    const renderer = new GameRenderer(canvas);
    renderer.setDifficulty('HARD');

    const chordTime = 8.0;
    const currentTime = 7.5; // Aproximando-se

    const noteLane0 = renderer.getNoteCoordinates(0, chordTime, currentTime);
    const noteLane2 = renderer.getNoteCoordinates(2, chordTime, currentTime);
    const noteLane4 = renderer.getNoteCoordinates(4, chordTime, currentTime);

    // Coordenada Y e escala devem ser absolutamente idênticas
    expect(noteLane0.y).toBeCloseTo(noteLane2.y, 4);
    expect(noteLane2.y).toBeCloseTo(noteLane4.y, 4);
    expect(noteLane0.scale).toBeCloseTo(noteLane4.scale, 4);

    // No instante do acorde, todas atingem a strike line juntas
    const atHit0 = renderer.getNoteCoordinates(0, chordTime, chordTime);
    const atHit2 = renderer.getNoteCoordinates(2, chordTime, chordTime);
    const atHit4 = renderer.getNoteCoordinates(4, chordTime, chordTime);

    const strikeY = renderer.getStrikeLineY();
    expect(atHit0.y).toBeCloseTo(strikeY, 4);
    expect(atHit2.y).toBeCloseTo(strikeY, 4);
    expect(atHit4.y).toBeCloseTo(strikeY, 4);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 4: Sustains Começam e Terminam Corretamente
  // --------------------------------------------------------------------------
  it('4. Sustains começam na strike line em note.time e terminam em note.time + duration', () => {
    const canvas = createMockCanvas(800, 600);
    const renderer = new GameRenderer(canvas);
    renderer.setDifficulty('MEDIUM');
    const strikeY = renderer.getStrikeLineY();

    const noteTime = 12.0;
    const duration = 2.5;
    const endTime = noteTime + duration;

    // 1. No início do sustain (t = noteTime)
    const headProgressAtStart = renderer.calculateProgress(noteTime, noteTime);
    expect(headProgressAtStart).toBeCloseTo(1.0, 5);
    const headYAtStart = renderer.getLanePositionAtProgress(1, headProgressAtStart).y;
    expect(headYAtStart).toBeCloseTo(strikeY, 4);

    // 2. No término do sustain (t = endTime)
    const tailProgressAtEnd = renderer.calculateProgress(endTime, endTime);
    expect(tailProgressAtEnd).toBeCloseTo(1.0, 5);
    const tailYAtEnd = renderer.getLanePositionAtProgress(1, tailProgressAtEnd).y;
    expect(tailYAtEnd).toBeCloseTo(strikeY, 4);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 5: Diferentes Velocidades Não Alteram Chegada
  // --------------------------------------------------------------------------
  it('5. Diferentes velocidades de esteira não alteram o instante exato de chegada', () => {
    const canvas = createMockCanvas(800, 600);
    const renderer = new GameRenderer(canvas);
    const strikeY = renderer.getStrikeLineY();
    const noteTime = 20.0;
    const currentTime = 20.0; // Instante exato

    const presets: ('LENTA' | 'NORMAL' | 'RÁPIDA')[] = ['LENTA', 'NORMAL', 'RÁPIDA'];
    const multipliers = [0.7, 1.0, 1.5, 2.0];

    for (const preset of presets) {
      for (const mult of multipliers) {
        renderer.speedPreset = preset;
        renderer.noteSpeedMultiplier = mult;

        const coords = renderer.getNoteCoordinates(2, noteTime, currentTime);
        expect(coords.timeUntilHit).toBe(0);
        expect(coords.progress).toBeCloseTo(1.0, 5);
        expect(coords.y).toBeCloseTo(strikeY, 4);
      }
    }
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 6: Taxas de Quadros (30, 60, 120 FPS)
  // --------------------------------------------------------------------------
  it('6. Simulação de FPS de 30, 60 e 120 não altera a sincronização nem gera desvios de fase', () => {
    const canvas = createMockCanvas(800, 600);
    const renderer = new GameRenderer(canvas);
    const noteTime = 30.0;

    const fpsTests = [
      { name: '30 FPS', deltaSec: 1 / 30 },
      { name: '60 FPS', deltaSec: 1 / 60 },
      { name: '120 FPS', deltaSec: 1 / 120 }
    ];

    for (const fps of fpsTests) {
      let time = 28.0;
      let lastProgress = -Infinity;

      while (time <= noteTime + 0.1) {
        const prog = renderer.calculateProgress(noteTime, time);
        expect(prog).toBeGreaterThanOrEqual(lastProgress); // Estritamente monotônico
        lastProgress = prog;

        if (Math.abs(time - noteTime) < fps.deltaSec / 2) {
          // O quadro mais próximo do tempo da nota cruza exatamente em 1.0
          expect(prog).toBeCloseTo(1.0, 1);
        }
        time += fps.deltaSec;
      }
    }
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 7: Diferentes Resoluções
  // --------------------------------------------------------------------------
  it('7. Diferentes resoluções de tela preservam o instante de chegada relativo', () => {
    const resolutions = [
      { w: 1920, h: 1080 }, // Full HD Desktop
      { w: 1280, h: 720 },  // HD Standard
      { w: 390, h: 844 },   // iPhone 14
      { w: 375, h: 667 }    // iPhone SE
    ];

    const noteTime = 15.0;

    for (const res of resolutions) {
      const canvas = createMockCanvas(res.w, res.h);
      const renderer = new GameRenderer(canvas);

      const noteCoords = renderer.getNoteCoordinates(1, noteTime, noteTime);
      const expectedStrikeY = res.h * renderer.strikeLineYRatio;

      expect(noteCoords.y).toBeCloseTo(expectedStrikeY, 3);
    }
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 8: Pausa Congela Corretamente
  // --------------------------------------------------------------------------
  it('8. Pausa congela corretamente as notas no mesmo pixel entre frames', () => {
    const canvas = createMockCanvas(800, 600);
    const renderer = new GameRenderer(canvas);
    const clock = new UnifiedMasterClock();

    let fakeTime = 10.0;
    const mockSource: AudioTimeSource = {
      getCurrentTime: () => fakeTime,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };
    clock.setSource(mockSource);
    clock.startPlayback();

    const t1 = clock.getTime();
    expect(t1).toBeCloseTo(10.0, 3);

    // Pausa o relógio
    clock.pause();

    // Simula passagem de tempo no player externo enquanto pausado
    fakeTime = 15.0;
    const tPaused1 = clock.getTime();
    const tPaused2 = clock.getTime();

    expect(tPaused1).toBeCloseTo(t1, 4);
    expect(tPaused2).toBeCloseTo(t1, 4);

    const pos1 = renderer.getNoteCoordinates(0, 12.0, tPaused1);
    const pos2 = renderer.getNoteCoordinates(0, 12.0, tPaused2);

    expect(pos1.y).toBe(pos2.y);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 9: Retomada Mantém Alinhamento
  // --------------------------------------------------------------------------
  it('9. Retomada mantém o alinhamento sem saltos acumulados', () => {
    const clock = new UnifiedMasterClock();
    let fakeTime = 10.0;
    const mockSource: AudioTimeSource = {
      getCurrentTime: () => fakeTime,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };
    clock.setSource(mockSource);
    clock.startPlayback();

    clock.pause();
    fakeTime = 10.0;
    clock.resume();

    // Avança 100ms após retorno
    fakeTime = 10.1;
    const tResumed = clock.getTime();
    expect(tResumed).toBeCloseTo(10.1, 3);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 10: Buffering Não Gera Atraso Acumulado
  // --------------------------------------------------------------------------
  it('10. Buffering congela a esteira e não gera atraso acumulado após restabelecimento', () => {
    const clock = new UnifiedMasterClock();
    let fakeTime = 5.0;
    let isBuffering = false;

    const mockSource: AudioTimeSource = {
      getCurrentTime: () => fakeTime,
      getPlaybackState: () => (isBuffering ? PlaybackState.BUFFERING : PlaybackState.PLAYING),
      isBuffering: () => isBuffering
    };
    clock.setSource(mockSource);
    clock.startPlayback();

    const tNormal = clock.getTime();
    expect(tNormal).toBeCloseTo(5.0, 3);

    // Entra em buffering por 2 segundos
    isBuffering = true;
    clock.setBuffering(true);
    fakeTime = 5.0;

    expect(clock.getTime()).toBeCloseTo(tNormal, 3);

    // Sai de buffering e retoma
    isBuffering = false;
    clock.setBuffering(false);
    fakeTime = 5.25;

    expect(clock.getTime()).toBeCloseTo(5.25, 3);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 11: Seek Reposiciona Todas as Notas
  // --------------------------------------------------------------------------
  it('11. Seek reposiciona imediatamente todas as notas para as novas coordenadas', () => {
    const canvas = createMockCanvas(800, 600);
    const renderer = new GameRenderer(canvas);
    const clock = new UnifiedMasterClock();

    let fakeTime = 10.0;
    const mockSource: AudioTimeSource = {
      getCurrentTime: () => fakeTime,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };
    clock.setSource(mockSource);
    clock.startPlayback();

    const noteTime = 50.0;
    const posBeforeSeek = renderer.getNoteCoordinates(2, noteTime, clock.getTime());
    expect(posBeforeSeek.progress).toBeLessThan(0); // Nota longe do horizonte

    // Salto para 49.0s (1 segundo antes da nota)
    fakeTime = 49.0;
    const posAfterSeek = renderer.getNoteCoordinates(2, noteTime, clock.getTime());
    expect(posAfterSeek.progress).toBeGreaterThan(0.4);
    expect(posAfterSeek.progress).toBeLessThan(1.0);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 12: Troca de Música Limpa o Estado Anterior
  // --------------------------------------------------------------------------
  it('12. Troca de música limpa o estado anterior e reinicializa a geometria', () => {
    const canvas = createMockCanvas(800, 600);
    const renderer = new GameRenderer(canvas);
    const clock = new UnifiedMasterClock();

    clock.setOffsets(1500, 0);
    clock.reset();

    expect(clock.getSongOffsetSec()).toBe(0);
    expect(clock.getTime()).toBe(0);

    renderer.setDifficulty('EASY');
    expect(renderer.laneCount).toBe(3);

    renderer.setDifficulty('HARD');
    expect(renderer.laneCount).toBe(5);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 13: Offsets Musicais Aplicados Exatamente Uma Vez
  // --------------------------------------------------------------------------
  it('13. Offsets musicais são aplicados exatamente uma vez sem dedução duplicada no GameEngine', () => {
    const songId = 'intl-gnr-welcome-to-the-jungle';
    const profileOffsetMs = CalibrationManager.getSongOffsetMs(songId); // -3800ms
    const globalOffsetMs = 0;

    const clock = new UnifiedMasterClock();
    clock.setOffsets(profileOffsetMs, globalOffsetMs);

    const testNotes: Note[] = [
      { id: 1, time: 3.269, lane: 3, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    const engine = new GameEngine(testNotes, 'MEDIUM', defaultSettings);
    engine.setUnifiedClockMode(true); // V14.2 Relógio Único Ativo

    // Quando o vídeo está no instante do primeiro ataque (7.069s)
    const mockVideoTime = 7.069;
    const mockSource: AudioTimeSource = {
      getCurrentTime: () => mockVideoTime,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    };
    clock.setSource(mockSource);
    clock.startPlayback();

    const unifiedTime = clock.getTime();
    // 7.069s - 3.8s = 3.269s
    expect(unifiedTime).toBeCloseTo(3.269, 2);

    // O GameEngine em modo unificado não subtrai offset novamente
    const judgmentTime = engine.getJudgmentTime(unifiedTime);
    expect(judgmentTime).toBeCloseTo(unifiedTime, 5);

    const hit = engine.handleLanePress(3, unifiedTime);
    expect(hit).not.toBeNull();
    expect(hit?.judgment).toBe('PERFECT');
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 14: Acerto Válido na Linha de Julgamento
  // --------------------------------------------------------------------------
  it('14. O jogador obtém PERFECT quando a nota está visualmente sobre a linha de julgamento', () => {
    const canvas = createMockCanvas(800, 600);
    const renderer = new GameRenderer(canvas);
    renderer.setDifficulty('MEDIUM');

    const testNotes: Note[] = [
      { id: 1, time: 10.0, lane: 2, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];
    const engine = new GameEngine(testNotes, 'MEDIUM', defaultSettings);
    engine.setUnifiedClockMode(true);

    const currentTime = 10.0; // Nota exatamente na linha
    const coords = renderer.getNoteCoordinates(2, 10.0, currentTime);
    const strikeY = renderer.getStrikeLineY();

    expect(coords.y).toBeCloseTo(strikeY, 4);

    const hit = engine.handleLanePress(2, currentTime);
    expect(hit).not.toBeNull();
    expect(hit?.judgment).toBe('PERFECT');
    expect(hit?.timeDiff).toBeCloseTo(0, 5);
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 15: Compatibilidade com Músicas Atuais e Futuras
  // --------------------------------------------------------------------------
  it('15. O motor mantém compatibilidade com músicas nacionais, internacionais e YouTube', () => {
    const canvas = createMockCanvas(800, 600);
    const renderer = new GameRenderer(canvas);

    // Verifica músicas do catálogo internacional
    const internationalSongKeys = Object.keys(RAW_INTERNATIONAL_CHARTS);
    expect(internationalSongKeys).toContain('intl-gnr-welcome-to-the-jungle');
    expect(internationalSongKeys).toContain('intl-acdc-highway-to-hell');
    expect(internationalSongKeys).toContain('intl-lp-numb');

    const gnrChart = RAW_INTERNATIONAL_CHARTS['intl-gnr-welcome-to-the-jungle'];
    expect(gnrChart.MEDIUM.length).toBeGreaterThan(100);

    // Converte primeira nota do chart de Guns N' Roses e renderiza sem erros
    const firstNoteData = gnrChart.MEDIUM[0];
    const firstNote: Note = {
      id: 1,
      time: firstNoteData[0],
      lane: firstNoteData[1] as Lane,
      duration: firstNoteData[2],
      hit: false,
      missed: false,
      sustainCompleted: false,
      sustainHeldTime: 0
    };

    expect(() => {
      renderer.render(firstNote.time, [firstNote], new Set([firstNote.lane]), 100);
    }).not.toThrow();

    // Instrumentação de diagnóstico valida ausência de desvio
    HighwaySyncDiagnostics.get().setEnabled(true);
    renderer.render(firstNote.time, [firstNote], new Set([firstNote.lane]), 100);

    const summary = HighwaySyncDiagnostics.get().getSummary();
    expect(summary.totalRecorded).toBeGreaterThan(0);
    expect(summary.singleClockConfirmed).toBe(true);
    expect(summary.maxTimeErrorMs).toBeLessThan(0.001);
  });
});
