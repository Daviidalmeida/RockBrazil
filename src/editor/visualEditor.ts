import { Note, Lane, Difficulty, SongMetadata } from '../types';
import { BeatmapManager } from '../game/beatmapManager';
import { AudioManager } from '../audio/audioManager';

export class VisualEditor {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private beatmaps: BeatmapManager;
  private audio: AudioManager;

  private currentSong: SongMetadata | null = null;
  private currentDifficulty: Difficulty = 'MEDIUM';
  private notes: Note[] = [];

  // Editor State
  private currentTime = 0; // Current playhead time in seconds
  private zoom = 140; // Pixels per second
  private scrollLeftSeconds = 0;
  private isPlaying = false;
  private selectedNoteId: number | null = null;
  private isDraggingNote = false;
  private isResizingSustain = false;
  private dragStartX = 0;
  private dragOriginalTime = 0;
  private dragOriginalLane: Lane = 0;
  private dragOriginalDuration = 0;
  private snapDivision = 4; // 4 = 1/4 beat, 8 = 1/8 beat, 16 = 1/16 beat, 0 = free
  private animationFrameId: number | null = null;

  // Colors
  readonly laneColors = [
    { core: '#00ff88', glow: 'rgba(0, 255, 136, 0.4)', border: '#00cc66' },
    { core: '#ff2a5f', glow: 'rgba(255, 42, 95, 0.4)',  border: '#cc0033' },
    { core: '#ffe600', glow: 'rgba(255, 230, 0, 0.4)', border: '#cca800' },
    { core: '#00d0ff', glow: 'rgba(0, 208, 255, 0.4)', border: '#0099cc' },
    { core: '#ff7b00', glow: 'rgba(255, 123, 0, 0.4)', border: '#cc5500' }
  ];

  // Callbacks
  public onExitRequested?: () => void;
  public onTestPlayRequested?: (song: SongMetadata, difficulty: Difficulty, notes: Note[]) => void;

  constructor(
    container: HTMLElement,
    canvas: HTMLCanvasElement,
    beatmaps: BeatmapManager,
    audio: AudioManager
  ) {
    this.container = container;
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Falha ao obter contexto 2D para o Editor.');
    this.ctx = context;
    this.beatmaps = beatmaps;
    this.audio = audio;

    this.setupEventListeners();
    this.resize();
  }

  public open(song: SongMetadata, difficulty: Difficulty = 'MEDIUM'): void {
    this.currentSong = song;
    this.currentDifficulty = difficulty;
    this.currentTime = 0;
    this.scrollLeftSeconds = 0;
    this.isPlaying = false;
    this.selectedNoteId = null;

    // Load existing notes from BeatmapManager
    const existing = this.beatmaps.getBeatmap(song.id, difficulty);
    this.notes = JSON.parse(JSON.stringify(existing));

    this.resize();
    this.render();
    this.updateControlsUI();
  }

  public close(): void {
    this.stopPlayback();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public resize(): void {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = (rect && rect.width > 0) ? rect.width : window.innerWidth;
    const h = 260; // 5 lanes (40px each) + 30px ruler + 30px buffer

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
    this.render();
  }

  private get width(): number {
    return this.canvas.width / (Math.min(window.devicePixelRatio || 1, 2));
  }

  private get height(): number {
    return this.canvas.height / (Math.min(window.devicePixelRatio || 1, 2));
  }

  private setupEventListeners(): void {
    // Window Resize
    window.addEventListener('resize', () => {
      if (!this.container.classList.contains('hidden')) {
        this.resize();
      }
    });

    // Canvas Pointer Events
    this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    window.addEventListener('pointerup', () => this.handlePointerUp());

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (this.container.classList.contains('hidden')) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlayback();
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (this.selectedNoteId !== null) {
          e.preventDefault();
          this.deleteSelectedNote();
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        this.seek(this.currentTime - 1.0);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        this.seek(this.currentTime + 1.0);
      }
    });

