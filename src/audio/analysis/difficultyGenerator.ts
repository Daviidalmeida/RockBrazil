import { GuitarEvent } from './guitarDetector';
import { Note, Lane, Difficulty, BeatmapByDifficulty } from '../../types';

export class DifficultyGenerator {
  static generateAllDifficulties(events: GuitarEvent[]): BeatmapByDifficulty {
    return {
      EASY: this.generateEasy(events),
      MEDIUM: this.generateMedium(events),
      HARD: this.generateHard(events),
      EXPERT: this.generateExpert(events)
    };
  }

  private static mapRegisterToLane(register: 'low' | 'mid' | 'high', index: number, maxLane: number): Lane {
    let lane: number;
    if (register === 'low') {
      lane = (index % 2); // 0 or 1
    } else if (register === 'high') {
      lane = 2 + (index % 3); // 2, 3 or 4
    } else {
      lane = 1 + (index % 3); // 1, 2 or 3
    }
    return Math.min(lane, maxLane) as Lane;
  }

  // --- FÁCIL ---
  private static generateEasy(events: GuitarEvent[]): Note[] {
    const notes: Note[] = [];
    let id = 1;
    let lastTime = -1;
    const minDistance = 0.50; // Max ~2 notes per second

    events.forEach((ev, idx) => {
      // Prioritize high intensity events and chords
      const isImportant = ev.intensity > 0.4 || ev.type === 'chord' || ev.duration > 0.6;
      if (isImportant && (ev.time - lastTime) >= minDistance) {
        lastTime = ev.time;
        const lane = this.mapRegisterToLane(ev.register, idx, 2); // Lanes 0 to 2
        notes.push({
          id: id++,
          time: ev.time,
          lane,
          duration: ev.duration > 0.8 ? Math.min(ev.duration, 1.5) : 0,
          hit: false,
          missed: false,
          sustainCompleted: false,
          sustainHeldTime: 0
        });
      }
    });

    return notes;
  }

  // --- MÉDIO ---
  private static generateMedium(events: GuitarEvent[]): Note[] {
    const notes: Note[] = [];
    let id = 1;
    let lastTime = -1;
    const minDistance = 0.28; // ~3.5 notes per second max

    events.forEach((ev, idx) => {
      if ((ev.time - lastTime) >= minDistance) {
        lastTime = ev.time;
        const lane = this.mapRegisterToLane(ev.register, idx, 3); // Lanes 0 to 3

        if (ev.type === 'chord' && ev.intensity > 0.5) {
          // Simple 2-note chord
          const lane2 = Math.min(4, lane + 2) as Lane;
          notes.push({
            id: id++,
            time: ev.time,
            lane,
            duration: ev.duration,
            hit: false,
            missed: false,
            sustainCompleted: false,
            sustainHeldTime: 0
          });
          notes.push({
            id: id++,
            time: ev.time,
            lane: lane2,
            duration: ev.duration,
            hit: false,
            missed: false,
            sustainCompleted: false,
            sustainHeldTime: 0
          });
        } else {
          notes.push({
            id: id++,
            time: ev.time,
            lane,
            duration: ev.duration,
            hit: false,
            missed: false,
            sustainCompleted: false,
            sustainHeldTime: 0
          });
        }
      }
    });

    return notes;
  }

  // --- DIFÍCIL ---
  private static generateHard(events: GuitarEvent[]): Note[] {
    const notes: Note[] = [];
    let id = 1;
    let lastTime = -1;
    const minDistance = 0.15; // Fast sequences, 8th notes

    events.forEach((ev, idx) => {
      if ((ev.time - lastTime) >= minDistance) {
        lastTime = ev.time;
        const lane = this.mapRegisterToLane(ev.register, idx, 4); // All 5 lanes

        if (ev.type === 'chord') {
          const lane2 = Math.min(4, lane + 2) as Lane;
          notes.push({
            id: id++,
            time: ev.time,
            lane,
            duration: ev.duration,
            hit: false,
            missed: false,
            sustainCompleted: false,
            sustainHeldTime: 0
          });
          notes.push({
            id: id++,
            time: ev.time,
            lane: lane2,
            duration: ev.duration,
            hit: false,
            missed: false,
            sustainCompleted: false,
            sustainHeldTime: 0
          });
        } else {
          notes.push({
            id: id++,
            time: ev.time,
            lane,
            duration: ev.duration,
            hit: false,
            missed: false,
            sustainCompleted: false,
            sustainHeldTime: 0
          });
        }
      }
    });

    return notes;
  }

  // --- EXPERT ---
  private static generateExpert(events: GuitarEvent[]): Note[] {
    const notes: Note[] = [];
    let id = 1;
    let lastTime = -1;
    const minDistance = 0.085; // Full fidelity including 16th-note fast licks

    events.forEach((ev, idx) => {
      if ((ev.time - lastTime) >= minDistance) {
        lastTime = ev.time;
        const lane = this.mapRegisterToLane(ev.register, idx, 4);

        if (ev.type === 'chord' && ev.intensity > 0.65) {
          // Epic 3-lane chord on climactic guitar hits
          const lanes: Lane[] = [0, 2, 4];
          lanes.forEach((l) => {
            notes.push({
              id: id++,
              time: ev.time,
              lane: l,
              duration: ev.duration,
              hit: false,
              missed: false,
              sustainCompleted: false,
              sustainHeldTime: 0
            });
          });
        } else if (ev.type === 'chord') {
          const lane2 = Math.min(4, lane + 2) as Lane;
          notes.push({
            id: id++,
            time: ev.time,
            lane,
            duration: ev.duration,
            hit: false,
            missed: false,
            sustainCompleted: false,
            sustainHeldTime: 0
          });
          notes.push({
            id: id++,
            time: ev.time,
            lane: lane2,
            duration: ev.duration,
            hit: false,
            missed: false,
            sustainCompleted: false,
            sustainHeldTime: 0
          });
        } else {
          notes.push({
            id: id++,
            time: ev.time,
            lane,
            duration: ev.duration,
            hit: false,
            missed: false,
            sustainCompleted: false,
            sustainHeldTime: 0
          });
        }
      }
    });

    return notes;
  }
}
