import { describe, it, expect } from 'vitest';
import { AudioImporter } from '../src/audio/analysis/audioImporter';
import { GuitarDetector, GuitarEvent } from '../src/audio/analysis/guitarDetector';
import { DifficultyGenerator } from '../src/audio/analysis/difficultyGenerator';
import { AnalysisFrame } from '../src/audio/analysis/audioAnalyzer';

describe('Fase 2 - Análise de Guitarra e Geração de Dificuldades', () => {
  it('AudioImporter valida extensões de arquivo corretamente', () => {
    const validFile = new File(['fake mp3 data'], 'rock.mp3', { type: 'audio/mpeg' });
    const invalidFile = new File(['fake text'], 'lyrics.txt', { type: 'text/plain' });

    expect(AudioImporter.validateAudioFile(validFile).valid).toBe(true);
    expect(AudioImporter.validateAudioFile(invalidFile).valid).toBe(false);
  });

  it('GuitarDetector detecta onsets e calcula duração de notas sustentadas', () => {
    const frames: AnalysisFrame[] = [];
    // 100 frames (~1.5s total)
    for (let i = 0; i < 100; i++) {
      const t = i * 0.015;
      let guitarEnergy = 0.02;
      let pickAttack = 0.01;
      let flux = 0.005;

      // Guitar onset at frame 20 (t = 0.3s)
      if (i === 20) {
        guitarEnergy = 0.45;
        pickAttack = 0.35;
        flux = 0.30;
      } else if (i > 20 && i < 50) {
        // Sustained vibration for 30 frames (~450ms)
        guitarEnergy = 0.25; // > 40% of peak (0.45 * 0.42 = 0.189)
        pickAttack = 0.03;
      }

      frames.push({
        time: Number(t.toFixed(3)),
        guitarEnergy,
        pickAttackEnergy: pickAttack,
        lowSubEnergy: 0.05,
        spectralFlux: flux
      });
    }

    const events = GuitarDetector.detectEvents(frames);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].time).toBeCloseTo(0.3, 1);
    expect(events[0].duration).toBeGreaterThan(0.3); // Sustain detectado!
  });

  it('DifficultyGenerator gera 4 dificuldades com densidades progressivas a partir dos eventos', () => {
    const events: GuitarEvent[] = [];
    // Simulate 20 detected guitar events
    for (let i = 0; i < 20; i++) {
      events.push({
        time: i * 0.3, // every 300ms
        type: i % 4 === 0 ? 'chord' : 'riff',
        duration: i % 5 === 0 ? 0.9 : 0,
        intensity: 0.3 + (i % 5) * 0.15,
        register: i % 3 === 0 ? 'low' : i % 3 === 1 ? 'mid' : 'high'
      });
    }

    const charts = DifficultyGenerator.generateAllDifficulties(events);

    expect(charts.EASY).toBeDefined();
    expect(charts.MEDIUM).toBeDefined();
    expect(charts.HARD).toBeDefined();
    expect(charts.EXPERT).toBeDefined();

    // Progressão estrita de densidade
    expect(charts.EASY.length).toBeLessThanOrEqual(charts.MEDIUM.length);
    expect(charts.MEDIUM.length).toBeLessThanOrEqual(charts.HARD.length);
    expect(charts.HARD.length).toBeLessThanOrEqual(charts.EXPERT.length);

    // Todas as notas devem pertencer às 5 pistas (0 a 4)
    charts.EXPERT.forEach((n) => {
      expect(n.lane).toBeGreaterThanOrEqual(0);
      expect(n.lane).toBeLessThanOrEqual(4);
      expect(n.time).toBeGreaterThanOrEqual(0);
    });
  });
});
