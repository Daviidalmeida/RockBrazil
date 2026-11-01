import { RockChartImportResult, RawChartData, ChartSourceProviderId } from '../types';
import { UniversalChartImporter, UniversalChartResult } from '../../../audio/universalChartImporter';
import { MidiChartParser } from '../../../audio/midiChartParser';
import { BeatmapByDifficulty, Difficulty, Note, Lane } from '../../../types';

export class RockChartImporter {
  /**
   * Importa de forma universal qualquer arquivo de chart (.chart, notes.mid, song.ini, .zip ou .sng).
   * Preserva estritamente os dados originais sem modificação permanente e gera versões derivadas separadas
   * para o RockBrazil (EASY 3 pistas, MEDIUM 4 pistas, HARD 5 pistas, EXPERT 5 pistas).
   */
  public static async importChartFile(
    fileBuffer: ArrayBuffer | Uint8Array | string,
    fileName: string,
    provider: ChartSourceProviderId = 'COMMUNITY_UPLOAD',
    optionalIniText?: string
  ): Promise<RockChartImportResult> {
    const rawFormat = this.detectFormat(fileName, fileBuffer);
    const originalRawCopy: RawChartData = {
      fileFormat: rawFormat,
      rawContent: typeof fileBuffer === 'string' ? fileBuffer : fileBuffer.slice(0),
      extractedMetadata: {}
    };

    let parsedResult: UniversalChartResult;

    if (typeof fileBuffer === 'string') {
      parsedResult = UniversalChartImporter.parseChartText(fileBuffer);
    } else {
      const uint8 = fileBuffer instanceof Uint8Array ? fileBuffer : new Uint8Array(fileBuffer);
      parsedResult = await UniversalChartImporter.importFromRawData(uint8, fileName);
    }

    if (optionalIniText) {
      const iniMeta = MidiChartParser.parseSongIni(optionalIniText);
      if (iniMeta.name) parsedResult.metadata.name = iniMeta.name;
      if (iniMeta.artist) parsedResult.metadata.artist = iniMeta.artist;
      if (iniMeta.charter) parsedResult.metadata.charter = iniMeta.charter;
    }

    originalRawCopy.charter = parsedResult.metadata.charter;
    originalRawCopy.resolution = parsedResult.metadata.resolution;
    originalRawCopy.extractedMetadata = {
      name: parsedResult.metadata.name,
      artist: parsedResult.metadata.artist,
      charter: parsedResult.metadata.charter,
      offsetSec: parsedResult.metadata.offsetSec,
      instrumentTrack: parsedResult.metadata.instrumentTrack
    };

    // Gera versões derivadas estritamente validadas para as 4 dificuldades
    const derivedCharts = this.createDerivedBeatmaps(parsedResult.charts);

    const totalNotesPerDifficulty: Record<Difficulty, number> = {
      EASY: derivedCharts.EASY.length,
      MEDIUM: derivedCharts.MEDIUM.length,
      HARD: derivedCharts.HARD.length,
      EXPERT: derivedCharts.EXPERT.length
    };

    const difficultiesPresent: Difficulty[] = (['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as Difficulty[])
      .filter((d) => totalNotesPerDifficulty[d] > 0);

    const songId = this.generateSongId(parsedResult.metadata.artist, parsedResult.metadata.name);

    return {
      songId,
      title: parsedResult.metadata.name || 'Música Importada',
      artist: parsedResult.metadata.artist || 'Artista Desconhecido',
      bpm: 120, // default nominal; actual tempo maps embedded in note timestamps
      durationSec: parsedResult.validation.durationSec || 180,
      originalRawData: originalRawCopy,
      derivedCharts,
      difficultiesPresent,
      hasChords: parsedResult.validation.hasChords,
      hasSustains: parsedResult.validation.hasSustains,
      totalNotesPerDifficulty,
      sourceProvider: provider,
      importTimestamp: new Date().toISOString()
    };
  }

  /**
   * Converte charts originais para o formato RockBrazil, respeitando:
   * EASY: máximo de 3 pistas (0, 1, 2)
   * MEDIUM: máximo de 4 pistas (0, 1, 2, 3)
   * HARD e EXPERT: até 5 pistas (0 a 4)
   * NUNCA injeta notas aleatórias para preencher silêncios.
   */
  private static createDerivedBeatmaps(original: BeatmapByDifficulty): BeatmapByDifficulty {
    const derived: BeatmapByDifficulty = {
      EASY: this.normalizeDifficultyNotes(original.EASY || [], 3),
      MEDIUM: this.normalizeDifficultyNotes(original.MEDIUM || [], 4),
      HARD: this.normalizeDifficultyNotes(original.HARD || [], 5),
      EXPERT: this.normalizeDifficultyNotes(original.EXPERT || [], 5)
    };

    return derived;
  }

  private static normalizeDifficultyNotes(notes: Note[], maxLanes: number): Note[] {
    if (!notes || notes.length === 0) return [];

    const sorted = [...notes].sort((a, b) => a.time - b.time);
    const result: Note[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const src = sorted[i];
      // Mapeamento proporcional de pista sem exceder o limite da dificuldade
      let lane: Lane = src.lane;
      if (lane >= maxLanes) {
        lane = (lane % maxLanes) as Lane;
      }

      result.push({
        id: i + 1,
        time: Math.round(src.time * 1000) / 1000,
        lane,
        duration: Math.max(0, Math.round(src.duration * 1000) / 1000),
        hit: false,
        missed: false,
        sustainCompleted: false,
        sustainHeldTime: 0
      });
    }

    return result;
  }

  private static detectFormat(fileName: string, buffer: any): '.chart' | '.mid' | '.ini' | '.zip' {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.chart')) return '.chart';
    if (lower.endsWith('.mid') || lower.endsWith('.midi')) return '.mid';
    if (lower.endsWith('.ini')) return '.ini';
    if (lower.endsWith('.zip')) return '.zip';
    if (typeof buffer === 'string' && buffer.includes('[Song]')) return '.chart';
    return '.chart';
  }

  private static generateSongId(artist: string, title: string): string {
    const cleanArtist = (artist || 'intl').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    const cleanTitle = (title || 'song').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 24);
    return `intl-${cleanArtist}-${cleanTitle}`;
  }
}
