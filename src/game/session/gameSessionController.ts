import { SessionState } from './sessionState';
import { MusicTimeline } from '../timeline/musicTimeline';
import { ChartTimeline } from '../timeline/chartTimeline';
import { NoteHighway } from '../highway/noteHighway';
import { InputController } from '../input/inputController';
import { HitJudgmentSystem } from '../judgment/hitJudgment';
import { SongMetadata, Difficulty, Note, Lane, PlaybackState } from '../../types';

export interface SessionResourceProvider {
  prepareChart: (sessionId: number) => Promise<boolean> | boolean;
  prepareRenderer: (sessionId: number) => void;
  prepareAudio: (sessionId: number) => Promise<boolean> | boolean;
  startAudioPlayback: (sessionId: number) => void;
  isAudioPlaying: () => boolean;
  isAudioBuffering: () => boolean;
}

export interface SessionUiEvents {
  onStateChange: (state: SessionState, sessionId: number) => void;
  onCountdownTick: (count: number) => void;
  onCountdownRock: () => void;
  onWaitingAudio: () => void;
  onAutoplayBlocked: () => void;
  onGameStart: () => void;
  onSongFinished: () => void;
  onGameOver: () => void;
}

/**
 * ROCKBRAZIL BETA V6 — GAME SESSION CONTROLLER
 * Full Unity-inspired session and state-machine manager.
 * - States: IDLE, LOADING, READY, COUNTDOWN, WAITING_AUDIO, PLAYING, BUFFERING, PAUSED, FAILED, FINISHED.
 * - Monotonic SessionId: ensures stale callbacks and duplicate events are strictly rejected.
 * - Single countdown enforcement: exactly ONE 3, 2, 1 countdown per session.
 * - Audio confirmation handling: if YouTube delays, displays "AGUARDANDO ÁUDIO..." without re-running countdown.
 * - Never restarts countdown upon buffering or network jitter.
 */
export class GameSessionController {
  private state: SessionState = SessionState.IDLE;
  private currentSessionId = 0;
  private hasStartedCountdown = false;
  private hasEnteredPlaying = false;

  // Timers
  private countdownTimer: any = null;
  private audioWaitInterval: any = null;

  // Subsystems
  public musicTimeline: MusicTimeline;
  public chartTimeline: ChartTimeline;
  public noteHighway?: NoteHighway;
  public inputController?: InputController;
  public hitJudgment?: HitJudgmentSystem;

  private currentSong: SongMetadata | null = null;
  private currentDifficulty: Difficulty = 'MEDIUM';
  private resourceProvider: SessionResourceProvider | null = null;
  private uiEvents: SessionUiEvents | null = null;

  constructor(musicTimeline: MusicTimeline, chartTimeline: ChartTimeline) {
    this.musicTimeline = musicTimeline;
    this.chartTimeline = chartTimeline;
  }

  public getState(): SessionState {
    return this.state;
  }

  public getSessionId(): number {
    return this.currentSessionId;
  }

  public isSessionActive(sessionId: number): boolean {
    return this.currentSessionId === sessionId;
  }

  private setState(newState: SessionState, sessionId: number): void {
    if (this.currentSessionId !== sessionId) return;

    if (this.state !== newState) {
      this.state = newState;
      if (this.uiEvents?.onStateChange) {
        this.uiEvents.onStateChange(newState, sessionId);
      }
    }
  }

