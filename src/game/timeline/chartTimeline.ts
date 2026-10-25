import { Note, Lane, Difficulty, getLanesForDifficulty } from '../../types';

/**
 * ROCKBRAZIL BETA V6 — CHART TIMELINE
 * Manages chart note data, indexing, and temporal query windows.
 * - Preserves authentic timestamps, durations, and lane assignments.
 * - Indexes notes by lane and chronological order.
 * - Provides active note windows in O(1) without iterating over thousands of notes.
 * - Detects intro delay to inform player of lead-in sections.
 */
export class ChartTimeline {
  private notes: Note[] = [];
  private notesByLane: Map<Lane, Note[]> = new Map();
  private difficulty: Difficulty = 'MEDIUM';
  private firstNoteTime = 0;
  private lastNoteTime = 0;
  private activePointer = 0;

  constructor(notes: Note[] = [], difficulty: Difficulty = 'MEDIUM') {
    this.loadNotes(notes, difficulty);
  }

  public loadNotes(notes: Note[], difficulty: Difficulty = this.difficulty): void {
    this.difficulty = difficulty;
    this.activePointer = 0;

    // Clone notes to guarantee isolation between sessions
    this.notes = notes.map((n, idx) => ({
      ...n,
      id: n.id ?? idx,
      hit: false,
      missed: false,
      sustainCompleted: false,
      sustainHeldTime: 0
    }));

    // Ensure chronological sort
    for (let i = 1; i < this.notes.length; i++) {
      if (this.notes[i].time < this.notes[i - 1].time) {
        this.notes.sort((a, b) => a.time - b.time);
        break;
      }
    }

    // Index by lane
    this.notesByLane.clear();
    for (let l = 0; l <= 4; l++) {
      this.notesByLane.set(l as Lane, []);
    }
    for (const n of this.notes) {
      this.notesByLane.get(n.lane)?.push(n);
    }

    if (this.notes.length > 0) {
      this.firstNoteTime = this.notes[0].time;
      const last = this.notes[this.notes.length - 1];
      this.lastNoteTime = last.time + (last.duration || 0);
    } else {
      this.firstNoteTime = 0;
      this.lastNoteTime = 0;
    }
  }

  public getNotes(): Note[] {
    return this.notes;
  }

  public getNotesByLane(lane: Lane): Note[] {
    return this.notesByLane.get(lane) || [];
  }

  public getFirstNoteTime(): number {
    return this.firstNoteTime;
  }

  public getLastNoteTime(): number {
    return this.lastNoteTime;
  }

  public getTotalNotesCount(): number {
    return this.notes.length;
  }

  public getDifficulty(): Difficulty {
    return this.difficulty;
  }

  /**
   * Returns true if the song has an introductory gap (> 2.5s) before the first playable note.
   */
  public hasIntroDelay(): boolean {
    return this.firstNoteTime > 2.5;
  }

  /**
   * Advances the active pointer past notes that have already passed and completed.
   */
  public advanceActivePointer(currentTime: number, maxPastSec = 0.5): void {
    while (
      this.activePointer < this.notes.length &&
      (this.notes[this.activePointer].hit || this.notes[this.activePointer].missed) &&
      (!this.notes[this.activePointer].duration ||
        this.notes[this.activePointer].sustainCompleted ||
        currentTime > this.notes[this.activePointer].time + this.notes[this.activePointer].duration + maxPastSec)
    ) {
      this.activePointer++;
    }
  }

  /**
   * Retrieves notes currently within a temporal query window.
   * e.g., from [currentTime - pastWindow, currentTime + futureWindow]
   */
  public getNotesInWindow(currentTime: number, pastWindow = 0.25, futureWindow = 1.35): Note[] {
    this.advanceActivePointer(currentTime);

    const minTime = currentTime - pastWindow;
    const maxTime = currentTime + futureWindow;
    const result: Note[] = [];

    for (let i = this.activePointer; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.time > maxTime) {
        break; // Sorted by time, no future notes can match
      }
      if (note.time + (note.duration || 0) >= minTime) {
        result.push(note);
      }
    }

    return result;
  }

  /**
   * Finds the closest unhit note for a specific lane within a hit window.
   */
  public findCandidateNote(lane: Lane, currentTime: number, maxWindow: number): { note: Note; diff: number } | null {
    this.advanceActivePointer(currentTime);

    let candidate: Note | null = null;
    let minDiff = Infinity;

    for (let i = this.activePointer; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.time > currentTime + maxWindow) {
        break; // Subsequent notes are beyond the window
      }
      if (note.lane === lane && !note.hit && !note.missed) {
        const diff = Math.abs(currentTime - note.time);
        if (diff <= maxWindow && diff < minDiff) {
          minDiff = diff;
          candidate = note;
        }
      }
    }

    return candidate ? { note: candidate, diff: minDiff } : null;
  }

  /**
   * Checks if there are notes remaining to be played.
   */
  public hasPendingNotes(currentTime: number, goodWindow = 0.14): boolean {
    this.advanceActivePointer(currentTime);
    for (let i = this.activePointer; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (!note.hit && !note.missed && currentTime <= note.time + goodWindow) {
        return true;
      }
      if (note.hit && note.duration > 0 && !note.sustainCompleted && currentTime < note.time + note.duration) {
        return true;
      }
    }
    return false;
  }

  public reset(): void {
    this.activePointer = 0;
    for (const n of this.notes) {
      n.hit = false;
      n.missed = false;
      n.sustainCompleted = false;
      n.sustainHeldTime = 0;
    }
  }
}
