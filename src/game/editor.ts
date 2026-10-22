import { Note, Lane, Difficulty, SongMetadata } from '../types';
import { AudioManager } from '../audio/audioManager';
import { BeatmapManager } from './beatmapManager';

export class NoteEditor {
  private audio: AudioManager;
  private beatmaps: BeatmapManager;
  private currentSong: SongMetadata | null = null;
  private currentDifficulty: Difficulty = 'MEDIUM';
  private notes: Note[] = [];
  private isPlaying = false;
  private noteType: 'tap' | 'sustain' = 'tap';
  private sustainDuration = 0.8;

  // DOM Elements
  private container: HTMLElement;
  private timeDisplay: HTMLElement;
  private scrubber: HTMLInputElement;
  private btnPlay: HTMLElement;
  private btnSave: HTMLElement;
  private btnPlaytest: HTMLElement;
  private notesList: HTMLElement;

  public onPlaytestRequested?: (song: SongMetadata, difficulty: Difficulty, notes: Note[]) => void;
  public onCloseRequested?: () => void;

  constructor(audio: AudioManager, beatmaps: BeatmapManager) {
    this.audio = audio;
    this.beatmaps = beatmaps;
    this.container = document.getElementById('screen-editor')!;
    this.timeDisplay = document.getElementById('editor-time')!;
    this.scrubber = document.getElementById('editor-scrubber') as HTMLInputElement;
    this.btnPlay = document.getElementById('btn-editor-play')!;
    this.btnSave = document.getElementById('btn-editor-save')!;
    this.btnPlaytest = document.getElementById('btn-editor-playtest')!;
    this.notesList = document.getElementById('editor-notes-list')!;

    this.bindEvents();
  }

