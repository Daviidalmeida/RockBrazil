import { Note, Lane, Difficulty, BeatmapByDifficulty } from '../types';
import { SmartChartEngine } from './catalog/smartChartEngine';
import { OFFICIAL_BRAZILIAN_CATALOG } from './catalog/catalogData';
import { UniversalChartImporter } from '../audio/universalChartImporter';
import { initPreconvertedCharts } from './catalog/preconvertedCharts';

export class BeatmapManager {
  private cache: Map<string, BeatmapByDifficulty> = new Map();

  constructor() {
    initPreconvertedCharts();
    this.initDefaultMaps();
  }

  /**
   * Returns notes for a specific song and difficulty
   */
  getBeatmap(songId: string, difficulty: Difficulty): Note[] {
    // Check localStorage for custom user overrides first
    const localSaved = this.loadFromStorage(songId, difficulty);
    if (localSaved && localSaved.length > 0) {
      return localSaved.map((n) => ({ ...n }));
    }

    const songMaps = this.cache.get(songId);
    if (songMaps && songMaps[difficulty]) {
      return songMaps[difficulty].map((n) => ({ ...n }));
    }

    // Check UniversalChartImporter for real converted community chart
    const convertedChart = UniversalChartImporter.getConvertedChart(songId);
    if (convertedChart && convertedChart[difficulty]) {
      this.cache.set(songId, convertedChart);
      return convertedChart[difficulty].map((n) => ({ ...n }));
    }

    // Check official Brazilian catalog for Smart Chart generation
    const officialSong = OFFICIAL_BRAZILIAN_CATALOG.find((s) => s.id === songId);
    if (officialSong) {
      const generated = SmartChartEngine.generateChartsForSong(
        officialSong.id,
        officialSong.bpm,
        officialSong.duration
      );
      this.cache.set(officialSong.id, generated);
      return generated[difficulty].map((n) => ({ ...n }));
    }

    // Fallback: generate default procedural map
    return this.generateDefaultTrackMap(songId, 132, 50, difficulty);
  }

  /**
   * Saves a custom beatmap to localStorage
   */
  saveBeatmap(songId: string, difficulty: Difficulty, notes: Note[]): void {
    const key = `rb_map_${songId}_${difficulty}`;
    try {
      localStorage.setItem(key, JSON.stringify(notes));
    } catch {
      // Ignore
    }
    let songMaps = this.cache.get(songId);
    if (!songMaps) {
      songMaps = {
        EASY: [],
        MEDIUM: [],
        HARD: [],
        EXPERT: []
      };
      this.cache.set(songId, songMaps);
    }
    songMaps[difficulty] = notes.map((n) => ({ ...n }));
  }

  private loadFromStorage(songId: string, difficulty: Difficulty): Note[] | null {
    try {
      const data = localStorage.getItem(`rb_map_${songId}_${difficulty}`);
      if (data) {
        return JSON.parse(data) as Note[];
      }
    } catch {
      // Ignore
    }
    return null;
  }

  private initDefaultMaps(): void {
    // 1. Fúria Tropical (132 BPM, 51.5s)
    this.cache.set('furia-tropical', this.createFuriaMaps());

    // 2. Trovão da Meia-Noite (148 BPM, 46.0s)
    this.cache.set('trovao-meia-noite', this.createTrovaoMaps());

    // 3. Garagem 90 (116 BPM, 48.0s)
    this.cache.set('garagem-90', this.createGaragemMaps());

    // 4. Estrada de Ferro (126 BPM, 46.0s)
    this.cache.set('estrada-de-ferro', this.createEstradaMaps());

    // 5. Sobrecarga (160 BPM, 42.0s)
    this.cache.set('sobrecarga', this.createSobrecargaMaps());

    // 6. T.N.T. — AC/DC (126 BPM, 216s)
    this.cache.set('tnt-acdc', this.createTNTMaps());
  }

  // --- Helper to build notes ---
  private buildNotesHelper(builder: (add: (t: number, l: Lane, dur?: number) => void, addChord: (t: number, lanes: Lane[], dur?: number) => void) => void): Note[] {
    const notes: Note[] = [];
    let id = 1;
    const add = (t: number, l: Lane, dur = 0) => {
      notes.push({
        id: id++,
        time: Number(t.toFixed(3)),
        lane: l,
        duration: Number(dur.toFixed(3)),
        hit: false,
        missed: false,
        sustainCompleted: false,
        sustainHeldTime: 0
      });
    };
    const addChord = (t: number, lanes: Lane[], dur = 0) => {
      lanes.forEach((l) => add(t, l, dur));
    };

    builder(add, addChord);
    notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
    return notes;
  }

