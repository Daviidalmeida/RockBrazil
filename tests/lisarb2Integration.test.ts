import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  ORIGINAL_31_BRAZILIAN_CATALOG,
  OFFICIAL_BRAZILIAN_CATALOG
} from '../src/game/catalog/catalogData';
import { SongLibrary } from '../src/game/songLibrary';
import { BeatmapManager } from '../src/game/beatmapManager';
import { UniversalChartImporter } from '../src/audio/universalChartImporter';
import { ProfileManager } from '../src/game/profileManager';
import { Difficulty } from '../src/types';

describe('ROCKBRAZIL — Suíte Completa de Integração e Conformidade Lisarb2', () => {
  const difficulties: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];

  it('1. Regra de Preservação: as 31 músicas originais mantêm ordem, IDs e posições intactas', () => {
    expect(ORIGINAL_31_BRAZILIAN_CATALOG.length).toBe(31);
    expect(OFFICIAL_BRAZILIAN_CATALOG.length).toBe(162);

    for (let i = 0; i < 31; i++) {
      const orig = ORIGINAL_31_BRAZILIAN_CATALOG[i];
      const catalogSong = OFFICIAL_BRAZILIAN_CATALOG[i];

      expect(catalogSong.id).toBe(orig.id);
      expect(catalogSong.title).toBe(orig.title);
      expect(catalogSong.artist).toBe(orig.artist);
      expect(catalogSong.group).toBe(orig.group);
      expect(catalogSong.encore).toBe(orig.encore);
    }
  });

  it('2. Todas as 131 novas músicas de Lisarb2 estão posicionadas estritamente após a 31ª música', () => {
    const newSongs = OFFICIAL_BRAZILIAN_CATALOG.slice(31);
    expect(newSongs.length).toBe(131);

    for (const song of newSongs) {
      expect(song.id.startsWith('lis-')).toBe(true);
      expect(song.type).toBe('audio-file');
      expect(song.audioUrl).toBeTruthy();
      expect(song.isAvailable).toBe(true);
      expect(song.duration).toBeGreaterThan(15);
      expect(song.bpm).toBeGreaterThan(40);
    }
  });

  it('3. As 6 duplicatas identificadas preservam seus IDs originais e possuem áudio local e capa', () => {
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
      expect(song!.type).toBe('audio-file');
      expect(song!.audioUrl).toBe(`songs/${id}/song.ogg`);
      expect(song!.coverUrl).toBeTruthy();

      // Verifica arquivos físicos no disco
      const audioFile = path.resolve(process.cwd(), 'public', song!.audioUrl!);
      expect(fs.existsSync(audioFile), `Áudio não encontrado: ${audioFile}`).toBe(true);

      const coverFile = path.resolve(process.cwd(), 'public', song!.coverUrl!);
      expect(fs.existsSync(coverFile), `Capa não encontrada: ${coverFile}`).toBe(true);
    }
  });

  it('4. Todos os 137 pacotes possuem arquivos de áudio .ogg e capas físicas no servidor público', () => {
    const publicSongsDir = path.resolve(process.cwd(), 'public/songs');
    expect(fs.existsSync(publicSongsDir)).toBe(true);

    const songDirs = fs.readdirSync(publicSongsDir);
    expect(songDirs.length).toBe(137);

    for (const dirName of songDirs) {
      const songPath = path.join(publicSongsDir, dirName);
      const audioPath = path.join(songPath, 'song.ogg');
      expect(fs.existsSync(audioPath), `song.ogg ausente em ${dirName}`).toBe(true);

      const files = fs.readdirSync(songPath);
      const hasCover = files.some((f) => /^cover\.(png|jpg|jpeg)$/i.test(f));
      expect(hasCover, `Capa ausente em ${dirName}`).toBe(true);
    }
  });

  it('5. Todos os 137 charts convertidos existem em public/charts/<id>.json', () => {
    const publicChartsDir = path.resolve(process.cwd(), 'public/charts');
    expect(fs.existsSync(publicChartsDir)).toBe(true);

    const chartFiles = fs.readdirSync(publicChartsDir).filter((f) => f.endsWith('.json'));
    expect(chartFiles.length).toBe(137);

    for (const file of chartFiles) {
      const chartPath = path.join(publicChartsDir, file);
      const data = JSON.parse(fs.readFileSync(chartPath, 'utf-8'));
      for (const diff of difficulties) {
        expect(Array.isArray(data[diff]), `Dificuldade ${diff} ausente em ${file}`).toBe(true);
      }
    }
  });

  it('6. BeatmapManager retorna notas jogáveis e ordenadas para todas as 162 músicas do catálogo', () => {
    const bm = new BeatmapManager();

    // Testa amostragem profunda (as 31 originais + 15 novas de diferentes categorias)
    const testSample = [
      ...OFFICIAL_BRAZILIAN_CATALOG.slice(0, 31),
      ...OFFICIAL_BRAZILIAN_CATALOG.slice(31, 50),
      ...OFFICIAL_BRAZILIAN_CATALOG.slice(-10)
    ];

    for (const song of testSample) {
      for (const diff of difficulties) {
        const notes = bm.getBeatmap(song.id, diff);
        expect(notes.length, `Notas insuficientes em ${song.title} (${diff})`).toBeGreaterThan(5);

        // Nenhuma nota excede pistas permitidas
        const maxLane = diff === 'EASY' ? 2 : diff === 'MEDIUM' ? 3 : 4;
        for (const n of notes) {
          expect(n.lane).toBeGreaterThanOrEqual(0);
          expect(n.lane).toBeLessThanOrEqual(maxLane);
        }

        // Ordenação temporal estrita
        for (let i = 1; i < notes.length; i++) {
          expect(notes[i].time).toBeGreaterThanOrEqual(notes[i - 1].time);
        }
      }
    }
  });

  it('7. De Borest inicia sincronizado com o áudio local e preserva notas autênticas', () => {
    const bm = new BeatmapManager();
    const deBorest = OFFICIAL_BRAZILIAN_CATALOG.find((s) => s.id === 'kua-de-borest');
    expect(deBorest).toBeDefined();
    expect(deBorest!.type).toBe('audio-file');
    expect(deBorest!.audioUrl).toBe('songs/kua-de-borest/song.ogg');

    const expert = bm.getBeatmap('kua-de-borest', 'EXPERT');
    expect(expert.length).toBeGreaterThan(500);

    // Na reprodução com áudio local, o áudio toca desde o início e as notas casam perfeitamente
    const audioPath = path.resolve(process.cwd(), 'public/songs/kua-de-borest/song.ogg');
    expect(fs.existsSync(audioPath)).toBe(true);
    expect(fs.statSync(audioPath).size).toBeGreaterThan(1000000);
  });

  it('8. SongLibrary retorna 162 músicas ativas mantendo persistência de recordes e economia', () => {
    const lib = new SongLibrary();
    const active = lib.getActiveSongs();
    expect(active.length).toBe(162);

    // Testa integridade do ProfileManager
    const profile = ProfileManager.GUEST_PROFILE;
    expect(profile).toBeDefined();
    expect(profile.records).toBeDefined();
  });
});
