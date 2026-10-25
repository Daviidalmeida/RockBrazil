import { Note, Lane, Difficulty, getLanesForDifficulty, NoteSpeedPreset } from '../../types';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  decay: number;
}

interface RingEffect {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
}

/**
 * ROCKBRAZIL BETA V6 — NOTE HIGHWAY
 * Manages 3D perspective projection, highway rendering, note gems, and receptors.
 * - Position strictly calculated from: progress = 1.0 - (note.time - musicTime) / travelTime.
 * - Aligns note with strike line center when musicTime === note.time.
 * - Zero `shadowBlur` calls for locked 60/120 FPS during multi-lane tapping.
 * - Flattened fret geometry (ry = laneWidth * 0.17 * scale) to eliminate note collisions.
 * - Clean chord connector rails and luminous receptor flash rings.
 */
export class NoteHighway {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private rings: RingEffect[] = [];

  // Active difficulty & dynamic lanes configuration
  private difficulty: Difficulty = 'HARD';
  private activeLanesList: Lane[] = [0, 1, 2, 3, 4];

  // Modern vibrant Lane Colors
  readonly laneColors = [
    { core: '#00ff88', glow: 'rgba(0, 255, 136, 0.75)', dark: '#006636', light: '#80ffc4' }, // 0: Verde
    { core: '#ff2a5f', glow: 'rgba(255, 42, 95, 0.75)',  dark: '#850022', light: '#ff85a3' }, // 1: Vermelho
    { core: '#ffe600', glow: 'rgba(255, 230, 0, 0.75)', dark: '#807300', light: '#fff480' }, // 2: Amarelo
    { core: '#00d0ff', glow: 'rgba(0, 208, 255, 0.75)', dark: '#005473', light: '#80e8ff' }, // 3: Azul
    { core: '#ff7b00', glow: 'rgba(255, 123, 0, 0.75)', dark: '#803e00', light: '#ffbd80' }  // 4: Laranja
  ];

  // 3D Perspective parameters
  readonly horizonYRatio = 0.085;       // Vanishing point Y
  readonly strikeLineYRatio = 0.82;     // Strike line Y (receptors location)
  readonly highwayTopWidthRatio = 0.28; // Narrow top for deep perspective
  readonly highwayBottomWidthRatio = 0.95; // Wide bottom for clear readability

  // V7: Restored comfortable base travel time (1.35s NORMAL) with selectable presets
  public speedPreset: NoteSpeedPreset = 'NORMAL';
  public speedMultiplier = 1.0;
  public visualEffectsEnabled = true;

  get baseTravelTime(): number {
    switch (this.speedPreset) {
      case 'LENTA': return 1.65;
      case 'RÁPIDA': return 1.05;
      case 'NORMAL':
      default: return 1.35;
    }
  }

  get travelTime(): number {
    return this.baseTravelTime / Math.max(0.6, Math.min(2.5, this.speedMultiplier));
  }

  get laneCount(): number {
    return this.activeLanesList.length;
  }