  // --- 1. FÚRIA TROPICAL MAPS ---
  private createFuriaMaps(): BeatmapByDifficulty {
    const bpm = 132;
    const b = 60 / bpm;
    const m = b * 4;

    const easy = this.buildNotesHelper((add) => {
      // Quarter note single hits on lanes 0, 1, 2
      for (let bar = 1; bar < 27; bar++) {
        const barT = bar * m;
        add(barT, 0);
        add(barT + b * 2, 1);
        if (bar >= 12 && bar < 20) {
          add(barT + b * 3, 2, b * 0.8);
        }
      }
    });

    const medium = this.buildNotesHelper((add, addChord) => {
      for (let bar = 1; bar < 4; bar++) {
        const barT = bar * m;
        add(barT, 0);
        add(barT + b * 2, 1);
        add(barT + b * 3, 2);
      }
      for (let bar = 4; bar < 12; bar++) {
        const barT = bar * m;
        add(barT, 0);
        add(barT + b * 1, 0);
        add(barT + b * 2, 1);
        add(barT + b * 3, 2);
        if (bar % 2 === 1) addChord(barT + b * 2, [0, 2]);
      }
      for (let bar = 12; bar < 20; bar++) {
        const barT = bar * m;
        addChord(barT, [0, 2], b * 1.5);
        addChord(barT + b * 2, [1, 3], b * 1.5);
      }
      for (let bar = 20; bar < 24; bar++) {
        const barT = bar * m;
        add(barT, 0);
        add(barT + b, 1);
        add(barT + b * 2, 2);
        add(barT + b * 3, 3);
      }
      addChord(27 * m, [0, 2], b * 3);
    });

    const hard = this.buildNotesHelper((add, addChord) => {
      for (let bar = 1; bar < 4; bar++) {
        const barT = bar * m;
        add(barT, 0);
        add(barT + b * 2, 1);
        add(barT + b * 3, 2);
      }
      for (let bar = 4; bar < 12; bar++) {
        const barT = bar * m;
        if (bar % 2 === 0) {
          add(barT, 0);
          add(barT + b * 1, 0);
          add(barT + b * 2, 1);
          add(barT + b * 3, 2);
          add(barT + b * 3.5, 1);
        } else {
          addChord(barT, [0, 2]);
          add(barT + b * 1.5, 1);
          add(barT + b * 2, 2);
          add(barT + b * 2.5, 3);
          addChord(barT + b * 3, [1, 3]);
        }
      }
      for (let bar = 12; bar < 20; bar++) {
        const barT = bar * m;
        addChord(barT, [0, 2], b * 1.6);
        addChord(barT + b * 2, [1, 3], b * 1.6);
      }
      // Solo
      const soloStart = 20 * m;
      [0, 1, 2, 3, 4].forEach((lane, idx) => {
        add(soloStart + idx * b, lane as Lane);
      });
      add(soloStart + 5 * b, 4, b * 1.5);
      [3, 2, 1, 0].forEach((lane, idx) => {
        add(soloStart + (7 + idx) * b, lane as Lane);
      });
      add(soloStart + 14 * b, 4, b * 2);
      // Outro
      for (let bar = 24; bar < 27; bar++) {
        const barT = bar * m;
        addChord(barT, [0, 2]);
        addChord(barT + b * 2, [1, 3]);
        addChord(barT + b * 3, [2, 4]);
      }
      addChord(27 * m, [0, 2, 4], b * 3.5);
    });

    const expert = this.buildNotesHelper((add, addChord) => {
      // High density 8th and 16th note rhythms
      for (let bar = 1; bar < 4; bar++) {
        const barT = bar * m;
        for (let i = 0; i < 4; i++) {
          add(barT + i * b, (i % 3) as Lane);
          add(barT + i * b + b * 0.5, ((i + 1) % 3) as Lane);
        }
      }
      for (let bar = 4; bar < 12; bar++) {
        const barT = bar * m;
        addChord(barT, [0, 2]);
        add(barT + b * 0.5, 1);
        add(barT + b * 1, 0);
        add(barT + b * 1.5, 1);
        addChord(barT + b * 2, [1, 3]);
        add(barT + b * 2.5, 2);
        addChord(barT + b * 3, [2, 4]);
        add(barT + b * 3.5, 3);
      }
      for (let bar = 12; bar < 20; bar++) {
        const barT = bar * m;
        addChord(barT, [0, 2, 4], b * 1.5);
        add(barT + b * 1.75, 3);
        addChord(barT + b * 2, [1, 3], b * 1.5);
        add(barT + b * 3.75, 2);
      }
      // Technical solo
      const soloStart = 20 * m;
      for (let i = 0; i < 16; i++) {
        const lane = (i % 5) as Lane;
        add(soloStart + i * (b * 0.5), lane, i === 15 ? b * 2 : 0);
      }
      for (let bar = 24; bar < 27; bar++) {
        const barT = bar * m;
        addChord(barT, [0, 2]);
        add(barT + b * 0.5, 1);
        addChord(barT + b * 1, [1, 3]);
        add(barT + b * 1.5, 2);
        addChord(barT + b * 2, [2, 4]);
        add(barT + b * 2.5, 3);
        addChord(barT + b * 3, [0, 2, 4]);
      }
      addChord(27 * m, [0, 1, 2, 3, 4], b * 3.5);
    });

    return { EASY: easy, MEDIUM: medium, HARD: hard, EXPERT: expert };
  }