  /**
   * Cleans up all active interval and timeout handles
   */
  public cancelTimers(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.audioWaitInterval !== null) {
      clearInterval(this.audioWaitInterval);
      this.audioWaitInterval = null;
    }
  }

  /**
   * Main entry point: starts a new game session.
   * Cancels prior active runs, creates a unique monotonic sessionId,
   * loads resources, executes a SINGLE countdown, verifies audio, and transitions to PLAYING.
   */
  public async startSession(
    song: SongMetadata,
    difficulty: Difficulty,
    resources: SessionResourceProvider,
    events: SessionUiEvents
  ): Promise<number> {
    const sessionId = ++this.currentSessionId;
    this.cancelTimers();

    this.currentSong = song;
    this.currentDifficulty = difficulty;
    this.resourceProvider = resources;
    this.uiEvents = events;

    this.hasStartedCountdown = false;
    this.hasEnteredPlaying = false;
    this.musicTimeline.reset();

    // 1. LOADING: prepare chart and highway
    this.setState(SessionState.LOADING, sessionId);

    const chartOk = await resources.prepareChart(sessionId);
    if (sessionId !== this.currentSessionId || !chartOk) {
      return sessionId;
    }

    resources.prepareRenderer(sessionId);

    // 2. READY: cue/prepare audio player
    this.setState(SessionState.READY, sessionId);
    await resources.prepareAudio(sessionId);
    if (sessionId !== this.currentSessionId) {
      return sessionId;
    }

    // 3. COUNTDOWN: exactly ONE single countdown sequence per session
    this.runSingleCountdown(sessionId, resources, events);

    return sessionId;
  }

  /**
   * Executes the synchronized 3, 2, 1, ROCK countdown.
   * Enforced to run at most once per session.
   */
  private runSingleCountdown(
    sessionId: number,
    resources: SessionResourceProvider,
    events: SessionUiEvents
  ): void {
    if (this.hasStartedCountdown || sessionId !== this.currentSessionId) {
      return;
    }
    this.hasStartedCountdown = true;

    this.setState(SessionState.COUNTDOWN, sessionId);
    let count = 3;

    // Preroll duration matching note travel time so approaching notes enter highway
    const prerollSec = this.noteHighway ? this.noteHighway.travelTime : 0.92;
    this.musicTimeline.startCountdown(prerollSec);
    this.musicTimeline.setPrerollProgress(0.0, prerollSec);

    events.onCountdownTick(count);

    const intervalFn = typeof window !== 'undefined' ? window.setInterval : setInterval;
    this.countdownTimer = intervalFn(() => {
      if (sessionId !== this.currentSessionId) {
        this.cancelTimers();
        return;
      }

      count--;

      if (count > 0) {
        const progress = (3 - count) / 3.0;
        this.musicTimeline.setPrerollProgress(progress, prerollSec);
        events.onCountdownTick(count);
      } else if (count === 0) {
        // "ROCK!"
        this.cancelTimers();
        this.musicTimeline.setPrerollProgress(1.0, prerollSec);
        events.onCountdownRock();

        // Trigger audio playback
        resources.startAudioPlayback(sessionId);

        // Immediate check: is audio already advancing?
        if (resources.isAudioPlaying()) {
          this.transitionToPlaying(sessionId, events);
        } else {
          // Transition to WAITING_AUDIO ("AGUARDANDO ÁUDIO...") without restarting countdown
          this.transitionToWaitingAudio(sessionId, resources, events);
        }
      }
    }, 1000);
  }

  /**
   * Handles the waiting period while YouTube or network finishes buffering.
   * Displays "AGUARDANDO ÁUDIO..." — NEVER repeats 3, 2, 1!
   */
  private transitionToWaitingAudio(
    sessionId: number,
    resources: SessionResourceProvider,
    events: SessionUiEvents
  ): void {
    if (sessionId !== this.currentSessionId || this.hasEnteredPlaying) {
      return;
    }

    this.setState(SessionState.WAITING_AUDIO, sessionId);
    events.onWaitingAudio();

    let checkAttempts = 0;
    const maxAttempts = 150; // 15 seconds max wait (at 100ms intervals)

    const intervalFn = typeof window !== 'undefined' ? window.setInterval : setInterval;
    this.audioWaitInterval = intervalFn(() => {
      if (sessionId !== this.currentSessionId || this.hasEnteredPlaying) {
        this.cancelTimers();
        return;
      }

      checkAttempts++;

      if (resources.isAudioPlaying()) {
        this.cancelTimers();
        this.transitionToPlaying(sessionId, events);
      } else if (checkAttempts >= maxAttempts) {
        this.cancelTimers();
        if (events.onAutoplayBlocked) {
          events.onAutoplayBlocked();
        }
      }
    }, 100);
  }

  /**
   * Final transition to active gameplay.
   * Guaranteed to execute at most once per session.
   */
  public transitionToPlaying(sessionId: number, events?: SessionUiEvents): void {
    if (sessionId !== this.currentSessionId || this.hasEnteredPlaying) {
      return;
    }
    this.hasEnteredPlaying = true;
    this.cancelTimers();

    this.musicTimeline.startPlayback();
    this.setState(SessionState.PLAYING, sessionId);

    const ev = events || this.uiEvents;
    if (ev?.onGameStart) {
      ev.onGameStart();
    }
  }

  public handleBufferingChange(isBuffering: boolean, sessionId = this.currentSessionId): void {
    if (sessionId !== this.currentSessionId) return;

    if (this.state === SessionState.PLAYING && isBuffering) {
      this.musicTimeline.setBuffering(true);
      this.setState(SessionState.BUFFERING, sessionId);
    } else if (this.state === SessionState.BUFFERING && !isBuffering) {
      this.musicTimeline.setBuffering(false);
      this.setState(SessionState.PLAYING, sessionId);
    }
  }

  public pauseSession(sessionId = this.currentSessionId): void {
    if (sessionId !== this.currentSessionId) return;
    if (this.state === SessionState.PLAYING || this.state === SessionState.BUFFERING) {
      this.musicTimeline.pause();
      this.setState(SessionState.PAUSED, sessionId);
    }
  }

  public resumeSession(sessionId = this.currentSessionId): void {
    if (sessionId !== this.currentSessionId) return;
    if (this.state === SessionState.PAUSED) {
      this.musicTimeline.resume();
      this.setState(SessionState.PLAYING, sessionId);
    }
  }

  public failSession(sessionId = this.currentSessionId): void {
    if (sessionId !== this.currentSessionId) return;
    this.cancelTimers();
    this.setState(SessionState.FAILED, sessionId);
    if (this.uiEvents?.onGameOver) {
      this.uiEvents.onGameOver();
    }
  }

  public finishSession(sessionId = this.currentSessionId): void {
    if (sessionId !== this.currentSessionId) return;
    this.cancelTimers();
    this.setState(SessionState.FINISHED, sessionId);
    if (this.uiEvents?.onSongFinished) {
      this.uiEvents.onSongFinished();
    }
  }
}
