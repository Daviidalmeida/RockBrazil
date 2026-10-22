import { Note, Lane } from '../types';

/**
 * Generates the synchronized rhythm chart for "Fúria Tropical"
 * Strictly aligned with the procedural Web Audio rock track
 */
export function generateBeatmap(): Note[] {
  const notes: Note[] = [];
  let id = 1;

  const bpm = 132;
  const b = 60 / bpm; // ~0.4545s per beat
  const m = b * 4;     // ~1.818s per measure

  const addNote = (time: number, lane: Lane, duration = 0) => {
    notes.push({
      id: id++,
      time: Number(time.toFixed(3)),
      lane,
      duration: Number(duration.toFixed(3)),
      hit: false,
      missed: false,
      sustainCompleted: false,
      sustainHeldTime: 0
    });
  };

  const addChord = (time: number, lanes: Lane[], duration = 0) => {
    lanes.forEach((lane) => addNote(time, lane, duration));
  };

  // ----------------------------------------------------
  // SECTION 1: INTRO (Bars 1 to 3) - 1.82s to 7.27s
  // ----------------------------------------------------
  for (let bar = 1; bar < 4; bar++) {
    const barT = bar * m;
    // Green root on beat 0
    addNote(barT, 0, 0);
    // Red on beat 2
    addNote(barT + b * 2, 1, 0);
    // Yellow on beat 3
    addNote(barT + b * 3, 2, 0);
  }

  // ----------------------------------------------------
  // SECTION 2: VERSE RIFF (Bars 4 to 11) - 7.27s to 21.82s
  // ----------------------------------------------------
  for (let bar = 4; bar < 12; bar++) {
    const barT = bar * m;

    if (bar % 2 === 0) {
      // Groove pattern A: Straight driving hits
      addNote(barT, 0, 0);
      addNote(barT + b * 1, 0, 0);
      addNote(barT + b * 2, 1, 0);
      addNote(barT + b * 3, 2, 0);
      // Offbeat syncopation
      addNote(barT + b * 3.5, 1, 0);
    } else {
      // Groove pattern B: Power Chord on beat 0 + syncopated fills
      addChord(barT, [0, 2], 0); // Green + Yellow chord!
      addNote(barT + b * 1.5, 1, 0);
      addNote(barT + b * 2, 2, 0);
      addNote(barT + b * 2.5, 3, 0);
      addChord(barT + b * 3, [1, 3], 0); // Red + Blue chord!
    }
  }

  // ----------------------------------------------------
  // SECTION 3: CHORUS (Bars 12 to 19) - 21.82s to 36.36s
  // Heavy chords and long sustained notes
  // ----------------------------------------------------
  const chorusChords: { barOffset: number; lanes: Lane[]; sustainDur: number }[] = [
    { barOffset: 0, lanes: [0, 2], sustainDur: b * 1.6 },      // C5 chord sustain
    { barOffset: 1, lanes: [1, 3], sustainDur: b * 1.6 },      // D5 chord sustain
    { barOffset: 2, lanes: [0, 2, 4], sustainDur: b * 2.8 },   // Epic 3-lane E5 chord!
    { barOffset: 3, lanes: [2, 4], sustainDur: b * 0.8 },      // G5
    { barOffset: 4, lanes: [0, 2], sustainDur: b * 1.6 },      // C5
    { barOffset: 5, lanes: [1, 3], sustainDur: b * 1.6 },      // D5
    { barOffset: 6, lanes: [1, 2], sustainDur: b * 1.6 },      // A5
    { barOffset: 7, lanes: [2, 3], sustainDur: b * 1.6 }       // B5
  ];

  chorusChords.forEach((step) => {
    const t = (12 + step.barOffset) * m;
    addChord(t, step.lanes, step.sustainDur);
    // Add transitional punch note on beat 2.5 if sustain allows
    if (step.sustainDur < b * 2) {
      addNote(t + b * 2.5, step.lanes[0] === 0 ? 3 : 1, 0);
    }
  });

  // ----------------------------------------------------
  // SECTION 4: GUITAR SOLO (Bars 20 to 23) - 36.36s to 43.64s
  // Fast melodic guitar licks ascending & descending
  // ----------------------------------------------------
  const soloNotes: { beat: number; lane: Lane; sustain: number }[] = [
    { beat: 0, lane: 0, sustain: 0 },
    { beat: 1, lane: 1, sustain: 0 },
    { beat: 2, lane: 2, sustain: 0 },
    { beat: 3, lane: 3, sustain: 0 },
    { beat: 4, lane: 4, sustain: 0 },
    { beat: 5, lane: 4, sustain: b * 1.4 }, // High note sustain!
    { beat: 7, lane: 3, sustain: 0 },
    { beat: 8, lane: 2, sustain: 0 },
    { beat: 9, lane: 1, sustain: 0 },
    { beat: 10, lane: 0, sustain: b * 1.0 },
    { beat: 12, lane: 2, sustain: 0 },
    { beat: 13, lane: 3, sustain: 0 },
    { beat: 14, lane: 4, sustain: b * 1.8 } // Screaming solo finale!
  ];

  const soloStartT = 20 * m;
  soloNotes.forEach((sn) => {
    addNote(soloStartT + sn.beat * b, sn.lane, sn.sustain);
  });

  // ----------------------------------------------------
  // SECTION 5: OUTRO (Bars 24 to 27) - 43.64s to 50.91s
  // Punchy climax into final sustain hold
  // ----------------------------------------------------
  for (let bar = 24; bar < 27; bar++) {
    const barT = bar * m;
    addChord(barT, [0, 2], 0);
    addChord(barT + b * 2, [1, 3], 0);
    addChord(barT + b * 3, [2, 4], 0);
  }

  // Grand Finale Sustain Note (bar 27)
  const finalT = 27 * m;
  addChord(finalT, [0, 2, 4], b * 3.5); // Hold all 3 chords until the song finishes!

  // Sort notes chronologically
  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);

  return notes;
}
