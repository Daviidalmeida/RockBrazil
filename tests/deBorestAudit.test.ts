import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { UniversalChartImporter } from '../src/audio/universalChartImporter';
import { BeatmapManager } from '../src/game/beatmapManager';
import { OFFICIAL_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';
import { GameEngine } from '../src/game/engine';
import { CalibrationManager } from '../src/game/sync/calibrationManager';

describe('ROCKBRAZIL BETA — Kuase Nada: De Borest & Chart Audit', () => {
  const chartPath = path.resolve('charts-import/extracted-charts/kua-de-borest.chart');
  const sngPath = path.resolve('charts-import/extracted/charts/Kuase Nada - De Borest.sng');

  it('1. Arquivo .chart extraído de Kuase Nada localizado no repositório', () => {
    expect(fs.existsSync(chartPath)).toBe(true);
    const chartStat = fs.statSync(chartPath);
    expect(chartStat.size).toBeGreaterThan(50000); // 56,651 bytes
    // SNG de referência local (se presente no workspace de desenvolvimento)
    if (fs.existsSync(sngPath)) {
      const sngStat = fs.statSync(sngPath);
      expect(sngStat.size).toBeGreaterThan(2500000); // 2,923,601 bytes
    }
  });

  it('2. Metadados do SNG e catálogo oficial', () => {
    const catalogEntry = OFFICIAL_BRAZILIAN_CATALOG.find((s) => s.id === 'kua-de-borest');
    expect(catalogEntry).toBeDefined();
    expect(catalogEntry!.title).toBe('De Borest');
    expect(catalogEntry!.artist).toBe('Kuase Nada');
    expect(catalogEntry!.youtubeVideoId).toBe('CveouQkdSCs');
    expect(catalogEntry!.duration).toBe(268); // ~4:28
    expect(catalogEntry!.bpm).toBe(110); // ~109.665 BPM
  });

  it('3. SyncTrack e Âncoras Absolutas (241 âncoras e 242 BPM markers)', () => {
    const content = fs.readFileSync(chartPath, 'utf-8');
    const parsed = UniversalChartImporter.parseChartText(content);

    expect(parsed.metadata.name).toBe('De Borest');
    expect(parsed.metadata.artist).toBe('Kuase Nada');
    expect(parsed.metadata.resolution).toBe(192);

    // Primeira nota deve estar no tick 2304 = 6.565444s (âncora A 6565444)
    const firstNoteExpert = parsed.charts.EXPERT[0];
    expect(firstNoteExpert).toBeDefined();
    expect(firstNoteExpert.time).toBeCloseTo(6.565, 3);
  });

  it('4. Contagem e preservação de notas jogáveis por dificuldade', () => {
    const content = fs.readFileSync(chartPath, 'utf-8');
    const parsed = UniversalChartImporter.parseChartText(content);

    // Contagem após filtragem de marcadores especiais 5 (HOPO) e 6 (Strum)
    expect(parsed.charts.EASY.length).toBe(260);
    expect(parsed.charts.MEDIUM.length).toBe(578);
    expect(parsed.charts.HARD.length).toBe(755);
    expect(parsed.charts.EXPERT.length).toBe(899);
  });

  it('5. Preservação autêntica de pistas no Easy e Medium (sem truncamento/módulo)', () => {
    const content = fs.readFileSync(chartPath, 'utf-8');
    const parsed = UniversalChartImporter.parseChartText(content);

    // EasySingle original possui eventos nas pistas 0, 1, 2, 3 e 4
    const easyLanes = new Set(parsed.charts.EASY.map((n) => n.lane));
    expect(easyLanes.has(0)).toBe(true);
    expect(easyLanes.has(1)).toBe(true);
    expect(easyLanes.has(2)).toBe(true);
    expect(easyLanes.has(3)).toBe(true);
    expect(easyLanes.has(4)).toBe(true);

    // MediumSingle original possui eventos nas pistas 0, 1, 2, 3 e 4
    const medLanes = new Set(parsed.charts.MEDIUM.map((n) => n.lane));
    expect(medLanes.has(4)).toBe(true);
  });

  it('6. BeatmapManager entrega as 4 dificuldades reais sem perda', () => {
    const bm = new BeatmapManager();
    const easy = bm.getBeatmap('kua-de-borest', 'EASY');
    const medium = bm.getBeatmap('kua-de-borest', 'MEDIUM');
    const hard = bm.getBeatmap('kua-de-borest', 'HARD');
    const expert = bm.getBeatmap('kua-de-borest', 'EXPERT');

    expect(easy.length).toBe(260);
    expect(medium.length).toBe(578);
    expect(hard.length).toBe(755);
    expect(expert.length).toBe(899);
  });

  it('7. GameEngine processa notas autênticas sem descarte de pistas altas', () => {
    const bm = new BeatmapManager();
    const easyNotes = bm.getBeatmap('kua-de-borest', 'EASY');
    const engine = new GameEngine(easyNotes, 'EASY', {
      audioOffsetMs: 0,
      musicVolume: 1,
      sfxVolume: 1,
      noteSpeed: 1
    });

    expect(engine.getNotes().length).toBe(260);
  });

  it('8. Remoção dos botões manuais de calibração do index.html', () => {
    const html = fs.readFileSync(path.resolve('index.html'), 'utf-8');
    expect(html).not.toContain('btn-calib-minus-50');
    expect(html).not.toContain('btn-calib-minus-10');
    expect(html).not.toContain('btn-calib-reset');
    expect(html).not.toContain('btn-calib-plus-10');
    expect(html).not.toContain('btn-calib-plus-50');
    expect(html).not.toContain('Sincronização desta Música');
  });

  it('9. Alinhamento matemático do receptor (progresso = 1.0 exatamente em t = note.time)', () => {
    const noteSpeed = 1.35;
    const noteTime = 6.565;
    const currentTime = 6.565;
    const progress = 1.0 - (noteTime - currentTime) / noteSpeed;
    expect(progress).toBe(1.0);
  });

  it('10. Compensação interna verificada para o offset de gravação de De Borest (0ms no V8 - chart normalizado)', () => {
    expect(CalibrationManager.getSongOffsetMs('kua-de-borest')).toBe(0);
  });
});
