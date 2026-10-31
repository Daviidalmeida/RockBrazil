import { describe, it, expect, vi } from 'vitest';
import {
  RealGuitarStemAdapter,
  SpotifyBasicPitchAdapter,
  RockAILocalBridge,
  ChartGenerationEngine,
  PreparedAudio,
  IsolatedGuitarStem
} from '../src/game/rockai';

describe('ROCKBRAZIL V13.9.1 — ROCK AI PRO ADAPTERS (DEMUCS & SPOTIFY BASIC PITCH)', () => {

  const samplePcm = new Float32Array(44100); // 1.0s mono
  for (let i = 0; i < samplePcm.length; i++) {
    samplePcm[i] = Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.5;
  }

  const samplePreparedAudio: PreparedAudio = {
    name: 'test_track.wav',
    format: 'audio/wav',
    duration: 1.0,
    sampleRate: 44100,
    channels: 1,
    buffer: samplePcm,
    peaks: [0.5, 0.5]
  };

  describe('1. RealGuitarStemAdapter (Demucs HTDemucs 6S)', () => {
    it('deve realizar health check e reportar offline quando o servidor local não estiver ativo', async () => {
      const adapter = new RealGuitarStemAdapter({ baseUrl: 'http://localhost:9999' }); // Porta inexistente
      const health = await adapter.checkHealth();
      expect(health.available).toBe(false);
      expect(health.error).toBeDefined();
    });

    it('deve acionar fallback DSP automaticamente quando o servidor local de IA estiver offline', async () => {
      const adapter = new RealGuitarStemAdapter({
        baseUrl: 'http://localhost:9999',
        autoFallbackToDsp: true
      });

      const stem = await adapter.separateGuitar(samplePreparedAudio);
      expect(stem).toBeDefined();
      expect(stem.metadata.targetInstrument).toBe('guitar');
      expect(stem.metadata.isRealAI).toBe(false); // Transparência: classificado como DSP
      expect(stem.metadata.separationModel).toBe('DSP_BANDPASS_FALLBACK');
      expect(stem.metadata.interferenceWarnings.some(w => w.includes('FALLBACK DSP'))).toBe(true);
    });
  });

  describe('2. SpotifyBasicPitchAdapter (Spotify Basic Pitch)', () => {
    it('deve realizar health check e reportar offline de forma transparente', async () => {
      const adapter = new SpotifyBasicPitchAdapter({ baseUrl: 'http://localhost:9999' });
      const health = await adapter.checkHealth();
      expect(health.available).toBe(false);
    });

    it('deve acionar fallback YIN quando offline e rotular explicitamente como YIN_DSP_FALLBACK', async () => {
      const adapter = new SpotifyBasicPitchAdapter({
        baseUrl: 'http://localhost:9999',
        autoFallbackToYin: true
      });

      const sampleStem: IsolatedGuitarStem = {
        audio: samplePreparedAudio,
        metadata: {
          modelName: 'htdemucs_6s',
          modelVersion: 'Demucs v4',
          targetInstrument: 'guitar',
          qualityEstimate: 0.9,
          duration: 1.0,
          processingTimeMs: 10,
          interferenceWarnings: [],
          isRealAI: true,
          separationModel: 'HTDEMUCS_6S'
        }
      };

      const result = await adapter.transcribe(sampleStem);
      expect(result).toBeDefined();
      expect(result.metadata.engine).toBe('YIN_DSP_FALLBACK');
      expect(result.metadata.isRealAI).toBe(false);
      expect(result.events.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('3. RockAILocalBridge (Importação e Descoberta)', () => {
    it('deve detectar status offline quando localhost:8000 não responder', async () => {
      const status = await RockAILocalBridge.probeBackend('http://localhost:9999');
      expect(status.online).toBe(false);
    });

    it('deve analisar e importar com sucesso um chart JSON gerado pelo CLI offline da IA', () => {
      const mockChartJson = JSON.stringify({
        songId: 'rockai-cli-test',
        title: 'Under the Bridge',
        artist: 'Red Hot Chili Peppers',
        youtubeVideoId: '44XYEeD1A1U',
        duration: 180.5,
        bpm: 120,
        charts: {
          EASY: [{ id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }],
          MEDIUM: [{ id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }],
          HARD: [{ id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }],
          EXPERT: [{ id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }]
        },
        stemMetadata: {
          modelName: 'htdemucs_6s',
          modelVersion: 'Demucs v4',
          targetInstrument: 'guitar',
          qualityEstimate: 0.96,
          duration: 180.5,
          processingTimeMs: 4500,
          interferenceWarnings: [],
          isRealAI: true,
          separationModel: 'HTDEMUCS_6S'
        },
        transcriptionMetadata: {
          engine: 'SPOTIFY_BASIC_PITCH',
          modelName: 'Spotify-Basic-Pitch',
          version: '0.2.7',
          isRealAI: true,
          polyphonic: true,
          notesDetectedCount: 350
        }
      });

      const imported = RockAILocalBridge.parseImportedChartJson(mockChartJson);
      expect(imported.title).toBe('Under the Bridge');
      expect(imported.engineMode).toBe('REAL_AI');
      expect(imported.stemMetadata.isRealAI).toBe(true);
      expect(imported.transcriptionMetadata.isRealAI).toBe(true);
      expect(imported.charts.EASY.length).toBe(1);
    });
  });

  describe('4. ChartGenerationEngine.generateFromStem', () => {
    it('deve gerar 4 dificuldades a partir de stem com metadata transparente', async () => {
      const sampleStem: IsolatedGuitarStem = {
        audio: samplePreparedAudio,
        metadata: {
          modelName: 'RockAI-HarmonicDspSeparator-v1 (FALLBACK)',
          modelVersion: '1.0',
          targetInstrument: 'guitar',
          qualityEstimate: 0.7,
          duration: 1.0,
          processingTimeMs: 15,
          interferenceWarnings: [],
          isRealAI: false,
          separationModel: 'DSP_BANDPASS_FALLBACK'
        }
      };

      const out = await ChartGenerationEngine.generateFromStem(sampleStem);
      expect(out.charts.EASY).toBeDefined();
      expect(out.charts.MEDIUM).toBeDefined();
      expect(out.charts.HARD).toBeDefined();
      expect(out.charts.EXPERT).toBeDefined();
      expect(out.bpm).toBeGreaterThan(0);
      expect(out.engineMode).toBe('FALLBACK_DSP');
    });
  });
});