  // --- 2. TROVÃO DA MEIA-NOITE (148 BPM, 46.0s) ---
  private createTrovaoMaps(): BeatmapByDifficulty {
    const bpm = 148;
    const b = 60 / bpm;
    const m = b * 4;

    const easy = this.buildNotesHelper((add) => {
      for (let bar = 1; bar < 28; bar++) {
        const barT = bar * m;
        add(barT, 1);
        add(barT + b * 2, 2);
      }
    });

    const medium = this.buildNotesHelper((add, addChord) => {
      for (let bar = 1; bar < 28; bar++) {
        const barT = bar * m;
        add(barT, 1);
        add(barT + b, 1);
        add(barT + b * 2, 2);
        add(barT + b * 3, 3);
        if (bar % 4 === 0) addChord(barT + b * 3, [1, 3]);
      }
    });

    const hard = this.buildNotesHelper((add, addChord) => {
      for (let bar = 1; bar < 28; bar++) {
        const barT = bar * m;
        addChord(barT, [1, 2]);
        add(barT + b * 1, 1);
        add(barT + b * 1.5, 2);
        addChord(barT + b * 2, [2, 3]);
        add(barT + b * 3, 3);
        add(barT + b * 3.5, 4);
      }
    });

    const expert = this.buildNotesHelper((add, addChord) => {
      for (let bar = 1; bar < 28; bar++) {
        const barT = bar * m;
        addChord(barT, [0, 2]);
        add(barT + b * 0.5, 1);
        add(barT + b * 1, 2);
        add(barT + b * 1.5, 3);
        addChord(barT + b * 2, [1, 3]);
        add(barT + b * 2.5, 2);
        add(barT + b * 3, 3);
        add(barT + b * 3.5, 4);
      }
    });

    return { EASY: easy, MEDIUM: medium, HARD: hard, EXPERT: expert };
  }

  // --- 3. GARAGEM 90 (116 BPM, 48.0s) ---
  private createGaragemMaps(): BeatmapByDifficulty {
    const bpm = 116;
    const b = 60 / bpm;
    const m = b * 4;

    const easy = this.buildNotesHelper((add) => {
      for (let bar = 1; bar < 23; bar++) {
        const barT = bar * m;
        add(barT, 0);
        add(barT + b * 2, 1, b * 1.5);
      }
    });

    const medium = this.buildNotesHelper((add, addChord) => {
      for (let bar = 1; bar < 23; bar++) {
        const barT = bar * m;
        addChord(barT, [0, 1]);
        add(barT + b * 2, 2, b * 1.5);
      }
    });

    const hard = this.buildNotesHelper((add, addChord) => {
      for (let bar = 1; bar < 23; bar++) {
        const barT = bar * m;
        addChord(barT, [0, 2], b);
        add(barT + b * 1.5, 1);
        addChord(barT + b * 2, [1, 3], b * 1.5);
      }
    });

    const expert = this.buildNotesHelper((add, addChord) => {
      for (let bar = 1; bar < 23; bar++) {
        const barT = bar * m;
        addChord(barT, [0, 2, 4], b);
        add(barT + b * 1.25, 1);
        add(barT + b * 1.5, 2);
        addChord(barT + b * 2, [1, 3], b * 1.8);
      }
    });

    return { EASY: easy, MEDIUM: medium, HARD: hard, EXPERT: expert };
  }