    // Horizontal Scroll with Mouse Wheel (Zoom or Scroll)
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const zoomDelta = e.deltaY > 0 ? 0.85 : 1.18;
        this.zoom = Math.max(40, Math.min(400, this.zoom * zoomDelta));
      } else {
        // Horizontal Scroll
        const deltaSeconds = (e.deltaY || e.deltaX) / this.zoom;
        this.scrollLeftSeconds = Math.max(0, this.scrollLeftSeconds + deltaSeconds);
      }
      this.render();
      this.updateControlsUI();
    }, { passive: false });
  }

  private handlePointerDown(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const rulerHeight = 32;
    const laneHeight = 40;

    // 1. Click on Ruler -> Seek Playhead
    if (y <= rulerHeight) {
      const clickTime = this.scrollLeftSeconds + (x / this.zoom);
      this.seek(Math.max(0, clickTime));
      return;
    }

    // 2. Click in Lane Area
    const laneIndex = Math.floor((y - rulerHeight) / laneHeight);
    if (laneIndex < 0 || laneIndex > 4) return;
    const targetLane = laneIndex as Lane;

    const clickTime = this.scrollLeftSeconds + (x / this.zoom);

    // Check if clicked existing note
    const hitNote = this.findNoteAt(clickTime, targetLane);

    if (hitNote) {
      this.selectedNoteId = hitNote.id;
      const noteX = (hitNote.time - this.scrollLeftSeconds) * this.zoom;
      const noteW = Math.max(24, hitNote.duration * this.zoom);

      // Check if clicking resize tail (right edge)
      if (hitNote.duration > 0 && Math.abs(x - (noteX + noteW)) < 12) {
        this.isResizingSustain = true;
        this.dragStartX = x;
        this.dragOriginalDuration = hitNote.duration;
      } else {
        this.isDraggingNote = true;
        this.dragStartX = x;
        this.dragOriginalTime = hitNote.time;
        this.dragOriginalLane = hitNote.lane;
      }
    } else {
      // Create new note snapped to grid
      const snappedTime = this.snapTime(clickTime);
      const newNote: Note = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        time: Number(snappedTime.toFixed(3)),
        lane: targetLane,
        duration: 0,
        hit: false,
        missed: false,
        sustainCompleted: false,
        sustainHeldTime: 0
      };

      this.notes.push(newNote);
      this.notes.sort((a, b) => a.time - b.time);
      this.selectedNoteId = newNote.id;
      this.isDraggingNote = true;
      this.dragStartX = x;
      this.dragOriginalTime = newNote.time;
      this.dragOriginalLane = newNote.lane;
    }

    this.render();
    this.updateControlsUI();
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.isDraggingNote && !this.isResizingSustain) return;
    if (this.selectedNoteId === null) return;

    const note = this.notes.find((n) => n.id === this.selectedNoteId);
    if (!note) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const rulerHeight = 32;
    const laneHeight = 40;

    if (this.isResizingSustain) {
      const deltaSeconds = (x - this.dragStartX) / this.zoom;
      const newDuration = Math.max(0, this.dragOriginalDuration + deltaSeconds);
      note.duration = Number(newDuration.toFixed(3));
    } else if (this.isDraggingNote) {
      const deltaSeconds = (x - this.dragStartX) / this.zoom;
      const rawTime = Math.max(0, this.dragOriginalTime + deltaSeconds);
      note.time = Number(this.snapTime(rawTime).toFixed(3));

      // Lane change
      const laneIndex = Math.floor((y - rulerHeight) / laneHeight);
      if (laneIndex >= 0 && laneIndex <= 4) {
        note.lane = laneIndex as Lane;
      }
    }

    this.render();
    this.updateControlsUI();
  }

  private handlePointerUp(): void {
    if (this.isDraggingNote || this.isResizingSustain) {
      this.isDraggingNote = false;
      this.isResizingSustain = false;
      this.notes.sort((a, b) => a.time - b.time);
      this.render();
      this.updateControlsUI();
    }
  }

  private findNoteAt(time: number, lane: Lane): Note | undefined {
    const tolerance = 16 / this.zoom;
    return this.notes.find((n) => {
      if (n.lane !== lane) return false;
      const start = n.time - tolerance;
      const end = n.time + Math.max(tolerance, n.duration);
      return time >= start && time <= end;
    });
  }

  private snapTime(time: number): number {
    if (this.snapDivision === 0 || !this.currentSong) return time;
    const bpm = this.currentSong.bpm || 120;
    const beatSeconds = 60 / bpm;
    const stepSeconds = beatSeconds / (this.snapDivision / 4);
    return Math.round(time / stepSeconds) * stepSeconds;
  }

  public deleteSelectedNote(): void {
    if (this.selectedNoteId === null) return;
    this.notes = this.notes.filter((n) => n.id !== this.selectedNoteId);
    this.selectedNoteId = null;
    this.render();
    this.updateControlsUI();
  }

  public clearAllNotes(): void {
    if (confirm('Deseja realmente apagar todas as notas deste mapa?')) {
      this.notes = [];
      this.selectedNoteId = null;
      this.render();
      this.updateControlsUI();
    }
  }

  public saveToGame(): void {
    if (!this.currentSong) return;
    this.beatmaps.saveBeatmap(this.currentSong.id, this.currentDifficulty, this.notes);
    alert(`⚡ Mapa salvo com sucesso para ${this.currentSong.title} (${this.currentDifficulty})! Total: ${this.notes.length} notas.`);
  }

  public exportJSON(): void {
    if (!this.currentSong) return;
    const exportData = {
      songId: this.currentSong.id,
      title: this.currentSong.title,
      difficulty: this.currentDifficulty,
      bpm: this.currentSong.bpm,
      duration: this.currentSong.duration,
      notes: this.notes
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentSong.id}_${this.currentDifficulty.toLowerCase()}_chart.json`;
    a.click();
  }

  public importJSON(jsonStr: string): void {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed.notes)) {
        throw new Error('Formato inválido. Campo "notes" ausente.');
      }
      this.notes = parsed.notes.map((n: any, idx: number) => ({
        id: n.id || Date.now() + idx,
        time: Number(n.time) || 0,
        lane: (Number(n.lane) || 0) as Lane,
        duration: Number(n.duration) || 0,
        hit: false,
        missed: false,
        sustainCompleted: false,
        sustainHeldTime: 0
      }));
      this.notes.sort((a, b) => a.time - b.time);
      this.render();
      this.updateControlsUI();
      alert(`Importadas ${this.notes.length} notas com sucesso!`);
    } catch (err: any) {
      alert('Erro ao importar JSON: ' + (err.message || err));
    }
  }

  public togglePlayback(): void {
    if (this.isPlaying) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  public startPlayback(): void {
    if (!this.currentSong) return;
    this.isPlaying = true;

    if (this.currentSong.type === 'procedural' && this.currentSong.proceduralTrackId) {
      this.audio.playProceduralTrack(this.currentSong.proceduralTrackId, this.currentTime);
    } else if (this.currentSong.audioBuffer) {
      this.audio.playAudioBuffer(this.currentSong.audioBuffer, this.currentTime);
    }

    this.tickLoop();
  }

  public stopPlayback(): void {
    this.isPlaying = false;
    this.audio.stop();
  }

  public seek(seconds: number): void {
    const maxDur = this.currentSong?.duration || 300;
    this.currentTime = Math.max(0, Math.min(seconds, maxDur));

    if (this.isPlaying) {
      this.startPlayback(); // Resync playback
    }

    // Auto-scroll to keep playhead visible
    const visibleStart = this.scrollLeftSeconds;
    const visibleEnd = visibleStart + (this.width / this.zoom);
    if (this.currentTime < visibleStart || this.currentTime > visibleEnd - 0.5) {
      this.scrollLeftSeconds = Math.max(0, this.currentTime - 1.0);
    }

    this.render();
    this.updateControlsUI();
  }

  private tickLoop = (): void => {
    if (!this.isPlaying) return;

    this.currentTime = this.audio.getCurrentTime();

    // Auto-scroll follow playhead
    const visibleStart = this.scrollLeftSeconds;
    const visibleEnd = visibleStart + (this.width / this.zoom);
    if (this.currentTime > visibleEnd - 1.0) {
      this.scrollLeftSeconds = this.currentTime - 1.0;
    }

    const maxDur = this.currentSong?.duration || 300;
    if (this.currentTime >= maxDur) {
      this.stopPlayback();
      this.seek(0);
      return;
    }

    this.render();
    this.updateControlsUI();
    this.animationFrameId = requestAnimationFrame(this.tickLoop);
  };

  public setSnapDivision(div: number): void {
    this.snapDivision = div;
  }

  // --- Rendering Canvas Highway & Notes ---
  public render(): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    const rulerHeight = 32;
    const laneHeight = 40;

    // 1. Clear background
    ctx.fillStyle = '#0a0b12';
    ctx.fillRect(0, 0, w, h);

    // 2. Draw 5 Horizontal Lanes
    for (let lane = 0; lane < 5; lane++) {
      const y = rulerHeight + lane * laneHeight;
      const color = this.laneColors[lane];

      ctx.fillStyle = lane % 2 === 0 ? 'rgba(18, 20, 32, 0.95)' : 'rgba(14, 15, 26, 0.95)';
      ctx.fillRect(0, y, w, laneHeight);

      // Lane line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      // Lane identifier badge on left
      ctx.fillStyle = color.core;
      ctx.fillRect(4, y + 10, 6, 20);
      ctx.fillStyle = '#8c90a3';
      ctx.font = '10px Montserrat, sans-serif';
      ctx.fillText(`L${lane + 1}`, 14, y + 24);
    }

    // 3. Draw Beat Grid & Time Ruler
    this.drawGridAndRuler(ctx, w, h, rulerHeight);

    // 4. Draw Notes & Sustains
    this.drawNotes(ctx, rulerHeight, laneHeight);

    // 5. Draw Playhead (Vertical Red Line)
    const playheadX = (this.currentTime - this.scrollLeftSeconds) * this.zoom;
    if (playheadX >= 0 && playheadX <= w) {
      ctx.strokeStyle = '#ff2a5f';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ff2a5f';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Playhead triangle flag
      ctx.fillStyle = '#ff2a5f';
      ctx.beginPath();
      ctx.moveTo(playheadX - 6, 0);
      ctx.lineTo(playheadX + 6, 0);
      ctx.lineTo(playheadX, 10);
      ctx.fill();
    }
  }

  private drawGridAndRuler(ctx: CanvasRenderingContext2D, w: number, h: number, rulerH: number): void {
    const bpm = this.currentSong?.bpm || 120;
    const beatSec = 60 / bpm;

    const startSec = Math.max(0, this.scrollLeftSeconds);
    const endSec = startSec + (w / this.zoom);

    // Ruler Background
    ctx.fillStyle = '#141624';
    ctx.fillRect(0, 0, w, rulerH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rulerH);
    ctx.lineTo(w, rulerH);
    ctx.stroke();

    // Align to first beat
    const firstBeat = Math.floor(startSec / beatSec);
    const lastBeat = Math.ceil(endSec / beatSec);

    for (let b = firstBeat; b <= lastBeat; b++) {
      const beatTime = b * beatSec;
      const x = (beatTime - this.scrollLeftSeconds) * this.zoom;
      if (x < 0 || x > w) continue;

      const isMeasure = b % 4 === 0;

      // Vertical grid lines across lanes
      ctx.strokeStyle = isMeasure ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = isMeasure ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, rulerH);
      ctx.lineTo(x, h);
      ctx.stroke();

      // Ruler ticks & text
      ctx.strokeStyle = isMeasure ? '#ffffff' : '#6b7280';
      ctx.beginPath();
      ctx.moveTo(x, rulerH - (isMeasure ? 14 : 7));
      ctx.lineTo(x, rulerH);
      ctx.stroke();

      if (isMeasure) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Montserrat, sans-serif';
        ctx.fillText(`${beatTime.toFixed(1)}s`, x + 3, rulerH - 12);
        ctx.fillStyle = '#ffe600';
        ctx.fillText(`M${Math.floor(b / 4) + 1}`, x + 3, rulerH - 2);
      }
    }
  }

  private drawNotes(ctx: CanvasRenderingContext2D, rulerH: number, laneH: number): void {
    const w = this.width;
    const startSec = this.scrollLeftSeconds;
    const endSec = startSec + (w / this.zoom);

    for (const note of this.notes) {
      const noteEnd = note.time + Math.max(0.1, note.duration);
      if (noteEnd < startSec || note.time > endSec) continue;

      const x = (note.time - this.scrollLeftSeconds) * this.zoom;
      const y = rulerH + note.lane * laneH + 6;
      const noteHeight = laneH - 12;
      const isSelected = note.id === this.selectedNoteId;
      const color = this.laneColors[note.lane];

      // Sustain Tail
      if (note.duration > 0) {
        const sustainW = note.duration * this.zoom;
        ctx.fillStyle = color.glow;
        ctx.fillRect(x + 12, y + noteHeight * 0.35, sustainW, noteHeight * 0.3);

        ctx.strokeStyle = color.core;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 12, y + noteHeight * 0.35, sustainW, noteHeight * 0.3);

        // Resize handle on end of sustain
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 12 + sustainW - 4, y + 2, 6, noteHeight - 4);
      }

      // Note Head
      const headWidth = 22;
      ctx.fillStyle = color.core;
      ctx.beginPath();
      ctx.roundRect(x, y, headWidth, noteHeight, 6);
      ctx.fill();

      ctx.strokeStyle = isSelected ? '#ffffff' : color.border;
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, headWidth, noteHeight, 6);
      ctx.stroke();

      if (isSelected) {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  }

  private updateControlsUI(): void {
    const timeDisplay = document.getElementById('editor-time-display');
    if (timeDisplay && this.currentSong) {
      const curM = Math.floor(this.currentTime / 60);
      const curS = (this.currentTime % 60).toFixed(1).padStart(4, '0');
      const totM = Math.floor(this.currentSong.duration / 60);
      const totS = (this.currentSong.duration % 60).toFixed(1).padStart(4, '0');
      timeDisplay.textContent = `${curM}:${curS} / ${totM}:${totS}`;
    }

    const scrubber = document.getElementById('editor-time-scrubber') as HTMLInputElement;
    if (scrubber && this.currentSong && !this.isDraggingNote) {
      scrubber.max = this.currentSong.duration.toString();
      scrubber.value = this.currentTime.toString();
    }

    const countDisplay = document.getElementById('editor-notes-count');
    if (countDisplay) {
      countDisplay.textContent = `Notas: ${this.notes.length}`;
    }

    const btnPlay = document.getElementById('btn-editor-play');
    if (btnPlay) {
      btnPlay.textContent = this.isPlaying ? '⏸ PAUSAR' : '▶ REPRODUZIR';
    }
  }
}
