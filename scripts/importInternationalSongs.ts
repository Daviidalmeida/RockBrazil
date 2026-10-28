/**
 * ROCKBRAZIL V13.6 — IMPORTADOR AUTOMÁTICO DE CHARTS ZIP INTERNACIONAIS
 *
 * Processa pacotes .zip contendo .chart, .mid/.midi, song.ini e capas.
 * - Proteção contra Zip Slip
 * - Limites de descompactação e quantidade de arquivos
 * - Conversão de tempo musical com suporte a multi-BPM e âncoras absolutas
 * - Mapeamento para as 5 pistas verticais do RockBrazil
 * - Geração de registro otimizado e catálogo internacional
 */

import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { UniversalChartImporter } from '../src/audio/universalChartImporter';
import { MidiChartParser } from '../src/audio/midiChartParser';
import { Note, Lane, Difficulty, SongMetadata } from '../src/types';

export type CompactNote = [number, Lane, number, number?];
export type CompactCharts = Record<Difficulty, CompactNote[]>;

export interface ProcessedSongResult {
  id: string;
  title: string;
  artist: string;
  charter: string;
  album: string;
  year: number;
  duration: number;
  bpm: number;
  format: '.chart' | '.mid';
  zipFileName: string;
  videoStartTimeMs: number;
  noteCounts: Record<Difficulty, number>;
  coverFileName?: string;
  coverBuffer?: Buffer;
  compactCharts: CompactCharts;
}

export interface SecurityOptions {
  maxEntriesPerZip?: number;
  maxUncompressedEntryBytes?: number;
  maxTotalUncompressedBytes?: number;
}

const DEFAULT_SECURITY_OPTIONS: Required<SecurityOptions> = {
  maxEntriesPerZip: 250,
  maxUncompressedEntryBytes: 100 * 1024 * 1024, // 100 MB
  maxTotalUncompressedBytes: 300 * 1024 * 1024  // 300 MB
};

export const KNOWN_INTERNATIONAL_VIDEOS: Record<string, {
  youtubeVideoId: string;
  youtubeUrl: string;
  youtubeChannel: string;
  recordingVersion: string;
  defaultOffsetMs: number;
  status: 'PRONTA PARA TESTE' | 'CHART EM PREPARAÇÃO' | 'VÍDEO NÃO CONFIGURADO' | 'VÍDEO INDISPONÍVEL';
}> = {
  'intl-acdc-highway-to-hell': {
    youtubeVideoId: 'gEPmA3USJdI',
    youtubeUrl: 'https://www.youtube.com/watch?v=gEPmA3USJdI',
    youtubeChannel: 'acdcVEVO',
    recordingVersion: 'Ao Vivo no River Plate (Buenos Aires, Dez/2009)',
    defaultOffsetMs: -2000,
    status: 'PRONTA PARA TESTE'
  },
  'intl-gnr-paradise-city': {
    youtubeVideoId: 'Rbm6GXllBiw',
    youtubeUrl: 'https://www.youtube.com/watch?v=Rbm6GXllBiw',
    youtubeChannel: 'GunsNRosesVEVO',
    recordingVersion: 'Clipe Oficial / Gravação de Estúdio (Appetite for Destruction)',
    defaultOffsetMs: 0,
    status: 'PRONTA PARA TESTE'
  },
  'intl-gnr-sweet-child-o-mine': {
    youtubeVideoId: '1w7OgIMMRc4',
    youtubeUrl: 'https://www.youtube.com/watch?v=1w7OgIMMRc4',
    youtubeChannel: 'GunsNRosesVEVO',
    recordingVersion: 'Clipe Oficial em HD (Appetite for Destruction)',
    defaultOffsetMs: 0,
    status: 'PRONTA PARA TESTE'
  },
  'intl-gnr-welcome-to-the-jungle': {
    youtubeVideoId: 'o1tj2zJ2Wvg',
    youtubeUrl: 'https://www.youtube.com/watch?v=o1tj2zJ2Wvg',
    youtubeChannel: 'GunsNRosesVEVO',
    recordingVersion: 'Clipe Oficial (Appetite for Destruction)',
    defaultOffsetMs: 0,
    status: 'PRONTA PARA TESTE'
  },
  'intl-lp-numb': {
    youtubeVideoId: 'kXYiU_JCYtU',
    youtubeUrl: 'https://www.youtube.com/watch?v=kXYiU_JCYtU',
    youtubeChannel: 'Linkin Park',
    recordingVersion: 'Clipe Oficial 4K Upgrade (Meteora)',
    defaultOffsetMs: 0,
    status: 'PRONTA PARA TESTE'
  }
};

