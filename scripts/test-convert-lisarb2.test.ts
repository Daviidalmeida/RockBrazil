import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { UniversalChartImporter } from '../src/audio/universalChartImporter';
import { Difficulty, Lane, Note } from '../src/types';

type CompactNote = [number, Lane, number, number?];
type CompactCharts = Record<Difficulty, CompactNote[]>;

describe('Lisarb2 Chart Conversion & Validation Test', () => {
  it('converts and validates all 137 Lisarb2 charts', () => {
    const inventoryPath = path.resolve(process.cwd(), 'reports/lisarb2-inventory.json');
    const inventory: any[] = JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'));

    expect(inventory.length).toBe(137);

    let successCount = 0;
    let totalNotes = 0;
    const compactRegistry: Record<string, CompactCharts> = {};
    const songMetadataList: any[] = [];

    for (const item of inventory) {
      const chartPath = item.chartPath;
      if (!fs.existsSync(chartPath)) {
        console.warn(`Chart not found: ${chartPath}`);
        continue;
      }

      const chartText = fs.readFileSync(chartPath, 'utf-8');
      const parsed = UniversalChartImporter.parseChartText(chartText);

      // Verify difficulties exist
      const compact: CompactCharts = {
        EASY: [],
        MEDIUM: [],
        HARD: [],
        EXPERT: []
      };

      const difficulties: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
      for (const diff of difficulties) {
        const notes = parsed.charts[diff] || [];
        compact[diff] = notes.map((n: Note) => {
          const item: CompactNote = [
            Number(n.time.toFixed(3)),
            n.lane,
            Number(n.duration.toFixed(3))
          ];
          if (n.type === 'chord') {
            item.push(1);
          }
          return item;
        });
        totalNotes += notes.length;
      }

      // Safe ID generation: lis-<categoryIndex>-<slug>
      const folderPrefix = item.folderName.substring(0, 4); // e.g. "01.1"
      const slug = (item.artist + '-' + item.name)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      const songId = item.isExistingDuplicate && item.existingSongId
        ? item.existingSongId
        : `lis-${folderPrefix.replace('.', '-')}-${slug}`.toLowerCase();

      compactRegistry[songId] = compact;
      songMetadataList.push({
        id: songId,
        isExistingDuplicate: item.isExistingDuplicate,
        existingSongId: item.existingSongId,
        title: item.name,
        artist: item.artist,
        genre: item.genre,
        year: item.year,
        diffGuitar: item.diffGuitar,
        bpm: parsed.metadata.bpm || 120,
        offsetSec: parsed.metadata.offsetSec || 0,
        duration: Math.round(item.songLengthMs / 1000) || Math.round(parsed.durationSec) || 180,
        folderName: item.folderName,
        audioPath: item.audioPath,
        audioSizeMB: item.audioSizeMB,
        notesCount: {
          EASY: compact.EASY.length,
          MEDIUM: compact.MEDIUM.length,
          HARD: compact.HARD.length,
          EXPERT: compact.EXPERT.length
        }
      });

      successCount++;
    }

    console.log(`Successfully converted ${successCount} charts with ${totalNotes} total notes!`);
    const jsonStr = JSON.stringify(compactRegistry);
    console.log(`Compact registry JSON size: ${(jsonStr.length / 1024 / 1024).toFixed(2)} MB`);

    expect(successCount).toBe(137);
  });
});
