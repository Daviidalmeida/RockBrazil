import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ORIGINAL_31_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';
import { RAW_COMPACT_CHARTS } from '../src/game/catalog/realChartsRegistry';
import { BeatmapManager } from '../src/game/beatmapManager';

describe('ROCKBRAZIL V8 — Auditoria Controlada de Charts', () => {
  it('executa auditoria progressiva das 31 músicas do catálogo', () => {
    const beatmapManager = new BeatmapManager();
    const totalSongs = ORIGINAL_31_BRAZILIAN_CATALOG.length;
    const auditResults: any[] = [];

    console.log(`\nIniciando auditoria controlada de ${totalSongs} músicas...\n`);

    for (let i = 0; i < totalSongs; i++) {
      const song = ORIGINAL_31_BRAZILIAN_CATALOG[i];
      const indexStr = (i + 1).toString().padStart(2, '0');

      try {
        const easy = beatmapManager.getBeatmap(song.id, 'EASY');
        const medium = beatmapManager.getBeatmap(song.id, 'MEDIUM');
        const hard = beatmapManager.getBeatmap(song.id, 'HARD');
        const expert = beatmapManager.getBeatmap(song.id, 'EXPERT');

        const diffs = { EASY: easy, MEDIUM: medium, HARD: hard, EXPERT: expert };
        let earliestTime = Infinity;
        let earliestDiff = '';
        const diffSummary: Record<string, any> = {};

        for (const [dName, notes] of Object.entries(diffs)) {
          const firstTime = notes.length > 0 ? notes[0].time : null;
          const lastTime = notes.length > 0 ? notes[notes.length - 1].time : null;
          let chords = 0;
          let sustains = 0;

          for (let n = 0; n < notes.length; n++) {
            if (notes[n].duration > 0.1) sustains++;
            if (n > 0 && notes[n].time === notes[n - 1].time) chords++;
          }

          diffSummary[dName] = {
            count: notes.length,
            firstTime,
            lastTime,
            chords,
            sustains
          };

          if (firstTime !== null && firstTime < earliestTime) {
            earliestTime = firstTime;
            earliestDiff = dName;
          }
        }

        const firstValidTime = earliestTime === Infinity ? 0 : Number(earliestTime.toFixed(4));
        const record = {
          index: i + 1,
          id: song.id,
          title: song.title,
          artist: song.artist,
          bpm: song.bpm,
          duration: song.duration,
          hasCompactSource: !!RAW_COMPACT_CHARTS[song.id],
          earliestNoteTimeSec: firstValidTime,
          earliestDiff,
          difficulties: diffSummary,
          suggestedShiftSec: firstValidTime
        };

        auditResults.push(record);
        console.log(`[${indexStr}/${totalSongs}] ${song.title.slice(0, 22).padEnd(22)} | Música carregada | 1ª Nota: ${firstValidTime}s (${earliestDiff}) | Notas: E:${easy.length} M:${medium.length} H:${hard.length} X:${expert.length}`);
      } catch (err: any) {
        console.error(`[${indexStr}/${totalSongs}] ERRO na música ${song.id}:`, err?.message || err);
        auditResults.push({
          index: i + 1,
          id: song.id,
          title: song.title,
          error: err?.message || String(err)
        });
      }
    }

    // Salvar relatório JSON permanente
    const reportDir = path.resolve(process.cwd(), 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    const reportPath = path.join(reportDir, 'audit-charts-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(auditResults, null, 2), 'utf-8');

    console.log(`\n[${totalSongs}/${totalSongs}] Auditoria concluída.`);
    console.log(`Relatório salvo em: ${reportPath}`);

    expect(auditResults.length).toBe(totalSongs);
  });
});