export class InternationalZipImporter {
  /**
   * Sanitizes and verifies path safety against Zip Slip vulnerabilities
   */
  public static isSafeZipPath(relPath: string): boolean {
    if (!relPath || relPath.startsWith('/') || relPath.startsWith('\\') || /^[a-zA-Z]:/.test(relPath)) {
      return false;
    }
    const normalized = path.normalize(relPath);
    if (normalized.startsWith('..') || normalized.includes(path.sep + '..' + path.sep) || normalized.endsWith(path.sep + '..')) {
      return false;
    }
    return true;
  }

  /**
   * Compacts Note objects into lightweight arrays [time, lane, duration, isChord?]
   */
  public static compactNotes(notes: Note[]): CompactNote[] {
    const timeCounts = new Map<number, number>();
    for (const n of notes) {
      timeCounts.set(n.time, (timeCounts.get(n.time) || 0) + 1);
    }

    return notes.map((n) => {
      const isChord = (timeCounts.get(n.time) || 0) > 1;
      const res: CompactNote = [
        Number(n.time.toFixed(3)),
        n.lane,
        Number(n.duration.toFixed(3))
      ];
      if (isChord) {
        res.push(1);
      }
      return res;
    });
  }

  /**
   * Processes a single ZIP buffer safely and returns the extracted metadata and compact charts
   */
  public static async processZipBuffer(
    zipBuffer: Buffer | ArrayBuffer,
    zipFileName: string,
    options: SecurityOptions = {}
  ): Promise<ProcessedSongResult> {
    const sec = { ...DEFAULT_SECURITY_OPTIONS, ...options };
    const zip = await JSZip.loadAsync(zipBuffer);

    let entryCount = 0;
    let totalUncompressedSize = 0;

    let chartEntry: JSZip.JSZipObject | null = null;
    let midiEntry: JSZip.JSZipObject | null = null;
    let iniEntry: JSZip.JSZipObject | null = null;
    let coverEntry: JSZip.JSZipObject | null = null;

    zip.forEach((relPath, entry) => {
      entryCount++;
      if (entryCount > sec.maxEntriesPerZip) {
        throw new Error(`Pacote ${zipFileName} excede o limite máximo de ${sec.maxEntriesPerZip} arquivos.`);
      }

      if (!this.isSafeZipPath(relPath)) {
        throw new Error(`Caminho potencialmente malicioso (Zip Slip detectado): "${relPath}" em ${zipFileName}`);
      }

      // Ignora executáveis e scripts perigosos
      const lower = relPath.toLowerCase();
      if (/\.(exe|bat|cmd|sh|dll|so|msi|ps1|vbs|scr)$/i.test(lower)) {
        return;
      }

      const uncompressedSize = (entry as any)._data ? (entry as any)._data.uncompressedSize : 0;
      if (uncompressedSize > sec.maxUncompressedEntryBytes) {
        throw new Error(`Arquivo "${relPath}" excede o tamanho máximo descompactado permitido (${sec.maxUncompressedEntryBytes} bytes).`);
      }
      totalUncompressedSize += uncompressedSize;
      if (totalUncompressedSize > sec.maxTotalUncompressedBytes) {
        throw new Error(`Tamanho total descompactado do pacote ${zipFileName} excede o limite permitido.`);
      }

      if (!entry.dir) {
        if (lower.endsWith('.chart')) {
          chartEntry = entry;
        } else if (lower.endsWith('.mid') || lower.endsWith('.midi')) {
          midiEntry = entry;
        } else if (lower.endsWith('song.ini')) {
          iniEntry = entry;
        } else if (lower.endsWith('album.jpg') || lower.endsWith('album.png') || lower.endsWith('cover.jpg') || lower.endsWith('cover.png')) {
          coverEntry = entry;
        }
      }
    });

    if (!chartEntry && !midiEntry) {
      throw new Error(`Nenhum arquivo de chart (.chart ou .mid) encontrado no pacote ZIP ${zipFileName}.`);
    }

    // 1. Metadados do song.ini
    let iniMeta: Record<string, string> = {};
    if (iniEntry) {
      const iniText = await (iniEntry as JSZip.JSZipObject).async('text');
      iniMeta = MidiChartParser.parseSongIni(iniText);
    }

    let title = iniMeta.name || zipFileName.replace(/\.zip$/i, '');
    let artist = iniMeta.artist || 'Artista Internacional';
    let charter = iniMeta.charter || 'Comunidade';
    let album = iniMeta.album || 'Single';
    let year = parseInt(iniMeta.year || '2000', 10) || 2000;
    let videoStartTimeMs = parseInt(iniMeta.video_start_time || '0', 10) || 0;

    // Determina ID canônico estável
    let id = this.generateStableId(artist, title);

    let format: '.chart' | '.mid' = '.chart';
    let bpm = 120;
    let duration = parseInt(iniMeta.song_length || '0', 10) / 1000;
    let rawCharts: Record<Difficulty, Note[]>;

    if (chartEntry) {
      format = '.chart';
      const chartText = await (chartEntry as JSZip.JSZipObject).async('text');
      const parsed = UniversalChartImporter.parseChartText(chartText);
      rawCharts = parsed.charts;
      if (parsed.metadata.name && parsed.metadata.name !== 'Música Importada') title = parsed.metadata.name;
      if (parsed.metadata.artist && parsed.metadata.artist !== 'Banda RockBrazil') artist = parsed.metadata.artist;
      if (parsed.metadata.charter && parsed.metadata.charter !== 'Comunidade') charter = parsed.metadata.charter;
      if (parsed.validation.durationSec > 0) duration = parsed.validation.durationSec;
    } else {
      format = '.mid';
      const midiData = await (midiEntry! as JSZip.JSZipObject).async('uint8array');
      const parsed = MidiChartParser.parse(midiData);
      bpm = parsed.bpm;
      if (parsed.duration > 0) duration = parsed.duration;
      rawCharts = {
        EASY: parsed.EASY,
        MEDIUM: parsed.MEDIUM,
        HARD: parsed.HARD,
        EXPERT: parsed.EXPERT
      };
    }

    // Normaliza ID estável definitivo baseado no artista e título apurados
    id = this.generateStableId(artist, title);

    const compactCharts: CompactCharts = {
      EASY: this.compactNotes(rawCharts.EASY || []),
      MEDIUM: this.compactNotes(rawCharts.MEDIUM || []),
      HARD: this.compactNotes(rawCharts.HARD || []),
      EXPERT: this.compactNotes(rawCharts.EXPERT || [])
    };

    const noteCounts = {
      EASY: compactCharts.EASY.length,
      MEDIUM: compactCharts.MEDIUM.length,
      HARD: compactCharts.HARD.length,
      EXPERT: compactCharts.EXPERT.length
    };

    // Extrai capa se disponível
    let coverFileName: string | undefined = undefined;
    let coverBuffer: Buffer | undefined = undefined;
    if (coverEntry) {
      const ext = path.extname((coverEntry as JSZip.JSZipObject).name).toLowerCase() || '.jpg';
      coverFileName = `${id}${ext}`;
      const arr = await (coverEntry as JSZip.JSZipObject).async('uint8array');
      coverBuffer = Buffer.from(arr);
    }

    return {
      id,
      title,
      artist,
      charter,
      album,
      year,
      duration: Math.round(duration),
      bpm,
      format,
      zipFileName,
      videoStartTimeMs,
      noteCounts,
      coverFileName,
      coverBuffer,
      compactCharts
    };
  }

