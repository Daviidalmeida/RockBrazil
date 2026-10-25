import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ORIGINAL_31_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';

describe('ROCKBRAZIL — Auditoria Completa da Coleção Lisarb2', () => {
  it('inspeciona todos os pacotes descompactados de Lisarb2 e cruza com as 31 músicas existentes', () => {
    const unpackedDir = path.resolve(process.cwd(), 'charts-import/lisarb2-unpacked');
    const songFolders = fs.readdirSync(unpackedDir);

    console.log(`\n================ AUDITORIA DE LISARB2 (${songFolders.length} PASTAS) ================\n`);

    const existing31Ids = new Set(ORIGINAL_31_BRAZILIAN_CATALOG.map((s) => s.id));
    const existing31Titles = new Map(
      ORIGINAL_31_BRAZILIAN_CATALOG.map((s) => [s.title.toLowerCase().trim(), s])
    );

    const parsedSongs: any[] = [];
    const duplicates: any[] = [];
    let audioTotalBytes = 0;

    for (const folderName of songFolders) {
      const folderPath = path.join(unpackedDir, folderName);
      if (!fs.statSync(folderPath).isDirectory()) continue;

      // May contain subfolder or files directly
      let songDir = folderPath;
      const subEntries = fs.readdirSync(folderPath);
      const subDir = subEntries.find((e) => fs.statSync(path.join(folderPath, e)).isDirectory());
      if (subDir && fs.existsSync(path.join(folderPath, subDir, 'notes.chart'))) {
        songDir = path.join(folderPath, subDir);
      }

      const iniPath = path.join(songDir, 'song.ini');
      const chartPath = path.join(songDir, 'notes.chart');
      const oggFiles = fs.readdirSync(songDir).filter((f) => f.endsWith('.ogg'));

      if (!fs.existsSync(chartPath)) {
        console.log(`[IGNORADO] ${folderName} — sem notes.chart (ex: vídeo)`);
        continue;
      }

      // Parse song.ini
      let name = folderName;
      let artist = 'Desconhecido';
      let genre = 'Rock';
      let year = '2000';
      let diffGuitar = 1;
      let songLengthMs = 0;

      if (fs.existsSync(iniPath)) {
        const iniContent = fs.readFileSync(iniPath, 'utf-8');
        const lines = iniContent.split(/\r?\n/);
        for (const line of lines) {
          const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
          if (m) {
            const k = m[1].toLowerCase().trim();
            const v = m[2].trim();
            if (k === 'name') name = v;
            else if (k === 'artist') artist = v;
            else if (k === 'genre') genre = v;
            else if (k === 'year') year = v;
            else if (k === 'diff_guitar') diffGuitar = parseInt(v, 10) || 1;
            else if (k === 'song_length') songLengthMs = parseInt(v, 10) || 0;
          }
        }
      }

      // Check audio size
      let audioPath = '';
      let audioSize = 0;
      if (oggFiles.includes('song.ogg')) {
        audioPath = path.join(songDir, 'song.ogg');
        audioSize = fs.statSync(audioPath).size;
      } else if (oggFiles.length > 0) {
        audioPath = path.join(songDir, oggFiles[0]);
        audioSize = fs.statSync(audioPath).size;
      }
      audioTotalBytes += audioSize;

      // Check if already in 31 existing songs
      const normTitle = name.toLowerCase().trim();
      const normArtist = artist.toLowerCase().trim();
      const existingMatch = ORIGINAL_31_BRAZILIAN_CATALOG.find((s) => {
        const titleMatch = s.title.toLowerCase().trim() === normTitle;
        const sArtist = s.artist.toLowerCase().trim();
        const artistMatch = sArtist.includes(normArtist) || normArtist.includes(sArtist);
        return titleMatch && artistMatch;
      });

      const songInfo = {
        folderName,
        songDir,
        name,
        artist,
        genre,
        year,
        diffGuitar,
        songLengthMs,
        chartPath,
        audioPath,
        audioSizeMB: Number((audioSize / (1024 * 1024)).toFixed(2)),
        allOggs: oggFiles,
        isExistingDuplicate: !!existingMatch,
        existingSongId: existingMatch ? existingMatch.id : null
      };

      if (existingMatch) {
        duplicates.push(songInfo);
      }
      parsedSongs.push(songInfo);
    }

    console.log(`Total de pacotes válidos com chart: ${parsedSongs.length}`);
    console.log(`Duplicatas das 31 músicas identificadas: ${duplicates.length}`);
    console.log(`Músicas novas a adicionar: ${parsedSongs.length - duplicates.length}`);
    console.log(`Tamanho total de áudio: ${(audioTotalBytes / (1024 * 1024)).toFixed(2)} MB`);

    console.log(`\n--- DUPLICATAS IDENTIFICADAS ---`);
    duplicates.forEach((d) => {
      console.log(`• "${d.name}" (${d.artist}) -> Já existente: ID ${d.existingSongId}`);
    });

    // Salvar relatório detalhado
    const reportPath = path.resolve(process.cwd(), 'reports/lisarb2-inventory.json');
    fs.writeFileSync(reportPath, JSON.stringify(parsedSongs, null, 2), 'utf-8');
    console.log(`\nInventário salvo em: ${reportPath}`);
  });
});
