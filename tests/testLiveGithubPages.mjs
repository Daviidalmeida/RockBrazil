import { chromium } from 'playwright';

async function run() {
  console.log('Testing live GitHub Pages: https://daviidalmeida.github.io/RockBrazil/...');
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
    console.log(`[LIVE CONSOLE] ${msg.type()}: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error(`[LIVE ERROR] ${err.message}`);
  });

  console.log('Navigating to GitHub Pages...');
  await page.goto('https://daviidalmeida.github.io/RockBrazil/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  console.log('Clicking #hotspot-jogar on live site...');
  await page.click('#hotspot-jogar');
  await page.waitForTimeout(1500);

  // Check what song is selected and click play
  console.log('Clicking btn-song-select-play...');
  await page.click('#btn-song-select-play');
  await page.waitForTimeout(1000);

  // Click Medium difficulty button
  console.log('Clicking .btn-diff-choice[data-diff="MEDIUM"]...');
  await page.click('.btn-diff-choice[data-diff="MEDIUM"]');

  console.log('Monitoring live GitHub Pages match for 18 seconds...');
  for (let s = 1; s <= 18; s++) {
    await page.waitForTimeout(1000);
    const info = await page.evaluate(() => {
      const countdownText = document.getElementById('countdown-number')?.textContent;
      const scoreText = document.getElementById('hud-score')?.textContent;
      const progressBar = document.getElementById('song-progress-bar')?.style.width;
      const hudHidden = document.getElementById('hud')?.classList.contains('hidden');
      const countdownHidden = document.getElementById('screen-countdown')?.classList.contains('hidden');
      return {
        countdownText,
        scoreText,
        progressBar,
        hudHidden,
        countdownHidden
      };
    });
    console.log(`[LIVE T+${s}s] Countdown: "${info.countdownText}" (hidden:${info.countdownHidden}) | HUD Hidden: ${info.hudHidden} | Progress: ${info.progressBar}`);
  }

  await browser.close();
  console.log('Live test complete.');
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
