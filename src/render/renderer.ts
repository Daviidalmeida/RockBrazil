import { SyncDiagnostics } from '../game/sync/syncDiagnostics';
import { Note, Lane, Difficulty, getLanesForDifficulty, NoteSpeedPreset } from '../types';

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
  private particlePool: Particle[] = [];
  private ringPool: RingEffect[] = [];
  private screenShake = 0;

  // Active difficulty & dynamic lanes configuration (Strictly 3 for EASY, 4 for MEDIUM, 5 for HARD/EXPERT)
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
  readonly horizonYRatio = 0.085;       // Vanishing point Y (converging toward upper center)
  readonly strikeLineYRatio = 0.82;     // Strike line Y (receptors location)
  readonly highwayTopWidthRatio = 0.28; // Narrow top for deep perspective
  readonly highwayBottomWidthRatio = 0.95; // Wide bottom for clear readability
  
  // V7: Restored comfortable base travel time (1.35s NORMAL) with selectable presets
  public speedPreset: NoteSpeedPreset = 'NORMAL';
  public noteSpeedMultiplier = 1.0;
  public visualEffectsEnabled = true;

  get baseNoteSpeed(): number {
    switch (this.speedPreset) {
      case 'LENTA': return 1.65;
      case 'RÁPIDA': return 1.05;
      case 'NORMAL':
      default: return 1.35;
    }
  }

  get noteSpeed(): number {
    return this.baseNoteSpeed / Math.max(0.6, Math.min(2.5, this.noteSpeedMultiplier));
  }

  get laneCount(): number {
    return this.activeLanesList.length;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D context from canvas');
    this.ctx = context;
    this.resize();
  }

  /**
   * Sets the active difficulty and strictly adapts visible lanes:
   * - EASY: strictly 3 lanes (0: Verde, 1: Vermelho, 2: Amarelo)
   * - MEDIUM: strictly 4 lanes (0: Verde, 1: Vermelho, 2: Amarelo, 3: Azul)
   * - HARD/EXPERT: 5 lanes (0, 1, 2, 3, 4)
   */
  setDifficulty(diff: Difficulty, _maxLaneOverride?: number): void {
    this.difficulty = diff;
    if (diff === 'EASY') {
      this.activeLanesList = [0, 1, 2];
    } else if (diff === 'MEDIUM') {
      this.activeLanesList = [0, 1, 2, 3];
    } else {
      this.activeLanesList = [0, 1, 2, 3, 4];
    }
  }

  resize(): void {
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

  get screenShakeMagnitude(): number {
    return this.screenShake;
  }

  /**
   * Triggers a screen shake effect (Desativado para garantir estabilidade absoluta das notas)
   */
  triggerShake(_intensity = 6): void {
    this.screenShake = 0;
  }

  private obtainParticle(
    x: number, y: number, vx: number, vy: number,
    color: string, size: number, alpha: number, decay: number
  ): Particle {
    const p = this.particlePool.pop();
    if (p) {
      p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.color = color; p.size = size; p.alpha = alpha; p.decay = decay;
      return p;
    }
    return { x, y, vx, vy, color, size, alpha, decay };
  }

  private obtainRing(x: number, y: number, radius: number, maxRadius: number, color: string, alpha: number): RingEffect {
    const r = this.ringPool.pop();
    if (r) {
      r.x = x; r.y = y; r.radius = radius; r.maxRadius = maxRadius; r.color = color; r.alpha = alpha;
      return r;
    }
    return { x, y, radius, maxRadius, color, alpha };
  }

  spawnHitParticles(lane: Lane): void {
    if (!this.visualEffectsEnabled) return;
    const coords = this.getLanePositionAtProgress(lane, 1.0);
    const color = this.laneColors[lane];

    // Burst particles from object pool
    const particleCount = 14;
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.4;
      const speed = Math.random() * 4.5 + 2.0;
      this.particles.push(
        this.obtainParticle(
          coords.x,
          coords.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed - 1.2,
          i % 2 === 0 ? color.core : '#ffffff',
          Math.random() * 3.5 + 2.0,
          1.0,
          Math.random() * 0.035 + 0.03
        )
      );
    }

    // Expanding shockwave ring from object pool
    this.rings.push(
      this.obtainRing(
        coords.x,
        coords.y,
        coords.laneWidth * 0.3,
        coords.laneWidth * 0.95,
        color.core,
        1.0
      )
    );
  }

  /**
   * Spawns sustain flame sparks
   */
  spawnSustainSparks(lane: Lane): void {
    if (!this.visualEffectsEnabled) return;
    const coords = this.getLanePositionAtProgress(lane, 1.0);
    const color = this.laneColors[lane];

    for (let i = 0; i < 2; i++) {
      this.particles.push(
        this.obtainParticle(
          coords.x + (Math.random() - 0.5) * coords.laneWidth * 0.45,
          coords.y + (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 2.5,
          -Math.random() * 4.5 - 2.5,
          Math.random() > 0.4 ? color.core : '#ffffff',
          Math.random() * 3.0 + 1.5,
          0.9,
          0.06
        )
      );
    }
  }

  /**
   * Calculates 3D perspective position (x, y, scale, laneWidth) for a given lane and progress
   * Progress: 0.0 at horizon, 1.0 at strike line
   */
  private getLanePositionAtProgress(
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

    // Constrain lane index to visible lane count
    const laneIdx = Math.min(lane, laneCount - 1);
    const x = highwayLeft + laneWidth * (laneIdx + 0.5);
    const scale = 0.35 + 0.65 * persp;

    return { x, y: currentY, laneWidth, scale, currentWidth, highwayLeft };
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

    // V5.7: Geometria de renderização perfeitamente estável (sem tremedeira em combo alto)
    ctx.save();

    // 1. Clear background
    ctx.clearRect(0, 0, w, h);

    // 2. Draw 3D Highway Surface & Border Rails
    this.drawHighway(ctx);

    // 3. Draw Beat Measure Lines (Fret Wires moving with tempo)
    this.drawBeatLines(ctx, currentTime, bpm);

    // 4. Draw Sustain Ribbons
    this.drawSustains(ctx, currentTime, notes);

    // 5. Draw Strike Line & Target Receptors
    this.drawStrikeTargets(ctx, activeLanes, currentTime, bpm);

    // If song is in intro section before first note, display subtle rhythm pulse indicator
    // V10: Indicador piscante no meio da pista removido para visual 100% limpo e confortável

    // 6. Draw Approaching 3D Notes (Gems)
    this.drawNotes(ctx, currentTime, notes);

    // 7. Draw Visual FX (Particles & Rings)
    this.renderEffects(ctx);

    ctx.restore();
  }

  /**
   * Draws the 3D-perspective highway board with neon rails and lane dividers
   */
  private drawHighway(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    const horizonY = h * this.horizonYRatio;
    const bottomY = h * 0.99;

    const topW = w * this.highwayTopWidthRatio;
    const bottomW = w * this.highwayBottomWidthRatio;

    const topLeftX = (w - topW) / 2;
    const topRightX = topLeftX + topW;
    const bottomLeftX = (w - bottomW) / 2;
    const bottomRightX = bottomLeftX + bottomW;

    ctx.save();

    // 1. Highway Board Surface Gradient (Deep Stage Charcoal)
    ctx.beginPath();
    ctx.moveTo(topLeftX, horizonY);
    ctx.lineTo(topRightX, horizonY);
    ctx.lineTo(bottomRightX, bottomY);
    ctx.lineTo(bottomLeftX, bottomY);
    ctx.closePath();

    const surfaceGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
    surfaceGrad.addColorStop(0, 'rgba(8, 10, 18, 0.45)');
    surfaceGrad.addColorStop(0.35, 'rgba(11, 13, 24, 0.75)');
    surfaceGrad.addColorStop(1, 'rgba(6, 7, 14, 0.96)');
    ctx.fillStyle = surfaceGrad;
    ctx.fill();

    // 2. Center Stage Ambient Glow
    const glowGrad = ctx.createRadialGradient(
      w / 2, h * this.strikeLineYRatio * 0.9, 10,
      w / 2, h * this.strikeLineYRatio * 0.9, bottomW * 0.6
    );
    glowGrad.addColorStop(0, 'rgba(0, 208, 255, 0.08)');
    glowGrad.addColorStop(0.6, 'rgba(255, 42, 95, 0.04)');
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fill();

    // 3. Lane Dividing Laser Lines
    const laneCount = this.laneCount;
    for (let i = 1; i < laneCount; i++) {
      const topX = topLeftX + (topW / laneCount) * i;
      const bottomX = bottomLeftX + (bottomW / laneCount) * i;

      ctx.beginPath();
      ctx.moveTo(topX, horizonY);
      ctx.lineTo(bottomX, bottomY);

      const divGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
      divGrad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
      divGrad.addColorStop(0.6, 'rgba(255, 255, 255, 0.18)');
      divGrad.addColorStop(1, 'rgba(255, 255, 255, 0.35)');

      ctx.strokeStyle = divGrad;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 4. Luminous Side Rails (Left & Right Glowing Bevels)
    const drawSideRail = (startX: number, endX: number, isRight: boolean) => {
      // Outer neon aura
      ctx.beginPath();
      ctx.moveTo(startX, horizonY);
      ctx.lineTo(endX, bottomY);
      ctx.strokeStyle = 'rgba(0, 208, 255, 0.45)';
      ctx.lineWidth = 6;
      ctx.stroke();

      // Inner electric core
      ctx.beginPath();
      ctx.moveTo(startX, horizonY);
      ctx.lineTo(endX, bottomY);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Accent border
      const offset = isRight ? 3 : -3;
      ctx.beginPath();
      ctx.moveTo(startX + offset * 0.3, horizonY);
      ctx.lineTo(endX + offset, bottomY);
      ctx.strokeStyle = isRight ? '#ff2a5f' : '#00ff88';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    drawSideRail(topLeftX, bottomLeftX, false);
    drawSideRail(topRightX, bottomRightX, true);

    ctx.restore();
  }

  /**
   * Draws rhythmically moving beat/fret lines down the perspective highway
   */
  private drawBeatLines(ctx: CanvasRenderingContext2D, currentTime: number, bpm: number): void {
    const secondsPerBeat = 60 / Math.max(60, bpm);
    const currentBeat = currentTime / secondsPerBeat;
    const startBeat = Math.floor(currentBeat - 1);
    const endBeat = Math.ceil(currentBeat + this.noteSpeed / secondsPerBeat + 1);

    ctx.save();
    for (let beat = startBeat; beat <= endBeat; beat++) {
      const beatTime = beat * secondsPerBeat;
      const timeRemaining = beatTime - currentTime;
      const progress = 1.0 - (timeRemaining / this.noteSpeed);

      if (progress < 0.02 || progress > 1.05) continue;

      const p = this.getLanePositionAtProgress(0, progress);
      const isMeasure = beat % 4 === 0;

      const lineLeft = p.highwayLeft;
      const lineRight = p.highwayLeft + p.currentWidth;

      ctx.beginPath();
      ctx.moveTo(lineLeft, p.y);
      ctx.lineTo(lineRight, p.y);

      if (isMeasure) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 * p.scale})`;
        ctx.lineWidth = Math.max(1.8, 3.0 * p.scale);
      } else {
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.28 * p.scale})`;
        ctx.lineWidth = Math.max(1, 1.8 * p.scale);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Draws the strike line and circular target receptors for active lanes
   */
  private drawStrikeTargets(ctx: CanvasRenderingContext2D, activeLanes: Set<Lane>, currentTime = 0, bpm = 120): void {
    const h = this.height;
    const strikeY = h * this.strikeLineYRatio;
    const pSample = this.getLanePositionAtProgress(0, 1.0);

    const lineLeft = pSample.highwayLeft;
    const lineRight = pSample.highwayLeft + pSample.currentWidth;

    const secondsPerBeat = 60 / Math.max(60, bpm);
    const beatFraction = (currentTime / secondsPerBeat) % 1;
    const beatPulse = Math.max(0, 1.0 - Math.abs(beatFraction < 0 ? beatFraction + 1 : beatFraction) * 3.5);

    ctx.save();

    // 1. Glowing Metallic Strike Bar across the highway
    const barGrad = ctx.createLinearGradient(lineLeft, strikeY, lineRight, strikeY);
    barGrad.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    barGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.85)');
    barGrad.addColorStop(1, 'rgba(255, 255, 255, 0.2)');

    ctx.strokeStyle = barGrad;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(lineLeft, strikeY);
    ctx.lineTo(lineRight, strikeY);
    ctx.stroke();

    // 2. Strike Target Receptors for each available difficulty lane
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
      ctx.strokeStyle = isPressed ? color.core : 'rgba(255, 255, 255, 0.5)';
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
        // Inactive Cup: Alvo limpo e confortável sem pulsação ou flash distrativo
        ctx.fillStyle = 'rgba(14, 16, 28, 0.9)';
        ctx.fill();
        ctx.strokeStyle = color.dark;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        const beadR = radius * 0.25;
        ctx.arc(x, y, beadR, 0, Math.PI * 2);
        ctx.fillStyle = color.core;
        ctx.globalAlpha = 0.8;
        ctx.fill();
      }

      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Renders active rhythm pulse indicator during intro sections before first playable note
   */
  private drawIntroRhythmIndicator(ctx: CanvasRenderingContext2D, currentTime: number, bpm: number): void {
    const w = this.width;
    const pos = this.getLanePositionAtProgress(0, 0.42);
    const secondsPerBeat = 60 / Math.max(60, bpm);
    const beatFraction = (currentTime / secondsPerBeat) % 1;
    const pulse = 0.7 + 0.3 * Math.max(0, 1.0 - Math.abs(beatFraction < 0 ? beatFraction + 1 : beatFraction) * 3.0);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 13px var(--font-display, Montserrat, sans-serif)';
    ctx.fillStyle = `rgba(255, 230, 0, ${pulse * 0.85})`;
    ctx.fillText('RITMO & INTRODUÇÃO', w / 2, pos.y);

    const dotsCount = 4;
    const currentDot = Math.floor(currentTime / secondsPerBeat) % 4;
    let dotsStr = '';
    for (let d = 0; d < dotsCount; d++) {
      dotsStr += d === currentDot ? ' ● ' : ' ○ ';
    }
    ctx.font = '600 11px monospace';
    ctx.fillStyle = `rgba(255, 255, 255, ${pulse * 0.75})`;
    ctx.fillText(dotsStr, w / 2, pos.y + 16);
    ctx.restore();
  }

  /**
   * Draws sustain note ribbons/trails with 3D perspective and glowing energy core
   */
  private drawSustains(ctx: CanvasRenderingContext2D, currentTime: number, notes: Note[]): void {
    for (const note of notes) {
      if (note.duration <= 0) continue;
      // Skip if completely passed
      if (note.time + note.duration < currentTime - 0.25) continue;
      // Skip if not yet in view
      if (note.time > currentTime + this.noteSpeed * 1.25) continue;

      const lane = note.lane;
      const color = this.laneColors[lane];

      const headTimeRemaining = note.time - currentTime;
      const tailTimeRemaining = (note.time + note.duration) - currentTime;

      const rawHeadProgress = 1.0 - (headTimeRemaining / this.noteSpeed);
      const rawTailProgress = 1.0 - (tailTimeRemaining / this.noteSpeed);

      // If note was hit, head locks to the strike line (1.0) while tail approaches
      const headProg = note.hit ? 1.0 : Math.min(1.0, rawHeadProgress);
      const tailProg = Math.max(0, rawTailProgress);

      if (headProg <= 0 || tailProg >= 1.05) continue;

      const pHead = this.getLanePositionAtProgress(lane, headProg);
      const pTail = this.getLanePositionAtProgress(lane, tailProg);

      const trailWHead = pHead.laneWidth * 0.36;
      const trailWTail = pTail.laneWidth * 0.36;

      ctx.save();

      // Ribbon Surface Polygon
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

      // Central Electric Laser Pulse Wire
      ctx.beginPath();
      ctx.moveTo(pTail.x, pTail.y);
      ctx.lineTo(pHead.x, pHead.y);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, 2.5 * pHead.scale);
      ctx.stroke();

      ctx.restore();
    }
  }

  /**
   * Draws 3D note gems descending down the highway with depth, bevels, and chrome reflection
   */
  private drawNotes(ctx: CanvasRenderingContext2D, currentTime: number, notes: Note[]): void {
    // Group notes by timestamp for chord connection beam
    const visibleNotes: Note[] = [];

    for (const note of notes) {
      if (note.hit || note.missed) continue;

      const timeRemaining = note.time - currentTime;
      const progress = 1.0 - (timeRemaining / this.noteSpeed);

      if (progress < -0.06 || progress > 1.12) continue;
      visibleNotes.push(note);
      if (progress >= 0 && progress <= 0.05) {
        SyncDiagnostics.get().recordFirstNoteVisible(note.time, currentTime, progress);
      }
      if (Math.abs(progress - 1.0) < 0.04) {
        SyncDiagnostics.get().recordFirstNoteReachingReceptor(note.time, currentTime, (currentTime - note.time) * 1000);
      }
    }

    // 1. Draw Chord Connector Beams (tight 20ms tolerance)
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

        const pFirst = this.getLanePositionAtProgress(first.lane, 1.0 - ((first.time - currentTime) / this.noteSpeed));
        const pLast = this.getLanePositionAtProgress(last.lane, 1.0 - ((last.time - currentTime) / this.noteSpeed));

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
      const timeRemaining = note.time - currentTime;
      const progress = 1.0 - (timeRemaining / this.noteSpeed);

      const { x, y, laneWidth, scale } = this.getLanePositionAtProgress(note.lane, progress);
      const color = this.laneColors[note.lane];

      const rx = laneWidth * 0.44 * scale;
      const ry = laneWidth * 0.17 * scale;

      ctx.save();

      // 3D Bottom Bevel (Darker base for depth volume)
      ctx.beginPath();
      ctx.ellipse(x, y + ry * 0.35, rx, ry * 0.9, 0, 0, Math.PI * 2);
      ctx.fillStyle = color.dark;
      ctx.fill();

      // Main Gem Body (Rich Radial Gradient)
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

      // Top Specular Highlight Pill (Jewel Glass Reflection)
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

  /**
   * Renders hit particles & expanding rings
   */
  private renderEffects(ctx: CanvasRenderingContext2D): void {
    // 1. Expanding Shockwave Rings (Zero-blur performant stroke)
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.radius += 2.5;
      ring.alpha -= 0.055;

      if (ring.alpha <= 0 || ring.radius >= ring.maxRadius) {
        if (this.ringPool.length < 50) this.ringPool.push(ring);
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

    // 2. Burst & Sustain Particles (Zero-blur performant fill)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        if (this.particlePool.length < 150) this.particlePool.push(p);
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