  constructor(canvas?: HTMLCanvasElement) {
    if (canvas && typeof canvas.getContext === 'function') {
      this.canvas = canvas;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not get 2D context from canvas');
      this.ctx = context;
      this.resize();
    } else {
      this.canvas = { width: 800, height: 600, parentElement: null } as any;
      this.ctx = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        ellipse: () => {},
        stroke: () => {},
        fill: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        scale: () => {},
        resetTransform: () => {}
      } as any;
    }
  }

  public calculateNoteProgress(noteTime: number, musicTime: number): number {
    const timeRemaining = noteTime - musicTime;
    return 1.0 - (timeRemaining / this.travelTime);
  }

  public calculateFretRadius(laneWidth: number, scale = 1.0): { rx: number; ry: number } {
    return {
      rx: laneWidth * 0.44 * scale,
      ry: laneWidth * 0.17 * scale
    };
  }

  public projectLanePoint(
    lane: Lane,
    progress: number,
    widthOverride?: number,
    heightOverride?: number,
    laneCountOverride?: number
  ): { x: number; y: number; laneWidth: number; scale: number; currentWidth: number; highwayLeft: number } {
    const w = widthOverride || this.width;
    const h = heightOverride || this.height;

    const horizonY = h * this.horizonYRatio;
    const strikeY = h * this.strikeLineYRatio;

    const persp = Math.pow(Math.max(0, Math.min(progress, 1.45)), 1.38);
    const currentY = horizonY + (strikeY - horizonY) * persp;

    const topWidth = w * this.highwayTopWidthRatio;
    const bottomWidth = w * this.highwayBottomWidthRatio;
    const currentWidth = topWidth + (bottomWidth - topWidth) * persp;

    const laneCount = laneCountOverride || Math.max(3, this.laneCount);
    const laneWidth = currentWidth / laneCount;
    const highwayLeft = (w - currentWidth) / 2;

    const laneIdx = Math.min(lane, laneCount - 1);
    const x = highwayLeft + laneWidth * (laneIdx + 0.5);
    const scale = 0.35 + 0.65 * persp;

    return { x, y: currentY, laneWidth, scale, currentWidth, highwayLeft };
  }

  public setDifficulty(diff: Difficulty, _maxLaneOverride?: number): void {
    this.difficulty = diff;
    if (diff === 'EASY') {
      this.activeLanesList = [0, 1, 2];
    } else if (diff === 'MEDIUM') {
      this.activeLanesList = [0, 1, 2, 3];
    } else {
      this.activeLanesList = [0, 1, 2, 3, 4];
    }
  }

  public resize(): void {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const w = (rect && rect.width > 0) ? rect.width : (typeof window !== 'undefined' ? (window.innerWidth || 360) : 360);
    const h = (rect && rect.height > 0) ? rect.height : (typeof window !== 'undefined' ? (window.innerHeight || 640) : 640);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    if (this.ctx.resetTransform) this.ctx.resetTransform();
    if (this.ctx.scale) this.ctx.scale(dpr, dpr);
  }

  get width(): number {
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    return this.canvas.width / dpr;
  }

  get height(): number {
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    return this.canvas.height / dpr;
  }

  public getLanePositionAtProgress(
    lane: Lane,
    progress: number
  ): { x: number; y: number; laneWidth: number; scale: number; currentWidth: number; highwayLeft: number } {
    const w = this.width;
    const h = this.height;

    const horizonY = h * this.horizonYRatio;
    const strikeY = h * this.strikeLineYRatio;

    // Non-linear natural foreshortening perspective
    const persp = Math.pow(Math.max(0, Math.min(progress, 1.45)), 1.38);
    const currentY = horizonY + (strikeY - horizonY) * persp;

    const topWidth = w * this.highwayTopWidthRatio;
    const bottomWidth = w * this.highwayBottomWidthRatio;
    const currentWidth = topWidth + (bottomWidth - topWidth) * persp;

    const laneCount = Math.max(3, this.laneCount);
    const laneWidth = currentWidth / laneCount;
    const highwayLeft = (w - currentWidth) / 2;

    const laneIdx = Math.min(lane, laneCount - 1);
    const x = highwayLeft + laneWidth * (laneIdx + 0.5);
    const scale = 0.35 + 0.65 * persp;

    return { x, y: currentY, laneWidth, scale, currentWidth, highwayLeft };
  }

  public spawnHitParticles(lane: Lane): void {
    if (!this.visualEffectsEnabled) return;
    const coords = this.getLanePositionAtProgress(lane, 1.0);
    const color = this.laneColors[lane];

    const particleCount = 12;
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.4;
      const speed = Math.random() * 4.5 + 2.0;
      this.particles.push({
        x: coords.x,
        y: coords.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        color: i % 2 === 0 ? color.core : '#ffffff',
        size: Math.random() * 3.5 + 2.0,
        alpha: 1.0,
        decay: Math.random() * 0.035 + 0.03
      });
    }

    this.rings.push({
      x: coords.x,
      y: coords.y,
      radius: coords.laneWidth * 0.3,
      maxRadius: coords.laneWidth * 0.95,
      color: color.core,
      alpha: 1.0
    });
  }

  public spawnSustainSparks(lane: Lane): void {
    if (!this.visualEffectsEnabled) return;
    const coords = this.getLanePositionAtProgress(lane, 1.0);
    const color = this.laneColors[lane];

    for (let i = 0; i < 2; i++) {
      this.particles.push({
        x: coords.x + (Math.random() - 0.5) * coords.laneWidth * 0.45,
        y: coords.y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 2.5,
        vy: -Math.random() * 4.5 - 2.5,
        color: Math.random() > 0.4 ? color.core : '#ffffff',
        size: Math.random() * 3.0 + 1.5,
        alpha: 0.9,
        decay: 0.06
      });
    }
  }

  public render(
    musicTime: number,
    notes: Note[],
    activeLanes: Set<Lane>,
    bpm = 132
  ): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // 1. Highway Surface & Border Rails
    this.drawHighway(ctx);

    // 2. Measure Lines
    this.drawBeatLines(ctx, musicTime, bpm);

    // 3. Sustains
    this.drawSustains(ctx, musicTime, notes);

    // 4. Strike Receptors
    this.drawStrikeTargets(ctx, activeLanes);

    // 5. Notes
    this.drawNotes(ctx, musicTime, notes);

    // 6. Effects
    this.renderEffects(ctx);

    ctx.restore();
  }

  private drawHighway(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    const horizonY = h * this.horizonYRatio;
    const bottomY = h * 0.99;

    const topWidth = w * this.highwayTopWidthRatio;
    const bottomWidth = w * this.highwayBottomWidthRatio;

    const topLeftX = (w - topWidth) / 2;
    const topRightX = topLeftX + topWidth;
    const bottomLeftX = (w - bottomWidth) / 2;
    const bottomRightX = bottomLeftX + bottomWidth;

    // Highway Board Surface
    ctx.beginPath();
    ctx.moveTo(topLeftX, horizonY);
    ctx.lineTo(topRightX, horizonY);
    ctx.lineTo(bottomRightX, bottomY);
    ctx.lineTo(bottomLeftX, bottomY);
    ctx.closePath();

    const surfaceGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
    surfaceGrad.addColorStop(0, '#040509');
    surfaceGrad.addColorStop(0.35, '#070912');
    surfaceGrad.addColorStop(0.8, '#0b0e1b');
    surfaceGrad.addColorStop(1, '#0e1122');
    ctx.fillStyle = surfaceGrad;
    ctx.fill();

    // Side Rails
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#22283e';
    ctx.beginPath();
    ctx.moveTo(topLeftX, horizonY);
    ctx.lineTo(bottomLeftX, bottomY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(topRightX, horizonY);
    ctx.lineTo(bottomRightX, bottomY);
    ctx.stroke();

    // Lane Dividers
    const laneCount = Math.max(3, this.laneCount);
    for (let i = 1; i < laneCount; i++) {
      const topDivX = topLeftX + (topWidth / laneCount) * i;
      const botDivX = bottomLeftX + (bottomWidth / laneCount) * i;

      ctx.beginPath();
      ctx.moveTo(topDivX, horizonY);
      ctx.lineTo(botDivX, bottomY);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  private drawBeatLines(ctx: CanvasRenderingContext2D, musicTime: number, bpm: number): void {
    if (bpm <= 0) return;
    const beatInterval = 60 / bpm;
    const firstBeat = Math.floor(musicTime / beatInterval) * beatInterval;

    ctx.save();
    for (let t = firstBeat; t <= musicTime + this.travelTime; t += beatInterval) {
      const timeRemaining = t - musicTime;
      const progress = 1.0 - (timeRemaining / this.travelTime);
      if (progress < 0 || progress > 1.05) continue;

      const pLeft = this.getLanePositionAtProgress(0, progress);
      const pRight = this.getLanePositionAtProgress((this.laneCount - 1) as Lane, progress);

      const y = pLeft.y;
      const leftX = pLeft.highwayLeft;
      const rightX = leftX + pLeft.currentWidth;

      ctx.beginPath();
      ctx.moveTo(leftX, y);
      ctx.lineTo(rightX, y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 1.5 * pLeft.scale;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSustains(ctx: CanvasRenderingContext2D, musicTime: number, notes: Note[]): void {
    for (const note of notes) {
      if (note.duration <= 0) continue;
      if (note.time + note.duration < musicTime - 0.25) continue;
      if (note.time > musicTime + this.travelTime * 1.25) continue;

      const lane = note.lane;
      const color = this.laneColors[lane];

      const headTimeRemaining = note.time - musicTime;
      const tailTimeRemaining = (note.time + note.duration) - musicTime;

      const rawHeadProgress = 1.0 - (headTimeRemaining / this.travelTime);
      const rawTailProgress = 1.0 - (tailTimeRemaining / this.travelTime);

      const headProg = note.hit ? 1.0 : Math.min(1.0, rawHeadProgress);
      const tailProg = Math.max(0, rawTailProgress);

      if (headProg <= 0 || tailProg >= 1.05) continue;

      const pHead = this.getLanePositionAtProgress(lane, headProg);
      const pTail = this.getLanePositionAtProgress(lane, tailProg);

      const trailWHead = pHead.laneWidth * 0.36;
      const trailWTail = pTail.laneWidth * 0.36;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pTail.x - trailWTail * 0.5, pTail.y);
      ctx.lineTo(pTail.x + trailWTail * 0.5, pTail.y);
      ctx.lineTo(pHead.x + trailWHead * 0.5, pHead.y);
      ctx.lineTo(pHead.x - trailWHead * 0.5, pHead.y);
      ctx.closePath();

      const sustainGrad = ctx.createLinearGradient(0, pTail.y, 0, pHead.y);
      sustainGrad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
      sustainGrad.addColorStop(0.5, color.glow);
      sustainGrad.addColorStop(1, color.core);

      ctx.fillStyle = sustainGrad;
      ctx.fill();

      // Laser center wire
      ctx.beginPath();
      ctx.moveTo(pTail.x, pTail.y);
      ctx.lineTo(pHead.x, pHead.y);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, 2.5 * pHead.scale);
      ctx.stroke();

      ctx.restore();
    }
  }

  private drawStrikeTargets(ctx: CanvasRenderingContext2D, activeLanes: Set<Lane>): void {
    const h = this.height;
    const strikeY = h * this.strikeLineYRatio;
    const pSample = this.getLanePositionAtProgress(0, 1.0);

    const lineLeft = pSample.highwayLeft;
    const lineRight = pSample.highwayLeft + pSample.currentWidth;

    ctx.save();

    // 1. Strike Bar across the highway
    const barGrad = ctx.createLinearGradient(lineLeft, strikeY, lineRight, strikeY);
    barGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    barGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.7)');
    barGrad.addColorStop(1, 'rgba(255, 255, 255, 0.15)');

    ctx.strokeStyle = barGrad;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(lineLeft, strikeY);
    ctx.lineTo(lineRight, strikeY);
    ctx.stroke();

    // 2. Strike Receptors
    const laneCount = this.laneCount;
    for (let laneIdx = 0; laneIdx < laneCount; laneIdx++) {
      const lane = this.activeLanesList[laneIdx];
      const { x, y, laneWidth } = this.getLanePositionAtProgress(lane, 1.0);
      const isPressed = activeLanes.has(lane);
      const color = this.laneColors[lane];
      const radius = laneWidth * 0.38;

      ctx.save();

      // Outer Bezel Ring
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = isPressed ? color.core : 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = isPressed ? 4.5 : 2.5;
      ctx.stroke();

      // Inner Receptor Cup
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.75, 0, Math.PI * 2);
      if (isPressed) {
        // Active Laser Flare (Fast, high-performance radial gradient without shadowBlur)
        const pressGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        pressGrad.addColorStop(0, '#ffffff');
        pressGrad.addColorStop(0.4, color.core);
        pressGrad.addColorStop(1, color.dark);
        ctx.fillStyle = pressGrad;
        ctx.fill();

        // High-contrast luminous aura ring (Hardware fast neon feedback)
        ctx.beginPath();
        ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = color.glow;
        ctx.lineWidth = 3.5;
        ctx.stroke();

        // Core light
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else {
        // Inactive Dark Cup
        ctx.fillStyle = 'rgba(14, 16, 28, 0.75)';
        ctx.fill();
        ctx.strokeStyle = color.glow;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, radius * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = color.core;
        ctx.fill();
      }

      ctx.restore();
    }

    ctx.restore();
  }

  private drawNotes(ctx: CanvasRenderingContext2D, musicTime: number, notes: Note[]): void {
    const visibleNotes: Note[] = [];

    for (const note of notes) {
      if (note.hit || note.missed) continue;

      const timeRemaining = note.time - musicTime;
      const progress = 1.0 - (timeRemaining / this.travelTime);

      if (progress < -0.06 || progress > 1.12) continue;
      visibleNotes.push(note);
    }

    // 1. Draw Chord Connector Beams
    const chordGroups = new Map<number, Note[]>();
    for (const note of visibleNotes) {
      const roundedTime = Math.round(note.time * 50) / 50; // 20ms quantization
      if (!chordGroups.has(roundedTime)) chordGroups.set(roundedTime, []);
      chordGroups.get(roundedTime)!.push(note);
    }

    ctx.save();
    chordGroups.forEach((groupNotes) => {
      if (groupNotes.length > 1) {
        groupNotes.sort((a, b) => a.lane - b.lane);
        const first = groupNotes[0];
        const last = groupNotes[groupNotes.length - 1];

        const pFirst = this.getLanePositionAtProgress(first.lane, 1.0 - ((first.time - musicTime) / this.travelTime));
        const pLast = this.getLanePositionAtProgress(last.lane, 1.0 - ((last.time - musicTime) / this.travelTime));

        ctx.beginPath();
        ctx.moveTo(pFirst.x, pFirst.y);
        ctx.lineTo(pLast.x, pLast.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = Math.max(2, 3.5 * pFirst.scale);
        ctx.stroke();
      }
    });
    ctx.restore();

    // 2. Draw 3D Note Gems (Optimized Sleek Frets: rx = 44%, ry = 17% to prevent clumping)
    for (const note of visibleNotes) {
      const timeRemaining = note.time - musicTime;
      const progress = 1.0 - (timeRemaining / this.travelTime);

      const { x, y, laneWidth, scale } = this.getLanePositionAtProgress(note.lane, progress);
      const color = this.laneColors[note.lane];

      const rx = laneWidth * 0.44 * scale;
      const ry = laneWidth * 0.17 * scale;

      ctx.save();

      // 3D Bottom Bevel
      ctx.beginPath();
      ctx.ellipse(x, y + ry * 0.35, rx, ry * 0.9, 0, 0, Math.PI * 2);
      ctx.fillStyle = color.dark;
      ctx.fill();

      // Main Gem Body
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);

      const gemGrad = ctx.createRadialGradient(
        x - rx * 0.25, y - ry * 0.35, rx * 0.08,
        x, y, rx
      );
      gemGrad.addColorStop(0, '#ffffff');
      gemGrad.addColorStop(0.35, color.light);
      gemGrad.addColorStop(0.7, color.core);
      gemGrad.addColorStop(1, color.dark);

      ctx.fillStyle = gemGrad;
      ctx.fill();

      // Chrome Rim
      ctx.lineWidth = Math.max(1.5, 2.5 * scale);
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Top Specular Highlight Pill
      ctx.beginPath();
      ctx.ellipse(
        x - rx * 0.15,
        y - ry * 0.35,
        rx * 0.48,
        ry * 0.28,
        0, 0, Math.PI * 2
      );
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fill();

      ctx.restore();
    }
  }

  private renderEffects(ctx: CanvasRenderingContext2D): void {
    // 1. Expanding Shockwave Rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.radius += 2.5;
      ring.alpha -= 0.055;

      if (ring.alpha <= 0 || ring.radius >= ring.maxRadius) {
        this.rings.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = Math.max(0, ring.alpha);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    // 2. Burst & Sustain Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fill();
      ctx.restore();
    }
  }
}
