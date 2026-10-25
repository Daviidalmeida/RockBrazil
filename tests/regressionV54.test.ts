import { describe, it, expect, beforeEach } from 'vitest';
import { SongLibrary } from '../src/game/songLibrary';
import { OFFICIAL_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';
import { AutoMusicFinder } from '../src/game/catalog/musicFinder';
import { SmartChartEngine } from '../src/game/catalog/smartChartEngine';
import { BeatmapManager } from '../src/game/beatmapManager';
import { YouTubePlayerController } from '../src/audio/youtubePlayer';
import * as fs from 'fs';
import * as path from 'path';

describe('ROCKBRAZIL V5.4 — SUÍTE COMPLETA DE REGRESSÃO E CONFORMIDADE', () => {

  describe('1. Catálogo Oficial Brasileiro (31 Músicas)', () => {
    let library: SongLibrary;

    beforeEach(() => {
      library = new SongLibrary();
    });

    it('deve conter exatamente 31 músicas no catálogo ativo oficial', () => {
      const activeSongs = library.getActiveSongs();
      expect(activeSongs.length).toBe(31);
      expect(OFFICIAL_BRAZILIAN_CATALOG.length).toBe(31);
    });

    it('deve conter todos os 8 grupos e faixas bônus completas', () => {
      const songs = library.getActiveSongs();

      // Grupo 1: 4 músicas
      const g1 = songs.filter((s) => s.group === 1);
      expect(g1.length).toBe(4);
      expect(g1.some((s) => s.title === '1406' && s.artist === 'Mamonas Assassinas')).toBe(true);
      expect(g1.some((s) => s.title === 'À Sua Maneira' && s.artist === 'Capital Inicial')).toBe(true);
      expect(g1.some((s) => s.title === 'Admirável Chip Novo' && s.artist === 'Pitty')).toBe(true);
      expect(g1.some((s) => s.title === 'Anna Júlia' && s.artist === 'Los Hermanos')).toBe(true);
      expect(g1.some((s) => s.title === 'Anna Júlia' && s.encore)).toBe(true);

      // Grupo 2: 3 músicas
      const g2 = songs.filter((s) => s.group === 2);
      expect(g2.length).toBe(3);
      expect(g2.some((s) => s.title === 'De Borest' && s.artist === 'Kuase Nada')).toBe(true);
      expect(g2.some((s) => s.title === 'Débil Metal')).toBe(true);
      expect(g2.some((s) => s.title === 'Chopis Centis' && s.encore)).toBe(true);

      // Grupo 3: 5 músicas
      const g3 = songs.filter((s) => s.group === 3);
      expect(g3.length).toBe(5);
      expect(g3.some((s) => s.title === 'Destruir Tudo de Novo' && s.artist === 'Dead Fish')).toBe(true);
      expect(g3.some((s) => s.title === 'Garota de Berlim' && s.artist === 'Supla')).toBe(true);
      expect(g3.some((s) => s.title === 'Hoje Eu Acordei Feliz' && s.artist === 'Charlie Brown Jr.')).toBe(true);
      expect(g3.some((s) => s.title === 'Irreversível' && s.artist === 'CPM 22')).toBe(true);
      expect(g3.some((s) => s.title === 'Jumento Celestino' && s.encore)).toBe(true);

      // Grupo 4: 3 músicas
      const g4 = songs.filter((s) => s.group === 4);
      expect(g4.length).toBe(3);
      expect(g4.some((s) => s.title === 'Lata Velha' && s.artist === 'Landau')).toBe(true);
      expect(g4.some((s) => s.title === 'Não É Sério' && s.artist === 'Charlie Brown Jr.')).toBe(true);
      expect(g4.some((s) => s.title.includes('Era Um Garoto') && s.artist === 'Engenheiros do Hawaii' && s.encore)).toBe(true);

      // Grupo 5: 2 músicas
      const g5 = songs.filter((s) => s.group === 5);
      expect(g5.length).toBe(2);
      expect(g5.some((s) => s.title === 'Champagne e Água Benta' && s.artist === 'Charlie Brown Jr.')).toBe(true);
      expect(g5.some((s) => s.title === 'Equalize' && s.artist === 'Pitty' && s.encore)).toBe(true);

      // Grupo 6: 3 músicas
      const g6 = songs.filter((s) => s.group === 6);
      expect(g6.length).toBe(3);
      expect(g6.some((s) => s.title === 'Tropa de Elite' && s.artist === 'Tihuana')).toBe(true);
      expect(g6.some((s) => s.title === 'Sabão Crá-Crá')).toBe(true);
      expect(g6.some((s) => s.title === 'Só por uma Noite' && s.artist === 'Charlie Brown Jr.' && s.encore)).toBe(true);

      // Grupo 7: 5 músicas
      const g7 = songs.filter((s) => s.group === 7);
      expect(g7.length).toBe(5);
      expect(g7.some((s) => s.title === 'Ela Roubou Meu Caminhão' && s.artist === 'Matanza')).toBe(true);
      expect(g7.some((s) => s.title === 'Evil Papagali' && s.artist === 'Massacration')).toBe(true);
      expect(g7.some((s) => s.title === 'Não Reclame Mais' && s.artist === 'Detonautas')).toBe(true);
      expect(g7.some((s) => s.title === 'Papo Reto' && s.artist === 'Charlie Brown Jr.')).toBe(true);
      expect(g7.some((s) => s.title === 'Mundo Animal' && s.encore)).toBe(true);

      // Grupo 8: 4 músicas
      const g8 = songs.filter((s) => s.group === 8);
      expect(g8.length).toBe(4);
      expect(g8.some((s) => s.title === 'Metal Is The Law' && s.artist === 'Massacration')).toBe(true);
      expect(g8.some((s) => s.title === 'Metal Milkshake' && s.artist === 'Massacration')).toBe(true);
      expect(g8.some((s) => s.title === 'Quem Matou o Bozo' && s.artist === 'Cueio Limão')).toBe(true);
      expect(g8.some((s) => s.title === 'Dormi na Praça' && s.artist === 'Hardneja Sertacore' && s.encore)).toBe(true);

      // Bônus: 2 músicas
      const bonus = songs.filter((s) => s.group === 'bonus');
      expect(bonus.length).toBe(2);
      expect(bonus.some((s) => s.title === 'Máscara' && s.artist === 'Pitty')).toBe(true);
      expect(bonus.some((s) => s.title === 'Minha Juventude' && s.artist === 'Cueio Limão')).toBe(true);
    });

    it('cada uma das 31 músicas deve ter ID de vídeo oficial do YouTube válido (11 caracteres)', () => {
      const activeSongs = library.getActiveSongs();
      const ytIdRegex = /^[a-zA-Z0-9_-]{11}$/;

      activeSongs.forEach((song) => {
        expect(song.youtubeVideoId, `Música sem ID: ${song.artist} - ${song.title}`).toBeDefined();
        expect(song.youtubeVideoId).toMatch(ytIdRegex);
        expect(song.youtubeUrl).toContain(song.youtubeVideoId);
        expect(song.duration).toBeGreaterThan(0);
        expect(song.bpm).toBeGreaterThan(0);
        expect(song.isAvailable).toBe(true);
      });
    });
  });

  describe('2. Localizador Automático (AutoMusicFinder)', () => {
    it('deve gerar relatório completo de 31 músicas com todos os metadados exigidos', () => {
      const finder = new AutoMusicFinder();
      const report = finder.generateReport();

      expect(report.length).toBe(31);

      report.forEach((item) => {
        expect(item.id).toBeTruthy();
        expect(item.artist).toBeTruthy();
        expect(item.title).toBeTruthy();
        expect(item.youtubeVideoId.length).toBe(11);
        expect(item.youtubeUrl).toContain('https://www.youtube.com/watch?v=');
        expect(item.youtubeChannel).toBeTruthy();
        expect(item.matchConfidence).toBeGreaterThanOrEqual(80);
        expect(item.embeddingStatus).toBe('ELIGIBLE_OFFICIAL');
        expect(item.reviewStatus).toBe('VERIFIED');
        expect(item.licenseStatus).toBe('EMBED_ALLOWED');
        expect(item.chartStatus).toBe('SMART_CHART_READY');
      });
    });

    it('deve permitir atualizar vídeo manualmente via updateSongVideoId', () => {
      const finder = new AutoMusicFinder();
      const success = finder.updateSongVideoId('mam-1406', 'ABC123xyz89');
      expect(success).toBe(true);

      const song = finder.getSongById('mam-1406');
      expect(song?.youtubeVideoId).toBe('ABC123xyz89');
      expect(song?.youtubeUrl).toBe('https://www.youtube.com/watch?v=ABC123xyz89');
    });
  });

  describe('3. Smart Chart Engine & BeatmapManager', () => {
    it('deve gerar mapas inteligentes para todas as dificuldades com pistas adequadas', () => {
      const charts = SmartChartEngine.generateChartsForSong('pit-chip-novo', 140, 191);

      expect(charts.EASY.length).toBeGreaterThan(0);
      expect(charts.MEDIUM.length).toBeGreaterThan(0);
      expect(charts.HARD.length).toBeGreaterThan(0);
      expect(charts.EXPERT.length).toBeGreaterThan(0);

      // EASY deve utilizar apenas pistas 0, 1, 2
      charts.EASY.forEach((n) => {
        expect(n.lane).toBeGreaterThanOrEqual(0);
        expect(n.lane).toBeLessThanOrEqual(2);
        expect(n.time).toBeGreaterThanOrEqual(0);
      });

      // MEDIUM deve utilizar apenas pistas 0, 1, 2, 3
      charts.MEDIUM.forEach((n) => {
        expect(n.lane).toBeGreaterThanOrEqual(0);
        expect(n.lane).toBeLessThanOrEqual(3);
      });

      // HARD / EXPERT utilizam pistas 0 a 4
      charts.HARD.forEach((n) => {
        expect(n.lane).toBeGreaterThanOrEqual(0);
        expect(n.lane).toBeLessThanOrEqual(4);
      });

      // Densidade cresce com a dificuldade
      expect(charts.MEDIUM.length).toBeGreaterThanOrEqual(charts.EASY.length);
      expect(charts.HARD.length).toBeGreaterThanOrEqual(charts.MEDIUM.length);
      expect(charts.EXPERT.length).toBeGreaterThanOrEqual(charts.HARD.length);
    });

    it('deve ser determinístico: mesma música e dificuldade geram exatamente as mesmas notas', () => {
      const notesA = SmartChartEngine.generateChartsForSong('cbjr-papo-reto', 112, 210).HARD;
      const notesB = SmartChartEngine.generateChartsForSong('cbjr-papo-reto', 112, 210).HARD;

      expect(notesA.length).toBe(notesB.length);
      for (let i = 0; i < notesA.length; i++) {
        expect(notesA[i].time).toBe(notesB[i].time);
        expect(notesA[i].lane).toBe(notesB[i].lane);
        expect(notesA[i].duration).toBe(notesB[i].duration);
      }
    });

    it('BeatmapManager deve fornecer mapas automaticamente para qualquer música do catálogo oficial', () => {
      const beatmaps = new BeatmapManager();
      const notes = beatmaps.getBeatmap('mam-vira-vira', 'MEDIUM');

      expect(notes.length).toBeGreaterThan(50);
      expect(notes.every((n) => n.lane <= 3)).toBe(true);
    });
  });

  describe('4. YouTubePlayerController', () => {
    it('deve instanciar e responder a métodos de controle com fallback seguro', () => {
      const player = new YouTubePlayerController();
      expect(player).toBeDefined();

      player.play();
      expect(player.getCurrentTime()).toBeGreaterThanOrEqual(0);

      player.pause();
      player.seekTo(15.5);
      expect(player.getCurrentTime()).toBe(15.5);

      expect(player.isBuffering()).toBe(false);

      player.setVolume(75);
      player.stop();
      expect(player.getCurrentTime()).toBe(0);
    });
  });

  describe('5. Conformidade Visual e Elementos do Layout V5.4', () => {
    it('deve conter o novo plano de fundo de palco stage-v54.jpg na pasta public/images', () => {
      const stagePath = path.resolve(__dirname, '../public/images/stage-v54.jpg');
      expect(fs.existsSync(stagePath)).toBe(true);

      const stats = fs.statSync(stagePath);
      expect(stats.size).toBeGreaterThan(10000);
    });

    it('index.html deve conter os novos elementos estruturais do HUD V5.4', () => {
      const htmlPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');

      // Miniplayer do YouTube
      expect(html).toContain('id="yt-player-container"');
      expect(html).toContain('id="yt-player-frame"');

      // Botão Pausar
      expect(html).toContain('id="btn-pause"');

      // Pontuação sem caixa preta
      expect(html).toContain('id="hud-score"');
      expect(html).toContain('id="hud-multiplier"');
      expect(html).toContain('id="hud-combo-number"');

      // Novo Medidor Industrial ROCKBRAZIL
      expect(html).toContain('class="industrial-rock-meter"');
      expect(html).toContain('class="meter-casing"');
      expect(html).toContain('class="vacuum-tube-unit"');
      expect(html).toContain('class="gauge-arc-track"');
      expect(html).toContain('id="rock-meter-needle"');
      expect(html).toContain('id="rock-meter-pct-text"');

      // Linha de Fogo na Highway
      expect(html).toContain('id="highway-flame-line"');

      // Encerramento Especial "AQUI É ROCKBRAZIL!"
      expect(html).toContain('id="overlay-rockbrazil-celebration"');
      expect(html).toContain('AQUI É ROCKBRAZIL!');

      // Botão Atualizar Links
      expect(html).toContain('id="btn-refresh-youtube-links"');
    });

    it('src/style.css deve aplicar stage-v54.jpg e as regras do novo medidor industrial', () => {
      const cssPath = path.resolve(__dirname, '../src/style.css');
      const css = fs.readFileSync(cssPath, 'utf-8');

      expect(css).toMatch(/\/images\/stage-(bg\.png|v54\.jpg)/);
      expect(css).toContain('.yt-miniplayer-box');
      expect(css).toContain('.industrial-rock-meter');
      expect(css).toContain('.vacuum-tube-unit');
      expect(css).toContain('.meter-mechanical-needle');
      expect(css).toContain('.highway-flame-bar');
      expect(css).toContain('.celebration-title');
    });
  });
});
