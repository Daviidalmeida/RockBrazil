import JSZip from 'jszip';
import { Note, Difficulty } from '../types';
import { MidiChartParser, MidiParsedCharts } from './midiChartParser';
import { UniversalChartImporter } from './universalChartImporter';

export interface LoadedSongPackage {
  id: string;
  title: string;
  artist: string;
  duration: number;
  bpm: number;
  charts: Record<Difficulty, Note[]>;
  audioBuffer: AudioBuffer;
  albumCoverUrl?: string;
  notesCount: {
    EASY: number;
    MEDIUM: number;
    HARD: number;
    EXPERT: number;
  };
}

export class ZipChartLoader {
  /**
   * Mixes multiple decoded AudioBuffers into a single unified stereo AudioBuffer
   */
  public static mixAudioBuffers(ctx: AudioContext, buffers: AudioBuffer[]): AudioBuffer {
    if (buffers.length === 0) {
      throw new Error('Nenhum buffer de áudio para mixar.');
    }
    if (buffers.length === 1) {
      return buffers[0];
    }

    const sampleRate = buffers[0].sampleRate;
    const maxChannels = 2; // Output standard stereo
    const maxLength = Math.max(...buffers.map((b) => b.length));

    const mixed = ctx.createBuffer(maxChannels, maxLength, sampleRate);
    const leftOut = mixed.getChannelData(0);
    const rightOut = mixed.getChannelData(1);

    for (const buf of buffers) {
      const leftIn = buf.getChannelData(0);
      const rightIn = buf.numberOfChannels > 1 ? buf.getChannelData(1) : leftIn;

      for (let i = 0; i < buf.length; i++) {
        leftOut[i] += leftIn[i];
        rightOut[i] += rightIn[i];
      }
    }

    // Normalization / Soft Limiter to avoid clipping if sum > 1.0
    let peak = 0;
    for (let i = 0; i < maxLength; i++) {
      if (Math.abs(leftOut[i]) > peak) peak = Math.abs(leftOut[i]);
      if (Math.abs(rightOut[i]) > peak) peak = Math.abs(rightOut[i]);
    }

    if (peak > 0.98) {
      const factor = 0.95 / peak;
      for (let i = 0; i < maxLength; i++) {
        leftOut[i] *= factor;
        rightOut[i] *= factor;
      }
    }

    return mixed;
  }

  private static async safeDecode(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
    const copy = data.slice(0);
    return new Promise<AudioBuffer>((resolve, reject) => {
      const res = ctx.decodeAudioData(copy, resolve, reject);
      if (res && typeof res.then === 'function') {
        res.then(resolve).catch(reject);
      }
    });
  }

