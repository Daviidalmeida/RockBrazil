import { Lane } from '../../types';

export interface InputControllerCallbacks {
  onLanePress: (lane: Lane) => void;
  onLaneRelease: (lane: Lane) => void;
  onPauseToggle?: () => void;
}

/**
 * ROCKBRAZIL BETA V6 — INPUT CONTROLLER
 * Decoupled input manager handling keyboard, mouse, and multitouch.
 * - Supports keyboard code mapping (KeyA, KeyS, KeyJ, KeyK, KeyL, Digit1-5) and key fallback.
 * - Multi-touch tracking on Android/iOS via PointerEvents without duplicate synthetic clicks.
 * - Zero garbage-collection allocations per frame or keystroke.
 * - Completely decoupled from canvas rendering and audio timeline.
 */
export class InputController {
  private activePressedLanes: Set<Lane> = new Set();
  private pointerLaneMap: Map<number, Lane> = new Map();
  private callbacks: InputControllerCallbacks;
  private fretBoardElement: HTMLElement | null = null;
  private isEnabled = true;

  // Keyboard mapping by e.code (layout-independent)
  private readonly codeMap: Record<string, Lane> = {
    KeyA: 0, Digit1: 0, KeyD: 0,
    KeyS: 1, Digit2: 1, KeyF: 1,
    KeyJ: 2, Digit3: 2,
    KeyK: 3, Digit4: 3,
    KeyL: 4, Digit5: 4, Semicolon: 4
  };

  // Keyboard fallback by e.key
  private readonly keyMap: Record<string, Lane> = {
    a: 0, A: 0, '1': 0, d: 0, D: 0,
    s: 1, S: 1, '2': 1, f: 1, F: 1,
    j: 2, J: 2, '3': 2,
    k: 3, K: 3, '4': 3,
    l: 4, L: 4, '5': 4, 'ç': 4, 'Ç': 4
  };

  // Bound event listeners for clean disposal
  private handleKeyDownBound: (e: KeyboardEvent) => void;
  private handleKeyUpBound: (e: KeyboardEvent) => void;
  private handlePointerDownBound: (e: PointerEvent) => void;
  private handlePointerUpBound: (e: PointerEvent) => void;

  constructor(callbacks: InputControllerCallbacks) {
    this.callbacks = callbacks;

    this.handleKeyDownBound = this.handleKeyDown.bind(this);
    this.handleKeyUpBound = this.handleKeyUp.bind(this);
    this.handlePointerDownBound = this.handlePointerDown.bind(this);
    this.handlePointerUpBound = this.handlePointerUp.bind(this);
  }

  public init(fretBoardElement?: HTMLElement | null): void {
    this.dispose();

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDownBound);
      window.addEventListener('keyup', this.handleKeyUpBound);
      window.addEventListener('pointerup', this.handlePointerUpBound);
      window.addEventListener('pointercancel', this.handlePointerUpBound);
    }

    if (fretBoardElement) {
      this.fretBoardElement = fretBoardElement;
      this.fretBoardElement.addEventListener('pointerdown', this.handlePointerDownBound, { passive: false });
    }
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.releaseAll();
    }
  }

  public getActiveLanes(): Set<Lane> {
    return this.activePressedLanes;
  }

  public isLanePressed(lane: Lane): boolean {
    return this.activePressedLanes.has(lane);
  }

  public pressLane(lane: Lane): void {
    if (!this.isEnabled) return;
    if (!this.activePressedLanes.has(lane)) {
      this.activePressedLanes.add(lane);
      this.callbacks.onLanePress(lane);
    }
  }

  public releaseLane(lane: Lane): void {
    if (this.activePressedLanes.has(lane)) {
      this.activePressedLanes.delete(lane);
      this.callbacks.onLaneRelease(lane);
    }
  }

  public releaseAll(): void {
    for (const lane of Array.from(this.activePressedLanes)) {
      this.releaseLane(lane);
    }
    this.pointerLaneMap.clear();
  }

  public handleKeyDownEvent(code: string, key: string, repeat = false): void {
    if (repeat) return;
    const lane = this.codeMap[code] !== undefined ? this.codeMap[code] : this.keyMap[key];
    if (lane !== undefined) {
      this.pressLane(lane);
    }
  }

  public handleKeyUpEvent(code: string, key: string): void {
    const lane = this.codeMap[code] !== undefined ? this.codeMap[code] : this.keyMap[key];
    if (lane !== undefined) {
      this.releaseLane(lane);
    }
  }

  public handlePointerDownEvent(pointerId: number, lane: Lane): void {
    this.pointerLaneMap.set(pointerId, lane);
    this.pressLane(lane);
  }

  public handlePointerUpEvent(pointerId: number): void {
    const lane = this.pointerLaneMap.get(pointerId);
    if (lane !== undefined) {
      this.pointerLaneMap.delete(pointerId);

      let stillPressed = false;
      for (const l of this.pointerLaneMap.values()) {
        if (l === lane) {
          stillPressed = true;
          break;
        }
      }
      if (!stillPressed) {
        this.releaseLane(lane);
      }
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;

    if (e.code === 'Space' || e.code === 'Escape') {
      if (this.callbacks.onPauseToggle) {
        this.callbacks.onPauseToggle();
        return;
      }
    }

    const lane = this.codeMap[e.code] !== undefined ? this.codeMap[e.code] : this.keyMap[e.key];
    if (lane !== undefined) {
      e.preventDefault();
      this.pressLane(lane);
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const lane = this.codeMap[e.code] !== undefined ? this.codeMap[e.code] : this.keyMap[e.key];
    if (lane !== undefined) {
      e.preventDefault();
      this.releaseLane(lane);
    }
  }

  private handlePointerDown(e: PointerEvent): void {
    e.preventDefault();
    const target = (e.target as HTMLElement).closest('.fret-button') as HTMLElement;
    if (!target) return;

    const lane = Number(target.dataset.lane) as Lane;
    if (lane >= 0 && lane <= 4) {
      this.pointerLaneMap.set(e.pointerId, lane);
      this.pressLane(lane);
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    const lane = this.pointerLaneMap.get(e.pointerId);
    if (lane !== undefined) {
      this.pointerLaneMap.delete(e.pointerId);

      // Check if any other active pointer is still pressing this lane
      let stillPressed = false;
      for (const l of this.pointerLaneMap.values()) {
        if (l === lane) {
          stillPressed = true;
          break;
        }
      }
      if (!stillPressed) {
        this.releaseLane(lane);
      }
    }
  }

  public dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDownBound);
      window.removeEventListener('keyup', this.handleKeyUpBound);
      window.removeEventListener('pointerup', this.handlePointerUpBound);
      window.removeEventListener('pointercancel', this.handlePointerUpBound);
    }
    if (this.fretBoardElement) {
      this.fretBoardElement.removeEventListener('pointerdown', this.handlePointerDownBound);
      this.fretBoardElement = null;
    }
    this.releaseAll();
  }
}
