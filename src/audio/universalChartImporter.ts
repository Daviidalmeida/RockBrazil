import JSZip from 'jszip';
import { Note, Lane, Difficulty, BeatmapByDifficulty, getLanesForDifficulty } from '../types';
import { MidiChartParser } from './midiChartParser';
import { REAL_COMMUNITY_CHARTS } from '../game/catalog/realChartsRegistry';
import { LISARB2_COMMUNITY_CHARTS } from '../game/catalog/lisarb2ChartsRegistry';

export type InstrumentTrackType =
  | 'guitar'
  | 'lead_guitar'
  | 'rhythm_guitar'
  | 'bass'
  | 'keys'
  | 'other';

export interface ChartTempoPoint {
  tick: number;
  bpm: number;
  timeSec: number;
}

export interface ParsedChartMetadata {
  name: string;
  artist: string;
  charter: string;
  offsetSec: number;
  resolution: number;
  instrumentTrack: InstrumentTrackType;
  sourceFormat: '.chart' | '.mid' | '.zip' | '.sng' | 'json';
}

export interface ChartValidationResult {
  valid: boolean;
  errors: string[];
  noteCounts: Record<Difficulty, number>;
  hasChords: boolean;
  hasSustains: boolean;
  durationSec: number;
}

export interface UniversalChartResult {
  metadata: ParsedChartMetadata;
  charts: BeatmapByDifficulty;
  validation: ChartValidationResult;
  audioBuffer?: AudioBuffer;
}

export class UniversalChartImporter {
  /**
   * Instrument track search priority:
   * 1. Guitar -> 2. Lead Guitar -> 3. Rhythm Guitar -> 4. Bass -> 5. Keys -> 6. Other
   */
  public static readonly INSTRUMENT_PRIORITY: { type: InstrumentTrackType; chartNames: string[]; midiNames: string[] }[] = [
    {
      type: 'guitar',
      chartNames: ['Single', 'Guitar'],
      midiNames: ['PART GUITAR', 'T1 GEMS', 'GUITAR']
    },
    {
      type: 'lead_guitar',
      chartNames: ['LeadGuitar', 'Lead'],
      midiNames: ['PART LEAD GUITAR', 'LEAD GUITAR', 'LEAD']
    },
    {
      type: 'rhythm_guitar',
      chartNames: ['RhythmGuitar', 'Rhythm'],
      midiNames: ['PART RHYTHM', 'RHYTHM GUITAR', 'RHYTHM']
    },
    {
      type: 'bass',
      chartNames: ['DoubleBass', 'Bass'],
      midiNames: ['PART BASS', 'BASS']
    },
    {
      type: 'keys',
      chartNames: ['Keys', 'Keyboard'],
      midiNames: ['PART KEYS', 'KEYBOARD', 'KEYS']
    }
  ];

