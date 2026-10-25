import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Generate Lisarb2 Charts Registry', () => {
  it('builds lisarb2ChartsRegistry.ts from public/charts', () => {
    const rootDir = process.cwd();
    const publicChartsDir = path.resolve(rootDir, 'public/charts');
    const chartFiles = fs.readdirSync(publicChartsDir).filter(f => f.endsWith('.json'));

    expect(chartFiles.length).toBe(137);

    const rawCharts: Record<string, any> = {};
    for (const file of chartFiles) {
      const songId = file.replace('.json', '');
      const content = JSON.parse(fs.readFileSync(path.join(publicChartsDir, file), 'utf-8'));
      rawCharts[songId] = content;
    }

    const header = `import { Note, Lane, Difficulty, BeatmapByDifficulty } from '../../types';

type CompactNote = [number, Lane, number, number?];
type CompactCharts = Record<Difficulty, CompactNote[]>;

/**
 * ROCKBRAZIL — LISARB2 CHARTS REGISTRY
 * Lazy-unpacked charts for all 137 Lisarb2 songs with authentic timings.
 */
export const RAW_LISARB2_CHARTS: Record<string, CompactCharts> = `;

    const footer = `;

function unpackNotes(compact: CompactNote[]): Note[] {
  let id = 1;
  return compact.map(([time, lane, duration, isChord]) => ({
    id: id++,
    time,
    lane,
    duration,
    hit: false,
    missed: false,
    sustainCompleted: false,
    sustainHeldTime: 0,
    type: isChord ? ('chord' as const) : duration > 0.1 ? ('hold' as const) : ('tap' as const)
  }));
}

export function unpackChart(compact: CompactCharts): BeatmapByDifficulty {
  return {
    EASY: unpackNotes(compact.EASY || []),
    MEDIUM: unpackNotes(compact.MEDIUM || []),
    HARD: unpackNotes(compact.HARD || []),
    EXPERT: unpackNotes(compact.EXPERT || [])
  };
}

export const LISARB2_COMMUNITY_CHARTS: Record<string, BeatmapByDifficulty> = {};

for (const [songId, compact] of Object.entries(RAW_LISARB2_CHARTS)) {
  Object.defineProperty(LISARB2_COMMUNITY_CHARTS, songId, {
    get() {
      const unpacked = unpackChart(compact);
      Object.defineProperty(LISARB2_COMMUNITY_CHARTS, songId, { value: unpacked });
      return unpacked;
    },
    configurable: true
  });
}
`;

    const fullContent = header + JSON.stringify(rawCharts) + footer;
    const destPath = path.resolve(rootDir, 'src/game/catalog/lisarb2ChartsRegistry.ts');
    fs.writeFileSync(destPath, fullContent, 'utf-8');

    console.log(`Successfully generated lisarb2ChartsRegistry.ts (${(fullContent.length / 1024 / 1024).toFixed(2)} MB)`);
    expect(fs.existsSync(destPath)).toBe(true);
  });
});
