import { Note, Lane, Difficulty, BeatmapByDifficulty } from '../../types';

export class SmartChartEngine {
  /**
   * Generates a complete set of difficulty beatmaps (EASY, MEDIUM, HARD, EXPERT)
   * synchronized to the song's BPM and musical structure.
   */
  static generateChartsForSong(
    songId: string,
    bpm: number,
    durationSec: number
  ): BeatmapByDifficulty {
    return {
      EASY: this.generateDifficultyMap(songId, bpm, durationSec, 'EASY'),
      MEDIUM: this.generateDifficultyMap(songId, bpm, durationSec, 'MEDIUM'),
      HARD: this.generateDifficultyMap(songId, bpm, durationSec, 'HARD'),
      EXPERT: this.generateDifficultyMap(songId, bpm, durationSec, 'EXPERT')
    };
  }

  /**
   * Deterministic pseudo-random number generator for consistent musical charts
   */
  private static seededRandom(seed: number): () => number {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  private static stringSeed(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) + 12345;
  }

  private static generateDifficultyMap(
    songId: string,
    bpm: number,
    durationSec: number,
    difficulty: Difficulty
  ): Note[] {
    const seed = this.stringSeed(`${songId}_${difficulty}_${bpm}`);
    const rand = this.seededRandom(seed);

    const notes: Note[] = [];
    let noteId = 1;

    const beatInterval = 60 / bpm; // seconds per beat
    const barInterval = beatInterval * 4; // seconds per 4/4 bar

    // Available lanes per difficulty
    const lanes: Lane[] =
      difficulty === 'EASY'
        ? [0, 1, 2]
        : difficulty === 'MEDIUM'
        ? [0, 1, 2, 3]
        : [0, 1, 2, 3, 4];

    // Starting offset - give 1 bar lead-in
    const startTime = Math.max(1.5, barInterval);
    const endTime = Math.max(startTime + 10, durationSec - 2.0);

    let currentTime = startTime;
    let barIndex = 0;

    const addNote = (time: number, lane: Lane, dur = 0) => {
      notes.push({
        id: noteId++,
        time: Number(time.toFixed(3)),
        lane,
        duration: Number(dur.toFixed(3)),
        hit: false,
        missed: false,
        sustainCompleted: false,
        sustainHeldTime: 0
      });
    };

    const addChord = (time: number, chordLanes: Lane[], dur = 0) => {
      chordLanes.forEach((l) => addNote(time, l, dur));
    };

    while (currentTime < endTime) {
      // Determine musical section in an 8-bar cycle:
      // Bars 0-3: Verse / Riff pattern
      // Bars 4-6: Chorus / Driving chords
      // Bar 7: Fill / Turnaround
      const barInPhrase = barIndex % 8;
      const isChorus = barInPhrase >= 4 && barInPhrase <= 6;
      const isFill = barInPhrase === 7;

      if (difficulty === 'EASY') {
        // EASY: Focus on quarter notes, downbeats, gentle pace
        for (let beat = 0; beat < 4; beat++) {
          const t = currentTime + beat * beatInterval;
          if (t >= endTime) break;

          // In easy, play on beats 0 and 2, or every beat in chorus
          if (beat === 0 || beat === 2 || (isChorus && rand() > 0.3)) {
            const lane = lanes[Math.floor(rand() * lanes.length)];
            // Occasional sustain note
            const isSustain = rand() > 0.8;
            const dur = isSustain ? beatInterval * 1.5 : 0;
            addNote(t, lane, dur);
          }
        }
      } else if (difficulty === 'MEDIUM') {
        // MEDIUM: 8th notes, syncopation, 2-note power chords, guitar riffs
        for (let beat = 0; beat < 4; beat++) {
          const t = currentTime + beat * beatInterval;
          if (t >= endTime) break;

          if (isChorus && beat === 0) {
            // Power chord on downbeat of chorus
            const l1 = lanes[0];
            const l2 = lanes[1];
            addChord(t, [l1, l2], beatInterval * 0.8);
          } else {
            // Note on main beat
            const lane = lanes[Math.floor(rand() * lanes.length)];
            const isSustain = beat === 3 && rand() > 0.6;
            addNote(t, lane, isSustain ? beatInterval * 1.2 : 0);

            // Possible off-beat (8th note)
            if (rand() > 0.45 && !isSustain) {
              const offTime = t + beatInterval * 0.5;
              if (offTime < endTime) {
                const nextLane = lanes[Math.floor(rand() * lanes.length)];
                addNote(offTime, nextLane, 0);
              }
            }
          }
        }

        // Fill bar at end of phrase
        if (isFill && rand() > 0.4) {
          const fillTime = currentTime + 3 * beatInterval;
          if (fillTime < endTime) {
            addNote(fillTime + beatInterval * 0.25, lanes[1], 0);
            addNote(fillTime + beatInterval * 0.5, lanes[2], 0);
            addNote(fillTime + beatInterval * 0.75, lanes[lanes.length - 1], 0);
          }
        }
      } else {
        // HARD / EXPERT: Technical guitar riffs, rapid 16th bursts, chords, solos
        for (let beat = 0; beat < 4; beat++) {
          const t = currentTime + beat * beatInterval;
          if (t >= endTime) break;

          if (isChorus && (beat === 0 || beat === 2)) {
            // 2-note or 3-note power chord
            const baseLane = Math.floor(rand() * (lanes.length - 1));
            const chordLanes: Lane[] = [lanes[baseLane], lanes[baseLane + 1]];
            if (difficulty === 'EXPERT' && baseLane + 2 < lanes.length && rand() > 0.5) {
              chordLanes.push(lanes[baseLane + 2]);
            }
            addChord(t, chordLanes, beatInterval * 0.7);
          } else {
            const lane = lanes[Math.floor(rand() * lanes.length)];
            const isLongSolo = beat === 0 && rand() > 0.75;
            addNote(t, lane, isLongSolo ? beatInterval * 2.5 : 0);

            if (!isLongSolo) {
              // 8th note
              const offTime = t + beatInterval * 0.5;
              if (offTime < endTime) {
                const offLane = lanes[Math.floor(rand() * lanes.length)];
                addNote(offTime, offLane, 0);

                // 16th note guitar riff / shred bursts
                if ((isChorus || isFill || difficulty === 'EXPERT') && rand() > 0.55) {
                  const sixteenth1 = t + beatInterval * 0.25;
                  const sixteenth2 = t + beatInterval * 0.75;
                  if (sixteenth1 < endTime) addNote(sixteenth1, lanes[(lane + 1) % lanes.length], 0);
                  if (sixteenth2 < endTime) addNote(sixteenth2, lanes[(lane + 2) % lanes.length], 0);
                }
              }
            }
          }
        }
      }

      currentTime += barInterval;
      barIndex++;
    }

    // Sort notes chronologically and ensure unique IDs
    notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
    notes.forEach((n, idx) => {
      n.id = idx + 1;
    });

    return notes;
  }
}
