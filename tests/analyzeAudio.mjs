import { chromium } from 'playwright';
import * as fs from 'fs';

async function analyze() {
  console.log('Launching browser to analyze kua-de-borest_original_audio.opus via Web Audio API...');
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

    const ctx = new OfflineAudioContext(2, 48000 * 20, 48000);
    const audioBuffer = await ctx.decodeAudioData(u8.buffer);
    const sampleRate = audioBuffer.sampleRate;
    const ch0 = audioBuffer.getChannelData(0);
    const duration = audioBuffer.duration;

    // Calculate RMS in 50ms windows for the first 12 seconds
    const windowSec = 0.05;
    const windowSamples = Math.floor(sampleRate * windowSec);
    const windows = [];

    for (let t = 0; t < 12; t += windowSec) {
      const start = Math.floor(t * sampleRate);
      let sum = 0;
      for (let s = 0; s < windowSamples && (start + s) < ch0.length; s++) {
        const v = ch0[start + s];
        sum += v * v;
      }
      const rms = Math.sqrt(sum / windowSamples);
      windows.push({ time: Number(t.toFixed(2)), rms: Number(rms.toFixed(4)) });
    }

    // Find first transient / sound onset
    let firstSoundTime = -1;
    for (const w of windows) {
      if (w.rms > 0.01) {
        firstSoundTime = w.time;
        break;
      }
    }

    return {
      duration,
      sampleRate,
      firstSoundTime,
      windows: windows.filter(w => w.rms > 0.005)
    };
  }, base64);

  console.log('Audio duration:', result.duration, 'Sample rate:', result.sampleRate);
  console.log('First sound onset (RMS > 0.01):', result.firstSoundTime, 's');
  console.log('Energy profile around 0s - 8s:');
  result.windows.forEach(w => {
    if (w.time <= 8.5) {
      const bars = '#'.repeat(Math.min(50, Math.floor(w.rms * 200)));
      console.log(`[${w.time.toFixed(2)}s] RMS=${w.rms.toFixed(4)} | ${bars}`);
    }
  });

  await browser.close();
}

analyze().catch(console.error);
