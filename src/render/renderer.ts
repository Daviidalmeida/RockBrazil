import { Note, Lane } from '../types';

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

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private rings: RingEffect[] = [];
  private screenShake = 0;

  // Lane Colors
  readonly laneColors = [
    { core: '#00ff88', glow: 'rgba(0, 255, 136, 0.7)', dark: '#008f4c' }, // 0: Green
    { core: '#ff2a5f', glow: 'rgba(255, 42, 95, 0.7)',  dark: '#9e0029' }, // 1: Red
    { core: '#ffe600', glow: 'rgba(255, 230, 0, 0.7)', dark: '#a69500' }, // 2: Yellow
    { core: '#00d0ff', glow: 'rgba(0, 208, 255, 0.7)', dark: '#006b94' }, // 3: Blue
    { core: '#ff7b00', glow: 'rgba(255, 123, 0, 0.7)', dark: '#944600' }  // 4: Orange
  ];

  // Perspective parameters
  readonly horizonYRatio = 0.08;   // Vanishing point Y
  readonly strikeLineYRatio = 0.82; // Strike line Y
  readonly highwayTopWidthRatio = 0.35; // Narrow at top
  readonly highwayBottomWidthRatio = 0.94; // Wide at strike line
  readonly baseNoteSpeed = 1.35; // Base seconds from horizon to strike line
  public noteSpeedMultiplier = 1.0;
  public visualEffectsEnabled = true;

  get noteSpeed(): number {
    return this.baseNoteSpeed / Math.max(0.6, Math.min(2.5, this.noteSpeedMultiplier));
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D context from canvas');
    this.ctx = context;
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = (rect && rect.width > 0) ? rect.width : (window.innerWidth || 360);
    const h = (rect && rect.height > 0) ? rect.height : (window.innerHeight || 640);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
  }

  get width(): number {
    return this.canvas.width / (Math.min(window.devicePixelRatio || 1, 2));
  }

  get height(): number {
    return this.canvas.height / (Math.min(window.devicePixelRatio || 1, 2));
  }

  /**
   * Triggers a screen shake effect
   */
  triggerShake(intensity = 6): void {
    if (!this.visualEffectsEnabled) return;
    this.screenShake = intensity;
  }

  spawnHitParticles(lane: Lane): void {
    if (!this.visualEffectsEnabled) return;
    const coords = this.getLanePositionAtProgress(lane, 1.0);
    const color = this.laneColors[lane].core;

    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      this.particles.push({
        x: coords.x,
        y: coords.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        color,
        size: Math.random() * 4 + 2,
        alpha: 1.0,
        decay: Math.random() * 0.03 + 0.02
      });
    }

    this.rings.push({
      x: coords.x,
      y: coords.y,
      radius: coords.laneWidth * 0.35,
      maxRadius: coords.laneWidth * 0.9,
      color,
      alpha: 1.0
    });
  }

  /**
   * Spawns sustain flame sparks
   */
  spawnSustainSparks(lane: Lane): void {
    if (!this.visualEffectsEnabled) return;
    const coords = this.getLanePositionAtProgress(lane, 1.0);
    const color = this.laneColors[lane].core;

    for (let i = 0; i < 3; i++) {
      this.particles.push({
        x: coords.x + (Math.random() - 0.5) * coords.laneWidth * 0.5,
        y: coords.y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 4 - 2,
        color,
        size: Math.random() * 3 + 1.5,
        alpha: 0.9,
        decay: 0.05
      });
    }
  }

  /**
   * Calculates perspective position (x, y, scale, laneWidth) for a given lane and progress
   * Progress: 0.0 at horizon, 1.0 at strike line
   */
  private getLanePositionAtProgress(lane: Lane, progress: number): { x: number; y: number; laneWidth: number; scale: number } {
    const w = this.width;
    const h = this.height;

    const horizonY = h * this.horizonYRatio;
    const strikeY = h * this.strikeLineYRatio;

    // Non-linear perspective interpolation
    const persp = Math.pow(Math.max(0, Math.min(progress, 1.4)), 1.35);
    const currentY = horizonY + (strikeY - horizonY) * persp;

    const topWidth = w * this.highwayTopWidthRatio;
    const bottomWidth = w * this.highwayBottomWidthRatio;
    const currentWidth = topWidth + (bottomWidth - topWidth) * persp;

    const laneWidth = currentWidth / 5;
    const highwayLeft = (w - currentWidth) / 2;
    const x = highwayLeft + laneWidth * (lane + 0.5);
    const scale = 0.4 + 0.6 * persp;

    return { x, y: currentY, laneWidth, scale };
  }

  /**
   * Main render method
   */
  render(
    currentTime: number,
    notes: Note[],
    activeLanes: Set<Lane>,
    bpm = 132
  ): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Apply Screen Shake
    ctx.save();
    if (this.screenShake > 0) {
      const shakeX = (Math.random() - 0.5) * this.screenShake;
      const shakeY = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(shakeX, shakeY);
      this.screenShake *= 0.88;
      if (this.screenShake < 0.2) this.screenShake = 0;
    }

    // 1. Clear background
    ctx.clearRect(0, 0, w, h);

    // 2. Draw Highway Surface
    this.drawHighway(ctx, activeLanes);

    // 3. Draw Beat Measure Lines
    this.drawBeatLines(ctx, currentTime, bpm);

    // 4. Draw Sustain Ribbons
    this.drawSustains(ctx, currentTime, notes);

    // 5. Draw Strike Line & Target Rings
    this.drawStrikeTargets(ctx, activeLanes);

    // 6. Draw Approaching Notes (Gems)
    this.drawNotes(ctx, currentTime, notes);

    // 7. Draw Visual FX (Particles & Rings)
    this.renderEffects(ctx);

    ctx.restore();
  }

  /**
   * Draws the 3D-perspective highway board
   */
  private drawHighway(ctx: CanvasRenderingContext2D, activeLanes: Set<Lane>): void {
    const w = this.width;
    const h = this.height;
    const horizonY = h * this.horizonYRatio;
    const bottomY = h * 0.98;

    const topW = w * this.highwayTopWidthRatio;
    const bottomW = w * (this.highwayBottomWidthRatio + 0.05);

    const topLeftX = (w - topW) / 2;
    const topRightX = topLeftX + topW;
    const bottomLeftX = (w - bottomW) / 2;
    const bottomRightX = bottomLeftX + bottomW;

    // Highway Board Background
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(topLeftX, horizonY);
    ctx.lineTo(topRightX, horizonY);
    ctx.lineTo(bottomRightX, bottomY);
    ctx.lineTo(bottomLeftX, bottomY);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
    grad.addColorStop(0, 'rgba(12, 13, 22, 0.45)');
    grad.addColorStop(0.5, 'rgba(19, 21, 34, 0.70)');
    grad.addColorStop(1, 'rgba(27, 29, 46, 0.88)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Side Borders (Metallic neon rails)
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#484c6e';
    ctx.stroke();

    // Highway Lane Dividers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 5; i++) {
      const topX = topLeftX + (topW / 5) * i;
      const bottomX = bottomLeftX + (bottomW / 5) * i;
      ctx.beginPath();
      ctx.moveTo(topX, horizonY);
      ctx.lineTo(bottomX, bottomY);
      ctx.stroke();
    }

    // Active Lane Light Beams (glows when button is pressed!)
    activeLanes.forEach((lane) => {
      const pTop = this.getLanePositionAtProgress(lane, 0);
      const pBottom = this.getLanePositionAtProgress(lane, 1.05);
      const color = this.laneColors[lane];

      ctx.save();
      const beamGrad = ctx.createLinearGradient(0, pBottom.y, 0, pTop.y);
      beamGrad.addColorStop(0, color.glow);
      beamGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.08)');
      beamGrad.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.moveTo(pTop.x - pTop.laneWidth * 0.45, pTop.y);
      ctx.lineTo(pTop.x + pTop.laneWidth * 0.45, pTop.y);
      ctx.lineTo(pBottom.x + pBottom.laneWidth * 0.48, pBottom.y);
      ctx.lineTo(pBottom.x - pBottom.laneWidth * 0.48, pBottom.y);
      ctx.closePath();
      ctx.fillStyle = beamGrad;
      ctx.fill();
      ctx.restore();
    });

    ctx.restore();
  }

  /**
   * Draws rhythm measure / beat lines moving down the highway
   */
  private drawBeatLines(ctx: CanvasRenderingContext2D, currentTime: number, bpm: number): void {
    const beatSec = 60 / bpm;
    const currentBeat = currentTime / beatSec;
    const startBeat = Math.floor(currentBeat);
    const endBeat = startBeat + 8;

    for (let b = startBeat; b <= endBeat; b++) {
      const beatTime = b * beatSec;
      const timeRemaining = beatTime - currentTime;
      const progress = 1.0 - (timeRemaining / this.noteSpeed);

      if (progress >= 0 && progress <= 1.05) {
        const p0 = this.getLanePositionAtProgress(0, progress);
        const p4 = this.getLanePositionAtProgress(4, progress);

        const isMeasure = b % 4 === 0;
        ctx.beginPath();
        ctx.moveTo(p0.x - p0.laneWidth * 0.5, p0.y);
        ctx.lineTo(p4.x + p4.laneWidth * 0.5, p4.y);
        ctx.strokeStyle = isMeasure ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = isMeasure ? 2.5 : 1.2;
        ctx.stroke();
      }
    }
  }

  /**
   * Draws the strike targets near the bottom
   */
  private drawStrikeTargets(ctx: CanvasRenderingContext2D, activeLanes: Set<Lane>): void {
    const strikeY = this.height * this.strikeLineYRatio;

    // Glowing Strike Bar Line
    const p0 = this.getLanePositionAtProgress(0, 1.0);
    const p4 = this.getLanePositionAtProgress(4, 1.0);
    const lineLeft = p0.x - p0.laneWidth * 0.55;
    const lineRight = p4.x + p4.laneWidth * 0.55;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lineLeft, strikeY);
    ctx.lineTo(lineRight, strikeY);
    ctx.stroke();

    // 5 Strike Targets
    for (let lane = 0; lane < 5; lane++) {
      const { x, y, laneWidth } = this.getLanePositionAtProgress(lane as Lane, 1.0);
      const isPressed = activeLanes.has(lane as Lane);
      const color = this.laneColors[lane];
      const radius = laneWidth * 0.36;

      ctx.save();
      // Outer Target Ring
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = isPressed ? color.core : 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = isPressed ? 4 : 2.5;
      ctx.stroke();

      // Inner Target Indicator
      if (isPressed) {
        ctx.fillStyle = color.glow;
        ctx.shadowColor = color.core;
        ctx.shadowBlur = 18;
        ctx.fill();
      }

      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Draws sustain note ribbons/trails
   */
  private drawSustains(ctx: CanvasRenderingContext2D, currentTime: number, notes: Note[]): void {
    for (const note of notes) {
      if (note.duration <= 0) continue;
      // Skip if completely passed
      if (note.time + note.duration < currentTime - 0.2) continue;
      // Skip if not yet near horizon
      if (note.time > currentTime + this.noteSpeed * 1.2) continue;

      const color = this.laneColors[note.lane];

      // Calculate progress of head and tail
      // Head progress is clamped if note is already hit and holding
      const headTimeRemaining = note.time - currentTime;
      const tailTimeRemaining = (note.time + note.duration) - currentTime;

      const rawHeadProgress = 1.0 - (headTimeRemaining / this.noteSpeed);
      const rawTailProgress = 1.0 - (tailTimeRemaining / this.noteSpeed);

      // If note was hit, head locks to the strike line (progress 1.0) while tail approaches
      const headProg = note.hit ? 1.0 : Math.min(1.0, rawHeadProgress);
      const tailProg = Math.max(0, rawTailProgress);

      if (headProg <= 0 || tailProg >= 1.05) continue;

      const pHead = this.getLanePositionAtProgress(note.lane, headProg);
      const pTail = this.getLanePositionAtProgress(note.lane, tailProg);

      const trailWHead = pHead.laneWidth * 0.38;
      const trailWTail = pTail.laneWidth * 0.38;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pTail.x - trailWTail * 0.5, pTail.y);
      ctx.lineTo(pTail.x + trailWTail * 0.5, pTail.y);
      ctx.lineTo(pHead.x + trailWHead * 0.5, pHead.y);
      ctx.lineTo(pHead.x - trailWHead * 0.5, pHead.y);
      ctx.closePath();

      // Sustain Trail Gradient
      const grad = ctx.createLinearGradient(0, pTail.y, 0, pHead.y);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
      grad.addColorStop(0.5, color.glow);
      grad.addColorStop(1, color.core);

      ctx.fillStyle = grad;
      ctx.fill();

      // Electric center pulse line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pTail.x, pTail.y);
      ctx.lineTo(pHead.x, pHead.y);
      ctx.stroke();

      ctx.restore();
    }
  }

  /**
   * Draws note gems descending down the highway
   */
  private drawNotes(ctx: CanvasRenderingContext2D, currentTime: number, notes: Note[]): void {
    for (const note of notes) {
      if (note.hit || note.missed) continue;

      const timeRemaining = note.time - currentTime;
      const progress = 1.0 - (timeRemaining / this.noteSpeed);

      // Draw only visible notes between horizon and just past strike line
      if (progress < -0.05 || progress > 1.12) continue;

      const { x, y, laneWidth, scale } = this.getLanePositionAtProgress(note.lane, progress);
      const color = this.laneColors[note.lane];
      const radiusX = laneWidth * 0.42 * scale;
      const radiusY = laneWidth * 0.28 * scale;

      ctx.save();

      // Note Glow Shadow
      ctx.shadowColor = color.core;
      ctx.shadowBlur = 14 * scale;

      // Note 3D Gem Body (Ellipse with radial gradient)
      ctx.beginPath();
      ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);

      const gemGrad = ctx.createRadialGradient(
        x - radiusX * 0.2,
        y - radiusY * 0.2,
        radiusX * 0.1,
        x,
        y,
        radiusX
      );
      gemGrad.addColorStop(0, '#ffffff');
      gemGrad.addColorStop(0.4, color.core);
      gemGrad.addColorStop(1, color.dark);
      ctx.fillStyle = gemGrad;
      ctx.fill();

      // Chrome rim
      ctx.lineWidth = Math.max(1.5, 2.5 * scale);
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.restore();
    }
  }

  /**
   * Renders hit particles & expanding rings
   */
  private renderEffects(ctx: CanvasRenderingContext2D): void {
    // 1. Rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.radius += 2.2;
      ring.alpha -= 0.05;

      if (ring.alpha <= 0) {
        this.rings.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = ring.alpha;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    // 2. Particles
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
      ctx.globalAlpha = p.alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();
    }
  }
}
