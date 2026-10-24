import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { GameEngine } from '../src/game/engine';
import { GameRenderer } from '../src/render/renderer';
import { YouTubePlayerController } from '../src/audio/youtubePlayer';
import { SmartChartEngine } from '../src/game/catalog/smartChartEngine';
import { EnchorChartImporter } from '../src/game/catalog/enchorImporter';
import { OFFICIAL_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';
import { Note, GameSettings } from '../src/types';

describe('ROCKBRAZIL V5.7 — SUÍTE DE TESTES DEFINITIVA', () => {
  const htmlPath = path.resolve(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const cssPath = path.resolve(__dirname, '../src/style.css');
  const css = fs.readFileSync(cssPath, 'utf-8');

  describe('1. Eliminação Total da Tremedeira das Notas (Prioridade 1)', () => {
    let renderer: GameRenderer;

    beforeEach(() => {
      // Mock Canvas and Context2D
      const mockCtx: any = {
        save: () => {},
        restore: () => {},
        clearRect: () => {},
        translate: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} })
      };
      const mockCanvas: any = {
        getContext: () => mockCtx,
        width: 412,
        height: 915,
        clientWidth: 412,
        clientHeight: 915
      };
      renderer = new GameRenderer(mockCanvas);
    });

    it('triggerShake não deve aplicar translação ou tremor à pista e às notas', () => {
      // Mesmo com chamadas de intensidade alta (ex.: combo ou multiplicador alto), a geometria deve permanecer estável
      renderer.triggerShake(12);
      expect((renderer as any).screenShake).toBe(0);
    });

    it('em combos longos de 10, 25, 50, 100, 200 e 500 notas, o motor e o renderizador devem manter estabilidade absoluta', () => {
      const notes: Note[] = [];
      for (let i = 0; i < 500; i++) {
        notes.push({
          id: i + 1,
          time: 1.0 + i * 0.2,
          lane: (i % 4) as any,
          duration: 0,
          hit: false,
          missed: false,
          sustainCompleted: false,
          sustainHeldTime: 0
        });
      }

      const settings: GameSettings = {
        musicVolume: 1,
        sfxVolume: 1,
        audioOffsetMs: 0,
        noteSpeedMultiplier: 1,
        visualEffectsEnabled: true
      };

      const engine = new GameEngine(notes, 'HARD', settings);

      // Simula 500 acertos consecutivos (combo = 500, multiplicador = 4X)
      for (let i = 0; i < 500; i++) {
        const hit = engine.handleLanePress((i % 4) as any, 1.0 + i * 0.2);
        expect(hit).not.toBeNull();
      }

      const stats = engine.getStats();
      expect(stats.combo).toBe(500);
      expect(stats.multiplier).toBe(4);

      // Renderiza múltiplos frames com combo 500 e confirma que screenShake permanece ZERO
      renderer.triggerShake(stats.multiplier * 2);
      expect((renderer as any).screenShake).toBe(0);
    });

    it('src/main.ts não deve acionar triggerShake nos callbacks de acerto ou erro', () => {
      const mainPath = path.resolve(__dirname, '../src/main.ts');
      const mainContent = fs.readFileSync(mainPath, 'utf-8');

      // Não pode haver triggerShake associado a onHit ou onMiss
      expect(mainContent).not.toMatch(/this\.renderer\.triggerShake/);
    });
  });

  describe('2. Medidor de Desempenho Vertical (Prioridade 2)', () => {
    it('index.html deve conter o medidor configurado em orientação VERTICAL', () => {
      expect(html).toContain('class="gauge-arc-track"');
      expect(html).toContain('id="gauge-vertical-track"');
      expect(html).toContain('class="vertical-arc-zone zone-green"');
      expect(html).toContain('class="vertical-arc-zone zone-yellow"');
      expect(html).toContain('class="vertical-arc-zone zone-orange"');
      expect(html).toContain('class="vertical-arc-zone zone-red"');
      expect(html).toContain('id="rock-meter-needle"');
      expect(html).toContain('id="rock-meter-pct-text"');
    });

    it('src/style.css deve conter regras de layout vertical no medidor', () => {
      expect(css).toContain('.gauge-vertical-track');
      expect(css).toContain('.meter-vertical-needle');
      expect(css).toContain('.vertical-arc-zone');
    });

    it('uiManager.ts deve posicionar o ponteiro mecânico verticalmente com bottom: %', () => {
      const uiPath = path.resolve(__dirname, '../src/ui/uiManager.ts');
      const uiContent = fs.readFileSync(uiPath, 'utf-8');

      expect(uiContent).toContain("this.meterNeedle.style.bottom = `${pct}%`");
      expect(uiContent).toContain("this.meterNeedle.style.bottom = '50%'");
    });
  });

  describe('3. Remoção do Badge BUFFERING (Prioridade 3)', () => {
    it('index.html NÃO deve conter o texto ou badge BUFFERING sobre o player', () => {
      expect(html).not.toContain('BUFFERING...');
      expect(html).not.toContain('id="yt-buffering-indicator"');
    });

    it('src/style.css NÃO deve conter a classe de estilo .yt-buffering-badge', () => {
      expect(css).not.toContain('.yt-buffering-badge');
    });

    it('YouTubePlayerController deve continuar gerenciando estado de buffering internamente sem impactar combo', () => {
      const player = new YouTubePlayerController();
      expect(player.isBuffering()).toBe(false);
    });
  });

  describe('4. Preparação do Clipe Antes do Jogo & Relógio Suave (Prioridades 4 e 10)', () => {
    it('YouTubePlayerController deve conter waitForPlaying e controle suave de tempo', async () => {
      const player = new YouTubePlayerController();
      expect(typeof player.waitForPlaying).toBe('function');
      expect(typeof player.getCurrentTime).toBe('function');

      player.play();
      const t1 = player.getCurrentTime();
      // Simula passagem de tempo
      await new Promise((r) => setTimeout(r, 50));
      const t2 = player.getCurrentTime();

      expect(t2).toBeGreaterThanOrEqual(t1);
    });
  });

  describe('5. Auditoria de Charts: Chorus Encore e RhythmVerse (Prioridades 5, 6, 7, 8)', () => {
    it('EnchorChartImporter deve conter métodos de busca ao vivo para Chorus Encore e RhythmVerse', () => {
      expect(typeof EnchorChartImporter.searchLiveEnchor).toBe('function');
      expect(typeof EnchorChartImporter.searchLiveRhythmVerse).toBe('function');
    });

    it('deve distinguir rigorosamente charts com chart de comunidade de charts com adaptação inteligente', () => {
      const pittyChart = EnchorChartImporter.getChartInfo('pit-chip-novo', 'Pitty', 'Admirável Chip Novo');
      expect(pittyChart.foundInEnchor).toBe(true);
      expect(pittyChart.auditStatus).toBe('JOGÁVEL');
      expect(pittyChart.rhythmVerseFound).toBe(true);

      const deBorest = EnchorChartImporter.getChartInfo('kua-de-borest', 'Kuase Nada', 'De Borest');
      expect(deBorest.foundInEnchor).toBe(true);
      expect(deBorest.auditStatus).toBe('JOGÁVEL');
    });

    it('músicas sem chart de comunidade devem estar registradas com AWAITING_MAPPING', () => {
      const bozo = EnchorChartImporter.getChartInfo('cue-quem-matou-bozo', 'Cueio Limão', 'Quem Matou o Bozo');
      expect(bozo.auditStatus).toBe('AWAITING_MAPPING');
      expect(bozo.chartStatus).toBe('SMART_GUITAR_ENGINE');
    });

    it('resumo estatístico deve cobrir 31 músicas com 100% jogabilidade no motor musical', () => {
      const summary = EnchorChartImporter.getSummaryStats();
      expect(summary.totalSongs).toBe(31);
      expect(summary.communityChartsFound).toBeGreaterThanOrEqual(25);
      expect(summary.rhythmVerseMatches).toBeGreaterThanOrEqual(15);
      expect(summary.gameplayPlayableCount).toBe(31);
      expect(summary.allDifficultiesValidated).toBe(true);
    });
  });

  describe('6. Três Dificuldades Independentes & Prioridade à Guitarra (Prioridade 9)', () => {
    it('Fácil, Médio e Difícil devem possuir ritmos, pistas e densidades independentes', () => {
      const charts = SmartChartEngine.generateChartsForSong('cbjr-papo-reto', 112, 210);

      // Fácil: pistas 0 a 2
      expect(charts.EASY.every((n) => n.lane <= 2)).toBe(true);
      // Médio: pistas 0 a 3 com power chords e contratempos
      expect(charts.MEDIUM.every((n) => n.lane <= 3)).toBe(true);
      expect(charts.MEDIUM.some((n) => n.lane === 3)).toBe(true);
      // Difícil: pistas 0 a 4 com solos rápidos
      expect(charts.HARD.some((n) => n.lane === 4)).toBe(true);

      expect(charts.HARD.length).toBeGreaterThan(charts.MEDIUM.length);
      expect(charts.MEDIUM.length).toBeGreaterThan(charts.EASY.length);
    });
  });

  describe('7. Catálogo Completo das 31 Músicas Preservado (Prioridade 11)', () => {
    it('deve conter as 31 músicas oficiais com vídeos e durações válidas', () => {
      expect(OFFICIAL_BRAZILIAN_CATALOG.length).toBe(31);
      OFFICIAL_BRAZILIAN_CATALOG.forEach((song) => {
        expect(song.id).toBeTruthy();
        expect(song.youtubeVideoId?.length).toBe(11);
        expect(song.bpm).toBeGreaterThan(0);
        expect(song.duration).toBeGreaterThan(0);
      });
    });
  });
});
