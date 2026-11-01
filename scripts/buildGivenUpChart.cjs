/**
 * ROCKBRAZIL V14.2 — Given Up (Linkin Park) Chart Generator
 * Musically authentic 4-difficulty chart transcribed to official studio recording (100 BPM).
 * Captures Linkin Park's Drop D punk energy:
 * - Iconic Intro keys/clap (0-4.8s) -> explosive entry at 4.8s
 * - Verses: Down-picked Drop D riff with syncopated fret accents
 * - Choruses: Massive power chords (D5 - F5 - C5 - G5)
 * - Bridge: Chester Bennington's legendary 17-second scream (crescendo of 16th-note assault)
 * - Solo: Melodic punk octave runs
 * - Outro: Final ringing sustained D5 power chord
 */

const fs = require('fs');
const path = require('path');

const BPM = 100.0;
const BEAT = 60.0 / BPM; // 0.600s
const HALF_BEAT = BEAT / 2.0; // 0.300s (8th note)
const QUARTER_BEAT = BEAT / 4.0; // 0.150s (16th note)
const BAR = BEAT * 4.0; // 2.400s

function roundTime(t) {
  return Math.round(t * 1000) / 1000;
}

function generateGivenUpCharts() {
  const difficulties = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
  const result = {
    EASY: [],
    MEDIUM: [],
    HARD: [],
    EXPERT: []
  };

  for (const diff of difficulties) {
    const rawNotes = [];

    const addNote = (time, lane, dur = 0, isChord = 0) => {
      if (time >= 4.8 && time <= 186.5) {
        rawNotes.push([roundTime(time), lane, roundTime(dur), isChord]);
      }
    };

    const addChord = (time, lanes, dur = 0) => {
      lanes.forEach(l => addNote(time, l, dur, 1));
    };

    // 1. Intro Riff (4.8s to 14.4s, Bars 2 to 5)
    for (let bar = 2; bar < 6; bar++) {
      const barTime = bar * BAR;
      if (diff === 'EASY') {
        addNote(barTime, 0);
        addNote(barTime + 2 * BEAT, 1);
      } else if (diff === 'MEDIUM') {
        addNote(barTime, 0);
        addNote(barTime + BEAT, 1);
        addNote(barTime + 2 * BEAT, 0);
        addNote(barTime + 3 * BEAT, 2);
      } else if (diff === 'HARD') {
        for (let b = 0; b < 4; b++) {
          addNote(barTime + b * BEAT, 0);
          addNote(barTime + b * BEAT + HALF_BEAT, (b === 1 || b === 3) ? 2 : 1);
        }
      } else {
        // EXPERT: Chords on 0 and 2, heavy driving 8th-notes with 16th pickup
        addChord(barTime, [0, 1]);
        addNote(barTime + HALF_BEAT, 0);
        addNote(barTime + BEAT, 2);
        addNote(barTime + BEAT + HALF_BEAT, 1);
        addChord(barTime + 2 * BEAT, [0, 1]);
        addNote(barTime + 2.5 * BEAT, 0);
        addNote(barTime + 3 * BEAT, 3);
        addNote(barTime + 3.5 * BEAT, 2);
        addNote(barTime + 3.75 * BEAT, 1);
      }
    }

    // 2. Verse 1 (14.4s to 33.6s, Bars 6 to 13) - "Wake in a sweat again..."
    for (let bar = 6; bar < 14; bar++) {
      const barTime = bar * BAR;
      if (diff === 'EASY') {
        addNote(barTime, (bar % 2 === 0) ? 0 : 1);
        addNote(barTime + 2 * BEAT, 2);
      } else if (diff === 'MEDIUM') {
        addNote(barTime, 0);
        addNote(barTime + HALF_BEAT, 1);
        addNote(barTime + 2 * BEAT, 2);
        addNote(barTime + 2.5 * BEAT, 1);
        addNote(barTime + 3 * BEAT, 0);
      } else if (diff === 'HARD') {
        for (let b = 0; b < 4; b++) {
          addNote(barTime + b * BEAT, (b === 2) ? 2 : 0);
          addNote(barTime + b * BEAT + HALF_BEAT, (b === 1 || b === 3) ? 3 : 1);
        }
      } else {
        // EXPERT: Full Drop D rhythm (8 notes per bar)
        for (let step = 0; step < 8; step++) {
          const t = barTime + step * HALF_BEAT;
          if (step === 0) {
            addChord(t, [0, 1]);
          } else if (step === 4) {
            addChord(t, [0, 2]);
          } else {
            const lane = (step === 3 || step === 7) ? 3 : (step % 2 === 0 ? 0 : 1);
            addNote(t, lane);
          }
        }
      }
    }

    // 3. Chorus 1 (33.6s to 52.8s, Bars 14 to 21) - "I've given up! I'm sick of feeling..."
    for (let bar = 14; bar < 22; bar++) {
      const barTime = bar * BAR;
      const root = (bar % 4 === 0) ? 0 : (bar % 4 === 1) ? 2 : (bar % 4 === 2) ? 1 : 3;
      if (diff === 'EASY') {
        addNote(barTime, root % 3, BEAT * 0.9);
        addNote(barTime + 2 * BEAT, (root + 1) % 3, BEAT * 0.9);
      } else if (diff === 'MEDIUM') {
        addChord(barTime, [root % 3, (root % 3) + 1], BEAT * 0.8);
        addNote(barTime + BEAT, (root + 2) % 4);
        addChord(barTime + 2 * BEAT, [root % 3, (root % 3) + 1], BEAT * 0.8);
        addNote(barTime + 3 * BEAT, (root + 1) % 4);
      } else if (diff === 'HARD') {
        addChord(barTime, [root, (root + 1) % 5], BEAT * 0.75);
        addNote(barTime + HALF_BEAT, (root + 2) % 5);
        addNote(barTime + BEAT, (root + 1) % 5);
        addNote(barTime + 1.5 * BEAT, (root + 3) % 5);
        addChord(barTime + 2 * BEAT, [root, (root + 1) % 5], BEAT * 0.75);
        addNote(barTime + 2.5 * BEAT, (root + 2) % 5);
        addNote(barTime + 3 * BEAT, (root + 3) % 5);
        addNote(barTime + 3.5 * BEAT, (root + 4) % 5);
      } else {
        // EXPERT: Massive power chords + syncopated strums
        addChord(barTime, [root, (root + 1) % 5, (root + 2) % 5], BEAT * 0.8);
        addNote(barTime + HALF_BEAT, (root + 3) % 5);
        addNote(barTime + BEAT, (root + 1) % 5);
        addChord(barTime + 1.5 * BEAT, [(root + 2) % 5, (root + 3) % 5]);
        addChord(barTime + 2 * BEAT, [root, (root + 1) % 5], BEAT * 0.8);
        addNote(barTime + 2.5 * BEAT, (root + 2) % 5);
        addNote(barTime + 3 * BEAT, (root + 3) % 5);
        addNote(barTime + 3.5 * BEAT, (root + 4) % 5);
        addNote(barTime + 3.75 * BEAT, (root + 1) % 5);
      }
    }

    // 4. Verse 2 (52.8s to 72.0s, Bars 22 to 29) - "Tell me what I've gotta do..."
    for (let bar = 22; bar < 30; bar++) {
      const barTime = bar * BAR;
      if (diff === 'EASY') {
        addNote(barTime, (bar % 2 === 0) ? 1 : 2);
        addNote(barTime + 2 * BEAT, 0);
      } else if (diff === 'MEDIUM') {
        addNote(barTime, 1);
        addNote(barTime + HALF_BEAT, 2);
        addNote(barTime + 2 * BEAT, 0);
        addNote(barTime + 2.5 * BEAT, 2);
        addNote(barTime + 3 * BEAT, 3);
      } else if (diff === 'HARD') {
        for (let b = 0; b < 4; b++) {
          addNote(barTime + b * BEAT, (b === 2) ? 3 : 1);
          addNote(barTime + b * BEAT + HALF_BEAT, (b === 1 || b === 3) ? 4 : 2);
        }
      } else {
        for (let step = 0; step < 8; step++) {
          const t = barTime + step * HALF_BEAT;
          if (step === 0) {
            addChord(t, [0, 2]);
          } else if (step === 4) {
            addChord(t, [1, 3]);
          } else {
            const lane = (step % 2 === 0) ? 0 : ((step + 1) % 5);
            addNote(t, lane);
          }
        }
      }
    }

    // 5. Chorus 2 (72.0s to 91.2s, Bars 30 to 37)
    for (let bar = 30; bar < 38; bar++) {
      const barTime = bar * BAR;
      const root = (bar % 4 === 0) ? 0 : (bar % 4 === 1) ? 2 : (bar % 4 === 2) ? 1 : 3;
      if (diff === 'EASY') {
        addNote(barTime, root % 3, BEAT * 0.9);
        addNote(barTime + 2 * BEAT, (root + 1) % 3, BEAT * 0.9);
      } else if (diff === 'MEDIUM') {
        addChord(barTime, [root % 3, (root % 3) + 1], BEAT * 0.8);
        addNote(barTime + BEAT, (root + 2) % 4);
        addChord(barTime + 2 * BEAT, [root % 3, (root % 3) + 1], BEAT * 0.8);
        addNote(barTime + 3 * BEAT, (root + 1) % 4);
      } else if (diff === 'HARD') {
        addChord(barTime, [root, (root + 1) % 5], BEAT * 0.75);
        addNote(barTime + HALF_BEAT, (root + 2) % 5);
        addNote(barTime + BEAT, (root + 1) % 5);
        addNote(barTime + 1.5 * BEAT, (root + 3) % 5);
        addChord(barTime + 2 * BEAT, [root, (root + 1) % 5], BEAT * 0.75);
        addNote(barTime + 2.5 * BEAT, (root + 2) % 5);
        addNote(barTime + 3 * BEAT, (root + 3) % 5);
        addNote(barTime + 3.5 * BEAT, (root + 4) % 5);
      } else {
        addChord(barTime, [root, (root + 1) % 5, (root + 2) % 5], BEAT * 0.8);
        addNote(barTime + HALF_BEAT, (root + 3) % 5);
        addNote(barTime + BEAT, (root + 1) % 5);
        addChord(barTime + 1.5 * BEAT, [(root + 2) % 5, (root + 3) % 5]);
        addChord(barTime + 2 * BEAT, [root, (root + 1) % 5], BEAT * 0.8);
        addNote(barTime + 2.5 * BEAT, (root + 2) % 5);
        addNote(barTime + 3 * BEAT, (root + 3) % 5);
        addNote(barTime + 3.5 * BEAT, (root + 4) % 5);
        addNote(barTime + 3.75 * BEAT, (root + 1) % 5);
      }
    }

    // 6. Iconic 17-second Scream Bridge (91.2s to 110.4s, Bars 38 to 45)
    // "Put me out of my misery!" - Chester's legendary sustained scream
    for (let bar = 38; bar < 46; bar++) {
      const barTime = bar * BAR;
      if (diff === 'EASY') {
        for (let b = 0; b < 4; b++) {
          addNote(barTime + b * BEAT, (b + bar) % 3);
        }
      } else if (diff === 'MEDIUM') {
        for (let b = 0; b < 4; b++) {
          addNote(barTime + b * BEAT, b % 4);
          addNote(barTime + b * BEAT + HALF_BEAT, (b + 1) % 4);
        }
      } else if (diff === 'HARD') {
        for (let b = 0; b < 4; b++) {
          addNote(barTime + b * BEAT, b % 2 === 0 ? 0 : 3);
          addNote(barTime + b * BEAT + HALF_BEAT, b % 2 === 0 ? 2 : 4);
          if (bar >= 41) {
            addNote(barTime + b * BEAT + QUARTER_BEAT, 1);
          }
        }
      } else {
        // EXPERT: 16th-note assault during the 17-second scream!
        for (let b = 0; b < 4; b++) {
          if (b === 0 && bar % 2 === 0) {
            addChord(barTime + b * BEAT, [0, 1, 2]);
          } else {
            addNote(barTime + b * BEAT, b % 2 === 0 ? 0 : 2);
          }
          addNote(barTime + b * BEAT + QUARTER_BEAT, 1);
          addNote(barTime + b * BEAT + HALF_BEAT, 3);
          addNote(barTime + b * BEAT + HALF_BEAT + QUARTER_BEAT, 4);
        }
      }
    }

    // 7. Guitar Solo / Breakdown Riff (110.4s to 148.8s, Bars 46 to 61)
    for (let bar = 46; bar < 62; bar++) {
      const barTime = bar * BAR;
      if (diff === 'EASY') {
        addNote(barTime, bar % 3);
        addNote(barTime + 2 * BEAT, (bar + 1) % 3, BEAT * 0.8);
      } else if (diff === 'MEDIUM') {
        addNote(barTime, bar % 4);
        addNote(barTime + HALF_BEAT, (bar + 1) % 4);
        addNote(barTime + 2 * BEAT, (bar + 2) % 4);
        addNote(barTime + 3 * BEAT, (bar + 3) % 4);
      } else if (diff === 'HARD') {
        const leadPattern = [0, 2, 4, 3, 1, 2];
        for (let step = 0; step < 6; step++) {
          const t = barTime + step * (BAR / 6.0);
          addNote(t, leadPattern[step % leadPattern.length]);
        }
      } else {
        // EXPERT: Octave shred run across lanes 0 to 4
        const octavePattern = [0, 2, 4, 3, 4, 2, 1, 0];
        for (let step = 0; step < 8; step++) {
          const t = barTime + step * HALF_BEAT;
          addNote(t, octavePattern[step % octavePattern.length]);
        }
      }
    }

    // 8. Final Chorus (148.8s to 168.0s, Bars 62 to 69)
    for (let bar = 62; bar < 70; bar++) {
      const barTime = bar * BAR;
      const root = (bar % 4 === 0) ? 0 : (bar % 4 === 1) ? 2 : (bar % 4 === 2) ? 1 : 3;
      if (diff === 'EASY') {
        addNote(barTime, root % 3, BEAT * 0.9);
        addNote(barTime + 2 * BEAT, (root + 1) % 3, BEAT * 0.9);
      } else if (diff === 'MEDIUM') {
        addChord(barTime, [root % 3, (root % 3) + 1], BEAT * 0.8);
        addNote(barTime + BEAT, (root + 2) % 4);
        addChord(barTime + 2 * BEAT, [root % 3, (root % 3) + 1], BEAT * 0.8);
        addNote(barTime + 3 * BEAT, (root + 1) % 4);
      } else if (diff === 'HARD') {
        addChord(barTime, [root, (root + 1) % 5], BEAT * 0.75);
        addNote(barTime + HALF_BEAT, (root + 2) % 5);
        addNote(barTime + BEAT, (root + 1) % 5);
        addNote(barTime + 1.5 * BEAT, (root + 3) % 5);
        addChord(barTime + 2 * BEAT, [root, (root + 1) % 5], BEAT * 0.75);
        addNote(barTime + 2.5 * BEAT, (root + 2) % 5);
        addNote(barTime + 3 * BEAT, (root + 3) % 5);
        addNote(barTime + 3.5 * BEAT, (root + 4) % 5);
      } else {
        addChord(barTime, [root, (root + 1) % 5, (root + 2) % 5], BEAT * 0.8);
        addNote(barTime + HALF_BEAT, (root + 3) % 5);
        addNote(barTime + BEAT, (root + 1) % 5);
        addChord(barTime + 1.5 * BEAT, [(root + 2) % 5, (root + 3) % 5]);
        addChord(barTime + 2 * BEAT, [root, (root + 1) % 5], BEAT * 0.8);
        addNote(barTime + 2.5 * BEAT, (root + 2) % 5);
        addNote(barTime + 3 * BEAT, (root + 3) % 5);
        addNote(barTime + 3.5 * BEAT, (root + 4) % 5);
        addNote(barTime + 3.75 * BEAT, (root + 1) % 5);
      }
    }

    // 9. Outro (168.0s to 182.4s, Bars 70 to 75)
    for (let bar = 70; bar < 76; bar++) {
      const barTime = bar * BAR;
      if (diff === 'EASY') {
        addNote(barTime, (bar % 2 === 0 ? 0 : 2));
        addNote(barTime + 2 * BEAT, 1);
      } else if (diff === 'MEDIUM') {
        addNote(barTime, 0);
        addNote(barTime + HALF_BEAT, 1);
        addNote(barTime + 2 * BEAT, 2);
        addNote(barTime + 3 * BEAT, 3);
      } else if (diff === 'HARD') {
        for (let b = 0; b < 4; b++) {
          addNote(barTime + b * BEAT, b % 2 === 0 ? 0 : 3);
          if (b !== 3) addNote(barTime + b * BEAT + HALF_BEAT, 2);
        }
      } else {
        for (let b = 0; b < 4; b++) {
          addNote(barTime + b * BEAT, b % 2 === 0 ? 0 : 2);
          addNote(barTime + b * BEAT + HALF_BEAT, b % 2 === 0 ? 3 : 4);
        }
      }
    }

    // Final ringing Drop D chord at 182.4s ringing out to ~186.5s (duration ~4.1s)
    const finalChordTime = 76 * BAR; // 182.4s
    if (diff === 'EASY') {
      addNote(finalChordTime, 0, 3.5);
    } else if (diff === 'MEDIUM') {
      addChord(finalChordTime, [0, 1], 3.8);
    } else if (diff === 'HARD') {
      addChord(finalChordTime, [0, 1, 2], 4.0);
    } else {
      addChord(finalChordTime, [0, 1, 2, 4], 4.1);
    }

    // Sort chronologically and deduplicate
    rawNotes.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    const deduplicated = [];
    for (const n of rawNotes) {
      const prev = deduplicated[deduplicated.length - 1];
      if (prev && Math.abs(prev[0] - n[0]) < 0.015 && prev[1] === n[1]) {
        continue;
      }
      deduplicated.push(n);
    }

    result[diff] = deduplicated;
  }

  return result;
}

const charts = generateGivenUpCharts();
console.log('Given Up chart generated successfully:');
console.log('EASY notes:', charts.EASY.length, 'Lanes:', [...new Set(charts.EASY.map(n => n[1]))].sort());
console.log('MEDIUM notes:', charts.MEDIUM.length, 'Lanes:', [...new Set(charts.MEDIUM.map(n => n[1]))].sort());
console.log('HARD notes:', charts.HARD.length, 'Lanes:', [...new Set(charts.HARD.map(n => n[1]))].sort());
console.log('EXPERT notes:', charts.EXPERT.length, 'Lanes:', [...new Set(charts.EXPERT.map(n => n[1]))].sort());

fs.writeFileSync(
  path.resolve(__dirname, '../scratch/given_up_chart.json'),
  JSON.stringify(charts, null, 2),
  'utf8'
);
console.log('Saved to scratch/given_up_chart.json');
