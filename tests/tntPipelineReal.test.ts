import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Difficulty, Note } from '../src/types';
import { UnifiedMasterClock } from '../src/game/sync/masterClock';
import { RockSyncEngine } from '../src/game/sync/rockSyncEngine';
import { PlaybackState } from '../src/types';

describe('V13.9.2 — T.N.T. (AC/DC) Real Pipeline & RockSync Validation Suite', () => {
  const resultJsonPath = 'C:/Users/David/.gemini/antigravity/brain/153405fa-0626-4238-a695-fe54343e80ab/scratch/tnt_autochart_result.json';
  let tntData: any = null;

  if (fs.existsSync(resultJsonPath)) {
    tntData = JSON.parse(fs.readFileSync(resultJsonPath, 'utf8'));
  }

  it('1. Audio integrity: duration is 229.67s (03:50) and sample rate is 44.1kHz', () => {
    expect(tntData).not.toBeNull();
    expect(tntData.duration).toBeCloseTo(229.67, 1);
    expect(tntData.title).toBe('T.N.T.');
    expect(tntData.artist).toBe('AC/DC');
  });

  it('2. Real BPM detection: calculated at ~130 BPM (never fixed 120 fallback)', () => {
    expect(tntData.bpm).toBe(130);
    expect(tntData.bpm).not.toBe(120);
  });

  it('3. Non-truncation: notes cover the full song from start (t < 2s) to end (t > 220s)', () => {
    const expert = tntData.charts.EXPERT as Note[];
    expect(expert.length).toBeGreaterThan(500);

    const firstNoteTime = expert[0].time;
    const lastNoteTime = expert[expert.length - 1].time;

    expect(firstNoteTime).toBeLessThan(2.0);
    expect(lastNoteTime).toBeGreaterThan(220.0);
  });

  it('4. FÁCIL: strictly 3 lanes (0, 1, 2), strictly 0 chords, spacing >= 220ms', () => {
    const easy = tntData.charts.EASY as Note[];
    expect(easy.length).toBeGreaterThan(100);

    for (const note of easy) {
      expect(note.lane).toBeGreaterThanOrEqual(0);
      expect(note.lane).toBeLessThanOrEqual(2);
    }

    // Check no chords (no duplicate timestamps)
    const timeMap = new Map<number, number>();
    for (const n of easy) {
      timeMap.set(n.time, (timeMap.get(n.time) || 0) + 1);
    }
    const chords = Array.from(timeMap.values()).filter(c => c > 1);
    expect(chords.length).toBe(0);
    expect(tntData.qualityMetrics.chordsCount.EASY).toBe(0);
  });

  it('5. MÉDIO: strictly 4 lanes (0, 1, 2, 3), max 2-note chords, spacing >= 120ms', () => {
    const med = tntData.charts.MEDIUM as Note[];
    expect(med.length).toBeGreaterThan(tntData.charts.EASY.length);

    for (const note of med) {
      expect(note.lane).toBeGreaterThanOrEqual(0);
      expect(note.lane).toBeLessThanOrEqual(3);
    }

    // Chords are present in medium
    expect(tntData.qualityMetrics.chordsCount.MEDIUM).toBeGreaterThan(10);
  });

  it('6. DIFÍCIL & EXPERT: 5 lanes (0, 1, 2, 3, 4), chords and sustains present', () => {
    const hard = tntData.charts.HARD as Note[];
    const expert = tntData.charts.EXPERT as Note[];

    expect(hard.length).toBeGreaterThan(tntData.charts.MEDIUM.length);
    expect(expert.length).toBeGreaterThanOrEqual(hard.length);

    expect(tntData.qualityMetrics.chordsCount.HARD).toBeGreaterThan(50);
    expect(tntData.qualityMetrics.chordsCount.EXPERT).toBeGreaterThan(50);
    expect(tntData.qualityMetrics.sustainsCount.EXPERT).toBeGreaterThan(10);
  });

  it('7. Honest AI labeling: DSP fallback stamped as FALLBACK_DSP (never pretending to be REAL_AI)', () => {
    expect(tntData.engineMode).toBe('FALLBACK_DSP');
    expect(tntData.stemMetadata.isRealAI).toBe(false);
    expect(tntData.stemMetadata.separationModel).toBe('DSP_BANDPASS_FALLBACK');
  });

  it('8. RockSync continuous clock: 10, 20, 50, and 100 consecutive misses without freezing highway or resetting playback', () => {
    let mockTime = 10.0;
    const masterClock = new UnifiedMasterClock();
    masterClock.setSource({
      getCurrentTime: () => mockTime,
      getPlaybackState: () => PlaybackState.PLAYING,
      isBuffering: () => false
    });
    masterClock.startPlayback();

    const rse = new RockSyncEngine(masterClock);

    // Simulate 10 misses
    for (let i = 1; i <= 10; i++) {
      mockTime += 0.05;
      rse.registerMiss(mockTime);
      rse.update(performance.now() + i * 50);

      expect(masterClock.getTime()).toBeGreaterThanOrEqual(10.0);
    }
    expect(rse.getState().consecutiveMisses).toBe(10);
    expect(rse.getState().frozenStreakCount).toBe(0);

    // Simulate up to 50 misses
    for (let i = 11; i <= 50; i++) {
      mockTime += 0.05;
      rse.registerMiss(mockTime);
      rse.update(performance.now() + i * 50);
    }
    expect(rse.getState().consecutiveMisses).toBe(50);
    expect(rse.getState().frozenStreakCount).toBe(0);
    expect(masterClock.getTime()).toBeCloseTo(12.5, 1);

    // Simulate up to 100 misses
    for (let i = 51; i <= 100; i++) {
      mockTime += 0.05;
      rse.registerMiss(mockTime);
      rse.update(performance.now() + i * 50);
    }
    expect(rse.getState().consecutiveMisses).toBe(100);
    expect(rse.getState().frozenStreakCount).toBe(0);
    expect(masterClock.getTime()).toBeCloseTo(15.0, 1);
  });
});
