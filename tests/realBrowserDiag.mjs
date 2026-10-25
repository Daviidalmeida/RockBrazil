import { chromium } from 'playwright';

async function run() {
  console.log('Launching Google Chrome for kua-de-borest test...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 412, height: 915 }
  });

  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[DIAG') || text.includes('[RockBrazil') || text.includes('Error') || text.includes('error') || text.includes('Warning')) {
      console.log(`[BROWSER] ${text}`);
    }
  });

  page.on('pageerror', err => {
    console.error(`[PAGE ERROR] ${err.message}`);
  });

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  console.log('Calling startNewMatch for "kua-de-borest" on HARD...');
  await page.evaluate(async () => {
    const game = window.__ROCKBRAZIL_GAME__;
    const song = game.library.getSongById('kua-de-borest');
    await game.startNewMatch(song, 'HARD');
  });

  console.log('Monitoring playback and clock for 15 seconds...');
  for (let s = 1; s <= 15; s++) {
    await page.waitForTimeout(1000);
    const info = await page.evaluate(() => {
      const g = window;
      const game = g.__ROCKBRAZIL_GAME__;
      const diag = g.__ROCKBRAZIL_DIAGNOSTICS__;
      if (!game) return { error: 'no game' };
      const clock = game.masterClock ? game.masterClock.getTime() : -1;
      const isBuffering = game.masterClock ? game.masterClock.isBufferingState : false;
      const ytState = game.ytPlayer ? game.ytPlayer.getPlaybackState() : 'unknown';
      let ytRaw = -1;
      let ytStateNum = -1;
      if (game.ytPlayer && game.ytPlayer.player) {
        try { ytRaw = game.ytPlayer.player.getCurrentTime(); } catch {}
        try { ytStateNum = game.ytPlayer.player.getPlayerState(); } catch {}
      }
      const firstNote = game.engine ? game.engine.getNotes()[0] : null;
      return {
        state: game.state,
        clockTime: clock,
        isBuffering,
        ytState,
        ytStateNum,
        ytRaw,
        firstNoteTime: firstNote ? firstNote.time : null,
        firstNoteHit: firstNote ? firstNote.hit : null,
        firstNoteMissed: firstNote ? firstNote.missed : null,
        eventsCount: diag ? diag.getChronologicalReport().length : 0
      };
    });
    console.log(`[T+${s}s] State: ${info.state} | Clock: ${info.clockTime?.toFixed(3)}s | Buf: ${info.isBuffering} | YT: ${info.ytState} (code:${info.ytStateNum}) | Raw: ${info.ytRaw?.toFixed(3)}s | Note1: t=${info.firstNoteTime}s (hit:${info.firstNoteHit})`);
  }

  const finalReport = await page.evaluate(() => {
    const diag = window.__ROCKBRAZIL_DIAGNOSTICS__;
    return diag ? diag.getChronologicalReport() : [];
  });

  console.log('\n================ FINAL CHRONOLOGICAL REPORT ================');
  console.table(finalReport);

  await browser.close();
  console.log('Diagnostic test completed.');
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
