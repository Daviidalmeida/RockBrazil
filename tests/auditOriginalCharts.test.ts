import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ORIGINAL_31_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';
import { RAW_COMPACT_CHARTS } from '../charts-backup/realChartsRegistry.original';
import { BeatmapManager } from '../src/game/beatmapManager';

describe('V8 Backup & Chart Audit', () => {
  it('audits all 31 songs, measures first note timestamps, and creates original manifest', () => {
    const beatmapManager = new BeatmapManager();
    const manifest: any[] = [];

    console.log(`\n================ AUDITORIA ORIGINAL DOS CHARTS (31 MÚSICAS) ================`);

    ORIGINAL_31_BRAZILIAN_CATALOG.forEach((song, index) => {
      const easy = beatmapManager.getBeatmap(song.id, 'EASY');
      const medium = beatmapManager.getBeatmap(song.id, 'MEDIUM');
      const hard = beatmapManager.getBeatmap(song.id, 'HARD');
      const expert = beatmapManager.getBeatmap(song.id, 'EXPERT');

      const difficulties = { EASY: easy, MEDIUM: medium, HARD: hard, EXPERT: expert };

      let minFirstNote = Infinity;
      let earliestDiff = '';
      const diffDetails: Record<string, any> = {};

      for (const [diff, notes] of Object.entries(difficulties)) {
        const count = notes.length;
        const firstTime = count > 0 ? notes[0].time : null;
        const lastTime = count > 0 ? notes[notes.length - 1].time : null;
        let chords = 0;
        let sustains = 0;

        for (let i = 0; i < notes.length; i++) {
          if (notes[i].duration > 0.1) sustains++;
          if (i > 0 && notes[i].time === notes[i - 1].time) chords++;
        }

        diffDetails[diff] = {
          noteCount: count,
          firstNoteTime: firstTime,
          lastNoteTime: lastTime,
          chords,
          sustains
        };

        if (firstTime !== null && firstTime < minFirstNote) {
          minFirstNote = firstTime;
          earliestDiff = diff;
        }
      }

      const songReport = {
        index: index + 1,
        id: song.id,
        title: song.title,
        artist: song.artist,
        bpm: song.bpm,
        duration: song.duration,
        hasCompactChart: !!RAW_COMPACT_CHARTS[song.id],
        earliestPlayableNoteSec: minFirstNote === Infinity ? null : Number(minFirstNote.toFixed(4)),
        earliestDiff,
        difficulties: diffDetails
      };

      manifest.push(songReport);

      console.log(
        `${(index + 1).toString().padStart(2, ' ')}. [${song.id}] "${song.title}" - ${song.artist}` +
        ` | 1ª Nota: ${songReport.earliestPlayableNoteSec}s (${earliestDiff})` +
        ` | Notas (E/M/H/X): ${easy.length}/${medium.length}/${hard.length}/${expert.length}`
      );
    });

    // Write original manifest to backup folder
    const backupDir = path.resolve(process.cwd(), 'charts-backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(backupDir, 'original_charts_manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );

    expect(manifest.length).toBe(31);
  });
});