  private bindEvents(): void {
    document.getElementById('btn-editor-close')?.addEventListener('click', () => {
      this.stop();
      this.onCloseRequested?.();
    });

    this.btnPlay?.addEventListener('click', () => {
      if (this.isPlaying) {
        this.pause();
      } else {
        this.play();
      }
    });

    this.scrubber?.addEventListener('input', () => {
      const targetTime = Number(this.scrubber.value);
      this.seek(targetTime);
    });

    this.btnSave?.addEventListener('click', () => {
      if (this.currentSong) {
        this.beatmaps.saveBeatmap(this.currentSong.id, this.currentDifficulty, this.notes);
        alert('Mapa salvo com sucesso no navegador!');
      }
    });

    this.btnPlaytest?.addEventListener('click', () => {
      if (this.currentSong) {
        this.stop();
        this.beatmaps.saveBeatmap(this.currentSong.id, this.currentDifficulty, this.notes);
        this.onPlaytestRequested?.(this.currentSong, this.currentDifficulty, this.notes);
      }
    });

    // Editor 5 Lane Buttons
    for (let lane = 0; lane < 5; lane++) {
      const btn = document.getElementById(`editor-lane-${lane}`);
      btn?.addEventListener('click', () => {
        this.addNoteAtCurrentTime(lane as Lane);
      });
    }

    // Toggle Tap / Sustain
    document.getElementById('btn-editor-tap')?.addEventListener('click', (e) => {
      this.noteType = 'tap';
      (e.target as HTMLElement).classList.add('active');
      document.getElementById('btn-editor-sustain')?.classList.remove('active');
    });

    document.getElementById('btn-editor-sustain')?.addEventListener('click', (e) => {
      this.noteType = 'sustain';
      (e.target as HTMLElement).classList.add('active');
      document.getElementById('btn-editor-tap')?.classList.remove('active');
    });

    // Export / Import JSON
    document.getElementById('btn-editor-export')?.addEventListener('click', () => {
      const jsonStr = JSON.stringify(this.notes, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.currentSong?.id || 'song'}-${this.currentDifficulty}.json`;
      a.click();
    });
  }

  open(song: SongMetadata, difficulty: Difficulty): void {
    this.currentSong = song;
    this.currentDifficulty = difficulty;
    this.notes = this.beatmaps.getBeatmap(song.id, difficulty);
    this.scrubber.max = song.duration.toString();
    this.scrubber.value = '0';
    this.updateTimeDisplay(0);
    this.renderNotesSummary();

    const titleEl = document.getElementById('editor-song-title');
    if (titleEl) {
      titleEl.textContent = `${song.title} (${difficulty})`;
    }
  }

  private updateTimeDisplay(sec: number): void {
    const mins = Math.floor(sec / 60);
    const secs = (sec % 60).toFixed(2).padStart(5, '0');
    this.timeDisplay.textContent = `${mins}:${secs}`;
  }

  private addNoteAtCurrentTime(lane: Lane): void {
    const t = Number(this.audio.getCurrentTime().toFixed(3));
    const dur = this.noteType === 'sustain' ? this.sustainDuration : 0;
    this.notes.push({
      id: Date.now() + Math.random(),
      time: t,
      lane,
      duration: dur,
      hit: false,
      missed: false,
      sustainCompleted: false,
      sustainHeldTime: 0
    });
    this.notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
    this.renderNotesSummary();
    this.audio.playSfxHit();
  }

  private removeNote(id: number): void {
    this.notes = this.notes.filter((n) => n.id !== id);
    this.renderNotesSummary();
  }

  private renderNotesSummary(): void {
    const laneColors = ['#00ff88', '#ff2a5f', '#ffe600', '#00d0ff', '#ff7b00'];
    const laneNames = ['Verde', 'Vermelho', 'Amarelo', 'Azul', 'Laranja'];

    const countEl = document.getElementById('editor-note-count');
    if (countEl) countEl.textContent = `${this.notes.length} notas no mapa`;

    const currentTime = this.audio.getCurrentTime();
    const nearby = this.notes.filter((n) => Math.abs(n.time - currentTime) <= 2.5);

    this.notesList.innerHTML = nearby.map((n) => `
      <div class="editor-note-pill" style="border-left: 4px solid ${laneColors[n.lane]}">
        <span><strong>${n.time.toFixed(2)}s</strong> - ${laneNames[n.lane]} ${n.duration > 0 ? `(Longa ${n.duration}s)` : ''}</span>
        <button class="btn-remove-note" data-id="${n.id}">✕</button>
      </div>
    `).join('');

    this.notesList.querySelectorAll('.btn-remove-note').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = Number((e.target as HTMLElement).dataset.id);
        this.removeNote(id);
      });
    });
  }

  private play(): void {
    if (!this.currentSong) return;
    this.isPlaying = true;
    this.btnPlay.textContent = '⏸ PAUSAR';
    const offset = Number(this.scrubber.value);

    if (this.currentSong.type === 'procedural' && this.currentSong.proceduralTrackId) {
      this.audio.playProceduralTrack(this.currentSong.proceduralTrackId, offset);
    } else if (this.currentSong.audioBuffer) {
      this.audio.playAudioBuffer(this.currentSong.audioBuffer, offset);
    }

    this.trackPlayback();
  }

  private pause(): void {
    this.isPlaying = false;
    this.btnPlay.textContent = '▶ REPRODUZIR';
    this.audio.pause();
  }

  private stop(): void {
    this.isPlaying = false;
    this.btnPlay.textContent = '▶ REPRODUZIR';
    this.audio.stop();
  }

  private seek(targetSec: number): void {
    this.updateTimeDisplay(targetSec);
    this.renderNotesSummary();
    if (this.isPlaying) {
      this.play();
    }
  }

  private trackPlayback = (): void => {
    if (!this.isPlaying) return;
    const t = this.audio.getCurrentTime();
    this.scrubber.value = t.toString();
    this.updateTimeDisplay(t);
    this.renderNotesSummary();
    if (this.currentSong && t >= this.currentSong.duration) {
      this.stop();
      return;
    }
    requestAnimationFrame(this.trackPlayback);
  };
}
