import { Note, Lane, Difficulty } from '../../types';
import { AutochartGenerationResult } from './contracts';
import { RockAIStorageService } from './rockAIStorageService';

export interface EditorAction {
  type: 'ADD' | 'REMOVE' | 'MOVE' | 'CHANGE_LANE' | 'ADJUST_DURATION';
  difficulty: Difficulty;
  previousNote?: Note;
  newNote?: Note;
  timestamp: number;
}

export class RockAIEditorIntegration {
  private currentResult: AutochartGenerationResult;
  private undoStack: EditorAction[] = [];
  private redoStack: EditorAction[] = [];

  constructor(initialResult: AutochartGenerationResult) {
    this.currentResult = JSON.parse(JSON.stringify(initialResult));
  }

  public getChart(difficulty: Difficulty): Note[] {
    return this.currentResult.charts[difficulty] || [];
  }

  public addNote(difficulty: Difficulty, note: Note): void {
    const list = this.currentResult.charts[difficulty];
    list.push(note);
    list.sort((a, b) => a.time - b.time);

    this.undoStack.push({
      type: 'ADD',
      difficulty,
      newNote: { ...note },
      timestamp: Date.now()
    });
    this.redoStack = [];
    this.autoSave();
  }

  public removeNote(difficulty: Difficulty, noteIndex: number): void {
    const list = this.currentResult.charts[difficulty];
    if (noteIndex >= 0 && noteIndex < list.length) {
      const removed = list.splice(noteIndex, 1)[0];
      this.undoStack.push({
        type: 'REMOVE',
        difficulty,
        previousNote: { ...removed },
        timestamp: Date.now()
      });
      this.redoStack = [];
      this.autoSave();
    }
  }

  public updateNote(difficulty: Difficulty, noteIndex: number, updated: Partial<Note>): void {
    const list = this.currentResult.charts[difficulty];
    if (noteIndex >= 0 && noteIndex < list.length) {
      const prev = { ...list[noteIndex] };
      list[noteIndex] = { ...list[noteIndex], ...updated };
      list.sort((a, b) => a.time - b.time);

      this.undoStack.push({
        type: 'MOVE',
        difficulty,
        previousNote: prev,
        newNote: { ...list[noteIndex] },
        timestamp: Date.now()
      });
      this.redoStack = [];
      this.autoSave();
    }
  }

  public undo(): boolean {
    const action = this.undoStack.pop();
    if (!action) return false;

    const list = this.currentResult.charts[action.difficulty];
    if (action.type === 'ADD' && action.newNote) {
      const idx = list.findIndex(n => n.time === action.newNote!.time && n.lane === action.newNote!.lane);
      if (idx !== -1) list.splice(idx, 1);
    } else if (action.type === 'REMOVE' && action.previousNote) {
      list.push({ ...action.previousNote });
      list.sort((a, b) => a.time - b.time);
    } else if (action.type === 'MOVE' && action.previousNote && action.newNote) {
      const idx = list.findIndex(n => n.time === action.newNote!.time && n.lane === action.newNote!.lane);
      if (idx !== -1) {
        list[idx] = { ...action.previousNote };
        list.sort((a, b) => a.time - b.time);
      }
    }

    this.redoStack.push(action);
    this.autoSave();
    return true;
  }

  public redo(): boolean {
    const action = this.redoStack.pop();
    if (!action) return false;

    const list = this.currentResult.charts[action.difficulty];
    if (action.type === 'ADD' && action.newNote) {
      list.push({ ...action.newNote });
      list.sort((a, b) => a.time - b.time);
    } else if (action.type === 'REMOVE' && action.previousNote) {
      const idx = list.findIndex(n => n.time === action.previousNote!.time && n.lane === action.previousNote!.lane);
      if (idx !== -1) list.splice(idx, 1);
    } else if (action.type === 'MOVE' && action.previousNote && action.newNote) {
      const idx = list.findIndex(n => n.time === action.previousNote!.time && n.lane === action.previousNote!.lane);
      if (idx !== -1) {
        list[idx] = { ...action.newNote };
        list.sort((a, b) => a.time - b.time);
      }
    }

    this.undoStack.push(action);
    this.autoSave();
    return true;
  }

  public getCurrentResult(): AutochartGenerationResult {
    return this.currentResult;
  }

  private autoSave(): void {
    RockAIStorageService.saveGeneratedChart(this.currentResult);
  }
}