  // --- 4. ESTRADA DE FERRO (126 BPM, 46.0s) ---
  private createEstradaMaps(): BeatmapByDifficulty {
    const bpm = 126;
    const b = 60 / bpm;
    const m = b * 4;

    const easy = this.buildNotesHelper((add) => {
      for (let bar = 1; bar < 24; bar++) {
        const barT = bar * m;
        add(barT, 0);
        add(barT + b * 2, 1);
      }
    });

    const medium = this.buildNotesHelper((add, addChord) => {
      for (let bar = 1; bar < 24; bar++) {
        const barT = bar * m;
        add(barT, 0);
        add(barT + b * 1, 1);
        add(barT + b * 2, 2);
        add(barT + b * 3, 1);
      }
    });

    const hard = this.buildNotesHelper((add, addChord) => {
      for (let bar = 1; bar < 24; bar++) {
        const barT = bar * m;
        addChord(barT, [0, 2]);
        add(barT + b * 1, 1);
        addChord(barT + b * 2, [1, 3]);
        add(barT + b * 3, 2);
      }
    });

    const expert = this.buildNotesHelper((add, addChord) => {
      for (let bar = 1; bar < 24; bar++) {
        const barT = bar * m;
        addChord(barT, [0, 2]);
        add(barT + b * 0.66, 1);
        add(barT + b * 1, 2);
        add(barT + b * 1.66, 3);
        addChord(barT + b * 2, [1, 3]);
        add(barT + b * 2.66, 2);
        add(barT + b * 3, 4);
      }
    });

    return { EASY: easy, MEDIUM: medium, HARD: hard, EXPERT: expert };
  }

  // --- 5. SOBRECARGA (160 BPM, 42.0s) ---
  private createSobrecargaMaps(): BeatmapByDifficulty {
    const bpm = 160;
    const b = 60 / bpm;
    const m = b * 4;

    const easy = this.buildNotesHelper((add) => {
      for (let bar = 1; bar < 28; bar++) {
        const barT = bar * m;
        add(barT, 0);
        add(barT + b * 2, 1);
      }
    });

    const medium = this.buildNotesHelper((add) => {
      for (let bar = 1; bar < 28; bar++) {
        const barT = bar * m;
        for (let i = 0; i < 4; i++) {
          add(barT + i * b, (i % 3) as Lane);
        }
      }
    });

    const hard = this.buildNotesHelper((add, addChord) => {
      for (let bar = 1; bar < 28; bar++) {
        const barT = bar * m;
        addChord(barT, [0, 2]);
        add(barT + b * 1, 1);
        addChord(barT + b * 2, [1, 3]);
        add(barT + b * 3, 2);
      }
    });

    const expert = this.buildNotesHelper((add, addChord) => {
      for (let bar = 1; bar < 28; bar++) {
        const barT = bar * m;
        for (let i = 0; i < 4; i++) {
          addChord(barT + i * b, [(i % 3) as Lane, ((i + 2) % 5) as Lane]);
        }
      }
    });

    return { EASY: easy, MEDIUM: medium, HARD: hard, EXPERT: expert };
  }

