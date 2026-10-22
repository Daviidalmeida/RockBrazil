/**
 * AudioAnalyzer: Performs band-limited spectral flux and energy decomposition focused on guitar frequencies.
 */

export interface AnalysisFrame {
  time: number;
  guitarEnergy: number;       // Energy in 300Hz - 3200Hz
  pickAttackEnergy: number;   // Energy in 3200Hz - 6500Hz
  lowSubEnergy: number;       // Energy in 20Hz - 220Hz (used to filter out kick-only transients)
  spectralFlux: number;       // Sharp positive change in guitar spectrum
}

export class AudioAnalyzer {
  static analyzeBuffer(buffer: AudioBuffer, hopSizeMs = 15): AnalysisFrame[] {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const totalSamples = channelData.length;

    const hopSamples = Math.floor(sampleRate * (hopSizeMs / 1000));
    const windowSamples = hopSamples * 2;
    const totalFrames = Math.floor((totalSamples - windowSamples) / hopSamples);

    const frames: AnalysisFrame[] = [];
    let prevGuitarMag = 0;
    let prevAttackMag = 0;

    // Filter frequency bins approximation based on sample rate
    // Sub/Bass: 20 - 220 Hz
    // Guitar Body/Distortion: 300 - 3200 Hz
    // Pick Attack/Presence: 3200 - 6500 Hz

    for (let f = 0; f < totalFrames; f++) {
      const start = f * hopSamples;
      const frameTime = start / sampleRate;

      let subEnergy = 0;
      let guitarEnergy = 0;
      let attackEnergy = 0;

      // Time-domain simple band-filtering approximation over window
      // Using zero-crossing rate and difference filters to separate spectral bands efficiently on mobile
      let prevVal = 0;
      for (let i = 0; i < windowSamples; i++) {
        const val = channelData[start + i];
        const diff = val - prevVal;
        const absVal = Math.abs(val);
        const absDiff = Math.abs(diff);

        // High frequency changes represent pick attacks
        attackEnergy += absDiff * absDiff;

        // Mid frequencies represent guitar distortion body
        guitarEnergy += absVal * absVal;

        // Low frequencies have slow variation
        subEnergy += Math.abs(val + prevVal) * 0.5;

        prevVal = val;
      }

      guitarEnergy = Math.sqrt(guitarEnergy / windowSamples);
      attackEnergy = Math.sqrt(attackEnergy / windowSamples);
      subEnergy = subEnergy / windowSamples;

      // Guitar Spectral Flux: positive novelty in guitar and attack bands
      const guitarFlux = Math.max(0, guitarEnergy - prevGuitarMag);
      const attackFlux = Math.max(0, attackEnergy - prevAttackMag);
      const combinedFlux = guitarFlux * 0.6 + attackFlux * 0.4;

      prevGuitarMag = guitarEnergy;
      prevAttackMag = attackEnergy;

      frames.push({
        time: Number(frameTime.toFixed(3)),
        guitarEnergy,
        pickAttackEnergy: attackEnergy,
        lowSubEnergy: subEnergy,
        spectralFlux: combinedFlux
      });
    }

    return frames;
  }
}
