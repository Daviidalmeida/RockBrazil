/** Original procedural applause. No recordings, samples or third-party sound assets. */
export type CrowdIntensity = 'NORMAL' | 'FIVE_STARS' | 'FULL_COMBO';
export function createCrowdSamples(sampleRate: number, intensity: CrowdIntensity): Float32Array[] {
  const level = intensity === 'FULL_COMBO' ? 3 : intensity === 'FIVE_STARS' ? 2 : 1;
  const duration = 2.1 + level * 0.45;
  const size = Math.ceil(duration * sampleRate);
  const channels = [new Float32Array(size), new Float32Array(size)];
  // Seeded noise makes this original synthesis reproducible for review and audio tests.
  let seed = 138 + level;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let clap = 0; clap < 36 + level * 22; clap++) {
    const start = Math.floor(random() * (duration - 0.2) * sampleRate);
    const length = Math.floor((0.025 + random() * 0.055) * sampleRate);
    const pan = 0.2 + random() * 0.6;
    let previous = 0;
    for (let i = 0; i < length && start + i < size; i++) {
      const noise = random() * 2 - 1;
      const sample = (noise - previous * 0.55) * Math.exp(-i / (sampleRate * 0.012)) * 0.24;
      previous = noise;
      channels[0][start + i] += sample * pan;
      channels[1][start + i] += sample * (1 - pan);
    }
  }
  // Soft crowd "whoo" for exceptional performances; no borrowed voice recording.
  if (level > 1) {
    for (let voice = 0; voice < level * 3; voice++) {
      const start = Math.floor((0.15 + random() * 0.7) * sampleRate);
      const frequency = 340 + random() * 300;
      const length = Math.floor(sampleRate * 1.25);
      for (let i = 0; i < length && start + i < size; i++) {
        const t = i / sampleRate;
        const envelope = Math.sin(Math.PI * i / length) ** 2;
        const sample = Math.sin(2 * Math.PI * frequency * (t + 0.025 * t * t)) * envelope * 0.016;
        channels[voice % 2][start + i] += sample;
      }
    }
  }
  let peak = 0;
  for (const channel of channels) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0 ? 0.65 / peak : 0;
  for (const channel of channels) {
    for (let i = 0; i < size; i++) {
      const fade = Math.min(1, i / (sampleRate * 0.14), (size - 1 - i) / (sampleRate * 0.65));
      channel[i] *= gain * Math.max(0, fade);
    }
  }
  return channels;
}
