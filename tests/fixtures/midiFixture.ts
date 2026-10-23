/**
 * Synthetic MIDI Chart Generator & Fixture for RockBand / Clone Hero format
 * Independent of any commercial song or external copyright.
 */
import * as fs from 'fs';
import * as path from 'path';

function encodeVarLen(value: number): number[] {
  const bytes = [value & 0x7f];
  let v = value;
  while ((v >>= 7) > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
  }
  return bytes;
}

export interface SyntheticChartConfig {
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  expertCount: number;
  bpm: number;
  division: number;
}

export const DEFAULT_SYNTHETIC_CONFIG: SyntheticChartConfig = {
  easyCount: 12,
  mediumCount: 24,
  hardCount: 36,
  expertCount: 48,
  bpm: 120,
  division: 480
};

export function createSyntheticMidiBuffer(config: SyntheticChartConfig = DEFAULT_SYNTHETIC_CONFIG): Uint8Array {
  const { easyCount, mediumCount, hardCount, expertCount, bpm, division } = config;
  const usPerBeat = Math.round(60000000 / bpm);

  // --- Track 0: Tempo track ---
  const trk0Data: number[] = [];
  // Meta: Track Name = "TEMPO MAP"
  trk0Data.push(0x00, 0xff, 0x03, 0x09);
  for (const c of 'TEMPO MAP') trk0Data.push(c.charCodeAt(0));
  // Meta: Set Tempo (0xFF 0x51 0x03 usPerBeat)
  trk0Data.push(0x00, 0xff, 0x51, 0x03);
  trk0Data.push((usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff);
  // Meta: End of Track
  trk0Data.push(0x00, 0xff, 0x2f, 0x00);

  // --- Track 1: PART GUITAR ---
  const trk1Events: { tick: number; type: 'on' | 'off'; pitch: number }[] = [];

  const addDifficultyNotes = (count: number, basePitch: number, maxLanes: number) => {
    // Generate notes at regular intervals (e.g. every beat = 480 ticks)
    for (let i = 0; i < count; i++) {
      const lane = i % maxLanes;
      const pitch = basePitch + lane;
      const startTick = (i + 1) * division; // starts at tick 480
      // Every 3rd note has sustain ribbon (480 ticks long)
      const durationTicks = i % 3 === 0 ? division : Math.round(division * 0.1);

      trk1Events.push({ tick: startTick, type: 'on', pitch });
      trk1Events.push({ tick: startTick + durationTicks, type: 'off', pitch });
    }
  };

  // EASY (basePitch 60, lanes 0..2)
  addDifficultyNotes(easyCount, 60, 3);
  // MEDIUM (basePitch 72, lanes 0..3)
  addDifficultyNotes(mediumCount, 72, 4);
  // HARD (basePitch 84, lanes 0..4)
  addDifficultyNotes(hardCount, 84, 5);
  // EXPERT (basePitch 96, lanes 0..4)
  addDifficultyNotes(expertCount, 96, 5);

  // Sort events chronologically. For same tick, 'off' comes before 'on' to prevent overlap
  trk1Events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.type !== b.type) return a.type === 'off' ? -1 : 1;
    return a.pitch - b.pitch;
  });

  const trk1Data: number[] = [];
  // Meta: Track Name = "PART GUITAR"
  trk1Data.push(0x00, 0xff, 0x03, 0x0b);
  for (const c of 'PART GUITAR') trk1Data.push(c.charCodeAt(0));

  let lastTick = 0;
  for (const ev of trk1Events) {
    const delta = ev.tick - lastTick;
    trk1Data.push(...encodeVarLen(delta));
    lastTick = ev.tick;

    if (ev.type === 'on') {
      trk1Data.push(0x90, ev.pitch, 0x64);
    } else {
      trk1Data.push(0x80, ev.pitch, 0x00);
    }
  }

  // Meta: End of Track
  trk1Data.push(0x00, 0xff, 0x2f, 0x00);

  // --- Assemble full MIDI file ---
  // Header: MThd, len=6, format=1, ntracks=2, division
  const totalLength = 14 + (8 + trk0Data.length) + (8 + trk1Data.length);
  const buffer = new Uint8Array(totalLength);
  let p = 0;

  // Header MThd
  buffer.set([0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x01, 0x00, 0x02], p);
  p += 12;
  buffer[p++] = (division >> 8) & 0xff;
  buffer[p++] = division & 0xff;

  // Track 0
  buffer.set([0x4d, 0x54, 0x72, 0x6b], p);
  p += 4;
  buffer[p++] = (trk0Data.length >> 24) & 0xff;
  buffer[p++] = (trk0Data.length >> 16) & 0xff;
  buffer[p++] = (trk0Data.length >> 8) & 0xff;
  buffer[p++] = trk0Data.length & 0xff;
  buffer.set(trk0Data, p);
  p += trk0Data.length;

  // Track 1
  buffer.set([0x4d, 0x54, 0x72, 0x6b], p);
  p += 4;
  buffer[p++] = (trk1Data.length >> 24) & 0xff;
  buffer[p++] = (trk1Data.length >> 16) & 0xff;
  buffer[p++] = (trk1Data.length >> 8) & 0xff;
  buffer[p++] = trk1Data.length & 0xff;
  buffer.set(trk1Data, p);
  p += trk1Data.length;

  return buffer;
}

/**
 * Creates static fixture files on disk in tests/fixtures/
 */
export function ensureFixtureFilesExist(): { midiPath: string; iniPath: string } {
  const fixturesDir = path.resolve(__dirname, '../../tests/fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  const midiPath = path.join(fixturesDir, 'synthetic_chart.mid');
  const iniPath = path.join(fixturesDir, 'song.ini');

  if (!fs.existsSync(midiPath)) {
    const bytes = createSyntheticMidiBuffer();
    fs.writeFileSync(midiPath, Buffer.from(bytes));
  }

  if (!fs.existsSync(iniPath)) {
    const iniContent = `[song]
name = Synthetic Rock Test
artist = RockBrazil Engine
charter = RockBrazil Core
bpm = 120
genre = Rock
year = 2026
`;
    fs.writeFileSync(iniPath, iniContent, 'utf-8');
  }

  return { midiPath, iniPath };
}
