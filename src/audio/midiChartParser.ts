import { Note, Lane, Difficulty } from '../types';

export interface MidiParsedCharts {
  EASY: Note[];
  MEDIUM: Note[];
  HARD: Note[];
  EXPERT: Note[];
  bpm: number;
  duration: number;
  tempoMap: { tick: number; usPerBeat: number; bpm: number }[];
}

export class MidiChartParser {
  /**
   * Helper to read variable-length quantity in standard MIDI
   */
  private static readVarLen(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
    let value = 0;
    let bytesRead = 0;
    while (offset + bytesRead < data.length) {
      const byte = data[offset + bytesRead];
      bytesRead++;
      value = (value << 7) | (byte & 0x7F);
      if ((byte & 0x80) === 0) break;
    }
    return { value, bytesRead };
  }

  /**
   * Parses a Standard MIDI File (SMF format 0 or 1) representing a Guitar Hero / Rock Band / Clone Hero chart
   */
  public static parse(midiBuffer: ArrayBuffer | Uint8Array): MidiParsedCharts {
    const data = midiBuffer instanceof Uint8Array ? midiBuffer : new Uint8Array(midiBuffer);

    if (data.length < 14) {
      throw new Error('Arquivo MIDI inválido ou corrompido.');
    }

    // Verify 'MThd' header
    const headerStr = String.fromCharCode(data[0], data[1], data[2], data[3]);
    if (headerStr !== 'MThd') {
      throw new Error('Cabeçalho MIDI MThd não encontrado.');
    }

    const numTracks = (data[10] << 8) | data[11];
    const division = (data[12] << 8) | data[13]; // ticks per quarter note

    let offset = 14;
    const tracks: { name: string; data: Uint8Array }[] = [];

    // Parse all track chunks
    for (let t = 0; t < numTracks && offset + 8 <= data.length; t++) {
      const trackLength =
        (data[offset + 4] << 24) |
        (data[offset + 5] << 16) |
        (data[offset + 6] << 8) |
        data[offset + 7];

      const trackData = data.subarray(offset + 8, offset + 8 + trackLength);

      // Inspect Track Name from Meta Event 0xFF 0x03
      let trackName = `Track_${t}`;
      for (let i = 0; i < trackData.length - 4; i++) {
        if (trackData[i] === 0xFF && trackData[i + 1] === 0x03) {
          const strLen = trackData[i + 2];
          if (i + 3 + strLen <= trackData.length) {
            trackName = new TextDecoder().decode(trackData.subarray(i + 3, i + 3 + strLen));
          }
          break;
        }
      }

      tracks.push({ name: trackName.trim(), data: trackData });
      offset += 8 + trackLength;
    }

    // 1. Build Tempo Map from Tempo Events (Meta Event 0x51 in any track, typically Track 0)
    const tempoMap: { tick: number; usPerBeat: number; bpm: number }[] = [];

    for (const track of tracks) {
      let curTick = 0;
      let p = 0;
      let runningStatus = 0;
      const td = track.data;

      while (p < td.length) {
        const delta = MidiChartParser.readVarLen(td, p);
        p += delta.bytesRead;
        curTick += delta.value;

        if (p >= td.length) break;

        let eventType = td[p];
        if (eventType < 0x80) {
          eventType = runningStatus;
        } else {
          p++;
          runningStatus = eventType;
        }

        if (eventType === 0xFF) {
          const metaType = td[p++];
          const metaLen = MidiChartParser.readVarLen(td, p);
          p += metaLen.bytesRead;
          const metaData = td.subarray(p, p + metaLen.value);
          p += metaLen.value;

          if (metaType === 0x51 && metaData.length >= 3) {
            const usPerBeat = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
            const bpm = 60000000 / usPerBeat;
            tempoMap.push({ tick: curTick, usPerBeat, bpm });
          }
        } else if ((eventType & 0xF0) === 0x80 || (eventType & 0xF0) === 0x90 || (eventType & 0xF0) === 0xA0 || (eventType & 0xF0) === 0xB0 || (eventType & 0xF0) === 0xE0) {
          p += 2;
        } else if ((eventType & 0xF0) === 0xC0 || (eventType & 0xF0) === 0xD0) {
          p += 1;
        }
      }
    }

    // Sort tempo events by tick
    tempoMap.sort((a, b) => a.tick - b.tick);
    if (tempoMap.length === 0) {
      tempoMap.push({ tick: 0, usPerBeat: 500000, bpm: 120 });
    }

    // Conversion helper: tick -> seconds
    const tickToSeconds = (tick: number): number => {
      let seconds = 0;
      let lastTick = 0;
      let lastUsPerBeat = tempoMap[0].usPerBeat;

      for (let i = 0; i < tempoMap.length; i++) {
        const t = tempoMap[i];
        if (tick <= t.tick) break;
        const deltaTicks = t.tick - lastTick;
        seconds += (deltaTicks / division) * (lastUsPerBeat / 1000000);
        lastTick = t.tick;
        lastUsPerBeat = t.usPerBeat;
      }

      const remainingTicks = tick - lastTick;
      seconds += (remainingTicks / division) * (lastUsPerBeat / 1000000);
      return seconds;
    };

    // 2. Identify Guitar Track (e.g. 'PART GUITAR' or fallback with notes)
    let guitarTrack = tracks.find((t) => t.name.toUpperCase() === 'PART GUITAR');
    if (!guitarTrack) {
      guitarTrack = tracks.find((t) => t.name.toUpperCase().includes('GUITAR')) || tracks[tracks.length - 1];
    }

    if (!guitarTrack) {
      throw new Error('Nenhuma faixa de guitarra identificada no arquivo MIDI.');
    }

    const diffNotes: Record<Difficulty, Note[]> = {
      EASY: [],
      MEDIUM: [],
      HARD: [],
      EXPERT: []
    };

    let nextNoteId = 1;
    let curTick = 0;
    let p = 0;
    let runningStatus = 0;
    const gd = guitarTrack.data;

    // Active note-on map: pitch -> { startTick, lane, diff }
    const activeNotes = new Map<number, { startTick: number; lane: Lane; diff: Difficulty }>();
    let maxSongTime = 0;

    // Threshold for sustain ribbon: at least 1/8 beat in ticks
    const minSustainTicks = Math.round(division * 0.35);

    while (p < gd.length) {
      const delta = MidiChartParser.readVarLen(gd, p);
      p += delta.bytesRead;
      curTick += delta.value;

      if (p >= gd.length) break;

      let eventType = gd[p];
      if (eventType < 0x80) {
        eventType = runningStatus;
      } else {
        p++;
        runningStatus = eventType;
      }

      const statusNibble = eventType & 0xF0;

      if (eventType === 0xFF) {
        p++; // metaType
        const metaLen = MidiChartParser.readVarLen(gd, p);
        p += metaLen.bytesRead;
        p += metaLen.value;
      } else if (statusNibble === 0x90) {
        const pitch = gd[p++];
        const velocity = gd[p++];

        if (velocity > 0) {
          let diff: Difficulty | null = null;
          let lane: Lane | null = null;

          if (pitch >= 96 && pitch <= 100) {
            diff = 'EXPERT';
            lane = (pitch - 96) as Lane;
          } else if (pitch >= 84 && pitch <= 88) {
            diff = 'HARD';
            lane = (pitch - 84) as Lane;
          } else if (pitch >= 72 && pitch <= 76) {
            diff = 'MEDIUM';
            lane = (pitch - 72) as Lane;
          } else if (pitch >= 60 && pitch <= 64) {
            diff = 'EASY';
            lane = (pitch - 60) as Lane;
          }

          if (diff && lane !== null) {
            activeNotes.set(pitch, { startTick: curTick, lane, diff });
          }
        } else {
          // Velocity 0 is Note Off
          if (activeNotes.has(pitch)) {
            const item = activeNotes.get(pitch)!;
            activeNotes.delete(pitch);

            const startTime = tickToSeconds(item.startTick);
            const endTime = tickToSeconds(curTick);
            const durationTicks = curTick - item.startTick;
            const duration = durationTicks >= minSustainTicks ? endTime - startTime : 0;

            diffNotes[item.diff].push({
              id: nextNoteId++,
              time: Number(startTime.toFixed(3)),
              lane: item.lane,
              duration: Number(duration.toFixed(3)),
              hit: false,
              missed: false,
              sustainCompleted: false,
              sustainHeldTime: 0
            });

            if (endTime > maxSongTime) maxSongTime = endTime;
          }
        }
      } else if (statusNibble === 0x80) {
        const pitch = gd[p++];
        p++; // velocity

        if (activeNotes.has(pitch)) {
          const item = activeNotes.get(pitch)!;
          activeNotes.delete(pitch);

          const startTime = tickToSeconds(item.startTick);
          const endTime = tickToSeconds(curTick);
          const durationTicks = curTick - item.startTick;
          const duration = durationTicks >= minSustainTicks ? endTime - startTime : 0;

          diffNotes[item.diff].push({
            id: nextNoteId++,
            time: Number(startTime.toFixed(3)),
            lane: item.lane,
            duration: Number(duration.toFixed(3)),
            hit: false,
            missed: false,
            sustainCompleted: false,
            sustainHeldTime: 0
          });

          if (endTime > maxSongTime) maxSongTime = endTime;
        }
      } else if (statusNibble === 0xA0 || statusNibble === 0xB0 || statusNibble === 0xE0) {
        p += 2;
      } else if (statusNibble === 0xC0 || statusNibble === 0xD0) {
        p += 1;
      }
    }

    // Sort notes chronologically by time
    (['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as Difficulty[]).forEach((d) => {
      diffNotes[d].sort((a, b) => a.time - b.time || a.lane - b.lane);
    });

    const primaryBpm = tempoMap.length > 0 ? Math.round(tempoMap[0].bpm) : 124;

    return {
      EASY: diffNotes.EASY,
      MEDIUM: diffNotes.MEDIUM,
      HARD: diffNotes.HARD,
      EXPERT: diffNotes.EXPERT,
      bpm: primaryBpm,
      duration: Math.max(30, Number(maxSongTime.toFixed(1))),
      tempoMap
    };
  }

  /**
   * Parses song.ini file content to extract metadata
   */
  public static parseSongIni(iniText: string): Record<string, string> {
    const lines = iniText.split(/\r?\n/);
    const meta: Record<string, string> = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#') || trimmed.startsWith('[')) {
        continue;
      }
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
        const value = trimmed.slice(eqIdx + 1).trim();
        meta[key] = value;
      }
    }
    return meta;
  }
}
