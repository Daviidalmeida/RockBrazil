import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const out = 'reports/v13.8';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(process.env.ROCKBRAZIL_URL || 'http://localhost:5173/RockBrazil/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ROCKBRAZIL_GAME__);
await page.locator('#screen-login').waitFor({ state: 'visible' });
const dimensions = [[320,568], [360,640], [375,667], [390,844], [412,915], [430,932], [1440,900]];
const report = { description: 'Real Chromium screenshots and geometry assertions with injected result statistics; no complete song or YouTube playback is implied.', viewports: [], errors };
for (const [width, height] of dimensions) {
  await page.setViewportSize({ width, height });
  for (const fullCombo of [false, true]) {
    await page.evaluate(fullCombo => {
      const game = window.__ROCKBRAZIL_GAME__;
      const song = game.library.getSongs().find(song => song.id === 'intl-gnr-sweet-child-o-mine');
      const stats = { score: 1234567, perfectCount: fullCombo ? 880 : 800, greatCount: fullCombo ? 0 : 60, goodCount: fullCombo ? 0 : 8, missCount: fullCombo ? 0 : 12, extraPressCount: fullCombo ? 0 : 74, hitsCount: fullCombo ? 880 : 868, totalNotes: 880, playableNotesCount: fullCombo ? 880 : 954, accuracy: fullCombo ? 100 : 91, stars: 5, maxCombo: 250 };
      game.ui.showResults(song, stats, { earnedCoins: 150, isNewRecord: true }, 'EXPERT', true);
    }, fullCombo);
    await page.waitForTimeout(900);
    await page.waitForFunction(() => { const image = document.getElementById('result-album-cover'); return image.complete && image.naturalWidth > 0; });
    const measurement = await page.evaluate(() => {
      const selectors = ['.results-title', '.results-header-overlay', '#result-stars-row', '.results-central-panel', '.results-stats-quad', '.results-judgments', '.results-extra', '.results-achievement-banner:not(.hidden)', '.results-buttons-overlay'];
      const boxes = selectors.flatMap(selector => {
        const el = document.querySelector(selector);
        if (!el) return [];
        const { x, y, width, height, bottom, right } = el.getBoundingClientRect();
        return [{ selector, x, y, width, height, bottom, right }];
      });
      const buttons = [...document.querySelectorAll('.result-action-btn')].map(button => {
        const rect = button.getBoundingClientRect(), text = button.querySelector('span').getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { height: rect.height, width: rect.width, textInside: text.x >= rect.x && text.right <= rect.right && text.y >= rect.y && text.bottom <= rect.bottom, reachable: button.contains(hit) };
      });
      return { boxes, buttons, scrollWidth: document.querySelector('#screen-result').scrollWidth, clientWidth: innerWidth };
    });
    for (let i = 0; i < measurement.boxes.length; i++) {
      const box = measurement.boxes[i];
      assert(box.x >= 0 && box.right <= width + 1 && box.y >= 0 && box.bottom <= height, JSON.stringify({ width, height, fullCombo, box }));
      if (i) assert(box.y >= measurement.boxes[i - 1].bottom - 1, `Overlap at ${box.selector}`);
    }
    assert(measurement.scrollWidth <= width, 'Horizontal overflow');
    for (const button of measurement.buttons) assert(button.height >= 44 && button.width >= 44 && button.textInside && button.reachable, JSON.stringify(button));
    const path = `${out}/results-${width}x${height}${fullCombo ? '-full-combo' : ''}.png`;
    await page.screenshot({ path });
    report.viewports.push({ width, height, fullCombo, path, ...measurement });
  }
}
// Real browser event wiring; callbacks replaced to avoid starting a song from fixture results.
report.buttons = await page.evaluate(() => {
  const ui = window.__ROCKBRAZIL_GAME__.ui;
  const calls = [];
  ui.onRestartClicked = () => calls.push('replay');
  ui.onReturnToLibraryClicked = () => calls.push('songs');
  ui.onResultRankingClicked = () => calls.push('ranking');
  for (const id of ['btn-play-again', 'btn-menu-result', 'btn-result-ranking']) document.getElementById(id).click();
  return calls;
});
assert.deepEqual(report.buttons, ['replay', 'songs', 'ranking']);
// OS preference and persisted settings in the actual app.
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.waitForFunction(() => document.documentElement.dataset.effects === 'reduced');
report.reducedMotion = await page.evaluate(() => ({ effects: document.documentElement.dataset.effects, particles: window.__ROCKBRAZIL_GAME__.renderer.visualEffectsEnabled }));
assert.equal(report.reducedMotion.effects, 'reduced');
assert.equal(report.reducedMotion.particles, false);
await page.screenshot({ path: `${out}/results-reduced-motion.png` });
await page.emulateMedia({ reducedMotion: 'no-preference' });
await page.evaluate(() => window.__ROCKBRAZIL_GAME__.ui.onSettingsChanged({ effectsMode: 'REDUCED' }));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ROCKBRAZIL_GAME__);
await page.locator('#screen-login').waitFor({ state: 'visible' });
report.persistedEffects = await page.evaluate(() => window.__ROCKBRAZIL_GAME__.settingsManager.getSettings().effectsMode);
assert.equal(report.persistedEffects, 'REDUCED');
await page.evaluate(() => window.__ROCKBRAZIL_GAME__.ui.onSettingsChanged({ effectsMode: 'NORMAL' }));
report.geometry = await page.evaluate(() => {
  const renderer = window.__ROCKBRAZIL_GAME__.renderer;
  renderer.setDifficulty('EXPERT');
  return [0, .25, .5, .75, 1].map(progress => {
    const lanes = [0,1,2,3,4].map(lane => renderer.getLanePositionAtProgress(lane, progress));
    return { progress, lanes };
  });
});
for (const { lanes } of report.geometry) {
  for (let i = 0; i < lanes.length; i++) {
    assert.equal(lanes[i].y, lanes[0].y);
    assert(Math.abs((lanes[i].x - lanes[i].highwayLeft) / lanes[i].laneWidth - (i + .5)) < 1e-10);
  }
}
report.performance = await page.evaluate(() => {
  const g = window.__ROCKBRAZIL_GAME__;
  const notes = Array.from({ length: 2000 }, (_, id) => ({ id, time: 1 + Math.floor(id/5)*.04, lane: id%5, duration: 0, hit: false, missed: false }));
  const samples = [];
  for (let i = 0; i < 180; i++) { const start = performance.now(); g.renderer.render(i/60, notes, new Set(), 120); samples.push(performance.now()-start); }
  samples.sort((a,b) => a-b);
  return { frames: samples.length, notes: notes.length, medianMs: samples[90], p95Ms: samples[171], environment: navigator.userAgent, caveat: 'Headless desktop renderer benchmark, not physical mobile FPS.' };
});
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => {
  const g = window.__ROCKBRAZIL_GAME__;
  g.state = 'RESULTS'; // The game loop renders at time zero without judging this fixture.
  g.ui.setDifficultyLanes('EXPERT');
  g.renderer.setDifficulty('EXPERT');
  g.ui.showScreen('PLAYING');
  g.renderer.resize();
  const notes = [0, .35, .7, 1].flatMap((progress, index) => [0,4].map(lane => ({ id: index*5+lane, time: (1-progress)*g.renderer.noteSpeed, lane, duration: 0, hit: false, missed: false })));
  g.engine.reset(notes, 'EXPERT');
  g.renderer.render(0, g.engine.getNotes(), new Set(), 120);
  g.ui.showJudgment('PERFECT');
});
report.hud = await page.evaluate(() => {
  const multiplier = document.getElementById('hud-multiplier').getBoundingClientRect();
  const judgment = document.getElementById('hud-judgment').getBoundingClientRect();
  return { multiplierBottom: multiplier.bottom, judgmentTop: judgment.top, judgmentRight: judgment.right };
});
assert(report.hud.judgmentTop >= report.hud.multiplierBottom);
await page.screenshot({ path: `${out}/gameplay-chords-and-judgment.png` });
await fs.writeFile(`${out}/ui-browser-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ captures: report.viewports.length + 2, buttons: report.buttons, reducedMotion: report.reducedMotion, performance: report.performance, errors }, null, 2));
assert.equal(errors.length, 0);
await browser.close();