  /**
   * Processes an uploaded .zip AutoChart or Clone Hero pack
   */
  public static async loadFromZipFile(file: File, ctx: AudioContext): Promise<LoadedSongPackage> {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 1. Locate notes.mid or notes.chart
    let midiEntry: JSZip.JSZipObject | null = null;
    let chartEntry: JSZip.JSZipObject | null = null;
    let iniEntry: JSZip.JSZipObject | null = null;
    let albumEntry: JSZip.JSZipObject | null = null;
    const audioEntries: JSZip.JSZipObject[] = [];

    zip.forEach((relativePath, entry) => {
      const lower = relativePath.toLowerCase();
      if (!entry.dir) {
        if (lower.endsWith('.chart')) {
          chartEntry = entry;
        } else if (lower.endsWith('notes.mid') || lower.endsWith('.mid') || lower.endsWith('.midi')) {
          midiEntry = entry;
        } else if (lower.endsWith('song.ini')) {
          iniEntry = entry;
        } else if (lower.endsWith('album.png') || lower.endsWith('album.jpg')) {
          albumEntry = entry;
        } else if (lower.endsWith('.ogg') || lower.endsWith('.mp3') || lower.endsWith('.wav')) {
          // Standard stems: song.ogg, guitar.ogg, bass.ogg, drums.ogg, vocals.ogg, keys.ogg, crowd.ogg
          audioEntries.push(entry);
        }
      }
    });

    if (!midiEntry && !chartEntry) {
      throw new Error('Nenhum arquivo de notas (notes.mid ou .chart) encontrado no pacote ZIP.');
    }

    // 2. Parse song.ini if present
    let title = file.name.replace(/\.[^/.]+$/, '');
    let artist = 'Banda RockBrazil';
    if (iniEntry) {
      const iniText = await (iniEntry as JSZip.JSZipObject).async('text');
      const meta = MidiChartParser.parseSongIni(iniText);
      if (meta.name) title = meta.name;
      if (meta.artist) artist = meta.artist;
    }

    // 3. Parse Chart or MIDI
    let parsedCharts: Record<Difficulty, Note[]>;
    let chartBpm = 120;

    if (chartEntry) {
      const chartText = await (chartEntry as JSZip.JSZipObject).async('text');
      const parsed = UniversalChartImporter.parseChartText(chartText);
      parsedCharts = parsed.charts;
      if (parsed.metadata.name && parsed.metadata.name !== 'Música Importada') title = parsed.metadata.name;
      if (parsed.metadata.artist && parsed.metadata.artist !== 'Banda RockBrazil') artist = parsed.metadata.artist;
    } else {
      const midiData = await (midiEntry! as JSZip.JSZipObject).async('uint8array');
      const parsedMidi: MidiParsedCharts = MidiChartParser.parse(midiData);
      chartBpm = parsedMidi.bpm;
      parsedCharts = {
        EASY: parsedMidi.EASY,
        MEDIUM: parsedMidi.MEDIUM,
        HARD: parsedMidi.HARD,
        EXPERT: parsedMidi.EXPERT
      };
    }

    // 4. Decode audio stems if available, otherwise generate clean silent buffer
    let mixedAudio: AudioBuffer;
    if (audioEntries.length > 0) {
      const decodedBuffers: AudioBuffer[] = [];
      for (const audioEntry of audioEntries) {
        try {
          const audioData = await audioEntry.async('arraybuffer');
          const buf = await ZipChartLoader.safeDecode(ctx, audioData);
          decodedBuffers.push(buf);
        } catch (err) {
          console.warn(`Falha ao decodificar trilha de áudio ${audioEntry.name}:`, err);
        }
      }

      if (decodedBuffers.length > 0) {
        mixedAudio = ZipChartLoader.mixAudioBuffers(ctx, decodedBuffers);
      } else {
        const estDuration = Math.max(30, ...(['EXPERT', 'HARD', 'MEDIUM', 'EASY'] as Difficulty[]).map((d) => (parsedCharts[d]?.length ? parsedCharts[d][parsedCharts[d].length - 1].time + 5 : 30)));
        mixedAudio = ctx.createBuffer(2, Math.round(ctx.sampleRate * estDuration), ctx.sampleRate);
      }
    } else {
      const estDuration = Math.max(30, ...(['EXPERT', 'HARD', 'MEDIUM', 'EASY'] as Difficulty[]).map((d) => (parsedCharts[d]?.length ? parsedCharts[d][parsedCharts[d].length - 1].time + 5 : 30)));
      mixedAudio = ctx.createBuffer(2, Math.round(ctx.sampleRate * estDuration), ctx.sampleRate);
    }

    // 5. Extract Album Cover
    let albumCoverUrl: string | undefined;
    if (albumEntry) {
      const albumBlob = await (albumEntry as JSZip.JSZipObject).async('blob');
      albumCoverUrl = URL.createObjectURL(albumBlob);
    }

    const songId = `zip_${Date.now()}_${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    return {
      id: songId,
      title,
      artist,
      duration: Number(mixedAudio.duration.toFixed(1)),
      bpm: chartBpm,
      charts: parsedCharts,
      audioBuffer: mixedAudio,
      albumCoverUrl,
      notesCount: {
        EASY: parsedCharts.EASY.length,
        MEDIUM: parsedCharts.MEDIUM.length,
        HARD: parsedCharts.HARD.length,
        EXPERT: parsedCharts.EXPERT.length
      }
    };
  }

  /**
   * Loads the authentic AC/DC - T.N.T. AutoChart package already extracted on disk
   */
  public static async loadLocalTNT(ctx: AudioContext): Promise<LoadedSongPackage> {
    const base = import.meta.env.BASE_URL;
    const basePath = `${base}custom-songs/acdc_tnt/ACDC - T.N.T`;

    // 1. Fetch notes.mid
    const midiRes = await fetch(`${basePath}/notes.mid`);
    if (!midiRes.ok) {
      throw new Error(`notes.mid não encontrado em ${basePath}`);
    }
    const midiBuf = await midiRes.arrayBuffer();
    const parsedMidi = MidiChartParser.parse(midiBuf);

    // 2. Fetch and decode audio stems
    const stemFiles = ['song.ogg', 'guitar.ogg', 'bass.ogg', 'drums.ogg', 'vocals.ogg'];
    const decodedBuffers: AudioBuffer[] = [];

    for (const stem of stemFiles) {
      try {
        const res = await fetch(`${basePath}/${stem}`);
        if (res.ok) {
          const arr = await res.arrayBuffer();
          const buf = await ZipChartLoader.safeDecode(ctx, arr);
          decodedBuffers.push(buf);
        }
      } catch (err) {
        console.warn(`Aviso: não foi possível carregar o stem ${stem}:`, err);
      }
    }

    // Fallback to TNT.mp3 if stems failed
    if (decodedBuffers.length === 0) {
      const fallbackRes = await fetch(`${base}custom-songs/TNT.mp3`);
      if (fallbackRes.ok) {
        const arr = await fallbackRes.arrayBuffer();
        const buf = await ZipChartLoader.safeDecode(ctx, arr);
        decodedBuffers.push(buf);
      }
    }

    if (decodedBuffers.length === 0) {
      throw new Error('Não foi possível carregar os arquivos de áudio de T.N.T.');
    }

    const mixedAudio = ZipChartLoader.mixAudioBuffers(ctx, decodedBuffers);

    return {
      id: 'tnt-acdc',
      title: 'T.N.T.',
      artist: 'AC/DC',
      duration: Number(mixedAudio.duration.toFixed(1)),
      bpm: parsedMidi.bpm,
      charts: {
        EASY: parsedMidi.EASY,
        MEDIUM: parsedMidi.MEDIUM,
        HARD: parsedMidi.HARD,
        EXPERT: parsedMidi.EXPERT
      },
      audioBuffer: mixedAudio,
      albumCoverUrl: `${basePath}/album.png`,
      notesCount: {
        EASY: parsedMidi.EASY.length,
        MEDIUM: parsedMidi.MEDIUM.length,
        HARD: parsedMidi.HARD.length,
        EXPERT: parsedMidi.EXPERT.length
      }
    };
  }
}