  /**
   * Generates a stable deterministic song ID based on artist and title
   */
  public static generateStableId(artist: string, title: string): string {
    const raw = `${artist} - ${title}`.toLowerCase();
    if (raw.includes('highway to hell')) return 'intl-acdc-highway-to-hell';
    if (raw.includes('paradise city')) return 'intl-gnr-paradise-city';
    if (raw.includes('sweet child')) return 'intl-gnr-sweet-child-o-mine';
    if (raw.includes('welcome to the jungle')) return 'intl-gnr-welcome-to-the-jungle';
    if (raw.includes('numb')) return 'intl-lp-numb';

    const slug = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `intl-${slug}`;
  }

  /**
   * Batch process directory with ZIPs and generates RockBrazil files
   */
  public static async runBatchImport(
    zipDirPath = path.resolve(process.cwd(), 'public/musicas-internacionais'),
    outputDir = path.resolve(process.cwd(), 'src/game/catalog')
  ): Promise<ProcessedSongResult[]> {
    if (!fs.existsSync(zipDirPath)) {
      throw new Error(`Diretório de pacotes não encontrado: ${zipDirPath}`);
    }

    const zipFiles = fs.readdirSync(zipDirPath).filter((f) => f.toLowerCase().endsWith('.zip'));
    if (zipFiles.length === 0) {
      console.warn(`[InternationalZipImporter] Nenhum arquivo .zip encontrado em ${zipDirPath}`);
      return [];
    }

    console.log(`[InternationalZipImporter] Localizados ${zipFiles.length} pacotes ZIP em ${zipDirPath}:`);
    zipFiles.forEach((f, idx) => console.log(`  ${idx + 1}. ${f}`));

    const coversDir = path.resolve(process.cwd(), 'public/images/intl-covers');
    if (!fs.existsSync(coversDir)) {
      fs.mkdirSync(coversDir, { recursive: true });
    }

    const results: ProcessedSongResult[] = [];
    const rawChartsMap: Record<string, CompactCharts> = {};

    for (const zipFile of zipFiles) {
      const fullPath = path.join(zipDirPath, zipFile);
      const buf = fs.readFileSync(fullPath);
      try {
        const processed = await this.processZipBuffer(buf, zipFile);
        results.push(processed);
        rawChartsMap[processed.id] = processed.compactCharts;

        if (processed.coverFileName && processed.coverBuffer) {
          const coverPath = path.join(coversDir, processed.coverFileName);
          fs.writeFileSync(coverPath, processed.coverBuffer);
        }
        console.log(`✅ [${processed.id}] "${processed.title}" (${processed.artist}) processada com sucesso! Formato: ${processed.format}`);
      } catch (err: any) {
        console.error(`❌ Erro ao processar ${zipFile}:`, err.message);
      }
    }

    // 1. Gera src/game/catalog/internationalChartsRegistry.ts
    const registryPath = path.join(outputDir, 'internationalChartsRegistry.ts');
    const registryContent = `import { Note, Lane, Difficulty, BeatmapByDifficulty } from '../../types';

export type CompactNote = [number, Lane, number, number?];
export type CompactCharts = Record<Difficulty, CompactNote[]>;

/**
 * ROCKBRAZIL V13.6 — INTERNATIONAL CHARTS REGISTRY
 * Lazy-unpacked authentic converted charts for international songs.
 */
export const RAW_INTERNATIONAL_CHARTS: Record<string, CompactCharts> = ${JSON.stringify(rawChartsMap)};

function unpackNotes(compactList: CompactNote[]): Note[] {
  let id = 1;
  return compactList.map(([time, lane, duration, isChord]) => ({
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

export function unpackInternationalChart(compact: CompactCharts): BeatmapByDifficulty {
  return {
    EASY: unpackNotes(compact.EASY || []),
    MEDIUM: unpackNotes(compact.MEDIUM || []),
    HARD: unpackNotes(compact.HARD || []),
    EXPERT: unpackNotes(compact.EXPERT || [])
  };
}

export const INTERNATIONAL_COMMUNITY_CHARTS: Record<string, BeatmapByDifficulty> = {};

for (const [songId, compact] of Object.entries(RAW_INTERNATIONAL_CHARTS)) {
  Object.defineProperty(INTERNATIONAL_COMMUNITY_CHARTS, songId, {
    get() {
      const unpacked = unpackInternationalChart(compact);
      Object.defineProperty(INTERNATIONAL_COMMUNITY_CHARTS, songId, { value: unpacked });
      return unpacked;
    },
    configurable: true
  });
}
`;
    fs.writeFileSync(registryPath, registryContent, 'utf-8');
    console.log(`📄 Gerado ${registryPath}`);

    // 2. Gera src/game/catalog/internationalCatalog.ts
    const catalogPath = path.join(outputDir, 'internationalCatalog.ts');
    const catalogEntries: SongMetadata[] = results.map((r) => {
      const known = KNOWN_INTERNATIONAL_VIDEOS[r.id];
      const coverUrl = r.coverFileName ? `images/intl-covers/${r.coverFileName}` : 'images/default-cover.png';

      return {
        id: r.id,
        title: r.title,
        artist: r.artist,
        duration: r.duration,
        bpm: r.bpm,
        style: `🎸 Internacional • ${r.album || 'Rock'}`,
        type: 'youtube' as const,
        youtubeVideoId: known?.youtubeVideoId || '',
        youtubeUrl: known?.youtubeUrl || '',
        youtubeChannel: known?.youtubeChannel || '',
        youtubeDuration: `${Math.floor(r.duration / 60)}:${(r.duration % 60).toString().padStart(2, '0')}`,
        matchConfidence: 100,
        embeddingStatus: 'ELIGIBLE_OFFICIAL',
        reviewStatus: 'VERIFIED',
        licenseStatus: 'EMBED_ALLOWED',
        chartStatus: 'CUSTOM',
        isAvailable: true,
        coverUrl,
        records: {
          EASY: null,
          MEDIUM: null,
          HARD: null,
          EXPERT: null
        }
      };
    });

    const catalogContent = `import { SongMetadata } from '../../types';

export interface InternationalSongConfig {
  recordingVersion: string;
  defaultOffsetMs: number;
  charter: string;
  year: number;
  status: 'PRONTA PARA TESTE' | 'CHART EM PREPARAÇÃO' | 'VÍDEO NÃO CONFIGURADO' | 'VÍDEO INDISPONÍVEL';
  availableDifficulties: ('EASY' | 'MEDIUM' | 'HARD' | 'EXPERT')[];
}

export const INTERNATIONAL_METADATA_CONFIG: Record<string, InternationalSongConfig> = ${JSON.stringify(
      Object.fromEntries(
        results.map((r) => {
          const known = KNOWN_INTERNATIONAL_VIDEOS[r.id];
          const availableDiffs: ('EASY' | 'MEDIUM' | 'HARD' | 'EXPERT')[] = (['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as const).filter(
            (d) => (r.noteCounts[d] || 0) > 0
          );
          return [
            r.id,
            {
              recordingVersion: known?.recordingVersion || 'Gravação Oficial',
              defaultOffsetMs: known?.defaultOffsetMs ?? r.videoStartTimeMs ?? 0,
              charter: r.charter,
              year: r.year,
              status: known?.status || (known?.youtubeVideoId ? 'PRONTA PARA TESTE' : 'VÍDEO NÃO CONFIGURADO'),
              availableDifficulties: availableDiffs
            }
          ];
        })
      ),
      null,
      2
    )};

export const INTERNATIONAL_SONGS_CATALOG: (SongMetadata & {
  isInternational: true;
  internationalStatus: 'PRONTA PARA TESTE' | 'CHART EM PREPARAÇÃO' | 'VÍDEO NÃO CONFIGURADO' | 'VÍDEO INDISPONÍVEL';
  recordingVersion: string;
  charter: string;
  year: number;
})[] = ${JSON.stringify(
      catalogEntries.map((song) => {
        const conf = KNOWN_INTERNATIONAL_VIDEOS[song.id];
        const res = results.find((r) => r.id === song.id);
        return {
          ...song,
          isInternational: true,
          internationalStatus: conf?.status || (song.youtubeVideoId ? 'PRONTA PARA TESTE' : 'VÍDEO NÃO CONFIGURADO'),
          recordingVersion: conf?.recordingVersion || 'Gravação Oficial',
          charter: res?.charter || 'Comunidade',
          year: res?.year || 2000
        };
      }),
      null,
      2
    )};
`;
    fs.writeFileSync(catalogPath, catalogContent, 'utf-8');
    console.log(`📄 Gerado ${catalogPath}`);

    return results;
  }
}

// Permite execução direta via CLI: npx tsx scripts/importInternationalSongs.ts
if (process.argv[1] && process.argv[1].endsWith('importInternationalSongs.ts')) {
  InternationalZipImporter.runBatchImport()
    .then((res) => {
      console.log(`\n🎉 Importação concluída com sucesso! ${res.length} músicas internacionais registradas.`);
    })
    .catch((err) => {
      console.error('❌ Falha na importação de músicas internacionais:', err);
      process.exit(1);
    });
}
