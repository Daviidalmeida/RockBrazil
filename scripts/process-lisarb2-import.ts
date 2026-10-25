import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { UniversalChartImporter } from '../src/audio/universalChartImporter';
import { SongMetadata, Difficulty, Note, Lane } from '../src/types';

type CompactNote = [number, Lane, number, number?];
type CompactCharts = Record<Difficulty, CompactNote[]>;

describe('Lisarb2 Asset & Catalog Generator', () => {
  it('processes all 137 songs, copies assets, and generates catalog & charts', async () => {
    const rootDir = process.cwd();
    const inventoryPath = path.resolve(rootDir, 'reports/lisarb2-inventory.json');
    const inventory: any[] = JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'));

    const publicSongsDir = path.resolve(rootDir, 'public/songs');
    const publicChartsDir = path.resolve(rootDir, 'public/charts');

    if (!fs.existsSync(publicSongsDir)) fs.mkdirSync(publicSongsDir, { recursive: true });
    if (!fs.existsSync(publicChartsDir)) fs.mkdirSync(publicChartsDir, { recursive: true });

    const categoryNames: Record<string, string> = {
      '01': '01. Mais Do Que Samba e Futebol',
      '02': '02. Nao Toque Raul',
      '03': '03. Os Sons Da Noite Retornam',
      '04': '04. Momento Brasil',
      '05': '05. Entre Bem e o Mal',
      '06': '06. Um Oferecimento Rede Globo',
      '07': '07. ROQUEN ROUL SEXTA FEIRAAAA',
      '08': '08. O Fim De Uma Era',
      '09': '09. Perdido',
      '10': '10. Abram os oleos',
      '11': '11. Flash Extinto Em 2020',
      '12': '12. Sem iPhone,Fica de iHope',
      '13': '13. E a Vida Segue',
      '14': '14. Um momento pra ouvir Trap',
      '15': '15. Eu Sou A Velocidade',
      '16': '16. As Lendas Nunca Morrem'
    };

    const newSongCatalog: SongMetadata[] = [];
    const duplicateUpdates: Record<string, { audioUrl: string; coverUrl?: string; bpm?: number; duration?: number }> = {};
    const compactRegistry: Record<string, CompactCharts> = {};

    let copiedAudio = 0;
    let copiedImages = 0;
    let chartsGenerated = 0;

    for (let i = 0; i < inventory.length; i++) {
      const item = inventory[i];
      const catKey = item.folderName.substring(0, 2);
      const catName = categoryNames[catKey] || `Categoria ${catKey}`;
      const groupNum = 8 + parseInt(catKey, 10); // Group 9 to 24

      const folderPrefix = item.folderName.substring(0, 4); // "01.1"
      const slug = (item.artist + '-' + item.name)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const songId = item.isExistingDuplicate && item.existingSongId
        ? item.existingSongId
        : `lis-${folderPrefix.replace('.', '-')}-${slug}`.toLowerCase();

      const songDestDir = path.join(publicSongsDir, songId);
      if (!fs.existsSync(songDestDir)) fs.mkdirSync(songDestDir, { recursive: true });

      // 1. Copy audio (song.ogg)
      const audioDest = path.join(songDestDir, 'song.ogg');
      if (!fs.existsSync(audioDest) || fs.statSync(audioDest).size !== fs.statSync(item.audioPath).size) {
        fs.copyFileSync(item.audioPath, audioDest);
      }
      copiedAudio++;

      // 2. Find and copy album cover
      const songDirFiles = fs.readdirSync(item.songDir);
      const coverFile = songDirFiles.find(f => /\.(png|jpg|jpeg)$/i.test(f));
      let coverExt = 'png';
      let hasCover = false;
      if (coverFile) {
        coverExt = path.extname(coverFile).toLowerCase().replace('.', '');
        const coverDest = path.join(songDestDir, `cover.${coverExt}`);
        if (!fs.existsSync(coverDest)) {
          fs.copyFileSync(path.join(item.songDir, coverFile), coverDest);
        }
        copiedImages++;
        hasCover = true;
      }

      // 3. Parse and generate compact chart
      const chartText = fs.readFileSync(item.chartPath, 'utf-8');
      const parsed = UniversalChartImporter.parseChartText(chartText);

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
          const entry: CompactNote = [
            Number(n.time.toFixed(3)),
            n.lane,
            Number(n.duration.toFixed(3))
          ];
          if (n.type === 'chord') {
            entry.push(1);
          }
          return entry;
        });
      }

      compactRegistry[songId] = compact;

      // Write individual chart JSON
      const chartJsonPath = path.join(publicChartsDir, `${songId}.json`);
      fs.writeFileSync(chartJsonPath, JSON.stringify(compact));
      chartsGenerated++;

      const durationSec = Math.max(
        Math.round(item.songLengthMs / 1000) || 0,
        Math.ceil((parsed.validation?.durationSec || 0) + 2),
        60
      );
      const bpm = parsed.metadata.bpm || 120;
      const audioUrl = `songs/${songId}/song.ogg`;
      const coverUrl = hasCover ? `songs/${songId}/cover.${coverExt}` : undefined;

      if (item.isExistingDuplicate && item.existingSongId) {
        duplicateUpdates[item.existingSongId] = {
          audioUrl,
          coverUrl
        };
      } else {
        const metadata: SongMetadata = {
          id: songId,
          title: item.name,
          artist: item.artist,
          duration: durationSec,
          bpm,
          style: `📻 ${catName} • ${item.genre || 'Rock'}`,
          type: 'audio-file',
          audioUrl,
          isAvailable: true,
          records: {
            EASY: null,
            MEDIUM: null,
            HARD: null,
            EXPERT: null
          },
          group: groupNum,
          encore: false,
          matchConfidence: 100,
          embeddingStatus: 'ELIGIBLE_OFFICIAL',
          reviewStatus: 'VERIFIED',
          licenseStatus: 'EMBED_ALLOWED',
          chartStatus: 'SMART_CHART_READY'
        };
        newSongCatalog.push(metadata);
      }
    }

    console.log(`Processed: Audio=${copiedAudio}, Covers=${copiedImages}, Charts=${chartsGenerated}`);
    console.log(`New Lisarb2 Songs: ${newSongCatalog.length}, Duplicate Updates: ${Object.keys(duplicateUpdates).length}`);

    // Generate src/game/catalog/lisarb2CatalogData.ts
    const catalogTsContent = `// Auto-generated Lisarb2 Brazilian Rock Collection Metadata
import { SongMetadata } from '../../types';

export const LISARB2_DUPLICATES_UPDATES: Record<string, Partial<SongMetadata>> = ${JSON.stringify(duplicateUpdates, null, 2)};

export const LISARB2_NEW_SONGS: SongMetadata[] = ${JSON.stringify(newSongCatalog, null, 2)};
`;

    fs.writeFileSync(
      path.resolve(rootDir, 'src/game/catalog/lisarb2CatalogData.ts'),
      catalogTsContent,
      'utf-8'
    );

    // Save report summary
    fs.writeFileSync(
      path.resolve(rootDir, 'reports/lisarb2-import-summary.json'),
      JSON.stringify({
        totalPackages: inventory.length,
        newSongsCount: newSongCatalog.length,
        duplicateUpdatesCount: Object.keys(duplicateUpdates).length,
        audioFilesCount: copiedAudio,
        coverImagesCount: copiedImages,
        chartsCount: chartsGenerated
      }, null, 2),
      'utf-8'
    );

    expect(newSongCatalog.length).toBe(131);
    expect(Object.keys(duplicateUpdates).length).toBe(6);
  });
});
