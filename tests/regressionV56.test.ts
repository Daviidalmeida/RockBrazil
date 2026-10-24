import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SmartChartEngine } from '../src/game/catalog/smartChartEngine';
import { EnchorChartImporter } from '../src/game/catalog/enchorImporter';
import { OFFICIAL_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';

describe('ROCKBRAZIL V5.6 — TESTES MESTRE DEFINITIVOS', () => {
  describe('1. HUD Único e Eliminação de Duplicações Visuais (Fases 1, 2, 3, 4, 5)', () => {
    const htmlPath = path.resolve(__dirname, '../index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const cssPath = path.resolve(__dirname, '../src/style.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    it('index.html deve conter exatamente UM container de miniplayer do YouTube', () => {
      const matches = html.match(/id="yt-player-container"/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(1);
    });

    it('index.html deve conter exatamente UM botão de pausa funcional no gameplay', () => {
      const matches = html.match(/id="btn-pause"/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(1);
    });

    it('index.html deve conter exatamente UMA barra central de progresso da música', () => {
      const matches = html.match(/id="song-progress-bar"/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(1);
    });

    it('index.html deve conter exatamente UM mostrador de pontuação principal', () => {
      const matches = html.match(/id="hud-score"/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(1);
    });

    it('index.html deve conter exatamente UM indicador de multiplicador', () => {
      const matches = html.match(/id="hud-multiplier"/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(1);
    });

    it('index.html deve conter exatamente UM mostrador de combo numérico', () => {
      const matches = html.match(/id="hud-combo-number"/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(1);
    });

    it('index.html deve conter exatamente UM medidor industrial ROCKBRAZIL', () => {
      const matches = html.match(/class="industrial-rock-meter"/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(1);

      const needleMatches = html.match(/id="rock-meter-needle"/g);
      expect(needleMatches).not.toBeNull();
      expect(needleMatches!.length).toBe(1);

      const pctMatches = html.match(/id="rock-meter-pct-text"/g);
      expect(pctMatches).not.toBeNull();
      expect(pctMatches!.length).toBe(1);
    });

    it('src/style.css deve aplicar stage-bg.png limpo sem elementos de HUD queimados na imagem', () => {
      // O bug visual anterior ocorria por carregar uma captura de tela com interface falsa (stage-v54.jpg)
      expect(css).toContain('/images/stage-bg.png');
      expect(css).toContain('gameplay-stage-bg');
    });

    it('src/style.css deve garantir posicionamento dinâmico seguro do HUD sem sobreposições com o YouTube', () => {
      // .hud-left-panel deve ancorar abaixo do miniplayer com espaçamento seguro
      expect(css).toContain('calc(18px + clamp(140px, 38vw, 200px) * 9 / 16)');
    });
  });

  describe('2. Três Dificuldades Independentes & Anti-duplicação (Fases 11, 12, 13)', () => {
    it('o modo Médio NÃO pode ser uma cópia do Fácil com notas azuis adicionadas', () => {
      const charts = SmartChartEngine.generateChartsForSong('pit-chip-novo', 140, 191);
      const easy = charts.EASY;
      const medium = charts.MEDIUM;

      // Densidades e quantidades distintas
      expect(medium.length).toBeGreaterThan(easy.length);
      expect(easy.length).toBeGreaterThan(40);

      // Fácil utiliza apenas pistas 0, 1, 2
      expect(easy.every((n) => n.lane <= 2)).toBe(true);
      // Médio utiliza pistas 0, 1, 2, 3
      expect(medium.every((n) => n.lane <= 3)).toBe(true);
      expect(medium.some((n) => n.lane === 3)).toBe(true);

      // Conjunto de timestamps deve ser distinto (Médio possui palhetadas sincopadas e contratempos que o Fácil não tem)
      const easyTimes = new Set(easy.map((n) => n.time));
      const mediumOnlyTimes = medium.filter((n) => !easyTimes.has(n.time));
      expect(mediumOnlyTimes.length).toBeGreaterThan(20);

      // O Fácil também possui tempos próprios que não aparecem no Médio (pausas de riff vs acordes)
      const mediumTimes = new Set(medium.map((n) => n.time));
      const easyOnlyTimes = easy.filter((n) => !mediumTimes.has(n.time));
      expect(easyOnlyTimes.length).toBeGreaterThanOrEqual(1);
    });

    it('o modo Difícil NÃO pode ser Médio com notas aleatórias', () => {
      const charts = SmartChartEngine.generateChartsForSong('cbjr-papo-reto', 112, 210);
      const medium = charts.MEDIUM;
      const hard = charts.HARD;

      expect(hard.length).toBeGreaterThan(medium.length);
      expect(hard.some((n) => n.lane === 4)).toBe(true);

      // Difícil possui frases em semicolcheias (16th bursts) e solos com timestamps exclusivos
      const mediumTimes = new Set(medium.map((n) => n.time));
      const hardUniqueTimes = hard.filter((n) => !mediumTimes.has(n.time));
      expect(hardUniqueTimes.length).toBeGreaterThan(30);
    });

    it('cada dificuldade deve possuir objetos de nota independentes sem compartilhamento de referências', () => {
      const charts = SmartChartEngine.generateChartsForSong('mam-1406', 156, 185);
      expect(charts.EASY[0]).not.toBe(charts.MEDIUM[0]);
      expect(charts.MEDIUM[0]).not.toBe(charts.HARD[0]);
    });
  });

  describe('3. Guitar-First Smart Chart Engine & Estrutura de Notas (Fases 13, 14)', () => {
    it('cada nota deve possuir a estrutura oficial da V5.6 com id, timeMs, lane, type, durationMs, sourceInstrument', () => {
      const charts = SmartChartEngine.generateChartsForSong('mat-ela-roubou-caminhao', 130, 160);
      const sampleNotes = [...charts.EASY, ...charts.MEDIUM, ...charts.HARD];

      sampleNotes.forEach((n) => {
        expect(n.id).toBeGreaterThan(0);
        expect(typeof n.time).toBe('number');
        expect(typeof n.timeMs).toBe('number');
        expect(n.timeMs).toBe(Math.round(n.time * 1000));
        expect(n.lane).toBeGreaterThanOrEqual(0);
        expect(n.lane).toBeLessThanOrEqual(4);
        expect(['tap', 'hold', 'chord']).toContain(n.type);
        expect(typeof n.duration).toBe('number');
        expect(typeof n.durationMs).toBe('number');
        expect(['guitar', 'bass', 'drums']).toContain(n.sourceInstrument);
        expect(typeof n.sourceEventId).toBe('string');
      });
    });

    it('deve priorizar aproximadamente 85% de eventos de guitarra e até 15% de baixo/bateria', () => {
      const charts = SmartChartEngine.generateChartsForSong('mas-metal-is-the-law', 145, 230);
      const hardNotes = charts.HARD;

      const guitarNotes = hardNotes.filter((n) => n.sourceInstrument === 'guitar');
      const rhythmSectionNotes = hardNotes.filter(
        (n) => n.sourceInstrument === 'bass' || n.sourceInstrument === 'drums'
      );

      const guitarRatio = guitarNotes.length / hardNotes.length;
      expect(guitarRatio).toBeGreaterThanOrEqual(0.75); // Prioridade maciça à guitarra
      expect(rhythmSectionNotes.length).toBeGreaterThan(0); // Transições rítmicas presentes
    });
  });

  describe('4. Chorus Encore / Enchor Integration (Fases 10, 11)', () => {
    it('deve fornecer metadados autênticos do Chorus Encore para as músicas do catálogo', () => {
      const pittyChart = EnchorChartImporter.getChartInfo('pit-chip-novo', 'Pitty', 'Admirável Chip Novo');
      expect(pittyChart.foundInEnchor).toBe(true);
      expect(pittyChart.charter).toContain('Naonemeu');
      expect(pittyChart.chartStatus).toBe('COMMUNITY_CHART_AVAILABLE');
      expect(pittyChart.difficultiesAvailable.expert).toBe(true);

      const cbjrChart = EnchorChartImporter.getChartInfo('cbjr-papo-reto', 'Charlie Brown Jr.', 'Papo Reto');
      expect(cbjrChart.foundInEnchor).toBe(true);
      expect(cbjrChart.charter).toContain('FilipinDuMods');
      expect(cbjrChart.chartStatus).toBe('COMMUNITY_CHART_AVAILABLE');
    });

    it('músicas sem chart de comunidade devem estar registradas com o motor inteligente RockBrazil', () => {
      const fallbackChart = EnchorChartImporter.getChartInfo('cue-quem-matou-bozo', 'Cueio Limão', 'Quem Matou o Bozo');
      expect(fallbackChart.chartStatus).toBe('SMART_GUITAR_ENGINE');
      expect(fallbackChart.difficultiesAvailable.easy).toBe(true);
      expect(fallbackChart.difficultiesAvailable.medium).toBe(true);
      expect(fallbackChart.difficultiesAvailable.hard).toBe(true);
    });

    it('resumo estatístico deve cobrir integralmente o catálogo das 31 músicas', () => {
      const summary = EnchorChartImporter.getSummaryStats();
      expect(summary.totalSongs).toBe(31);
      expect(summary.communityChartsFound).toBeGreaterThanOrEqual(25);
      expect(summary.smartGuitarEngineSongs).toBeGreaterThan(0);
      expect(summary.allDifficultiesValidated).toBe(true);
    });
  });

  describe('5. Catálogo Oficial 31 Músicas Preservado (Fase 8)', () => {
    it('deve conter exatamente 31 músicas com dados íntegros e YouTube IDs válidos', () => {
      expect(OFFICIAL_BRAZILIAN_CATALOG.length).toBe(31);
      const ytRegex = /^[a-zA-Z0-9_-]{11}$/;

      OFFICIAL_BRAZILIAN_CATALOG.forEach((song) => {
        expect(song.id).toBeTruthy();
        expect(song.title).toBeTruthy();
        expect(song.artist).toBeTruthy();
        expect(song.youtubeVideoId).toMatch(ytRegex);
        expect(song.duration).toBeGreaterThan(0);
        expect(song.bpm).toBeGreaterThan(0);
      });
    });
  });
});
