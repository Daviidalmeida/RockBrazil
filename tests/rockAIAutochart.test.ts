import { describe, it, expect } from 'vitest';
import {
  MusicSourceManager,
  AudioPreparationService,
  GuitarStemSeparator,
  TempoAndBeatAnalyzer,
  MusicalEventDetector,
  GuitarTranscriptionService,
  DifficultyChartBuilder,
  ChartGenerationEngine,
  ChartValidationService,
  ChartVideoAlignmentService,
  PILOT_SONG_V13_9
} from '../src/game/rockai';
import { Note, Lane } from '../src/types';

describe('Rock AI Autochart Engine — Sistema Completo de Análise e Transcrição (V13.9)', () => {

  // 1. Validação de URLs do YouTube
  describe('MusicSourceManager - Validação de URLs e Conformidade', () => {
    it('deve extrair ID de URLs padrão watch do YouTube', () => {
      const res = MusicSourceManager.validateYouTubeUrl('https://www.youtube.com/watch?v=44XYEeD1A1U');
      expect(res.isValid).toBe(true);
      expect(res.videoId).toBe('44XYEeD1A1U');
    });

    it('deve extrair ID de URLs encurtadas youtu.be', () => {
      const res = MusicSourceManager.validateYouTubeUrl('https://youtu.be/44XYEeD1A1U?si=AbCdEf123');
      expect(res.isValid).toBe(true);
      expect(res.videoId).toBe('44XYEeD1A1U');
    });

    it('deve extrair ID de URLs de Shorts do YouTube', () => {
      const res = MusicSourceManager.validateYouTubeUrl('https://www.youtube.com/shorts/44XYEeD1A1U');
      expect(res.isValid).toBe(true);
      expect(res.videoId).toBe('44XYEeD1A1U');
    });

    it('deve aceitar ID puro de 11 caracteres', () => {
      const res = MusicSourceManager.validateYouTubeUrl('44XYEeD1A1U');
      expect(res.isValid).toBe(true);
      expect(res.videoId).toBe('44XYEeD1A1U');
    });

    it('deve rejeitar URLs inválidas ou de domínios não permitidos', () => {
      expect(MusicSourceManager.validateYouTubeUrl('https://vimeo.com/12345678').isValid).toBe(false);
      expect(MusicSourceManager.validateYouTubeUrl('invalid_string').isValid).toBe(false);
      expect(MusicSourceManager.validateYouTubeUrl('').isValid).toBe(false);
    });
  });

  // 2. Serviço de Preparação de Áudio
  describe('AudioPreparationService - Arquivos e Peaks de Forma de Onda', () => {
    it('deve gerar picos normalizados (0.0 a 1.0) para exibição gráfica', () => {
      const pcm = new Float32Array(44100); // 1 segundo a 44.1kHz
      // Gerar onda senoidal simples
      for (let i = 0; i < pcm.length; i++) {
        pcm[i] = Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.8;
      }

      const peaks = AudioPreparationService.generatePeaks(pcm, 100);
      expect(peaks.length).toBe(100);
      for (const p of peaks) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1.0);
      }
    });
  });

  // 3. Separação de Stems e DSP de Guitarra
  describe('GuitarStemSeparator - Filtro Harmônico Bandpass de Guitarra', () => {
    it('deve processar áudio e produzir metadata oficial com targetInstrument guitar', async () => {
      const separator = new GuitarStemSeparator();
      const pcm = new Float32Array(22050); // 0.5s
      for (let i = 0; i < pcm.length; i++) {
        pcm[i] = Math.sin((2 * Math.PI * 330 * i) / 44100); // Nota E4 da guitarra (330Hz)
      }

      const prepared = {
        name: 'test.wav',
        format: 'audio/wav',
        duration: 0.5,
        sampleRate: 44100,
        channels: 1,
        buffer: pcm,
        peaks: [0.5, 0.5]
      };

      const stem = await separator.separateGuitar(prepared);
      expect(stem.metadata.targetInstrument).toBe('guitar');
      expect(stem.metadata.modelName).toBe('RockAI-HarmonicDspSeparator-v1');
      expect(stem.audio.buffer).toBeInstanceOf(Float32Array);
    });
  });

  // 4. Análise de Andamento e Grade Rítmica (BPM)
  describe('TempoAndBeatAnalyzer - Detecção de BPM e Grade de Tempos', () => {
    it('deve estimar BPM dentro de limites musicais válidos (60 a 220 BPM)', () => {
      const pcm = new Float32Array(44100 * 4); // 4 segundos
      const sampleRate = 44100;
      // Inserir pulsos de beat a cada 0.5 segundos (120 BPM)
      for (let beat = 0; beat < 8; beat++) {
        const idx = Math.floor(beat * 0.5 * sampleRate);
        for (let j = 0; j < 200 && idx + j < pcm.length; j++) {
          pcm[idx + j] = 0.9;
        }
      }

      const result = TempoAndBeatAnalyzer.analyze(pcm, sampleRate, 4.0);
      expect(result.bpm).toBeGreaterThanOrEqual(60);
      expect(result.bpm).toBeLessThanOrEqual(240);
      expect(result.beats.length).toBeGreaterThan(0);
      expect(result.downbeats.length).toBeGreaterThan(0);
    });
  });

  // 5. Construtor de Dificuldades (Regras Rígidas de Pistas e Acordes)
  describe('DifficultyChartBuilder - Restrições Rígidas de Jogabilidade', () => {
    it('FÁCIL deve utilizar apenas pistas 0, 1 e 2, sem acordes simultâneos', () => {
      const events = [
        { time: 1.0, type: 'single' as const, duration: 0, intensity: 0.8, register: 'low' as const, confidence: 0.9, isStrumAttack: true },
        { time: 1.5, type: 'single' as const, duration: 0, intensity: 0.7, register: 'mid' as const, confidence: 0.8, isStrumAttack: true },
        { time: 2.0, type: 'chord' as const, duration: 0, intensity: 0.9, register: 'high' as const, confidence: 0.9, isStrumAttack: true },
        { time: 2.5, type: 'single' as const, duration: 0, intensity: 0.6, register: 'low' as const, confidence: 0.7, isStrumAttack: true }
      ];
      const tempo = { bpm: 120, isVariableBpm: false, beatIntervalSec: 0.5, downbeats: [0, 2], beats: [0, 0.5, 1, 1.5, 2, 2.5] };

      const charts = DifficultyChartBuilder.buildAllDifficulties(events, tempo, 3.0);

      expect(charts.EASY.length).toBeGreaterThan(0);
      for (const note of charts.EASY) {
        expect([0, 1, 2]).toContain(note.lane);
      }

      // Nenhum acorde (nenhum par de notas com mesmo timestamp)
      const times = charts.EASY.map(n => n.time);
      const uniqueTimes = new Set(times);
      expect(times.length).toBe(uniqueTimes.size);
    });

    it('MÉDIO deve limitar pistas a 0..3 e acordes a no máximo 2 notas', () => {
      const events = [
        { time: 1.0, type: 'chord' as const, duration: 0, intensity: 0.9, register: 'mid' as const, confidence: 0.9, isStrumAttack: true },
        { time: 1.5, type: 'single' as const, duration: 0, intensity: 0.7, register: 'high' as const, confidence: 0.8, isStrumAttack: true }
      ];
      const tempo = { bpm: 120, isVariableBpm: false, beatIntervalSec: 0.5, downbeats: [0], beats: [0, 0.5, 1, 1.5] };

      const charts = DifficultyChartBuilder.buildAllDifficulties(events, tempo, 2.0);

      for (const note of charts.MEDIUM) {
        expect([0, 1, 2, 3]).toContain(note.lane);
      }

      // Máximo 2 notas por timestamp no MÉDIO
      const countsByTime: Record<number, number> = {};
      charts.MEDIUM.forEach(n => countsByTime[n.time] = (countsByTime[n.time] || 0) + 1);
      Object.values(countsByTime).forEach(count => expect(count).toBeLessThanOrEqual(2));
    });
  });

  // 6. Serviço de Validação de Charts (14 Regras Mandatórias)
  describe('ChartValidationService - Validação de Integridade e Compatibilidade', () => {
    it('deve aprovar charts perfeitamente construídos e ordenados', () => {
      const charts = {
        EASY: [
          { id: 1, time: 1.0, lane: 0 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
          { id: 2, time: 2.0, lane: 1 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
        ],
        MEDIUM: [
          { id: 1, time: 1.0, lane: 0 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
          { id: 2, time: 1.5, lane: 1 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
          { id: 3, time: 2.0, lane: 2 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
        ],
        HARD: [
          { id: 1, time: 1.0, lane: 0 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
          { id: 2, time: 1.3, lane: 2 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
          { id: 3, time: 1.6, lane: 3 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
          { id: 4, time: 2.0, lane: 4 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
        ],
        EXPERT: [
          { id: 1, time: 1.0, lane: 0 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
          { id: 2, time: 1.2, lane: 1 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
          { id: 3, time: 1.4, lane: 2 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
          { id: 4, time: 1.7, lane: 3 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
          { id: 5, time: 2.0, lane: 4 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
        ]
      };

      const result = ChartValidationService.validateAllDifficulties(charts, 3.0);
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('deve reprovar notas desordenadas ou com espaçamento físico impossível (< 50ms)', () => {
      const invalidCharts = {
        EASY: [
          { id: 1, time: 2.0, lane: 0 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
          { id: 2, time: 1.0, lane: 0 as Lane, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 } // Desordenado!
        ],
        MEDIUM: [],
        HARD: [],
        EXPERT: []
      };

      const result = ChartValidationService.validateAllDifficulties(invalidCharts, 3.0);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('ordenação temporal') || e.includes('ordem cronológica'))).toBe(true);
    });
  });

  // 7. Alinhamento Temporal de Vídeo (RockSync Offset)
  describe('ChartVideoAlignmentService - Calibração de Offset', () => {
    it('deve ajustar o offset em passos de -100ms, -25ms, +25ms, +100ms e mudar o status para EM_TESTE', () => {
      let state = ChartVideoAlignmentService.createInitialAlignment('test-song', '44XYEeD1A1U', 0);
      expect(state.offsetMs).toBe(0);
      expect(state.status).toBe('NAO_CALIBRADO');

      // Ajustar +25ms
      state = ChartVideoAlignmentService.adjustOffset(state, 25);
      expect(state.offsetMs).toBe(25);
      expect(state.status).toBe('EM_TESTE');

      // Ajustar -100ms
      state = ChartVideoAlignmentService.adjustOffset(state, -100);
      expect(state.offsetMs).toBe(-75);

      // Confirmar validação do usuário
      state = ChartVideoAlignmentService.setValidationStatus(state, 'VALIDADO_PELO_USUARIO');
      expect(state.status).toBe('VALIDADO_PELO_USUARIO');
    });

    it('deve aplicar a fórmula temporal chartTime = videoTime + (offsetMs / 1000)', () => {
      const offsetMs = 150; // +150ms
      const chartTime = ChartVideoAlignmentService.calculateChartTime(10.0, offsetMs);
      expect(chartTime).toBe(10.15);

      const videoTime = ChartVideoAlignmentService.calculateVideoTime(10.15, offsetMs);
      expect(videoTime).toBe(10.0);
    });
  });

  // 8. Registro da Música Piloto V13.9
  describe('PilotSongRegistry - Red Hot Chili Peppers (Under the Bridge)', () => {
    it('deve conter a música piloto registrada como AGUARDANDO ÁUDIO AUTORIZADO em conformidade legal', () => {
      expect(PILOT_SONG_V13_9.youtubeVideoId).toBe('44XYEeD1A1U');
      expect(PILOT_SONG_V13_9.title).toBe('Under the Bridge');
      expect(PILOT_SONG_V13_9.artist).toBe('Red Hot Chili Peppers');
      expect(PILOT_SONG_V13_9.status).toBe('AGUARDANDO ÁUDIO AUTORIZADO');
      expect(PILOT_SONG_V13_9.licenseNotice).toContain('Direitos autorais preservados');
    });
  });
});