  // --- 6. T.N.T. — AC/DC (126 BPM, 216s) ---
  private createTNTMaps(): BeatmapByDifficulty {
    const bpm = 126;
    const b = 60 / bpm; // ~0.4762s
    const m = b * 4;     // ~1.9048s
    const totalBars = 113; // ~216 seconds

    // Section markers:
    // Bar 0 - 4: Intro Chants ("Oi! Oi!")
    // Bar 4 - 12: Main Guitar Riff E5 - G5 - A5
    // Bar 12 - 28: Verse 1
    // Bar 28 - 36: Chorus 1 ("'Cause I'm T.N.T.!")
    // Bar 36 - 52: Verse 2
    // Bar 52 - 60: Chorus 2
    // Bar 60 - 78: Guitar Solo (Angus Young screaming solo)
    // Bar 78 - 100: Final Chorus + Chants
    // Bar 100 - 113: Outro Grand Finale

    const easy = this.buildNotesHelper((add, addChord) => {
      // Quarter note accents matching the iconic E-G-A power chords
      for (let bar = 4; bar < totalBars; bar++) {
        const barT = bar * m;
        if (bar % 2 === 0) {
          add(barT, 0); // E5
          add(barT + b * 2, 1); // G5
          add(barT + b * 3, 2); // A5
        } else {
          add(barT, 2); // A5
          add(barT + b * 2, 0); // E5
        }
      }
    });

    const medium = this.buildNotesHelper((add, addChord) => {
      // Intro Chants
      for (let bar = 0; bar < 4; bar++) {
        const barT = bar * m;
        add(barT, 0);
        add(barT + b * 2, 0);
      }
      // Main Riffs
      for (let bar = 4; bar < totalBars; bar++) {
        const barT = bar * m;
        const isChorus = (bar >= 28 && bar < 36) || (bar >= 52 && bar < 60) || (bar >= 78 && bar < 100);
        if (isChorus) {
          addChord(barT, [0, 2]);
          add(barT + b * 1, 1);
          addChord(barT + b * 2, [1, 3]);
          add(barT + b * 3, 2);
        } else {
          addChord(barT, [0, 1]);
          add(barT + b * 2, 2);
          add(barT + b * 3, 3);
        }
      }
    });

    const hard = this.buildNotesHelper((add, addChord) => {
      // Intro Oi! Oi! beats
      for (let bar = 0; bar < 4; bar++) {
        const barT = bar * m;
        add(barT, 0);
        add(barT + b, 1);
        add(barT + b * 2, 0);
        add(barT + b * 3, 1);
      }
      // Riff & Verses
      for (let bar = 4; bar < totalBars; bar++) {
        const barT = bar * m;
        const isSolo = bar >= 60 && bar < 78;
        const isChorus = (bar >= 28 && bar < 36) || (bar >= 52 && bar < 60) || (bar >= 78 && bar < 100);

        if (isSolo) {
          // Solo runs
          for (let s = 0; s < 4; s++) {
            add(barT + s * b, ((bar + s) % 5) as Lane);
          }
        } else if (isChorus) {
          addChord(barT, [0, 2], b * 0.8);
          add(barT + b * 1, 1);
          addChord(barT + b * 2, [1, 3], b * 0.8);
          add(barT + b * 3, 2);
          addChord(barT + b * 3.5, [2, 4]);
        } else {
          addChord(barT, [0, 1]);
          add(barT + b * 1.5, 1);
          add(barT + b * 2, 2);
          add(barT + b * 2.5, 3);
          addChord(barT + b * 3, [1, 3]);
        }
      }
    });

    const expert = this.buildNotesHelper((add, addChord) => {
      // Full authentic Guitar Flash mapping for T.N.T.
      for (let bar = 0; bar < 4; bar++) {
        const barT = bar * m;
        for (let i = 0; i < 4; i++) {
          add(barT + i * b, (i % 2) as Lane);
        }
      }
      for (let bar = 4; bar < totalBars; bar++) {
        const barT = bar * m;
        const isSolo = bar >= 60 && bar < 78;
        const isChorus = (bar >= 28 && bar < 36) || (bar >= 52 && bar < 60) || (bar >= 78 && bar < 100);

        if (isSolo) {
          // Fast pentatonic shredding
          for (let s = 0; s < 8; s++) {
            const lane = ((bar * 2 + s) % 5) as Lane;
            add(barT + s * (b * 0.5), lane, s === 7 ? b * 0.8 : 0);
          }
        } else if (isChorus) {
          addChord(barT, [0, 2, 4], b);
          add(barT + b * 1, 1);
          addChord(barT + b * 1.5, [1, 3]);
          addChord(barT + b * 2, [2, 4], b);
          add(barT + b * 3, 3);
          addChord(barT + b * 3.5, [0, 2, 4]);
        } else {
          addChord(barT, [0, 2]);
          add(barT + b * 0.5, 1);
          add(barT + b * 1, 0);
          add(barT + b * 1.5, 1);
          addChord(barT + b * 2, [1, 3]);
          add(barT + b * 2.5, 2);
          addChord(barT + b * 3, [2, 4]);
          add(barT + b * 3.5, 3);
        }
      }
    });

    return { EASY: easy, MEDIUM: medium, HARD: hard, EXPERT: expert };
  }

  /**
   * Generates a fallback beatmap for custom imported tracks using their BPM
   */
  generateDefaultTrackMap(songId: string, bpm: number, duration: number, difficulty: Difficulty): Note[] {
    const b = 60 / bpm;
    const m = b * 4;
    const totalBars = Math.floor(duration / m);

    return this.buildNotesHelper((add, addChord) => {
      for (let bar = 1; bar < totalBars; bar++) {
        const barT = bar * m;
        if (difficulty === 'EASY') {
          add(barT, 0);
          add(barT + b * 2, 1);
        } else if (difficulty === 'MEDIUM') {
          add(barT, 0);
          add(barT + b, 1);
          add(barT + b * 2, 2);
          add(barT + b * 3, 1);
        } else if (difficulty === 'HARD') {
          addChord(barT, [0, 2]);
          add(barT + b, 1);
          addChord(barT + b * 2, [1, 3]);
          add(barT + b * 3, 2);
        } else {
          addChord(barT, [0, 2]);
          add(barT + b * 0.5, 1);
          addChord(barT + b * 1, [1, 3]);
          add(barT + b * 1.5, 2);
          addChord(barT + b * 2, [2, 4]);
          add(barT + b * 3, 3);
        }
      }
    });
  }
}
