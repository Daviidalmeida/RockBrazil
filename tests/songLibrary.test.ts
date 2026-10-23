import { describe, it, expect } from 'vitest';
import { SongLibrary } from '../src/game/songLibrary';
import { BeatmapManager } from '../src/game/beatmapManager';

describe('SongLibrary & BeatmapManager', () => {
  it('deve carregar as 5 músicas procedurais e a faixa AC/DC TNT', () => {
    const library = new SongLibrary();
    const songs = library.getSongs();

    expect(songs.length).toBeGreaterThanOrEqual(6);

    const proceduralSongs = songs.filter((s) => s.type === 'procedural');
    expect(proceduralSongs.length).toBe(5);

    const tnt = library.getSongById('tnt-acdc');
    expect(tnt).toBeDefined();
    expect(tnt?.title).toBe('T.N.T.');
    expect(tnt?.artist).toBe('AC/DC');
  });

  it('deve conter beatmaps para todas as 4 dificuldades nas músicas procedurais', () => {
    const library = new SongLibrary();
    const beatmaps = new BeatmapManager();
    const songs = library.getSongs().filter((s) => s.type === 'procedural');

    const diffs = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as const;

    for (const song of songs) {
      for (const diff of diffs) {
        const notes = beatmaps.getBeatmap(song.id, diff);
        expect(notes.length).toBeGreaterThan(0);
        // Garantir que as pistas estejam entre 0 e 4
        for (const n of notes) {
          expect(n.lane).toBeGreaterThanOrEqual(0);
          expect(n.lane).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  it('deve aumentar densidade de notas conforme a dificuldade cresce', () => {
    const beatmaps = new BeatmapManager();
    const easyNotes = beatmaps.getBeatmap('furia-tropical', 'EASY');
    const expertNotes = beatmaps.getBeatmap('furia-tropical', 'EXPERT');

    expect(expertNotes.length).toBeGreaterThan(easyNotes.length);
  });
});
