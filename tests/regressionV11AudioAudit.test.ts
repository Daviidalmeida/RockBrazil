import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SongLibrary } from '../src/game/songLibrary';
import { BeatmapManager } from '../src/game/beatmapManager';
import { GameEngine } from '../src/game/engine';
import { ChartShiftManager } from '../src/game/catalog/chartShiftManager';
import { OFFICIAL_BRAZILIAN_CATALOG, ORIGINAL_31_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';
import { PreStartSystem } from '../src/game/sync/prestartSystem';

describe('ROCKBRAZIL V11 — Auditoria Completa dos Áudios e Correção do Player', () => {
  const library = new SongLibrary();
  const beatmaps = new BeatmapManager();

  it('1. Catálogo Total: 162 faixas, com 160 em áudio local e apenas 2 no YouTube', () => {
    const active = library.getActiveSongs();
    expect(active.length).toBe(162);
    expect(OFFICIAL_BRAZILIAN_CATALOG.length).toBe(162);
    expect(ORIGINAL_31_BRAZILIAN_CATALOG.length).toBe(31);

    const localSongs = active.filter((s) => s.type === 'audio-file');
    const ytSongs = active.filter((s) => s.type === 'youtube');

    expect(localSongs.length).toBe(160);
    expect(ytSongs.length).toBe(2);

    const ytIds = ytSongs.map((s) => s.id);
    expect(ytIds).toContain('cue-quem-matou-bozo');
    expect(ytIds).toContain('cue-minha-juventude');
  });

  it('2. Preservação de Ordem, IDs e Metadados das Primeiras 31 Músicas Canônicas', () => {
    const active = library.getActiveSongs();
    for (let i = 0; i < 31; i++) {
      expect(active[i].id).toBe(ORIGINAL_31_BRAZILIAN_CATALOG[i].id);
      expect(active[i].title).toBe(ORIGINAL_31_BRAZILIAN_CATALOG[i].title);
      expect(active[i].artist).toBe(ORIGINAL_31_BRAZILIAN_CATALOG[i].artist);
    }
  });

  it('3. Correção de 1406 (Mamonas Assassinas): Áudio local autêntico e sem vídeo da Pitty', () => {
    const song1406 = library.getSongById('mam-1406');
    expect(song1406).toBeDefined();
    expect(song1406!.type).toBe('audio-file');
    expect(song1406!.audioUrl).toBe('songs/mam-1406/song.ogg');
    expect(song1406!.coverUrl).toBe('songs/mam-1406/cover.png');

    const oggPath = path.resolve(process.cwd(), 'public/songs/mam-1406/song.ogg');
    expect(fs.existsSync(oggPath)).toBe(true);
    expect(fs.statSync(oggPath).size).toBeGreaterThan(2000000); // ~2.29 MB

    const coverPath = path.resolve(process.cwd(), 'public/songs/mam-1406/cover.png');
    expect(fs.existsSync(coverPath)).toBe(true);
  });

  it('4. Correção de À Sua Maneira (Capital Inicial): Áudio local e eliminação do erro 404 do YouTube', () => {
    const suaManeira = library.getSongById('cap-sua-maneira');
    expect(suaManeira).toBeDefined();
    expect(suaManeira!.type).toBe('audio-file');
    expect(suaManeira!.audioUrl).toBe('songs/cap-sua-maneira/song.ogg');
    expect(suaManeira!.coverUrl).toBe('songs/cap-sua-maneira/cover.png');

    const oggPath = path.resolve(process.cwd(), 'public/songs/cap-sua-maneira/song.ogg');
    expect(fs.existsSync(oggPath)).toBe(true);
    expect(fs.statSync(oggPath).size).toBeGreaterThan(3000000); // ~3.08 MB
  });

  it('5. Correção de Admirável Chip Novo (Pitty): Áudio local autêntico e sem fallback forçado no Player', () => {
    const chipNovo = library.getSongById('pit-chip-novo');
    expect(chipNovo).toBeDefined();
    expect(chipNovo!.type).toBe('audio-file');
    expect(chipNovo!.audioUrl).toBe('songs/pit-chip-novo/song.ogg');
    expect(chipNovo!.coverUrl).toBe('songs/pit-chip-novo/cover.png');

    const oggPath = path.resolve(process.cwd(), 'public/songs/pit-chip-novo/song.ogg');
    expect(fs.existsSync(oggPath)).toBe(true);
    expect(fs.statSync(oggPath).size).toBeGreaterThan(1800000); // ~1.93 MB

    // Verifica que o controlador do YouTube não possui fallback hardcoded para a Pitty
    const ytSource = fs.readFileSync('src/audio/youtubePlayer.ts', 'utf-8');
    expect(ytSource).not.toContain("this.currentVideoId || 'aXJ_Ub1xbhw'");
  });

  it('6. Remoção dos 3 Botões do Rodapé no index.html e ajuste de estilo sem espaço vazio', () => {
    const html = fs.readFileSync('index.html', 'utf-8');

    // Botões removidos da interface da lista
    expect(html).not.toContain('class="notebook-bar-btn btn-import"');
    expect(html).not.toContain('id="btn-refresh-youtube-links"');
    expect(html).not.toContain('id="btn-open-editor"');

    // Botões que devem permanecer
    expect(html).toContain('id="btn-song-select-back"');
    expect(html).toContain('id="btn-song-select-play"');

    // Estilo do rodapé ajustado
    const css = fs.readFileSync('src/style.css', 'utf-8');
    expect(css).toContain('.notebook-footer-bar .notebook-bar-btn');
  });

  it('7. Correção do Overlay "ÁUDIO AGUARDANDO": Botão Cancelar/Voltar e sem display:flex inline', () => {
    const html = fs.readFileSync('index.html', 'utf-8');

    // Não deve ter inline display:flex que conflite com .hidden
    expect(html).not.toContain('id="overlay-unblock-audio" class="overlay-screen hidden" style="background: rgba(0,0,0,0.85); z-index: 1000; display: flex;');

    // Deve conter botão para cancelar e retornar ao catálogo
    expect(html).toContain('id="btn-unblock-cancel"');
    expect(html).toContain('VOLTAR AO CATÁLOGO');

    // Deve conter botão de desbloqueio com gesto
    expect(html).toContain('id="btn-unblock-audio"');
    expect(html).toContain('TOCAR AGORA');
  });

  it('8. PreStartSystem possui mecanismo de retryAudio funcional', () => {
    const prestart = new PreStartSystem();
    expect(typeof prestart.retryAudio).toBe('function');
    expect(typeof prestart.cancel).toBe('function');
    expect(typeof prestart.notifyPlaybackConfirmed).toBe('function');
  });

  it('9. Preservação da Sincronização Autêntica V9/V10 (De Borest e 1406 sem deslocamentos artificiais)', () => {
    const deBorestNotes = beatmaps.getBeatmap('kua-de-borest', 'EASY');
    expect(deBorestNotes[0].time).toBeCloseTo(6.565, 2);

    const mamNotes = beatmaps.getBeatmap('mam-1406', 'EASY');
    expect(mamNotes[0].time).toBeCloseTo(12.391, 2);

    expect(ChartShiftManager.isSongShifted('kua-de-borest')).toBe(false);
    expect(ChartShiftManager.getShiftSeconds('kua-de-borest')).toBe(0);
    expect(ChartShiftManager.isSongShifted('mam-1406')).toBe(false);
  });

  it('10. Auditoria de Existência Física: Todos os 160 arquivos de áudio .ogg existem em public/songs', () => {
    const active = library.getActiveSongs();
    const localSongs = active.filter((s) => s.type === 'audio-file');
    expect(localSongs.length).toBe(160);

    for (const song of localSongs) {
      expect(song.audioUrl).toBeTruthy();
      const fullPath = path.resolve(process.cwd(), 'public', song.audioUrl!);
      expect(fs.existsSync(fullPath), `Arquivo ausente: ${song.id} (${song.audioUrl})`).toBe(true);

      const stats = fs.statSync(fullPath);
      expect(stats.size, `Arquivo de áudio vazio: ${song.audioUrl}`).toBeGreaterThan(100000);
    }
  });
});
