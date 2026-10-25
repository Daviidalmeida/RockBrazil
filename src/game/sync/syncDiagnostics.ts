/**
 * RockBrazil Sync Diagnostics Instrumenter (Section 5)
 * Captures real in-browser chronological milestones with high-precision timestamps.
 */

export interface DiagnosticEvent {
  id: string;
  name: string;
  perfNow: number;
  relativeMs: number;
  videoTime?: number;
  clockTime?: number;
  details?: Record<string, any>;
}

export class SyncDiagnostics {
  private static instance: SyncDiagnostics | null = null;
  private events: DiagnosticEvent[] = [];
  private t0 = 0;
  private firstNoteLogged = false;
  private firstVisibleLogged = false;
  private firstHitLineLogged = false;
  private firstEngineFrameLogged = false;
  private firstRendererFrameLogged = false;

  public static get(): SyncDiagnostics {
    if (!SyncDiagnostics.instance) {
      SyncDiagnostics.instance = new SyncDiagnostics();
      if (typeof window !== 'undefined') {
        (window as any).__ROCKBRAZIL_DIAGNOSTICS__ = SyncDiagnostics.instance;
      }
    }
    return SyncDiagnostics.instance;
  }

  public reset(): void {
    this.events = [];
    this.t0 = performance.now();
    this.firstNoteLogged = false;
    this.firstVisibleLogged = false;
    this.firstHitLineLogged = false;
    this.firstEngineFrameLogged = false;
    this.firstRendererFrameLogged = false;
    console.log('[RockBrazil SyncDiagnostics] Session reset at t0 =', this.t0.toFixed(2), 'ms');
  }

  public record(name: string, details?: Record<string, any>): void {
    const now = performance.now();
    if (this.t0 === 0) this.t0 = now;
    const relativeMs = now - this.t0;

    const event: DiagnosticEvent = {
      id: `${this.events.length + 1}_${name}`,
      name,
      perfNow: now,
      relativeMs,
      videoTime: details?.videoTime,
      clockTime: details?.clockTime,
      details
    };

    this.events.push(event);

    console.log(
      `[DIAG +${relativeMs.toFixed(1)}ms] ${name}`,
      details ? JSON.stringify(details) : ''
    );
  }

  public recordCountdownStart(count: number, details?: Record<string, any>): void {
    this.record(`COUNTDOWN_START_${count}`, details);
  }

  public recordCountdownTick(count: number): void {
    this.record(`COUNTDOWN_TICK_${count}`);
  }

  public recordCountdownEnd(): void {
    this.record('COUNTDOWN_END_ROCK');
  }

  public recordPlayVideoCommand(videoId: string): void {
    this.record('COMMAND_PLAY_VIDEO', { videoId });
  }

  public recordPlayingEvent(rawTime: number): void {
    this.record('EVENT_YT_PLAYING', { rawTime });
  }

  public recordFirstTimeProgression(rawTime: number): void {
    this.record('FIRST_YT_PROGRESSION', { rawTime });
  }

  public recordFirstEngineFrame(clockTime: number): void {
    if (!this.firstEngineFrameLogged) {
      this.firstEngineFrameLogged = true;
      this.record('FIRST_ENGINE_FRAME', { clockTime });
    }
  }

  public recordFirstRendererFrame(clockTime: number): void {
    if (!this.firstRendererFrameLogged) {
      this.firstRendererFrameLogged = true;
      this.record('FIRST_RENDERER_FRAME', { clockTime });
    }
  }

  public recordChartFirstTimestamp(firstNoteTime: number, totalNotes: number): void {
    this.record('CHART_FIRST_NOTE_TIMESTAMP', { firstNoteTime, totalNotes });
  }

  public recordFirstNoteVisible(noteTime: number, clockTime: number, progress: number): void {
    if (!this.firstVisibleLogged) {
      this.firstVisibleLogged = true;
      this.record('FIRST_NOTE_VISIBLE_ON_HIGHWAY', { noteTime, clockTime, progress });
    }
  }

  public recordFirstNoteReachingReceptor(noteTime: number, clockTime: number, diffMs: number): void {
    if (!this.firstHitLineLogged) {
      this.firstHitLineLogged = true;
      this.record('FIRST_NOTE_REACHING_RECEPTOR', { noteTime, clockTime, diffMs });
    }
  }

  public getChronologicalReport(): DiagnosticEvent[] {
    return [...this.events];
  }

  public printReport(): void {
    if (typeof console !== 'undefined' && console.table) {
      console.table(
        this.events.map((e) => ({
          'Rel ms': Math.round(e.relativeMs),
          Event: e.name,
          'Video Time': e.videoTime !== undefined ? e.videoTime.toFixed(3) : '-',
          'Clock Time': e.clockTime !== undefined ? e.clockTime.toFixed(3) : '-',
          Details: e.details ? JSON.stringify(e.details) : ''
        }))
      );
    }
  }
}
