import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SongLibrary } from '../src/game/songLibrary';
import { INTERNATIONAL_SONGS_CATALOG } from '../src/game/catalog/internationalCatalog';
import { OFFICIAL_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';

describe('ROCKBRAZIL V13.6.1 — AUDITORIA E TESTE DA ABA INTERNACIONAIS', () => {
  it('1. Deve ter no index.html a aba "INTERNACIONAIS" totalmente ativa e sem "EM BREVE..."', () => {
    const htmlPath = path.resolve(__dirname, '../index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    // Não deve conter a aba "EM BREVE..."
    expect(html).not.toMatch(/id="tab-songs-custom"[^>]*>EM BREVE\.\.\.<\/button>/i);

    // Deve conter id="tab-songs-custom" com texto "INTERNACIONAIS"
    expect(html).toContain('id="tab-songs-custom"');
    expect(html).toContain('>INTERNACIONAIS</button>');

    // Não deve ter a classe disabled-tab nem aria-disabled="true"
    const tabMatch = html.match(/<button[^>]*id="tab-songs-custom"[^>]*>/);
    expect(tabMatch).not.toBeNull();
    const tabTag = tabMatch![0];
    expect(tabTag).not.toContain('disabled-tab');
    expect(tabTag).not.toContain('disabled');
    expect(tabTag).not.toContain('aria-disabled="true"');
  });

  it('2. SongLibrary deve retornar as 5 músicas internacionais ao filtrar por "custom" ou "international"', () => {
    const library = new SongLibrary();

    const customSongs = library.getActiveSongs('custom');
    expect(customSongs.length).toBe(5);

    const intlSongs = library.getActiveSongs('international');
    expect(intlSongs.length).toBe(5);

    // IDs das 5 músicas
    const ids = customSongs.map(s => s.id);
    expect(ids).toContain('intl-gnr-paradise-city');
    expect(ids).toContain('intl-lp-numb');
    expect(ids).toContain('intl-gnr-sweet-child-o-mine');
    expect(ids).toContain('intl-gnr-welcome-to-the-jungle');
    expect(ids).toContain('intl-acdc-highway-to-hell');
  });

  it('3. Ao filtrar por "all", o catálogo exibe as 162 músicas brasileiras originais', () => {
    const library = new SongLibrary();
    const allSongs = library.getActiveSongs('all');
    expect(allSongs.length).toBe(162);
    expect(allSongs.every(s => !s.isInternational)).toBe(true);
  });

  it('4. As 5 músicas internacionais possuem metadados completos e prontos para teste', () => {
    expect(INTERNATIONAL_SONGS_CATALOG.length).toBe(5);
    for (const song of INTERNATIONAL_SONGS_CATALOG) {
      expect(song.isInternational).toBe(true);
      expect(song.title).toBeTruthy();
      expect(song.artist).toBeTruthy();
      expect(song.youtubeVideoId).toBeTruthy();
      expect(song.internationalStatus).toBe('PRONTA PARA TESTE');
    }
  });
});
