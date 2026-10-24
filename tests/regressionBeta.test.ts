import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { UniversalChartImporter } from '../src/audio/universalChartImporter';
import { BeatmapManager } from '../src/game/beatmapManager';
import { EnchorChartImporter } from '../src/game/catalog/enchorImporter';
import { OFFICIAL_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';
import { createSyntheticMidiBuffer } from './fixtures/midiFixture';
import { GameRenderer } from '../src/render/renderer';
import { Difficulty, Note } from '../src/types';

describe('ROCKBRAZIL BETA — SUÍTE DE TESTES MASTER DEFINITIVA', () => {

  // 1. Rebranding & Identidade Comercial
  describe('1. Rebranding Comercial RockBrazil Beta (Prioridade 1)', () => {
    it('index.html deve conter o título oficial "RockBrazil Beta - Rhythm Guitar"', () => {
      const htmlPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');
      expect(html).toContain('<title>RockBrazil Beta - Rhythm Guitar</title>');
    });

    it('index.html deve conter metadados atualizados com RockBrazil Beta', () => {
      const htmlPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');
      expect(html).toContain('content="RockBrazil Beta"');
      expect(html).toContain('content="RockBrazil Beta - Rhythm Guitar"');
    });

    it('título não deve mais referenciar versões antigas V5.7 ou V5.8', () => {
      const htmlPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');
      expect(html).not.toContain('<title>RockBrazil V5.7');
      expect(html).not.toContain('<title>RockBrazil V5.8');
    });

    it('telas de configurações e tutorial devem identificar RockBrazil Beta', () => {
      const htmlPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');
      expect(html).toContain('ROCKBRAZIL BETA');
    });
  });

  // 2. Importador Universal: Formato .chart
  describe('2. Importação e Parsing Real de .chart (Clone Hero)', () => {
    const SAMPLE_CHART = `
[Song]
{
  Name = "Teste Master Rock"
  Artist = "Guitarrista BR"
  Charter = "Comunidade"
  Offset = 0
  Resolution = 192
  Difficulty = 0
}
[SyncTrack]
{
  0 = TS 4
  0 = B 120000
  384 = B 140000
}
[ExpertSingle]
{
  0 = N 0 0
  96 = N 1 0
  192 = N 2 96
  384 = N 0 0
  384 = N 2 0
  576 = N 3 192
  768 = N 4 0
}
[HardSingle]
{
  0 = N 0 0
  192 = N 2 96
  384 = N 0 0
  384 = N 2 0
  768 = N 3 0
}
`;

    it('deve extrair metadados, resolução e mapa de tempo corretamente', () => {
      const result = UniversalChartImporter.parseChartText(SAMPLE_CHART);
      expect(result.metadata.name).toBe('Teste Master Rock');
      expect(result.metadata.artist).toBe('Guitarrista BR');
      expect(result.metadata.resolution).toBe(192);
      expect(result.metadata.sourceFormat).toBe('.chart');
      expect(result.metadata.instrumentTrack).toBe('guitar');
    });

    it('deve converter ticks em timestamps precisos respeitando mudanças de BPM', () => {
      const result = UniversalChartImporter.parseChartText(SAMPLE_CHART);
      const notes = result.charts.EXPERT;

      // Tick 0 @ 120 BPM: 0.0s
      expect(notes[0].time).toBe(0);

      // Tick 192 @ 120 BPM: exactly 1 beat = 0.5s
      const noteAt192 = notes.find((n) => n.lane === 2 && n.time > 0);
      expect(noteAt192).toBeDefined();
      expect(noteAt192!.time).toBeCloseTo(0.5, 2);

      // Sustain at tick 192 of 96 ticks (0.5 beat @ 120 BPM = 0.25s)
      expect(noteAt192!.duration).toBeCloseTo(0.25, 2);
    });

    it('deve identificar e agrupar acordes perfeitamente (notas simultâneas)', () => {
      const result = UniversalChartImporter.parseChartText(SAMPLE_CHART);
      const notes = result.charts.EXPERT;

      // Tick 384 has 2 notes (lanes 0 and 2)
      const chordNotes = notes.filter((n) => Math.abs(n.time - 1.0) < 0.05);
      expect(chordNotes.length).toBe(2);
      expect(chordNotes.some((n) => n.lane === 0)).toBe(true);
      expect(chordNotes.some((n) => n.lane === 2)).toBe(true);
      expect(chordNotes[0].type).toBe('chord');
    });

    it('deve gerar todas as 4 dificuldades (EASY, MEDIUM, HARD, EXPERT) com pistas válidas', () => {
      const result = UniversalChartImporter.parseChartText(SAMPLE_CHART);
      expect(result.charts.EXPERT.length).toBeGreaterThan(0);
      expect(result.charts.HARD.length).toBeGreaterThan(0);
      expect(result.charts.MEDIUM.length).toBeGreaterThan(0);
      expect(result.charts.EASY.length).toBeGreaterThan(0);

      // EASY: pistas 0 a 2
      result.charts.EASY.forEach((n) => {
        expect([0, 1, 2]).toContain(n.lane);
      });

      // MEDIUM: pistas 0 a 3
      result.charts.MEDIUM.forEach((n) => {
        expect([0, 1, 2, 3]).toContain(n.lane);
      });

      // HARD e EXPERT: pistas 0 a 4
      result.charts.HARD.forEach((n) => {
        expect([0, 1, 2, 3, 4]).toContain(n.lane);
      });
      result.charts.EXPERT.forEach((n) => {
        expect([0, 1, 2, 3, 4]).toContain(n.lane);
      });
    });
  });

  // 3. Hierarquia de Instrumentos (Guitar -> Lead -> Rhythm -> Bass -> Keys)
  describe('3. Escolha Flexível de Instrumentos com Prioridade', () => {
    it('deve priorizar Bass caso Guitarra não esteja presente no chart', () => {
      const BASS_CHART = `
[Song]
{
  Name = "Linha de Baixo Pesada"
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[ExpertDoubleBass]
{
  0 = N 0 0
  192 = N 1 0
  384 = N 2 0
  576 = N 3 0
}
`;
      const result = UniversalChartImporter.parseChartText(BASS_CHART);
      expect(result.metadata.instrumentTrack).toBe('bass');
      expect(result.charts.EXPERT.length).toBe(4);
    });

    it('deve priorizar Keys quando apenas teclado estiver presente', () => {
      const KEYS_CHART = `
[Song]
{
  Name = "Teclados Virtuosos"
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[ExpertKeys]
{
  0 = N 0 0
  192 = N 1 96
  384 = N 2 0
}
`;
      const result = UniversalChartImporter.parseChartText(KEYS_CHART);
      expect(result.metadata.instrumentTrack).toBe('keys');
      expect(result.charts.EXPERT.length).toBe(3);
    });
  });

  // 4. Importação de MIDI Real
  describe('4. Importação de MIDI (Standard MIDI File 0 e 1)', () => {
    it('deve processar buffer MIDI sintético e mapear notas para todas as dificuldades', () => {
      const midiBuffer = createSyntheticMidiBuffer({
        easyCount: 8,
        mediumCount: 16,
        hardCount: 24,
        expertCount: 32,
        bpm: 128,
        division: 480
      });

      const result = UniversalChartImporter.parseMidiFile(midiBuffer);
      expect(result.metadata.sourceFormat).toBe('.mid');
      expect(result.charts.EXPERT.length).toBe(32);
      expect(result.charts.HARD.length).toBe(24);
      expect(result.charts.MEDIUM.length).toBe(16);
      expect(result.charts.EASY.length).toBe(8);
      expect(result.validation.valid).toBe(true);
    });
  });

  // 5. Extração e Importação de Pacote ZIP
  describe('5. Extração e Validação de Pacotes ZIP', () => {
    it('deve extrair e analisar pacote ZIP contendo notes.chart em memória', async () => {
      const zip = new JSZip();
      const chartContent = `
[Song]
{
  Name = "Zip Song Test"
  Artist = "Zip Rockers"
  Resolution = 192
}
[SyncTrack]
{
  0 = B 130000
}
[ExpertSingle]
{
  0 = N 0 0
  192 = N 1 0
  384 = N 2 96
}
`;
      zip.file('notes.chart', chartContent);
      zip.file('song.ini', '[song]\nname = Zip Song Test\nartist = Zip Rockers\n');

      const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
      const result = await UniversalChartImporter.parseZipPackage(zipBuffer);

      expect(result.metadata.name).toBe('Zip Song Test');
      expect(result.metadata.artist).toBe('Zip Rockers');
      expect(result.metadata.sourceFormat).toBe('.zip');
      expect(result.charts.EXPERT.length).toBe(3);
      expect(result.validation.valid).toBe(true);
    });
  });

  // 6. Suporte a Contêiner SNG
  describe('6. Suporte a Contêiner SNG', () => {
    it('deve reconhecer dados no contêiner SNG com cabeçalho de chart', async () => {
      const sngText = `
[Song]
{
  Name = "SNG Container Rock"
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[ExpertSingle]
{
  0 = N 0 0
  192 = N 1 0
}
`;
      const uint8 = new TextEncoder().encode(sngText);
      const result = await UniversalChartImporter.parseSngContainer(uint8);

      expect(result.metadata.name).toBe('SNG Container Rock');
      expect(result.metadata.sourceFormat).toBe('.sng');
      expect(result.charts.EXPERT.length).toBe(2);
    });
  });

  // 7. Integração Real com BeatmapManager e Gameplay
  // 7. Integração Real com BeatmapManager e Gameplay
  describe('7. Integração Real com BeatmapManager & Fallback Inteligente', () => {
    it('músicas pré-convertidas devem ser carregadas diretamente do UniversalChartImporter', () => {
      const bm = new BeatmapManager();

      // "À Sua Maneira" (cap-sua-maneira) tem chart real do pacote RAR
      const notesExpert = bm.getBeatmap('cap-sua-maneira', 'EXPERT');
      expect(notesExpert.length).toBeGreaterThan(10);
      expect(notesExpert[0].time).toBeGreaterThanOrEqual(0);

      const notesEasy = bm.getBeatmap('cap-sua-maneira', 'EASY');
      expect(notesEasy.length).toBeGreaterThan(0);
      notesEasy.forEach((n) => expect([0, 1, 2]).toContain(n.lane));
    });

    it('as 12 músicas excluídas pelo usuário não devem existir no catálogo oficial', () => {
      const removedIds = [
        'mam-bois-dont-cry',
        'mam-cabeca-bagre',
        'pit-deja-vu',
        'cbjr-longe-de-voce',
        'mam-la-vem-alemao',
        'gab-ate-quando',
        'vel-dizia-raul',
        'mam-arlinda-mulher',
        'mam-vira-vira',
        'mam-sabado-de-sol',
        'pit-na-sua-estante',
        'str-paraiso-proibido'
      ];
      removedIds.forEach((id) => {
        expect(OFFICIAL_BRAZILIAN_CATALOG.some((s) => s.id === id)).toBe(false);
      });
    });

    it('exatamente 29 músicas devem possuir REAL_CHART e 2 devem usar SMART_CHART_FALLBACK', () => {
      let realChartCount = 0;
      let fallbackCount = 0;

      OFFICIAL_BRAZILIAN_CATALOG.forEach((song) => {
        if (UniversalChartImporter.hasConvertedChart(song.id)) {
          realChartCount++;
        } else {
          fallbackCount++;
        }
      });

      expect(realChartCount).toBe(29);
      expect(fallbackCount).toBe(2);
      expect(UniversalChartImporter.hasConvertedChart('cue-quem-matou-bozo')).toBe(false);
      expect(UniversalChartImporter.hasConvertedChart('cue-minha-juventude')).toBe(false);
    });

    it('todas as 31 músicas do catálogo oficial devem ser 100% jogáveis nas 4 dificuldades', () => {
      const bm = new BeatmapManager();
      const diffs: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];

      expect(OFFICIAL_BRAZILIAN_CATALOG.length).toBe(31);

      OFFICIAL_BRAZILIAN_CATALOG.forEach((song) => {
        diffs.forEach((diff) => {
          const notes = bm.getBeatmap(song.id, diff);
          expect(notes.length, `Música sem notas: ${song.title} (${diff})`).toBeGreaterThan(5);

          // Verifica ordenação cronológica
          for (let i = 1; i < notes.length; i++) {
            expect(notes[i].time).toBeGreaterThanOrEqual(notes[i - 1].time);
          }
        });
      });
    });
  });

  // 8. Relatório Canônico de Auditoria (8 Categorias)
  describe('8. Relatório Canônico de 8 Status de Auditoria', () => {
    it('deve fornecer o relatório de auditoria cobrindo as 8 categorias oficiais do RockBrazil Beta', () => {
      const report = EnchorChartImporter.getBetaAuditReport();
      expect(report.totalSongs).toBe(31);

      // Categorias requeridas
      expect(report.categories.JOGÁVEL).toBe(31);
      expect(report.categories.CONVERTIDO).toBe(29);
      expect(report.categories.PENDENTE).toBe(2);
      expect(report.categories.VALIDADO).toBe(31);

      // Validação das entradas individuais
      expect(report.details.length).toBe(31);
      report.details.forEach((item) => {
        expect(item.songId).toBeTruthy();
        expect(item.title).toBeTruthy();
        expect(item.status).toBeTruthy();
      });
    });
  });

  // 9. Estabilidade da Esteira & Medidor Vertical
  describe('9. Estabilidade da Esteira e Conformidade Visual', () => {
    it('GameRenderer não deve aplicar tremedeira na esteira nem com combos astronômicos', () => {
      const mockCanvas = {
        getContext: () => ({
          save: () => {},
          restore: () => {},
          clearRect: () => {},
          fillRect: () => {},
          stroke: () => {},
          beginPath: () => {},
          arc: () => {},
          fill: () => {}
        }),
        width: 1080,
        height: 1920
      } as unknown as HTMLCanvasElement;

      const renderer = new GameRenderer(mockCanvas);
      expect(renderer.screenShakeMagnitude).toBe(0);

      renderer.triggerShake(50);
      expect(renderer.screenShakeMagnitude).toBe(0);
    });

    it('index.html deve conter o medidor vertical industrial exclusivo', () => {
      const htmlPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');
      expect(html).toContain('industrial-rock-meter');
      expect(html).toContain('gauge-arc-track');
      expect(html).toContain('meter-vertical-needle');
      expect(html).toContain('meter-percentage-text');
    });

    it('index.html deve aceitar novos formatos de chart no input de importação', () => {
      const htmlPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');
      expect(html).toContain('accept=".zip,.chart,.mid,.midi,.sng,application/zip"');
    });
  });

});
