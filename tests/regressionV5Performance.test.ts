import { describe, it, expect } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { GameRenderer } from '../src/render/renderer';
import { UnifiedMasterClock } from '../src/game/sync/masterClock';
import { PlaybackState, Note } from '../src/types';

describe('ROCKBRAZIL BETA — SUÍTE DE REGRESSÃO E PERFORMANCE V5', () => {
  it('1. Note Speed e Espaçamento: baseNoteSpeed = 0.92s expande separação entre notas', () => {
    const dummyCanvas = {
      getContext: () => ({
        save: () => {},
        restore: () => {},
        clearRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        ellipse: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        resetTransform: () => {},
        scale: () => {}
      }),
      parentElement: { getBoundingClientRect: () => ({ width: 400, height: 700 }) },
      width: 400,
      height: 700
    } as any;

    const renderer = new GameRenderer(dummyCanvas);
    expect(renderer.baseNoteSpeed).toBeCloseTo(0.92, 2);

    // Em 120 BPM, uma semicolcheia (16th note) tem dt = 0.125s
    // Com noteSpeed de 0.92s, o progresso entre notas é de 0.125 / 0.92 = ~0.136 (13.6% da pista)
    // muito superior ao valor antigo de 1.35s (0.092 / 9.2%)
    const dt16th = 0.125;
    const progressDiff = dt16th / renderer.noteSpeed;
    expect(progressDiff).toBeGreaterThan(0.13);
  });

  it('2. Geometria de notas: ry reduzido para fretes horizontais sem colisão visual', () => {
    const dummyCanvas = {
      getContext: () => ({
        save: () => {},
        restore: () => {},
        clearRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        ellipse: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        resetTransform: () => {},
        scale: () => {}
      }),
      parentElement: { getBoundingClientRect: () => ({ width: 400, height: 700 }) },
      width: 400,
      height: 700
    } as any;

    const renderer = new GameRenderer(dummyCanvas);
    const p1 = (renderer as any).getLanePositionAtProgress(0, 1.0);
    const p2 = (renderer as any).getLanePositionAtProgress(0, 1.0 - (0.125 / renderer.noteSpeed));

    // A distância vertical entre duas notas de 16th na linha de acerto deve ser estritamente maior que o diâmetro vertical da nota
    const deltaY = Math.abs(p1.y - p2.y);
    const noteHeight = p1.laneWidth * 0.17 * p1.scale * 2; // 2 * ry

    expect(deltaY).toBeGreaterThan(noteHeight);
  });

  it('3. Resposta de Teclas: apertar teclas repetidamente NÃO congela nem atrasa o relógio mestre', () => {
    let mockAudioTime = 5.0;
    const clock = new UnifiedMasterClock();
    clock.setSource({
      getCurrentTime: () => mockAudioTime,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    });
    clock.startPlayback();

    const sampleNotes: Note[] = [
      { time: 5.0, lane: 0, duration: 0 },
      { time: 5.2, lane: 1, duration: 0 },
      { time: 5.4, lane: 2, duration: 0 },
      { time: 5.6, lane: 3, duration: 0 },
      { time: 5.8, lane: 4, duration: 0 }
    ];

    const engine = new GameEngine(sampleNotes, 'HARD', {
      audioOffsetMs: 0,
      musicVolume: 1,
      sfxVolume: 1,
      noteSpeed: 1
    });

    // 50 acionamentos rápidos de botões
    for (let i = 0; i < 50; i++) {
      engine.handleLanePress((i % 5) as any, clock.getTime());
      engine.handleLaneRelease((i % 5) as any, clock.getTime());
    }

    // O relógio musical NÃO deve sofrer alteração ou drift com as pressões de tecla
    expect(clock.getTime()).toBeCloseTo(5.0, 2);
    // As notas legítimas mantêm seus timestamps
    expect(engine.getNotes()[0].time).toBe(5.0);
    expect(engine.getNotes()[1].time).toBe(5.2);
  });

  it('4. Otimização do GameEngine: activeNoteStartIndex avança em O(1) sem varredura total de notas', () => {
    const manyNotes: Note[] = [];
    for (let i = 0; i < 1000; i++) {
      manyNotes.push({ time: i * 0.25, lane: (i % 5) as any, duration: 0 });
    }

    const engine = new GameEngine(manyNotes, 'EXPERT', {
      audioOffsetMs: 0,
      musicVolume: 1,
      sfxVolume: 1,
      noteSpeed: 1
    });

    // Simula jogador acertando notas consecutivas de 0 a 199
    for (let i = 0; i < 200; i++) {
      engine.handleLanePress(manyNotes[i].lane, manyNotes[i].time);
    }

    // O ponteiro interno activeNoteStartIndex deve ter avançado significativamente
    const startIndex = (engine as any).activeNoteStartIndex;
    expect(startIndex).toBeGreaterThanOrEqual(190);

    // Pressionar tecla em t = 50.0s deve julgar a nota correspondente em O(1)
    const result = engine.handleLanePress(manyNotes[startIndex].lane, manyNotes[startIndex].time);
    expect(result).not.toBeNull();
    expect(result?.judgment).toBe('PERFECT');
  });

  it('5. Renderizador sem shadowBlur em alvos e notas: elimina pausas de GPU/CPU', () => {
    const dummyCtx = {
      save: () => {},
      restore: () => {},
      clearRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      ellipse: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      resetTransform: () => {},
      scale: () => {},
      shadowBlur: 0
    } as any;

    const dummyCanvas = {
      getContext: () => dummyCtx,
      parentElement: { getBoundingClientRect: () => ({ width: 400, height: 700 }) },
      width: 400,
      height: 700
    } as any;

    const renderer = new GameRenderer(dummyCanvas);

    // Invoca desenho de alvos com botões pressionados
    const activeLanes = new Set<any>([0, 1, 2]);
    (renderer as any).drawStrikeTargets(dummyCtx, activeLanes);

    // Nenhuma operação deve definir shadowBlur > 0
    expect(dummyCtx.shadowBlur).toBe(0);
  });
});
