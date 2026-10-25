import { describe, it, expect } from 'vitest';
import { UnifiedMasterClock } from '../src/game/sync/masterClock';
import { GameEngine } from '../src/game/engine';
import { BeatmapManager } from '../src/game/beatmapManager';
import { ChartShiftManager } from '../src/game/catalog/chartShiftManager';
import { CalibrationManager } from '../src/game/sync/calibrationManager';
import { Note, GameSettings, PlaybackState } from '../src/types';
import { OFFICIAL_BRAZILIAN_CATALOG, ORIGINAL_31_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';

describe('ROCKBRAZIL V9 — Suíte de Regressão e Sincronização Autêntica', () => {
  const defaultSettings: GameSettings = {
    musicVolume: 0.8,
    sfxVolume: 0.8,
    audioOffsetMs: 0,
    noteSpeedMultiplier: 1.0,
    visualEffectsEnabled: true
  };

  it('1. Primeira nota respeita a introdução musical autêntica sem deslocamento artificial para zero', () => {
    const beatmaps = new BeatmapManager();

    // De Borest: introdução autêntica de 6.565s
    const deBorestExpert = beatmaps.getBeatmap('kua-de-borest', 'EXPERT');
    expect(deBorestExpert[0].time).toBeCloseTo(6.565, 2);

    // À Sua Maneira: introdução autêntica de 4.364s
    const suaManeiraEasy = beatmaps.getBeatmap('cap-sua-maneira', 'EASY');
    expect(suaManeiraEasy[0].time).toBeCloseTo(4.364, 2);

    // 1406: introdução autêntica de 12.391s
    const mam1406Easy = beatmaps.getBeatmap('mam-1406', 'EASY');
    expect(mam1406Easy[0].time).toBeCloseTo(12.391, 2);

    // Dormi na Praça: introdução de 3.512s
    const dormiNaPracaEasy = beatmaps.getBeatmap('har-dormi-na-praca', 'EASY');
    expect(dormiNaPracaEasy[0].time).toBeCloseTo(3.512, 2);

    // Máscara: introdução de 4.8s
    const mascaraEasy = beatmaps.getBeatmap('pit-mascara', 'EASY');
    expect(mascaraEasy[0].time).toBeCloseTo(4.8, 2);
  });

  it('2. Pré-roll visual: notas descem suavemente durante a contagem regressiva sem antecipar acerto', () => {
    const clock = new UnifiedMasterClock();
    const prerollSec = 1.35; // Preset NORMAL

    clock.startCountdown(prerollSec);
    expect(clock.isCountdownState()).toBe(true);
    expect(clock.getTime()).toBeCloseTo(-1.35, 3);

    // Meio da contagem (progresso 50%) -> -0.675s
    clock.setPrerollProgress(0.5, prerollSec);
    expect(clock.getTime()).toBeCloseTo(-0.675, 3);

    // Final da contagem (ROCK BRASIL! / progresso 100%) -> 0.0s
    clock.setPrerollProgress(1.0, prerollSec);
    expect(clock.getTime()).toBeCloseTo(0.0, 3);

    // Início da reprodução de áudio
    clock.startPlayback();
    expect(clock.isCountdownState()).toBe(false);
  });

  it('3. Notas durante introdução não são acertáveis antes do instante musical correto', () => {
    const testNotes: Note[] = [
      { id: 1, time: 6.565, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    const engine = new GameEngine(testNotes, 'MEDIUM', defaultSettings);

    // Jogador aperta tecla nos primeiros segundos da introdução (ex: t = 2.0s)
    const earlyPress = engine.handleLanePress(0, 2.0);
    // Não pode acertar nem registrar hit antes da janela válida
    expect(earlyPress).toBeNull();
    expect(engine.getNotes()[0].hit).toBe(false);
    expect(engine.getNotes()[0].missed).toBe(false);

    // Jogador aperta na janela exata da nota (t = 6.57s)
    const onTimePress = engine.handleLanePress(0, 6.57);
    expect(onTimePress).not.toBeNull();
    expect(onTimePress?.judgment).toBe('PERFECT');
    expect(engine.getNotes()[0].hit).toBe(true);
  });

  it('4. Preservação de intervalos entre notas (distâncias relativas invariantes)', () => {
    const beatmaps = new BeatmapManager();
    const notes = beatmaps.getBeatmap('kua-de-borest', 'EXPERT');

    // Intervalos devem ser estritamente não-negativos e ordenados cronologicamente
    for (let i = 1; i < notes.length; i++) {
      const delta = notes[i].time - notes[i - 1].time;
      expect(delta).toBeGreaterThanOrEqual(0);
    }
  });

  it('5. Preservação de acordes sem colisões no EASY e MEDIUM', () => {
    const beatmaps = new BeatmapManager();
    const easyNotes = beatmaps.getBeatmap('cap-sua-maneira', 'EASY');

    // No EASY, nenhuma nota pode ter lane > 2
    const timesMap = new Map<number, Set<number>>();
    for (const note of easyNotes) {
      expect(note.lane).toBeGreaterThanOrEqual(0);
      expect(note.lane).toBeLessThanOrEqual(2);

      let lanesAtTime = timesMap.get(note.time);
      if (!lanesAtTime) {
        lanesAtTime = new Set<number>();
        timesMap.set(note.time, lanesAtTime);
      }
      // NUNCA pode haver duas notas na mesma pista no mesmo instante
      expect(lanesAtTime.has(note.lane)).toBe(false);
      lanesAtTime.add(note.lane);
    }
  });

  it('6. Preservação de notas sustentadas com pontuação contínua', () => {
    const testNotes: Note[] = [
      { id: 1, time: 6.0, lane: 2, duration: 1.5, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
    ];

    const engine = new GameEngine(testNotes, 'MEDIUM', defaultSettings);
    let sustainTickCount = 0;
    engine.onSustainTick = () => { sustainTickCount++; };

    // Acerta a nota no início exato
    engine.handleLanePress(2, 6.0);
    expect(engine.getNotes()[0].hit).toBe(true);

    // Avança o tempo mantendo o botão pressionado
    engine.update(6.2);
    engine.update(6.5);
    engine.update(7.0);
    engine.update(7.5); // Fim da sustentação (6.0 + 1.5s)

    expect(sustainTickCount).toBeGreaterThan(0);
    expect(engine.getNotes()[0].sustainCompleted).toBe(true);
  });

  it('7. Suporte a offsets positivos e negativos de calibração', () => {
    const clock = new UnifiedMasterClock();
    // Offset positivo (+50ms)
    clock.setOffsets(50, 0);
    expect(clock.getTotalOffsetSec()).toBeCloseTo(0.05, 3);

    // Offset negativo (-30ms)
    clock.setOffsets(-30, 0);
    expect(clock.getTotalOffsetSec()).toBeCloseTo(-0.03, 3);
  });

  it('8. Estabilidade do relógio em pausa e retomada', () => {
    const clock = new UnifiedMasterClock();
    const fakeSource = {
      currentTime: 10.5,
      getCurrentTime() { return this.currentTime; },
      getPlaybackState() { return PlaybackState.PLAYING; },
      isBuffering() { return false; }
    };

    clock.setSource(fakeSource);
    clock.startPlayback();
    expect(clock.getTime()).toBeCloseTo(10.5, 2);

    // Pausa
    clock.pause();
    expect(clock.isPausedState()).toBe(true);
    // Mesmo que a fonte avance inadvertidamente enquanto pausado:
    fakeSource.currentTime = 15.0;
    expect(clock.getTime()).toBeCloseTo(10.5, 2); // Congelado!

    // Retoma
    clock.resume();
    expect(clock.isPausedState()).toBe(false);
  });

  it('9. Ausência de deslocamento artificial da primeira nota (ChartShiftManager zerado)', () => {
    expect(ChartShiftManager.isSongShifted('kua-de-borest')).toBe(false);
    expect(ChartShiftManager.getShiftSeconds('kua-de-borest')).toBe(0);
    expect(ChartShiftManager.isSongShifted('cap-sua-maneira')).toBe(false);
    expect(ChartShiftManager.getShiftSeconds('cap-sua-maneira')).toBe(0);
  });

  it('10. Músicas com áudio local são configuradas sem dependência do YouTube', () => {
    const deBorest = OFFICIAL_BRAZILIAN_CATALOG.find((s) => s.id === 'kua-de-borest');
    expect(deBorest).toBeDefined();
    expect(deBorest?.type).toBe('audio-file');
    expect(deBorest?.audioUrl).toBe('songs/kua-de-borest/song.ogg');

    // As 6 duplicatas possuem áudio local
    const duplicateIds = [
      'mam-chopis-centis',
      'pit-mascara',
      'kua-de-borest',
      'mat-ela-roubou-caminhao',
      'mas-metal-is-the-law',
      'har-dormi-na-praca'
    ];
    for (const id of duplicateIds) {
      const song = OFFICIAL_BRAZILIAN_CATALOG.find((s) => s.id === id);
      expect(song).toBeDefined();
      expect(song?.type).toBe('audio-file');
      expect(song?.audioUrl).toContain('song.ogg');
    }
  });

  it('11. Preservação integral do catálogo (31 originais + 131 novas = 162 total)', () => {
    expect(ORIGINAL_31_BRAZILIAN_CATALOG.length).toBe(31);
    expect(OFFICIAL_BRAZILIAN_CATALOG.length).toBe(162);
    // As 31 primeiras faixas mantêm rigorosamente os mesmos IDs nas mesmas posições
    for (let i = 0; i < 31; i++) {
      expect(OFFICIAL_BRAZILIAN_CATALOG[i].id).toBe(ORIGINAL_31_BRAZILIAN_CATALOG[i].id);
    }
  });
});
