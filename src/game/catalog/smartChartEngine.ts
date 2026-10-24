import { Note, Lane, Difficulty, BeatmapByDifficulty } from '../../types';

export class SmartChartEngine {
  /**
   * Generates a complete set of difficulty beatmaps (EASY, MEDIUM, HARD, EXPERT)
   * synchronized to the song's BPM and musical structure with Guitar-First prioritization.
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
   * Deterministic pseudo-random number generator for reproducible musical charts
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

    // 1 bar lead-in for player setup
    const startTime = Math.max(1.5, barInterval);
    const endTime = Math.max(startTime + 10, durationSec - 2.0);

    let currentTime = startTime;
    let barIndex = 0;

    const addNote = (
      time: number,
      lane: Lane,
      dur = 0,
      instrument: 'guitar' | 'bass' | 'drums' = 'guitar',
      chordType: 'tap' | 'hold' | 'chord' = dur > 0 ? 'hold' : 'tap'
    ) => {
      const timeMs = Math.round(time * 1000);
      const durationMs = Math.round(dur * 1000);
      notes.push({
        id: noteId++,
        time: Number(time.toFixed(3)),
        lane,
        duration: Number(dur.toFixed(3)),
        hit: false,
        missed: false,
        sustainCompleted: false,
        sustainHeldTime: 0,
        timeMs,
        durationMs,
        type: chordType,
        sourceInstrument: instrument,
        sourceEventId: `${songId}-${difficulty.toLowerCase()}-${noteId}`
      });
    };

    const addChord = (
      time: number,
      chordLanes: Lane[],
      dur = 0,
      instrument: 'guitar' | 'bass' | 'drums' = 'guitar'
    ) => {
      chordLanes.forEach((l) => addNote(time, l, dur, instrument, 'chord'));
    };

    while (currentTime < endTime) {
      // 8-bar musical phrase cycle:
      // Bars 0-3: Verse / Riff pattern
      // Bars 4-6: Chorus / Driving chords
      // Bar 7: Turnaround / Drum-bass fill
      const barInPhrase = barIndex % 8;
      const isChorus = barInPhrase >= 4 && barInPhrase <= 6;
      const isFill = barInPhrase === 7;

      if (difficulty === 'EASY') {
        // EASY: Focus on main guitar downbeats, half notes and quarter notes
        // lanes 0, 1, 2 only. Generous breathing room between phrases.
        const riffLane = Math.floor(rand() * 3) as Lane;
        const secondLane = ((riffLane + 1) % 3) as Lane;

        if (isFill) {
          // Bass groove marker in turnaround (15% bass presence)
          const fillTime = currentTime;
          if (fillTime < endTime) addNote(fillTime, 0, 0, 'bass');
          const fillTime2 = currentTime + 2 * beatInterval;
          if (fillTime2 < endTime) addNote(fillTime2, 1, 0, 'bass');
        } else if (isChorus) {
          // Chorus: Quarter notes on beats 0, 1, 2
          for (let beat = 0; beat < 3; beat++) {
            const t = currentTime + beat * beatInterval;
            if (t >= endTime) break;
            const l = beat === 0 ? riffLane : secondLane;
            const isSustain = beat === 2 && rand() > 0.5;
            addNote(t, l, isSustain ? beatInterval * 1.5 : 0, 'guitar');
          }
        } else {
          // Verse: Root notes on beat 0 and beat 2
          const t0 = currentTime;
          if (t0 < endTime) addNote(t0, riffLane, 0, 'guitar');

          const t2 = currentTime + 2 * beatInterval;
          if (t2 < endTime) {
            const isSustain = rand() > 0.6;
            addNote(t2, secondLane, isSustain ? beatInterval * 1.2 : 0, 'guitar');
          }
        }
      } else if (difficulty === 'MEDIUM') {
        // MEDIUM: Independent rhythm guitar chart with syncopated 8th notes & 2-note power chords
        // Uses lanes 0, 1, 2, 3. NOT Easy + blue!
        const baseLane = Math.floor(rand() * 3) as Lane;
        const chordLanes: Lane[] = [baseLane, (baseLane + 1) as Lane];

        if (isFill) {
          // 15% drums fill across lanes on the last bar
          for (let step = 0; step < 4; step++) {
            const ft = currentTime + step * beatInterval;
            if (ft >= endTime) break;
            const fillLane = (step % 4) as Lane;
            addNote(ft, fillLane, 0, 'drums');
          }
        } else if (isChorus) {
          // Driving rock power chord on beat 0, syncopated strumming on offbeats (8th notes)
          addChord(currentTime, chordLanes, beatInterval * 0.75, 'guitar');

          // Syncopated strum pattern on 1.5, 2.5, 3.0
          const strumPattern = [1.5, 2.5, 3.0];
          for (const beatOffset of strumPattern) {
            const t = currentTime + beatOffset * beatInterval;
            if (t >= endTime) break;
            const strumLane = lanes[Math.floor(rand() * lanes.length)];
            addNote(t, strumLane, 0, 'guitar');
          }
        } else {
          // Verse: Rhythmic syncopation (downbeat + 8th-note offbeats)
          // Beat 0: riff anchor note
          addNote(currentTime, lanes[baseLane], 0, 'guitar');

          // Offbeat syncopations at 0.5 and 1.5
          if (rand() > 0.3) {
            const tOff1 = currentTime + 0.5 * beatInterval;
            if (tOff1 < endTime) addNote(tOff1, lanes[(baseLane + 1) % 4], 0, 'guitar');
          }

          // Beat 2: power chord or sustain
          const t2 = currentTime + 2 * beatInterval;
          if (t2 < endTime) {
            if (rand() > 0.5) {
              addChord(t2, [lanes[0], lanes[1]], beatInterval * 0.8, 'guitar');
            } else {
              addNote(t2, lanes[(baseLane + 2) % 4], beatInterval * 1.0, 'guitar');
            }
          }

          // Beat 3.5: pickup note to next bar
          if (rand() > 0.4) {
            const tPickup = currentTime + 3.5 * beatInterval;
            if (tPickup < endTime) addNote(tPickup, lanes[baseLane], 0, 'guitar');
          }
        }
      } else {
        // HARD & EXPERT: Technical lead guitar riffs, fast 16th-note shred bursts, chords across all 5 lanes
        const isExpert = difficulty === 'EXPERT';

        if (isFill) {
          // Intense turnaround fill (guitar lead flourish + drums)
          for (let step = 0; step < 6; step++) {
            const ft = currentTime + step * (beatInterval * 0.5);
            if (ft >= endTime) break;
            const fillLane = (step % 5) as Lane;
            addNote(ft, fillLane, 0, step >= 4 ? 'drums' : 'guitar');
          }
        } else if (isChorus) {
          // Full 2-note or 3-note power chords on downbeats
          const chordLanes: Lane[] = [0, 1];
          if (isExpert && rand() > 0.4) chordLanes.push(2);
          addChord(currentTime, chordLanes, beatInterval * 0.7, 'guitar');

          // Rapid 16th-note guitar strumming and lead accents
          const subBeats = [0.75, 1.25, 1.5, 2.0, 2.5, 3.0, 3.5];
          for (const sb of subBeats) {
            const t = currentTime + sb * beatInterval;
            if (t >= endTime) break;
            const l = Math.floor(rand() * 5) as Lane;
            addNote(t, l, sb === 2.0 && rand() > 0.6 ? beatInterval * 0.8 : 0, 'guitar');
          }
        } else {
          // Verse: Melodic lead riff with 16th-note bursts
          const startLane = Math.floor(rand() * 4) as Lane;
          addNote(currentTime, startLane, 0, 'guitar');

          // 8th and 16th note guitar shred runs
          const notesInBar = isExpert ? 6 : 5;
          for (let i = 1; i < notesInBar; i++) {
            const t = currentTime + (i * beatInterval * (4 / notesInBar));
            if (t >= endTime) break;
            const l = ((startLane + i) % 5) as Lane;
            const isHold = i === notesInBar - 1 && rand() > 0.6;
            addNote(t, l, isHold ? beatInterval * 1.5 : 0, 'guitar');
          }

          // Shred burst on beat 3.5
          if (rand() > 0.4) {
            const shredTime = currentTime + 3.5 * beatInterval;
            if (shredTime < endTime) {
              addNote(shredTime, ((startLane + 2) % 5) as Lane, 0, 'guitar');
              if (shredTime + beatInterval * 0.25 < endTime) {
                addNote(shredTime + beatInterval * 0.25, ((startLane + 3) % 5) as Lane, 0, 'guitar');
              }
            }
          }
        }
      }

      currentTime += barInterval;
      barIndex++;
    }

    // Sort chronologically and deduplicate exact timestamp+lane collisions
    notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
    const uniqueNotes: Note[] = [];
    for (const n of notes) {
      const prev = uniqueNotes[uniqueNotes.length - 1];
      if (prev && Math.abs(prev.time - n.time) < 0.015 && prev.lane === n.lane) {
        continue; // skip duplicate note on exact same lane and timestamp
      }
      uniqueNotes.push(n);
    }

    // Re-index IDs sequentially
    uniqueNotes.forEach((n, idx) => {
      n.id = idx + 1;
      n.sourceEventId = `${songId}-${difficulty.toLowerCase()}-${n.id}`;
    });

    return uniqueNotes;
  }
}
