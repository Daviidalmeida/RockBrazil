import { AudioManager } from '../src/audio/audioManager';
import { videoCoversChart } from '../src/game/sync/videoChartCompatibility';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { YouTubePlayerController, youtubeErrorMessage } from '../src/audio/youtubePlayer';
import { PlaybackState, GameSettings, Note } from '../src/types';
import { GameEngine } from '../src/game/engine';
import { PreStartSystem } from '../src/game/sync/prestartSystem';
import { createCrowdSamples } from '../src/audio/crowdReaction';
import { reducedEffects } from '../src/game/visualEffects';

const settings: GameSettings = { musicVolume: .85, sfxVolume: .9, audioOffsetMs: 0, noteSpeedMultiplier: 1, visualEffectsEnabled: true };
const players: YouTubePlayerController[] = [];
function fakePlayer(start = 0) {
  let time = start, state = 1;
  const confirmed = vi.fn();
  const blocked = vi.fn();
  const controller = new YouTubePlayerController({ onPlaybackConfirmed: confirmed, onAutoplayBlocked: blocked });
  players.push(controller);
  (controller as any).player = { getCurrentTime: () => time, getPlayerState: () => state, playVideo: vi.fn(), pauseVideo: vi.fn() };
  return { controller, confirmed, blocked, setTime: (t: number) => { time = t; }, setState: (s: number) => { state = s; } };
}
afterEach(() => { players.splice(0).forEach(p => p.destroy()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('V13.8 simulated player contract (does not validate YouTube streaming)', () => {
  it('never synthesizes playback without an iframe', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] });
    const p = new YouTubePlayerController(); players.push(p);
    p.play(); await vi.advanceTimersByTimeAsync(5000);
    expect(p.getPlaybackState()).toBe(PlaybackState.ERROR);
    expect(p.getCurrentTime()).toBe(0);
    expect(await p.waitForPlaying(0)).toBe(false);
  });
  it('does not initialize successfully without browser/API', async () => {
    const p = new YouTubePlayerController(); players.push(p);
    await expect(p.init()).rejects.toThrow();
    expect(p.isReadyState()).toBe(false);
  });
  it('awaits iframe onReady, sets permissions and propagates native error codes', async () => {
    let options: any;
    const attributes: Record<string, string> = {};
    class MockIframePlayer {
      constructor(_element: string, config: any) { options = config; }
      getIframe() { return { setAttribute: (key: string, value: string) => { attributes[key] = value; } }; }
      setVolume() {} unMute() {} destroy() {}
    }
    vi.stubGlobal('window', { YT: { Player: MockIframePlayer }, location: { origin: 'https://example.test' } });
    vi.stubGlobal('document', { getElementById: () => ({}) });
    const error = vi.fn(); const p = new YouTubePlayerController({ onError: error }); players.push(p);
    const ready = p.init(); await Promise.resolve();
    expect(p.isReadyState()).toBe(false);
    expect(options.playerVars).toMatchObject({ origin: 'https://example.test', playsinline: 1, autoplay: 0, controls: 1 });
    options.events.onReady(); await ready;
    expect(p.isReadyState()).toBe(true);
    expect(attributes.allow).toContain('autoplay');
    expect(attributes.referrerpolicy).toBe('strict-origin-when-cross-origin');
    options.events.onError({ data: 150 });
    expect(error).toHaveBeenCalledWith(150); expect(p.getPlaybackState()).toBe(PlaybackState.ERROR);
  });
  it('a PLAYING event at a nonzero frozen timestamp does not confirm playback', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] }); const p = fakePlayer(15);
    p.controller.play(); (p.controller as any).handlePlayerStateChange(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(p.confirmed).not.toHaveBeenCalled(); expect(p.controller.isPlaying()).toBe(false);
    p.setTime(15.06); await vi.advanceTimersByTimeAsync(40);
    expect(p.controller.isPlaying()).toBe(true); expect(p.confirmed).toHaveBeenCalledTimes(1);
  });
  it('waitForPlaying returns false on timeout and alerts autoplay blocking once', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] }); const p = fakePlayer(); p.setState(5); p.controller.play();
    const waiting = p.controller.waitForPlaying(3000);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await waiting).toBe(false); expect(p.blocked).toHaveBeenCalledTimes(1);
  });
  it('freezes buffering and requires fresh progress on resume', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] }); const p = fakePlayer(); p.controller.play(); p.setTime(.1);
    await vi.advanceTimersByTimeAsync(40); expect(p.controller.isPlaying()).toBe(true);
    p.setState(3); (p.controller as any).handlePlayerStateChange(3);
    const frozen = p.controller.getCurrentTime(); await vi.advanceTimersByTimeAsync(1000);
    expect(p.controller.getCurrentTime()).toBe(frozen);
    p.setState(1); (p.controller as any).handlePlayerStateChange(1);
    expect(p.controller.isPlaying()).toBe(false);
    p.setTime(.2); await vi.advanceTimersByTimeAsync(40);
    expect(p.controller.isPlaying()).toBe(true); expect(p.confirmed).toHaveBeenCalledTimes(2);
  });
  it('stalls the musical clock when state=PLAYING but timestamps stop', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] }); const p = fakePlayer(); p.controller.play(); p.setTime(.1);
    await vi.advanceTimersByTimeAsync(40); await vi.advanceTimersByTimeAsync(600);
    expect(p.controller.isBuffering()).toBe(true);
    const frozen = p.controller.getCurrentTime(); await vi.advanceTimersByTimeAsync(2000);
    expect(p.controller.getCurrentTime()).toBe(frozen);
  });
  it.each([2, 5, 100, 101, 150, 153, 'API_TIMEOUT'])('explains error %s', code => {
    expect(youtubeErrorMessage(code).length).toBeGreaterThan(25);
  });
  it('does not start countdown after audio preparation fails or is cancelled', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] }); const system = new PreStartSystem();
    const tick = vi.fn(), start = vi.fn();
    const resources = { prepareChart: () => true, prepareRenderer: vi.fn(), prepareAudio: () => false, startAudioPlayback: vi.fn(), isAudioPlaying: () => false, isAudioBuffering: () => false };
    const events = { onCountdownTick: tick, onCountdownRock: vi.fn(), onSynchronizingWait: vi.fn(), onGameStart: start };
    await system.prepareAndStart(1, resources, events); await vi.advanceTimersByTimeAsync(20000);
    expect(tick).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
    let ready!: (value: boolean) => void;
    const pending = system.prepareAndStart(2, { ...resources, prepareAudio: () => new Promise(resolve => { ready = resolve; }) }, events);
    await Promise.resolve(); system.cancel(); ready(true); await pending;
    expect(tick).not.toHaveBeenCalled();
  });
});

