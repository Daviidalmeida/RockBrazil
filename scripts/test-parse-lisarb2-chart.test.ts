import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { UniversalChartImporter } from '../src/audio/universalChartImporter';

describe('Test parse Lisarb2 notes.chart', () => {
  it('parses a sample chart from Lisarb2 using UniversalChartImporter', () => {
    const sampleChartPath = path.resolve(
      process.cwd(),
      'charts-import/lisarb2-unpacked/03.1 Raul Seixas - Metamorfose Ambulante/03.1 Raul Seixas - Metamorfose Ambulante/notes.chart'
    );

    let finalPath = sampleChartPath;
    if (!fs.existsSync(sampleChartPath)) {
      // Find where it is
      const baseDir = path.resolve(process.cwd(), 'charts-import/lisarb2-unpacked/03.1 Raul Seixas - Metamorfose Ambulante');
      const files = fs.readdirSync(baseDir);
      for (const f of files) {
        const p = path.join(baseDir, f, 'notes.chart');
        if (fs.existsSync(p)) {
          finalPath = p;
          break;
        }
      }
    }

    expect(fs.existsSync(finalPath)).toBe(true);
    const chartContent = fs.readFileSync(finalPath, 'utf-8');
    const parsed = UniversalChartImporter.parseChartText(chartContent);

    console.log('Metamorfose Ambulante parsed metadata:', parsed.metadata);
    console.log('Difficulties:', {
      EASY: parsed.charts.EASY.length,
      MEDIUM: parsed.charts.MEDIUM.length,
      HARD: parsed.charts.HARD.length,
      EXPERT: parsed.charts.EXPERT.length
    });
    console.log('First note EASY:', parsed.charts.EASY[0]?.time);
    console.log('First note EXPERT:', parsed.charts.EXPERT[0]?.time);

    expect(parsed.charts.EXPERT.length).toBeGreaterThan(0);
  });
});
