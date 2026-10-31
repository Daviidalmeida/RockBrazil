import { Note, Lane, Difficulty, BeatmapByDifficulty } from '../../types';
import { DetectedMusicalEvent, TempoAnalysisResult } from './contracts';

/**
 * ROCKBRAZIL V13.9 — DIFFICULTY CHART BUILDER
 *
 * Implements strict lane mapping, density progression, and physical constraints:
 * - FÁCIL: 3 Pistas (0, 1, 2), apenas notas individuais, sem acordes, espaçamento amplo.
 * - MÉDIO: 4 Pistas (0, 1, 2, 3), acordes simples de 2 notas, ritmo equilibrado.
 * - DIFÍCIL: 5 Pistas (0, 1, 2, 3, 4), riffs rápidos, acordes frequentes, solos.
 * - EXPERT: 5 Pistas (0, 1, 2, 3, 4), fidelidade musical completa com solos técnicos.
 */
export class DifficultyChartBuilder {
  private static makeNote(id: number, time: number, lane: Lane, duration: number): Note {
    return {
      id,
      time,
      lane,
      duration,
      hit: false,
      missed: false,
      sustainCompleted: false,
      sustainHeldTime: 0
    };
  }

  public static buildCharts = DifficultyChartBuilder.buildAllDifficulties;
  public static buildAllDifficulties(
    events: DetectedMusicalEvent[],
    tempo: TempoAnalysisResult,
    songDuration: number
  ): BeatmapByDifficulty {
    return {
      EASY: this.buildEasy(events, tempo, songDuration),
      MEDIUM: this.buildMedium(events, tempo, songDuration),
      HARD: this.buildHard(events, tempo, songDuration),
      EXPERT: this.buildExpert(events, tempo, songDuration)
    };
  }

  /**
   * FÁCIL: 3 Pistas (0, 1, 2). Sem acordes, ritmo focado nos tempos fortes.
   */
  private static buildEasy(
    events: DetectedMusicalEvent[],
    tempo: TempoAnalysisResult,
    duration: number
  ): Note[] {
    const notes: Note[] = [];
    const minSpacing = 0.22; // 220ms
    let lastTime = -1;
    let noteId = 1;

    for (const ev of events) {
      if (ev.time >= duration) continue;

      // Filter: only strong intensity or on/near beats
      const isNearBeat = tempo.beats.some(b => Math.abs(b - ev.time) < 0.08);
      const isStrong = ev.intensity > 0.40;

      if ((isNearBeat || isStrong) && (ev.time - lastTime) >= minSpacing) {
        // Map strictly to lanes 0, 1, 2
        let lane: Lane = 0;
        if (ev.register === 'mid') lane = 1;
        else if (ev.register === 'high') lane = 2;

        const noteDuration = ev.duration > 0.5 ? Number(Math.min(2.0, ev.duration).toFixed(3)) : 0;

        notes.push(this.makeNote(noteId++, ev.time, lane, noteDuration));
        lastTime = ev.time;
      }
    }

    return notes;
  }

  /**
   * MÉDIO: 4 Pistas (0, 1, 2, 3). Densidade moderada, acordes simples de 2 notas.
   */
  private static buildMedium(
    events: DetectedMusicalEvent[],
    tempo: TempoAnalysisResult,
    duration: number
  ): Note[] {
    const notes: Note[] = [];
    const minSpacing = 0.12; // 120ms
    let lastTime = -1;
    let noteId = 1;

    for (const ev of events) {
      if (ev.time >= duration) continue;

      if ((ev.time - lastTime) >= minSpacing || ev.type === 'chord') {
        // Map to lanes 0, 1, 2, 3
        let primaryLane: Lane = 1;
        if (ev.register === 'low') primaryLane = 0;
        else if (ev.register === 'mid') primaryLane = 1;
        else primaryLane = 2;

        const noteDuration = ev.duration > 0.4 ? Number(Math.min(2.5, ev.duration).toFixed(3)) : 0;

        if (ev.type === 'chord' && ev.intensity > 0.55 && (ev.time - lastTime) >= 0.25) {
          // Simple 2-note power chord within 0..3
          const secondLane: Lane = (Math.min(3, primaryLane + 1)) as Lane;
          notes.push(this.makeNote(noteId++, ev.time, primaryLane, noteDuration));
          if (secondLane !== primaryLane) {
            notes.push(this.makeNote(noteId++, ev.time, secondLane, noteDuration));
          }
        } else {
          notes.push(this.makeNote(noteId++, ev.time, primaryLane, noteDuration));
        }

        lastTime = ev.time;
      }
    }

    return notes;
  }

