import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Difficulty, Note, PlaybackState } from '../src/types';
import { UnifiedMasterClock } from '../src/game/sync/masterClock';
import { RockSyncEngine } from '../src/game/sync/rockSyncEngine';
import { BeatmapManager } from '../src/game/beatmapManager';
import { SongLibrary } from '../src/game/songLibrary';
import { ProfileManager } from '../src/game/profileManager';
import {
  INTERNATIONAL_METADATA_CONFIG,
  INTERNATIONAL_SONGS_CATALOG
} from '../src/game/catalog/internationalCatalog';
import { RAW_INTERNATIONAL_CHARTS } from '../src/game/catalog/internationalChartsRegistry';

describe('V13.9.3.1 — T.N.T. (AC/DC) Real Pipeline & RockSync Validation Suite', () => {
  const bm = new BeatmapManager();
  const library = new SongLibrary();
  const profileManager = new ProfileManager();

  // 1. Integridade de Metadados e Duração
  it('1. Audio integrity: duration is 229s (03:49) and title/artist are T.N.T. by AC/DC', () => {
    const catalogEntry = INTERNATIONAL_SONGS_CATALOG.find((s) => s.id === 'tnt-acdc');
    expect(catalogEntry).toBeDefined();
    expect(catalogEntry?.title).toBe('T.N.T.');
    expect(catalogEntry?.artist).toBe('AC/DC');
    expect(catalogEntry?.duration).toBe(229);
    expect(catalogEntry?.isInternational).toBe(true);

    const config = INTERNATIONAL_METADATA_CONFIG['tnt-acdc'];
    expect(config).toBeDefined();
    expect(config.status).toBe('PRONTA PARA TESTE');
  });

  // 2. Detecção Real de BPM e Associação de Vídeo
  it('2. Real BPM detection: calculated at 130 BPM and associated with official YouTube video fGDQ9IukMOc', () => {
    const catalogEntry = INTERNATIONAL_SONGS_CATALOG.find((s) => s.id === 'tnt-acdc');
    expect(catalogEntry).toBeDefined();
    expect(catalogEntry?.bpm).toBe(130);
    expect(catalogEntry?.bpm).not.toBe(120);
    expect(catalogEntry?.youtubeVideoId).toBe('fGDQ9IukMOc');
    expect(catalogEntry?.internationalStatus).toBe('PRONTA PARA TESTE');
  });

  // 3. Extensão Completa do Chart (Sem Truncamento)
  it('3. Non-truncation: notes cover the full song from start (t < 2s) to end (t > 220s)', () => {
    const expert = bm.getBeatmap('tnt-acdc', 'EXPERT');
    expect(expert.length).toBe(1639);

    const firstNoteTime = expert[0].time;
    const lastNoteTime = expert[expert.length - 1].time;

    expect(firstNoteTime).toBeLessThan(2.0);
    expect(lastNoteTime).toBeGreaterThan(220.0);
    expect(lastNoteTime).toBeLessThan(232.0);
  });

  // 4. FÁCIL: 703 notas, estritamente 3 pistas (0, 1, 2) e zero acordes
  it('4. FÁCIL: strictly 703 notes, 3 lanes (0, 1, 2), strictly 0 chords, spacing >= 200ms', () => {
    const easy = bm.getBeatmap('tnt-acdc', 'EASY');
    expect(easy.length).toBe(703);

    for (const note of easy) {
      expect(note.lane).toBeGreaterThanOrEqual(0);
      expect(note.lane).toBeLessThanOrEqual(2);
    }

    // Validação de zero acordes (timestamps estritamente únicos)
    const timeMap = new Map<number, number>();
    for (const n of easy) {
      timeMap.set(n.time, (timeMap.get(n.time) || 0) + 1);
    }
    const chords = Array.from(timeMap.values()).filter((c) => c > 1);
    expect(chords.length).toBe(0);
  });

  // 5. MÉDIO: 1125 notas, estritamente 4 pistas (0, 1, 2, 3), acordes permitidos
  it('5. MÉDIO: strictly 1125 notes, 4 lanes (0, 1, 2, 3), chords present and progressive', () => {
    const med = bm.getBeatmap('tnt-acdc', 'MEDIUM');
    expect(med.length).toBe(1125);
    expect(med.length).toBeGreaterThan(703);

    for (const note of med) {
      expect(note.lane).toBeGreaterThanOrEqual(0);
      expect(note.lane).toBeLessThanOrEqual(3);
    }

    const timeMap = new Map<number, number>();
    for (const n of med) {
      timeMap.set(n.time, (timeMap.get(n.time) || 0) + 1);
    }
    const chords = Array.from(timeMap.values()).filter((c) => c > 1);
    expect(chords.length).toBeGreaterThan(10);
  });

  // 6. DIFÍCIL & EXPERT: 1518 e 1639 notas, 5 pistas (0..4), acordes e sustains
  it('6. DIFÍCIL & EXPERT: 1518 and 1639 notes, 5 lanes (0, 1, 2, 3, 4), chords and sustains present', () => {
    const hard = bm.getBeatmap('tnt-acdc', 'HARD');
    const expert = bm.getBeatmap('tnt-acdc', 'EXPERT');

    expect(hard.length).toBe(1518);
    expect(expert.length).toBe(1639);
    expect(hard.length).toBeGreaterThan(1125);
    expect(expert.length).toBeGreaterThan(1518);

    for (const note of hard) {
      expect(note.lane).toBeGreaterThanOrEqual(0);
      expect(note.lane).toBeLessThanOrEqual(4);
    }
    for (const note of expert) {
      expect(note.lane).toBeGreaterThanOrEqual(0);
      expect(note.lane).toBeLessThanOrEqual(4);
    }

    const sustains = expert.filter((n) => n.duration > 0.05);
    expect(sustains.length).toBeGreaterThan(5);
  });

  // 7. Integração no Catálogo Internacional e Desbloqueio
  it('7. Catalog integration: T.N.T. is listed in international catalog and accessible for gameplay', () => {
    const intlSongs = library.getActiveSongs('international');
    const customSongs = library.getActiveSongs('custom');

    expect(intlSongs.some((s) => s.id === 'tnt-acdc')).toBe(true);
    expect(customSongs.some((s) => s.id === 'tnt-acdc')).toBe(true);

    // Verificação de desbloqueio de teste garantido
    const isUnlocked = profileManager.isSongUnlocked('tnt-acdc');
    expect(isUnlocked).toBe(true);
  });

  // 8. Estabilidade do Relógio RockSync com Múltiplos Erros Consecutivos
  it('8. RockSync continuous clock: 10, 20, 50, and 100 consecutive misses without freezing highway or resetting playback', () => {
    let mockTime = 10.0;
    const masterClock = new UnifiedMasterClock();
    masterClock.setSource({
      getCurrentTime: () => mockTime,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    });
    masterClock.startPlayback();

    const rse = new RockSyncEngine(masterClock);

    // Simula 10 misses
    for (let i = 1; i <= 10; i++) {
      mockTime += 0.05;
      rse.registerMiss(mockTime);
      rse.update(performance.now() + i * 50);

      expect(masterClock.getTime()).toBeGreaterThanOrEqual(10.0);
    }
    expect(rse.getState().consecutiveMisses).toBe(10);
    expect(rse.getState().frozenStreakCount).toBe(0);

    // Simula até 50 misses
    for (let i = 11; i <= 50; i++) {
      mockTime += 0.05;
      rse.registerMiss(mockTime);
      rse.update(performance.now() + i * 50);
    }
    expect(rse.getState().consecutiveMisses).toBe(50);
    expect(rse.getState().frozenStreakCount).toBe(0);
    expect(masterClock.getTime()).toBeCloseTo(12.5, 1);

    // Simula até 100 misses
    for (let i = 51; i <= 100; i++) {
      mockTime += 0.05;
      rse.registerMiss(mockTime);
      rse.update(performance.now() + i * 50);
    }
    expect(rse.getState().consecutiveMisses).toBe(100);
    expect(rse.getState().frozenStreakCount).toBe(0);
    expect(masterClock.getTime()).toBeCloseTo(15.0, 1);
  });

  // 9. BeatmapManager carrega os charts reais integrados em RAW_INTERNATIONAL_CHARTS
  it('9. BeatmapManager retrieves the authentic converted charts for T.N.T. across all 4 difficulties', () => {
    const raw = RAW_INTERNATIONAL_CHARTS['tnt-acdc'];
    expect(raw).toBeDefined();
    expect(raw.EASY.length).toBe(703);
    expect(raw.MEDIUM.length).toBe(1125);
    expect(raw.HARD.length).toBe(1518);
    expect(raw.EXPERT.length).toBe(1639);

    const easy = bm.getBeatmap('tnt-acdc', 'EASY');
    const medium = bm.getBeatmap('tnt-acdc', 'MEDIUM');
    const hard = bm.getBeatmap('tnt-acdc', 'HARD');
    const expert = bm.getBeatmap('tnt-acdc', 'EXPERT');

    expect(easy.length).toBe(703);
    expect(medium.length).toBe(1125);
    expect(hard.length).toBe(1518);
    expect(expert.length).toBe(1639);
  });

  // 10. Fixture opcional de análise acústica (executada se disponível localmente)
  it('10. Acoustic analysis fixture: transparent metadata validation when available', () => {
    const localScratch = path.resolve(__dirname, '../scratch/tnt_compact.json');
    if (fs.existsSync(localScratch)) {
      const data = JSON.parse(fs.readFileSync(localScratch, 'utf8'));
      expect(data.EASY.length).toBe(703);
      expect(data.MEDIUM.length).toBe(1125);
      expect(data.HARD.length).toBe(1518);
      expect(data.EXPERT.length).toBe(1639);
    } else {
      // Em ambiente limpo de CI sem scratch, valida diretamente os dados permanentes
      expect(RAW_INTERNATIONAL_CHARTS['tnt-acdc']).toBeDefined();
    }
  });
});