  /**
   * Parses a Clone Hero / Moonscraper text-based .chart file
   */
  public static parseChartText(chartText: string): UniversalChartResult {
    if (chartText.charCodeAt(0) === 0xFEFF) {
      chartText = chartText.slice(1);
    }
    const lines = chartText.split(/\r?\n/);

    let currentSection = '';
    const sectionLines: Record<string, string[]> = {};

    for (const rawLine of lines) {
      const line = rawLine.trim().replace(/^\uFEFF/, '');
      if (!line || line.startsWith('//')) continue;

      if (line.startsWith('[') && line.endsWith(']')) {
        currentSection = line.slice(1, -1).trim();
        if (!sectionLines[currentSection]) {
          sectionLines[currentSection] = [];
        }
        continue;
      }

      if (line === '{' || line === '}') continue;

      if (currentSection) {
        sectionLines[currentSection].push(line);
      }
    }

    // 1. Parse [Song]
    let resolution = 192;
    let offsetSec = 0;
    let name = 'Música Importada';
    let artist = 'Banda RockBrazil';
    let charter = 'Comunidade';

    const songLines = sectionLines['Song'] || [];
    for (const line of songLines) {
      const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        }

        if (key.toLowerCase() === 'resolution') {
          const parsedRes = parseInt(val, 10);
          if (parsedRes > 0) resolution = parsedRes;
        } else if (key.toLowerCase() === 'offset') {
          const parsedOffset = parseFloat(val);
          if (!isNaN(parsedOffset)) offsetSec = parsedOffset;
        } else if (key.toLowerCase() === 'name') {
          name = val;
        } else if (key.toLowerCase() === 'artist') {
          artist = val;
        } else if (key.toLowerCase() === 'charter') {
          charter = val;
        }
      }
    }

    // 2. Parse [SyncTrack] to build Chronological Tempo Map (BPM + Absolute Anchors)
    const tempoPoints: ChartTempoPoint[] = [];
    const anchors = new Map<number, number>(); // tick -> absolute seconds
    const syncLines = sectionLines['SyncTrack'] || [];

    for (const line of syncLines) {
      // e.g.: 2304 = A 6565444 (microseconds)
      const matchA = line.match(/^(\d+)\s*=\s*A\s+(\d+)$/);
      if (matchA) {
        const tick = parseInt(matchA[1], 10);
        const microsec = parseInt(matchA[2], 10);
        anchors.set(tick, microsec / 1000000);
      }
      // e.g.: 0 = B 120000
      const matchB = line.match(/^(\d+)\s*=\s*B\s+(\d+)$/);
      if (matchB) {
        const tick = parseInt(matchB[1], 10);
        const rawBpm = parseInt(matchB[2], 10);
        const bpm = rawBpm / 1000;
        if (bpm > 0) {
          tempoPoints.push({ tick, bpm, timeSec: 0 });
        }
      }
    }

    tempoPoints.sort((a, b) => a.tick - b.tick);
    if (tempoPoints.length === 0 || tempoPoints[0].tick !== 0) {
      tempoPoints.unshift({ tick: 0, bpm: 120, timeSec: 0 });
    }

    // Calculate cumulative time for each tempo marker, locking to absolute anchors if present
    let cumTime = 0;
    for (let i = 0; i < tempoPoints.length; i++) {
      const cur = tempoPoints[i];
      if (i > 0) {
        const prev = tempoPoints[i - 1];
        const deltaTicks = cur.tick - prev.tick;
        cumTime += (deltaTicks / resolution) * (60.0 / prev.bpm);
      }
      if (anchors.has(cur.tick)) {
        cumTime = anchors.get(cur.tick)!;
      }
      cur.timeSec = cumTime;
    }

    const tickToSeconds = (tick: number): number => {
      // If direct absolute anchor exists for this tick, respect charter anchor down to microsecond
      if (anchors.has(tick)) {
        return anchors.get(tick)! + offsetSec;
      }
      let segment = tempoPoints[0];
      for (let i = tempoPoints.length - 1; i >= 0; i--) {
        if (tick >= tempoPoints[i].tick) {
          segment = tempoPoints[i];
          break;
        }
      }
      const deltaTicks = tick - segment.tick;
      return segment.timeSec + (deltaTicks / resolution) * (60.0 / segment.bpm) + offsetSec;
    };

    const getBpmAtTick = (tick: number): number => {
      for (let i = tempoPoints.length - 1; i >= 0; i--) {
        if (tick >= tempoPoints[i].tick) {
          return tempoPoints[i].bpm;
        }
      }
      return 120;
    };

    // 3. Find Best Instrument Track by Priority
    let chosenInstrument: InstrumentTrackType = 'other';
    let diffSections: Record<Difficulty, string> = {
      EXPERT: '',
      HARD: '',
      MEDIUM: '',
      EASY: ''
    };

    for (const priority of UniversalChartImporter.INSTRUMENT_PRIORITY) {
      for (const instName of priority.chartNames) {
        const expKey = `Expert${instName}`;
        const hardKey = `Hard${instName}`;
        const medKey = `Medium${instName}`;
        const easyKey = `Easy${instName}`;

        if (sectionLines[expKey] || sectionLines[hardKey] || sectionLines[medKey] || sectionLines[easyKey]) {
          chosenInstrument = priority.type;
          diffSections = {
            EXPERT: expKey,
            HARD: hardKey,
            MEDIUM: medKey,
            EASY: easyKey
          };
          break;
        }
      }
      if (chosenInstrument !== 'other') break;
    }

    // Fallback: look for any section ending with Single or standard difficulty names
    if (chosenInstrument === 'other') {
      const allSections = Object.keys(sectionLines);
      const expSec = allSections.find((s) => s.startsWith('Expert'));
      if (expSec) {
        const baseName = expSec.replace('Expert', '');
        chosenInstrument = 'guitar';
        diffSections = {
          EXPERT: `Expert${baseName}`,
          HARD: `Hard${baseName}`,
          MEDIUM: `Medium${baseName}`,
          EASY: `Easy${baseName}`
        };
      }
    }

    // 4. Parse Notes for each Difficulty Section
    const parsedCharts: Partial<BeatmapByDifficulty> = {};
    const minSustainTicks = Math.round(resolution * 0.35);

    const parseSectionNotes = (secName: string, targetDiff: Difficulty): Note[] => {
      const lines = sectionLines[secName];
      if (!lines || lines.length === 0) return [];

      const rawNotes: { tick: number; lane: Lane; lengthTicks: number }[] = [];
      const hopoTicks = new Set<number>();
      const strumTicks = new Set<number>();

      for (const line of lines) {
        // e.g.: 768 = N 1 96
        const match = line.match(/^(\d+)\s*=\s*N\s+(\d+)\s+(\d+)$/);
        if (match) {
          const tick = parseInt(match[1], 10);
          const rawLane = parseInt(match[2], 10);
          const lengthTicks = parseInt(match[3], 10);

          if (rawLane === 5) {
            // Special marker 5: Force HOPO toggle
            hopoTicks.add(tick);
          } else if (rawLane === 6) {
            // Special marker 6: Force Strum toggle
            strumTicks.add(tick);
          } else if (rawLane >= 0 && rawLane <= 4) {
            // Preserve authentic lane without artificial remapping/modulo
            rawNotes.push({ tick, lane: rawLane as Lane, lengthTicks });
          } else if (rawLane === 7) {
            // Open note mapped to lane 0
            rawNotes.push({ tick, lane: 0 as Lane, lengthTicks });
          }
        }
      }

      // Group chords (same tick)
      const tickGroups = new Map<number, typeof rawNotes>();
      for (const n of rawNotes) {
        if (!tickGroups.has(n.tick)) {
          tickGroups.set(n.tick, []);
        }
        tickGroups.get(n.tick)!.push(n);
      }

      let noteId = 1;
      const notes: Note[] = [];

      for (const [tick, group] of tickGroups.entries()) {
        const isChord = group.length > 1;
        const noteTime = Number(tickToSeconds(tick).toFixed(3));
        const bpmAtNote = getBpmAtTick(tick);

        for (const item of group) {
          const duration =
            item.lengthTicks >= minSustainTicks
              ? Number(((item.lengthTicks / resolution) * (60.0 / bpmAtNote)).toFixed(3))
              : 0;

          notes.push({
            id: noteId++,
            time: Math.max(0, noteTime),
            lane: item.lane,
            duration,
            hit: false,
            missed: false,
            sustainCompleted: false,
            sustainHeldTime: 0,
            type: isChord ? 'chord' : duration > 0 ? 'hold' : 'tap',
            sourceInstrument: chosenInstrument === 'bass' ? 'bass' : 'guitar'
          });
        }
      }

      notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
      return notes;
    };

    (['EXPERT', 'HARD', 'MEDIUM', 'EASY'] as Difficulty[]).forEach((diff) => {
      const secName = diffSections[diff];
      if (secName && sectionLines[secName]) {
        parsedCharts[diff] = parseSectionNotes(secName, diff);
      }
    });

    // 5. Ensure all 4 difficulties exist via coherent downscaling
    const completeCharts = UniversalChartImporter.ensureAllDifficulties(parsedCharts, tempoPoints[0].bpm);

    const validation = UniversalChartImporter.validateChart(completeCharts);

    return {
      metadata: {
        name,
        artist,
        charter,
        offsetSec,
        resolution,
        instrumentTrack: chosenInstrument,
        sourceFormat: '.chart'
      },
      charts: completeCharts,
      validation
    };
  }

  /**
   * Parses a Standard MIDI File (.mid / .midi)
   */
  public static parseMidiFile(midiBuffer: ArrayBuffer | Uint8Array): UniversalChartResult {
    const parsedMidi = MidiChartParser.parse(midiBuffer);

    const completeCharts = UniversalChartImporter.ensureAllDifficulties(
      {
        EASY: parsedMidi.EASY,
        MEDIUM: parsedMidi.MEDIUM,
        HARD: parsedMidi.HARD,
        EXPERT: parsedMidi.EXPERT
      },
      parsedMidi.bpm
    );

    const validation = UniversalChartImporter.validateChart(completeCharts);

    return {
      metadata: {
        name: 'Música MIDI Importada',
        artist: 'Banda RockBrazil',
        charter: 'Comunidade MIDI',
        offsetSec: 0,
        resolution: 480,
        instrumentTrack: 'guitar',
        sourceFormat: '.mid'
      },
      charts: completeCharts,
      validation
    };
  }

  /**
   * Processes an uploaded .zip archive (containing .chart or notes.mid)
   */
  public static async parseZipPackage(buffer: ArrayBuffer | Uint8Array): Promise<UniversalChartResult> {
    const zip = await JSZip.loadAsync(buffer);

    let chartFile: JSZip.JSZipObject | null = null;
    let midiFile: JSZip.JSZipObject | null = null;
    let iniFile: JSZip.JSZipObject | null = null;

    zip.forEach((path, entry) => {
      const lower = path.toLowerCase();
      if (!entry.dir) {
        if (lower.endsWith('.chart')) {
          chartFile = entry;
        } else if (lower.endsWith('notes.mid') || lower.endsWith('.mid') || lower.endsWith('.midi')) {
          midiFile = entry;
        } else if (lower.endsWith('song.ini')) {
          iniFile = entry;
        }
      }
    });

    let iniMeta: { name?: string; artist?: string; charter?: string } = {};
    if (iniFile) {
      const iniText = await (iniFile as JSZip.JSZipObject).async('text');
      iniMeta = MidiChartParser.parseSongIni(iniText);
    }

    if (chartFile) {
      const chartText = await (chartFile as JSZip.JSZipObject).async('text');
      const result = UniversalChartImporter.parseChartText(chartText);
      result.metadata.sourceFormat = '.zip';
      if (iniMeta.name) result.metadata.name = iniMeta.name;
      if (iniMeta.artist) result.metadata.artist = iniMeta.artist;
      if (iniMeta.charter) result.metadata.charter = iniMeta.charter;
      return result;
    }

    if (midiFile) {
      const midiData = await (midiFile as JSZip.JSZipObject).async('uint8array');
      const result = UniversalChartImporter.parseMidiFile(midiData);
      result.metadata.sourceFormat = '.zip';
      if (iniMeta.name) result.metadata.name = iniMeta.name;
      if (iniMeta.artist) result.metadata.artist = iniMeta.artist;
      if (iniMeta.charter) result.metadata.charter = iniMeta.charter;
      return result;
    }

    throw new Error('Nenhum arquivo de notas (.chart ou notes.mid) encontrado dentro do pacote ZIP.');
  }

  /**
   * Parses SNG file containers
   */
  public static async parseSngContainer(data: ArrayBuffer | Uint8Array): Promise<UniversalChartResult> {
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);

    // Look for embedded .chart or .mid magic within SNG stream
    // 1. Check for text "[Song]" or "[SyncTrack]"
    const textChunk = new TextDecoder('utf-8', { fatal: false }).decode(uint8.subarray(0, Math.min(uint8.length, 65536)));
    if (textChunk.includes('[Song]') || textChunk.includes('[SyncTrack]')) {
      const fullText = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
      const result = UniversalChartImporter.parseChartText(fullText);
      result.metadata.sourceFormat = '.sng';
      return result;
    }

    // 2. Check for MIDI 'MThd'
    for (let i = 0; i < uint8.length - 4; i++) {
      if (
        uint8[i] === 0x4D &&
        uint8[i + 1] === 0x54 &&
        uint8[i + 2] === 0x68 &&
        uint8[i + 3] === 0x64
      ) {
        const midiSub = uint8.subarray(i);
        const result = UniversalChartImporter.parseMidiFile(midiSub);
        result.metadata.sourceFormat = '.sng';
        return result;
      }
    }

    throw new Error('Não foi possível extrair dados musicais do formato SNG.');
  }

  /**
   * Universal autodetection import entry point
   */
  public static async importFromRawData(
    data: ArrayBuffer | Uint8Array | string,
    filename: string = 'chart'
  ): Promise<UniversalChartResult> {
    if (typeof data === 'string') {
      return UniversalChartImporter.parseChartText(data);
    }

    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const lowerName = filename.toLowerCase();

    // Check ZIP magic: PK\x03\x04
    if (uint8.length >= 4 && uint8[0] === 0x50 && uint8[1] === 0x4B && uint8[2] === 0x03 && uint8[3] === 0x04) {
      return UniversalChartImporter.parseZipPackage(uint8);
    }

    // Check MIDI magic: MThd
    if (uint8.length >= 4 && uint8[0] === 0x4D && uint8[1] === 0x54 && uint8[2] === 0x68 && uint8[3] === 0x64) {
      return UniversalChartImporter.parseMidiFile(uint8);
    }

    // Check .chart or text format
    if (lowerName.endsWith('.chart') || lowerName.endsWith('.txt')) {
      const text = new TextDecoder('utf-8').decode(uint8);
      return UniversalChartImporter.parseChartText(text);
    }

    // Check .sng format
    if (lowerName.endsWith('.sng')) {
      return UniversalChartImporter.parseSngContainer(uint8);
    }

    // Fallback: try decoding as text first
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(uint8);
      if (text.includes('[Song]') || text.includes('[SyncTrack]')) {
        return UniversalChartImporter.parseChartText(text);
      }
    } catch {
      // not utf-8 text
    }

    // Final attempt: check if ZIP
    try {
      return await UniversalChartImporter.parseZipPackage(uint8);
    } catch {
      // not zip
    }

    throw new Error(`Formato de arquivo "${filename}" não reconhecido ou incompatível.`);
  }

  /**
   * Ensures all 4 difficulties (EASY, MEDIUM, HARD, EXPERT) exist.
   * If some difficulties are missing, generates downscaled adaptations
   * strictly from the existing note events (NO random notes!).
   */
  public static ensureAllDifficulties(
    charts: Partial<BeatmapByDifficulty>,
    bpm: number = 120
  ): BeatmapByDifficulty {
    const baseSource =
      (charts.EXPERT && charts.EXPERT.length > 0 ? charts.EXPERT : null) ||
      (charts.HARD && charts.HARD.length > 0 ? charts.HARD : null) ||
      (charts.MEDIUM && charts.MEDIUM.length > 0 ? charts.MEDIUM : null) ||
      (charts.EASY && charts.EASY.length > 0 ? charts.EASY : null) ||
      [];

    const beatInterval = 60 / bpm;

    // 1. EXPERT
    const expert: Note[] =
      charts.EXPERT && charts.EXPERT.length > 0
        ? charts.EXPERT.map((n) => ({ ...n }))
        : baseSource.map((n) => ({ ...n }));

    // 2. HARD (5 lanes: lanes 0-4, downscale rapid 16th/32nd shreds)
    let hard: Note[];
    if (charts.HARD && charts.HARD.length > 0) {
      hard = charts.HARD.map((n) => ({ ...n }));
    } else {
      let lastTime = -999;
      const minInterval = beatInterval * 0.22; // filter faster than 16th note bursts
      hard = expert
        .filter((n, idx) => {
          if (idx === 0) {
            lastTime = n.time;
            return true;
          }
          if (n.time === lastTime) return true; // keep chords
          if (n.time - lastTime >= minInterval) {
            lastTime = n.time;
            return true;
          }
          return false;
        })
        .map((n, i) => ({ ...n, id: i + 1 }));
    }

    // 3. MEDIUM (preserve authentic chart lanes if present)
    let medium: Note[];
    if (charts.MEDIUM && charts.MEDIUM.length > 0) {
      medium = charts.MEDIUM.map((n) => ({ ...n }));
    } else {
      const allowedLanes = getLanesForDifficulty('MEDIUM'); // [0, 1, 2, 3]
      let lastTime = -999;
      const minInterval = beatInterval * 0.45; // 8th note spacing
      const chordCounts = new Map<number, number>();

      medium = hard
        .filter((n) => {
          const count = chordCounts.get(n.time) || 0;
          if (count >= 2) return false; // max 2 notes per chord
          if (n.time !== lastTime && n.time - lastTime < minInterval) return false;
          chordCounts.set(n.time, count + 1);
          lastTime = n.time;
          return true;
        })
        .map((n, i) => {
          let lane = n.lane;
          if (!allowedLanes.includes(lane)) {
            lane = 3 as Lane;
          }
          return {
            ...n,
            id: i + 1,
            lane
          };
        });
    }

    // 4. EASY (preserve authentic chart lanes if present)
    let easy: Note[];
    if (charts.EASY && charts.EASY.length > 0) {
      easy = charts.EASY.map((n) => ({ ...n }));
    } else {
      const allowedLanes = getLanesForDifficulty('EASY'); // [0, 1, 2]
      let lastTime = -999;
      const minInterval = beatInterval * 0.9; // quarter note spacing

      easy = medium
        .filter((n) => {
          if (n.time === lastTime) return false; // single notes only
          if (n.time - lastTime >= minInterval) {
            lastTime = n.time;
            return true;
          }
          return false;
        })
        .map((n, i) => {
          let lane = n.lane;
          if (!allowedLanes.includes(lane)) {
            lane = (lane % 3) as Lane;
          }
          return {
            ...n,
            id: i + 1,
            lane,
            type: 'tap'
          };
        });
    }

    return {
      EASY: easy,
      MEDIUM: medium,
      HARD: hard,
      EXPERT: expert
    };
  }

  /**
   * Validates a chart's integrity and musical structure
   */
  public static validateChart(charts: BeatmapByDifficulty): ChartValidationResult {
    const errors: string[] = [];
    let hasChords = false;
    let hasSustains = false;
    let maxSongTime = 0;

    const difficulties: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
    const noteCounts: Record<Difficulty, number> = {
      EASY: 0,
      MEDIUM: 0,
      HARD: 0,
      EXPERT: 0
    };

    for (const diff of difficulties) {
      const notes = charts[diff] || [];
      noteCounts[diff] = notes.length;
      const allowedLanes = getLanesForDifficulty(diff);

      if (notes.length === 0) {
        errors.push(`Dificuldade ${diff} está vazia.`);
      }

      for (let i = 0; i < notes.length; i++) {
        const cur = notes[i];
        if (cur.time > maxSongTime) maxSongTime = cur.time;

        if (cur.duration > 0) hasSustains = true;
        if (cur.type === 'chord') hasChords = true;

        if (!allowedLanes.includes(cur.lane)) {
          errors.push(`Nota ID ${cur.id} em ${diff} usa pista inválida (${cur.lane}).`);
        }

        if (i > 0) {
          const prev = notes[i - 1];
          if (cur.time < prev.time) {
            errors.push(`Notas fora de ordem cronológica em ${diff} (tempo ${cur.time} < ${prev.time}).`);
          } else if (cur.time === prev.time) {
            hasChords = true;
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      noteCounts,
      hasChords,
      hasSustains,
      durationSec: Number(maxSongTime.toFixed(1))
    };
  }

  /**
   * Pre-converted real community charts registry for high-profile songs
   */
  private static readonly CONVERTED_REGISTRY: Map<string, BeatmapByDifficulty> = new Map();

  public static registerConvertedChart(songId: string, chart: BeatmapByDifficulty): void {
    this.CONVERTED_REGISTRY.set(songId, chart);
  }

  public static getConvertedChart(songId: string): BeatmapByDifficulty | undefined {
    return (
      REAL_COMMUNITY_CHARTS[songId] ||
      LISARB2_COMMUNITY_CHARTS[songId] ||
      this.CONVERTED_REGISTRY.get(songId)
    );
  }

  public static hasConvertedChart(songId: string): boolean {
    return (
      !!REAL_COMMUNITY_CHARTS[songId] ||
      !!LISARB2_COMMUNITY_CHARTS[songId] ||
      this.CONVERTED_REGISTRY.has(songId)
    );
  }
}