describe('V13.8 accuracy and audio audit', () => {
  it('rejects unavailable/short video duration without changing chart timestamps', () => {
    expect(videoCoversChart(0, 355, 0)).toBe(false);
    expect(videoCoversChart(303, 355, 0)).toBe(false);
    expect(videoCoversChart(355, 355, 0)).toBe(true);
    expect(videoCoversChart(355, 355, -2000)).toBe(false);
  });
  const note = (id: number, time: number, lane: Note['lane'] = 0): Note => ({ id, time, lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 });
  it('explains 868 hits / 12 note misses / 74 extra taps = 91%, preserving V13.7', () => {
    const e = new GameEngine(Array.from({ length: 880 }, (_, i) => note(i, i + 1)), 'MEDIUM', settings);
    for (let i = 0; i < 868; i++) e.handleLanePress(0, i + 1);
    e.forceCompleteAllPendingNotes();
    // Space extra taps between successful hits to keep the rock meter alive in an actual session.
    // Here the original ratio is checked directly against the exact recorded counters.
    (e as any).extraPressCount = 74;
    expect(e.getStats()).toMatchObject({ hitsCount: 868, missCount: 12, extraPressCount: 74, accuracy: 91 });
    (e as any).extraPressCount = 0; expect(e.getAccuracy()).toBe(99);
  });
  it('judges simultaneous notes independently and preserves their timestamps', () => {
    const e = new GameEngine([note(1, 2, 0), note(2, 2, 4)], 'EXPERT', settings);
    e.handleLanePress(0, 2); e.handleLanePress(4, 2);
    expect(e.getStats()).toMatchObject({ perfectCount: 2, missCount: 0, accuracy: 100, maxCombo: 2 });
    expect(e.getNotes().map(n => n.time)).toEqual([2, 2]);
  });
  it('extra taps can end a show when the rock meter reaches zero, exactly once', () => {
    const e = new GameEngine([], 'EXPERT', settings); const over = vi.fn(); e.onGameOver = over;
    for (let i = 0; i < 30; i++) e.handleLanePress(0, 1);
    expect(e.getStats().rockMeter).toBe(0); expect(over).toHaveBeenCalledTimes(1);
  });
  it('respects reduced effects without changing any timing values', () => {
    expect(reducedEffects({ ...settings, effectsMode: 'REDUCED' })).toBe(true);
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    expect(reducedEffects({ ...settings, effectsMode: 'NORMAL' })).toBe(true);
  });
  it('does not duplicate applause, respects SFX mute and never plays on defeat', () => {
    const manager = new AudioManager(settings);
    const start = vi.fn(), ramp = vi.fn();
    const source = { connect: vi.fn(), disconnect: vi.fn(), stop: vi.fn(), start, buffer: null, onended: null };
    (manager as any).ctx = { state: 'running', sampleRate: 22050, currentTime: 0,
      createBuffer: (_channels: number, length: number, rate: number) => ({ duration: length / rate, copyToChannel: vi.fn() }),
      createBufferSource: () => source,
      createGain: () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: ramp } })
    };
    (manager as any).sfxGainNode = { gain: { setValueAtTime: vi.fn() } };
    manager.playCrowdReaction(5, true, false); expect(start).not.toHaveBeenCalled();
    manager.playCrowdReaction(5, true); manager.playCrowdReaction(5, true);
    expect(start).toHaveBeenCalledTimes(1); expect(ramp).toHaveBeenCalledTimes(2);
    expect(ramp.mock.calls.at(-1)?.[0]).toBe(0);
    const muted = new AudioManager({ ...settings, sfxVolume: 0 });
    (muted as any).ctx = (manager as any).ctx; (muted as any).sfxGainNode = (manager as any).sfxGainNode;
    muted.playCrowdReaction(5, true); expect(start).toHaveBeenCalledTimes(1);
  });
  it('produces finite, bounded original stereo applause with fades and distinct intensities', () => {
    const durations: number[] = [];
    for (const intensity of ['NORMAL', 'FIVE_STARS', 'FULL_COMBO'] as const) {
      const [left, right] = createCrowdSamples(22050, intensity);
      expect(left.length).toBe(right.length); expect(left).not.toEqual(right);
      expect(left[0]).toBe(0); expect(left[left.length - 1]).toBe(0);
      expect([...left].every(value => Number.isFinite(value) && Math.abs(value) <= .65)).toBe(true);
      expect(left.some(value => Math.abs(value) > .1)).toBe(true); durations.push(left.length);
    }
    expect(durations[0]).toBeLessThan(durations[1]); expect(durations[1]).toBeLessThan(durations[2]);
  });
});
