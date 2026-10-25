import { chromium } from 'playwright';
import * as fs from 'fs';

async function inspectSpectrum() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  const audioData = fs.readFileSync('charts-import/extracted/charts/kua-de-borest_original_audio.opus');
  const base64 = audioData.toString('base64');

  const result = await page.evaluate(async (b64) => {
    const raw = atob(b64);
    const u8 = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);

    const ctx = new OfflineAudioContext(1, 48000 * 10, 48000);
    const audioBuffer = await ctx.decodeAudioData(u8.buffer);
    const ch = audioBuffer.getChannelData(0);

    // Let's analyze 100ms segments from 0.0 to 8.0s
    const segs = [];
    for (let t = 0; t < 8.0; t += 0.25) {
      const start = Math.floor(t * 48000);
      const end = Math.floor((t + 0.25) * 48000);
      let sum = 0;
      let peak = 0;
      for (let i = start; i < end && i < ch.length; i++) {
        const val = Math.abs(ch[i]);
        sum += val * val;
        if (val > peak) peak = val;
      }
      const rms = Math.sqrt(sum / (end - start));
      segs.push({ t: Number(t.toFixed(2)), rms: Number(rms.toFixed(4)), peak: Number(peak.toFixed(4)) });
    }
    return segs;
  }, base64);

  console.log('--- AUDIO ENERGY SEGMENTS (0s - 8s) ---');
  for (const s of result) {
    if (s.rms > 0.001) {
      console.log(`t=${s.t.toFixed(2)}s: RMS=${s.rms} Peak=${s.peak}`);
    }
  }

  await browser.close();
}

inspectSpectrum().catch(console.error);