  /**
   * DIFÍCIL: 5 Pistas (0, 1, 2, 3, 4). Alta fidelidade rítmica e acordes.
   */
  private static buildHard(
    events: DetectedMusicalEvent[],
    tempo: TempoAnalysisResult,
    duration: number
  ): Note[] {
    const notes: Note[] = [];
    const minSpacing = 0.07; // 70ms
    let lastTime = -1;
    let noteId = 1;

    for (const ev of events) {
      if (ev.time >= duration) continue;

      if ((ev.time - lastTime) >= minSpacing || ev.type === 'chord') {
        let lane: Lane = 2;
        if (ev.register === 'low') lane = (ev.intensity > 0.6 ? 1 : 0) as Lane;
        else if (ev.register === 'mid') lane = (ev.intensity > 0.6 ? 3 : 2) as Lane;
        else lane = (ev.intensity > 0.7 ? 4 : 3) as Lane;

        const noteDuration = ev.duration > 0.35 ? Number(Math.min(3.0, ev.duration).toFixed(3)) : 0;

        if (ev.type === 'chord' && ev.intensity > 0.50 && (ev.time - lastTime) >= 0.18) {
          const l1 = Math.max(0, lane - 1) as Lane;
          const l2 = Math.min(4, lane + 1) as Lane;
          notes.push(this.makeNote(noteId++, ev.time, l1, noteDuration));
          notes.push(this.makeNote(noteId++, ev.time, l2, noteDuration));
        } else {
          notes.push(this.makeNote(noteId++, ev.time, lane, noteDuration));
        }

        lastTime = ev.time;
      }
    }

    return notes;
  }

  /**
   * EXPERT: 5 Pistas (0..4). Máxima fidelidade musical, solos e acordes completos.
   */
  private static buildExpert(
    events: DetectedMusicalEvent[],
    tempo: TempoAnalysisResult,
    duration: number
  ): Note[] {
    const notes: Note[] = [];
    const minSpacing = 0.05; // 50ms physical threshold
    let lastTime = -1;
    let noteId = 1;

    for (const ev of events) {
      if (ev.time >= duration) continue;

      if ((ev.time - lastTime) >= minSpacing || ev.type === 'chord') {
        // Melodic contour mapping across 5 lanes based on MIDI note or pitch
        let lane: Lane = 2;
        if (ev.midiNote) {
          if (ev.midiNote < 48) lane = 0;
          else if (ev.midiNote < 57) lane = 1;
          else if (ev.midiNote < 65) lane = 2;
          else if (ev.midiNote < 74) lane = 3;
          else lane = 4;
        } else {
          if (ev.register === 'low') lane = 0;
          else if (ev.register === 'mid') lane = 2;
          else lane = 4;
        }

        const noteDuration = ev.duration > 0.30 ? Number(Math.min(4.0, ev.duration).toFixed(3)) : 0;

        if (ev.type === 'chord' && (ev.time - lastTime) >= 0.15) {
          const chordLanes: Lane[] = [lane];
          if (lane > 0) chordLanes.unshift((lane - 1) as Lane);
          if (lane < 4 && ev.intensity > 0.70) chordLanes.push((lane + 1) as Lane);

          for (const l of chordLanes) {
            notes.push(this.makeNote(noteId++, ev.time, l, noteDuration));
          }
        } else {
          notes.push(this.makeNote(noteId++, ev.time, lane, noteDuration));
        }

        lastTime = ev.time;
      }
    }

    return notes;
  }
}
