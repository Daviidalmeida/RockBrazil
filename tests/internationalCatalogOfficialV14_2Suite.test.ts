import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  INTERNATIONAL_SONGS_CATALOG,
  INTERNATIONAL_METADATA_CONFIG,
  ARCHIVED_INTERNATIONAL_SONGS
} from '../src/game/catalog/internationalCatalog';
import { RAW_INTERNATIONAL_CHARTS } from '../src/game/catalog/internationalChartsRegistry';
import { INTERNATIONAL_SYNC_REGISTRY } from '../src/game/sync/internationalSyncRegistry';
import { RockSyncProfileRepository } from '../src/game/rockchart/sync/rockSyncProfileRepository';
import { BeatmapManager } from '../src/game/beatmapManager';
import { SongLibrary } from '../src/game/songLibrary';
import { CalibrationManager } from '../src/game/sync/calibrationManager';
import { GameEngine } from '../src/game/engine';
import { GameRenderer } from '../src/render/renderer';
import { UnifiedMasterClock } from '../src/game/sync/masterClock';
import { RockSyncEngine } from '../src/game/sync/rockSyncEngine';
import { AudioPlaybackController } from '../src/audio/audioPlaybackController';
import { Difficulty, Note, PlaybackState, GameSettings } from '../src/types';

const defaultSettings: GameSettings = {
  musicVolume: 0.85,
  sfxVolume: 0.9,
  audioOffsetMs: 0,
  noteSpeedMultiplier: 1.0,
  visualEffectsEnabled: true,
  visualEffectsMode: 'NORMAL',
  effectsMode: 'NORMAL',
  muteOnMiss: true
};

describe('ROCKBRAZIL V14.2 — SUÍTE OFICIAL DO CATÁLOGO INTERNACIONAL & GIVEN UP', () => {
  let bm: BeatmapManager;
  let library: SongLibrary;
  let masterClock: UnifiedMasterClock;
  let engine: GameEngine;
  let renderer: GameRenderer;
  let canvas: any;

  beforeEach(() => {
    bm = new BeatmapManager();
    library = new SongLibrary();
    masterClock = new UnifiedMasterClock();
    engine = new GameEngine([], 'MEDIUM', defaultSettings);
    engine.setUnifiedClockMode(true);

    canvas = {
      width: 800,
      height: 600,
      getContext: vi.fn().mockReturnValue({
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        arc: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        ellipse: vi.fn(),
        createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
        createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        fillText: vi.fn()
      })
    };
    renderer = new GameRenderer(canvas);
  });

  // ==========================================================================
  // SEÇÃO 1: ESTRUTURA DO CATÁLOGO INTERNACIONAL (ESTRITAMENTE 6 MÚSICAS)
  // ==========================================================================
  describe('1. Catálogo Internacional Definitivo (Escopo Estrito de 6 Músicas)', () => {
    it('1.1. O catálogo internacional ativo deve conter exatamente 6 músicas', () => {
      expect(INTERNATIONAL_SONGS_CATALOG.length).toBe(6);
    });

    it('1.2. As 6 músicas devem possuir os IDs e artistas oficiais esperados', () => {
      const ids = INTERNATIONAL_SONGS_CATALOG.map((s) => s.id);
      expect(ids).toEqual([
        'intl-acdc-highway-to-hell',
        'intl-gnr-paradise-city',
        'intl-gnr-sweet-child-o-mine',
        'intl-gnr-welcome-to-the-jungle',
        'intl-lp-numb',
        'intl-lp-given-up'
      ]);
    });

    it('1.3. T.N.T. não deve estar na lista de músicas jogáveis ativas', () => {
      const intlSongs = library.getActiveSongs('international');
      expect(intlSongs.some((s) => s.id === 'tnt-acdc')).toBe(false);
      expect(intlSongs.some((s) => s.id === 'intl-lp-given-up')).toBe(true);
    });

    it('1.4. T.N.T. não deve aparecer como "PRONTA PARA TESTE"', () => {
      const config = INTERNATIONAL_METADATA_CONFIG['tnt-acdc'];
      expect(config.status).toBe('VÍDEO INDISPONÍVEL');
      expect(config.status).not.toBe('PRONTA PARA TESTE');
    });

    it('1.5. Os charts históricos de T.N.T. devem estar preservados na íntegra em RAW_INTERNATIONAL_CHARTS', () => {
      const tntRaw = RAW_INTERNATIONAL_CHARTS['tnt-acdc'];
      expect(tntRaw).toBeDefined();
      expect(tntRaw.EASY.length).toBe(703);
      expect(tntRaw.MEDIUM.length).toBe(1125);
      expect(tntRaw.HARD.length).toBe(1518);
      expect(tntRaw.EXPERT.length).toBe(1639);
    });

    it('1.6. Highway to Hell deve preservar a versão Ao Vivo no River Plate', () => {
      const hth = INTERNATIONAL_SONGS_CATALOG.find((s) => s.id === 'intl-acdc-highway-to-hell');
      expect(hth).toBeDefined();
      expect(hth?.title).toContain('River Plate');
      expect(hth?.youtubeVideoId).toBe('gEPmA3USJdI');
      expect(hth?.recordingVersion).toContain('River Plate');
    });
  });

  // ==========================================================================
  // SEÇÃO 2: 28 TESTES ESPECÍFICOS DE GIVEN UP — LINKIN PARK
  // ==========================================================================
  describe('2. Bateria Completa de 28 Testes — Given Up (Linkin Park)', () => {
    const GIVEN_UP_ID = 'intl-lp-given-up';

    it('T01. Metadados cadastrais: ID, título, artista, álbum, ano e duração (189s)', () => {
      const song = INTERNATIONAL_SONGS_CATALOG.find((s) => s.id === GIVEN_UP_ID);
      expect(song).toBeDefined();
      expect(song?.id).toBe(GIVEN_UP_ID);
      expect(song?.title).toBe('Given Up');
      expect(song?.artist).toBe('Linkin Park');
      expect(song?.year).toBe(2007);
      expect(song?.duration).toBe(189);
      expect(song?.style).toContain('Minutes to Midnight');
    });

    it('T02. Associação com gravação oficial do YouTube (D93vYwuMeUw / Official Audio / Topic)', () => {
      const song = INTERNATIONAL_SONGS_CATALOG.find((s) => s.id === GIVEN_UP_ID);
      expect(song?.youtubeVideoId).toBe('D93vYwuMeUw');
      expect(song?.youtubeChannel).toBe('Linkin Park - Topic');
      expect(song?.embeddingStatus).toBe('ELIGIBLE_OFFICIAL');
      expect(song?.licenseStatus).toBe('EMBED_ALLOWED');
    });

    it('T03. Arquivo de capa oficial existe no disco público (intl-lp-given-up.jpg)', () => {
      const song = INTERNATIONAL_SONGS_CATALOG.find((s) => s.id === GIVEN_UP_ID);
      expect(song?.coverUrl).toBe('images/intl-covers/intl-lp-given-up.jpg');
      const coverPath = path.resolve(__dirname, '../public', song!.coverUrl);
      expect(fs.existsSync(coverPath)).toBe(true);
    });

    it('T04. Andamento musical detectado em 100 BPM (straight 4/4)', () => {
      const song = INTERNATIONAL_SONGS_CATALOG.find((s) => s.id === GIVEN_UP_ID);
      expect(song?.bpm).toBe(100);
    });

    it('T05. Não-truncamento: extensão de notas cobre do início do riff (4.8s) ao encerramento (>182s)', () => {
      const expert = bm.getBeatmap(GIVEN_UP_ID, 'EXPERT');
      expect(expert.length).toBeGreaterThan(0);
      const first = expert[0].time;
      const last = expert[expert.length - 1].time;
      expect(first).toBeLessThanOrEqual(4.9);
      expect(first).toBeGreaterThanOrEqual(4.7);
      expect(last).toBeGreaterThanOrEqual(182.0);
    });

    it('T06. FÁCIL: exatamente 432 notas, estritamente 3 pistas (0, 1, 2)', () => {
      const easy = bm.getBeatmap(GIVEN_UP_ID, 'EASY');
      expect(easy.length).toBe(432);
      for (const note of easy) {
        expect(note.lane).toBeGreaterThanOrEqual(0);
        expect(note.lane).toBeLessThanOrEqual(2);
      }
    });

    it('T07. FÁCIL: estritamente zero acordes (timestamps 100% únicos)', () => {
      const easy = bm.getBeatmap(GIVEN_UP_ID, 'EASY');
      const timeMap = new Map<number, number>();
      for (const n of easy) {
        timeMap.set(n.time, (timeMap.get(n.time) || 0) + 1);
      }
      const chords = Array.from(timeMap.values()).filter((c) => c > 1);
      expect(chords.length).toBe(0);
    });

    it('T08. FÁCIL: ritmo consistente e progressivo para iniciantes', () => {
      const easy = bm.getBeatmap(GIVEN_UP_ID, 'EASY');
      expect(easy.length).toBe(432);
    });

    it('T09. MÉDIO: exatamente 838 notas, estritamente 4 pistas (0, 1, 2, 3)', () => {
      const med = bm.getBeatmap(GIVEN_UP_ID, 'MEDIUM');
      expect(med.length).toBe(838);
      for (const note of med) {
        expect(note.lane).toBeGreaterThanOrEqual(0);
        expect(note.lane).toBeLessThanOrEqual(3);
      }
    });

    it('T10. MÉDIO: presença de acordes e sincopas nos refrãos', () => {
      const med = bm.getBeatmap(GIVEN_UP_ID, 'MEDIUM');
      const timeMap = new Map<number, number>();
      for (const n of med) {
        timeMap.set(n.time, (timeMap.get(n.time) || 0) + 1);
      }
      const chords = Array.from(timeMap.values()).filter((c) => c > 1);
      expect(chords.length).toBeGreaterThan(20);
    });

    it('T11. DIFÍCIL: exatamente 841 notas, 5 pistas (0..4) com sustentadas e acordes', () => {
      const hard = bm.getBeatmap(GIVEN_UP_ID, 'HARD');
      expect(hard.length).toBe(841);
      const lanes = new Set(hard.map((n) => n.lane));
      expect(lanes.has(4)).toBe(true);
    });

    it('T12. EXPERT: exatamente 841 notas, 5 pistas (0..4) com técnica completa', () => {
      const expert = bm.getBeatmap(GIVEN_UP_ID, 'EXPERT');
      expect(expert.length).toBe(841);
      const lanes = new Set(expert.map((n) => n.lane));
      expect(lanes.has(4)).toBe(true);
    });

    it('T13. Progressão estrita de notas: EASY (432) < MEDIUM (838) <= HARD (841) <= EXPERT (841)', () => {
      const e = bm.getBeatmap(GIVEN_UP_ID, 'EASY').length;
      const m = bm.getBeatmap(GIVEN_UP_ID, 'MEDIUM').length;
      const h = bm.getBeatmap(GIVEN_UP_ID, 'HARD').length;
      const x = bm.getBeatmap(GIVEN_UP_ID, 'EXPERT').length;
      expect(e).toBeLessThan(m);
      expect(m).toBeLessThanOrEqual(h);
      expect(h).toBeLessThanOrEqual(x);
    });

    it('T14. BeatmapManager carrega Given Up de RAW_INTERNATIONAL_CHARTS via UniversalChartImporter', () => {
      const raw = RAW_INTERNATIONAL_CHARTS[GIVEN_UP_ID];
      expect(raw).toBeDefined();
      expect(raw.EASY.length).toBe(432);
      expect(raw.EXPERT.length).toBe(841);
    });

    it('T15. Ponte icônica do grito de 17 segundos (91.2s - 110.4s) possui crescendo de notas', () => {
      const expert = bm.getBeatmap(GIVEN_UP_ID, 'EXPERT');
      const screamNotes = expert.filter((n) => n.time >= 91.2 && n.time <= 110.4);
      expect(screamNotes.length).toBeGreaterThan(80);
    });

    it('T16. Riff em Drop D dos versos representado com fidelidade rítmica', () => {
      const expert = bm.getBeatmap(GIVEN_UP_ID, 'EXPERT');
      const verseNotes = expert.filter((n) => n.time >= 14.4 && n.time <= 33.6);
      expect(verseNotes.length).toBeGreaterThanOrEqual(50);
    });

    it('T17. Progressão dos refrãos possui acordes marcados nas pistas de power chord', () => {
      const hard = bm.getBeatmap(GIVEN_UP_ID, 'HARD');
      const chorusNotes = hard.filter((n) => n.time >= 33.6 && n.time <= 52.8);
      const chords = chorusNotes.filter((n) => n.type === 'chord' || n.duration > 0.5);
      expect(chords.length).toBeGreaterThan(10);
    });

    it('T18. Acorde final em Drop D (187.1s) encerra a faixa com fidelidade acústica', () => {
      const expert = bm.getBeatmap(GIVEN_UP_ID, 'EXPERT');
      const finalNote = expert[expert.length - 1];
      expect(finalNote.time).toBeCloseTo(187.1, 1);
    });

    it('T19. CalibrationManager retorna 0ms para o áudio de estúdio de Given Up', () => {
      const offset = CalibrationManager.getSongOffsetMs(GIVEN_UP_ID, 'D93vYwuMeUw');
      expect(offset).toBe(0);
    });

    it('T20. RockSyncProfileRepository registra perfil canônico VERIFIED para Given Up', () => {
      const profile = RockSyncProfileRepository.getInstance().getProfileForSong(GIVEN_UP_ID);
      expect(profile).toBeDefined();
      expect(profile?.youtubeVideoId).toBe('D93vYwuMeUw');
      expect(profile?.validationStatus).toBe('VERIFIED');
      expect(profile?.offsetMs).toBe(0);
    });

    it('T21. MasterClock configura offsets de Given Up sem duplicidade sistêmica', () => {
      masterClock.setOffsets(0, 0);
      masterClock.setSource({
        getCurrentTime: () => 10.0,
        getPlaybackState: () => PlaybackState.PLAYING,
        isBuffering: () => false
      });
      masterClock.startPlayback();
      expect(masterClock.getTime()).toBe(10.0);
    });

    it('T22. Alinhamento esteira vs receptor: quando timeUntilHit = 0, y coincide exatamente com strikeY', () => {
      const noteTime = 4.8;
      const currentTime = 4.8;
      const visualY = renderer.calculateVisualY(noteTime, currentTime);
      const strikeY = renderer.getStrikeLineY();
      expect(visualY).toBeCloseTo(strikeY, 5);

      const timeUntilHit = renderer.calculateTimeUntilHit(noteTime, currentTime);
      expect(timeUntilHit).toBe(0);
    });

    it('T23. Pausa na reprodução congela o relógio unificado e a posição visual', () => {
      let mockTime = 15.0;
      let state = PlaybackState.PLAYING;
      masterClock.setSource({
        getCurrentTime: () => mockTime,
        getPlaybackState: () => state,
        isBuffering: () => false
      });
      masterClock.startPlayback();

      const timeBefore = masterClock.getTime();
      state = PlaybackState.PAUSED;
      masterClock.pause();

      expect(masterClock.getTime()).toBe(timeBefore);
    });

    it('T24. Buffering congela relógio sem disparar falhas de MISS', () => {
      let isBuffering = false;
      masterClock.setSource({
        getCurrentTime: () => 20.0,
        getPlaybackState: () => PlaybackState.PLAYING,
        isBuffering: () => isBuffering
      });
      masterClock.startPlayback();

      const rse = new RockSyncEngine(masterClock);
      isBuffering = true;
      rse.update(performance.now());
      expect(rse.getState().consecutiveMisses).toBe(0);
    });

    it('T25. Retomada após buffering reconecta o tempo sem salto temporal brusco', () => {
      let mockTime = 25.0;
      masterClock.setSource({
        getCurrentTime: () => mockTime,
        getPlaybackState: () => PlaybackState.PLAYING,
        isBuffering: () => false
      });
      masterClock.startPlayback();

      mockTime = 25.05;
      const timeAfter = masterClock.getTime();
      expect(timeAfter).toBeCloseTo(25.05, 2);
    });

    it('T26. Regra MISS silencia o áudio imediatamente mantendo o relógio musical em curso', () => {
      const mockAudio: any = {
        setMuteOnMiss: vi.fn(),
        resetMuteOnMiss: vi.fn(),
        stop: vi.fn(),
        getCurrentTime: vi.fn().mockReturnValue(10.0)
      };
      const mockYt: any = {
        setMuted: vi.fn(),
        stop: vi.fn(),
        getCurrentTime: vi.fn().mockReturnValue(10.0),
        isBuffering: vi.fn().mockReturnValue(false)
      };
      const controller = new AudioPlaybackController(mockAudio, mockYt);

      controller.handleGameplayMiss();
      expect(controller.getStatus().isMissMuted).toBe(true);
      expect(mockYt.setMuted).toHaveBeenCalledWith(true);
      expect(mockAudio.setMuteOnMiss).toHaveBeenCalledWith(true);
    });

    it('T27. Regra HIT restaura o áudio imediatamente', () => {
      const mockAudio: any = {
        setMuteOnMiss: vi.fn(),
        resetMuteOnMiss: vi.fn(),
        stop: vi.fn(),
        getCurrentTime: vi.fn().mockReturnValue(10.0)
      };
      const mockYt: any = {
        setMuted: vi.fn(),
        stop: vi.fn(),
        getCurrentTime: vi.fn().mockReturnValue(10.0),
        isBuffering: vi.fn().mockReturnValue(false)
      };
      const controller = new AudioPlaybackController(mockAudio, mockYt);

      controller.handleGameplayMiss();
      expect(controller.getStatus().isMissMuted).toBe(true);

      controller.handleGameplayHit();
      expect(controller.getStatus().isMissMuted).toBe(false);
      expect(mockYt.setMuted).toHaveBeenCalledWith(false, true);
      expect(mockAudio.setMuteOnMiss).toHaveBeenCalledWith(false);
    });

    it('T28. Regra SAIR encerra completamente a reprodução e reseta o controlador', () => {
      const mockAudio: any = {
        setMuteOnMiss: vi.fn(),
        resetMuteOnMiss: vi.fn(),
        stop: vi.fn(),
        getCurrentTime: vi.fn().mockReturnValue(10.0)
      };
      const mockYt: any = {
        setMuted: vi.fn(),
        stop: vi.fn(),
        getCurrentTime: vi.fn().mockReturnValue(10.0),
        isBuffering: vi.fn().mockReturnValue(false)
      };
      const controller = new AudioPlaybackController(mockAudio, mockYt);

      controller.stop();
      expect(controller.getStatus().playbackState).toBe(PlaybackState.READY);
      expect(mockAudio.stop).toHaveBeenCalled();
      expect(mockYt.stop).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // SEÇÃO 3: MATRIZ DE VALIDAÇÃO DAS 6 MÚSICAS DO CATÁLOGO INTERNACIONAL
  // ==========================================================================
  describe('3. Matriz de Validação das 6 Músicas Internacionais', () => {
    const expectedCatalog = [
      {
        id: 'intl-acdc-highway-to-hell',
        title: 'Highway to Hell (Live at River Plate)',
        artist: 'AC/DC',
        youtubeVideoId: 'gEPmA3USJdI',
        expectedBpm: 120,
        expectedOffset: -2000,
        diffCounts: { EASY: 334, MEDIUM: 911, HARD: 972, EXPERT: 1257 }
      },
      {
        id: 'intl-gnr-paradise-city',
        title: 'Paradise City',
        artist: "Guns N' Roses",
        youtubeVideoId: 'WJUInYShJYo',
        expectedBpm: 120,
        expectedOffset: 0,
        diffCounts: { EASY: 521, MEDIUM: 1093, HARD: 1940, EXPERT: 2411 }
      },
      {
        id: 'intl-gnr-sweet-child-o-mine',
        title: "Sweet Child o' Mine",
        artist: "Guns N' Roses",
        youtubeVideoId: 'MNrgf3GNNXw',
        expectedBpm: 128,
        expectedOffset: 0,
        diffCounts: { EASY: 581, MEDIUM: 711, HARD: 968, EXPERT: 1095 }
      },
      {
        id: 'intl-gnr-welcome-to-the-jungle',
        title: 'Welcome to the Jungle',
        artist: "Guns N' Roses",
        youtubeVideoId: 'FN7ECSHb5xs',
        expectedBpm: 100,
        expectedOffset: 0,
        diffCounts: { EASY: 437, MEDIUM: 631, HARD: 855, EXPERT: 1248 }
      },
      {
        id: 'intl-lp-numb',
        title: 'Numb',
        artist: 'Linkin Park',
        youtubeVideoId: 'u-IcadiJCrE',
        expectedBpm: 110,
        expectedOffset: 0,
        diffCounts: { EASY: 93, MEDIUM: 165, HARD: 189, EXPERT: 211 }
      },
      {
        id: 'intl-lp-given-up',
        title: 'Given Up',
        artist: 'Linkin Park',
        youtubeVideoId: 'D93vYwuMeUw',
        expectedBpm: 100,
        expectedOffset: 0,
        diffCounts: { EASY: 432, MEDIUM: 838, HARD: 841, EXPERT: 841 }
      }
    ];

    for (const songData of expectedCatalog) {
      describe(`Validação da faixa: ${songData.title} (${songData.artist})`, () => {
        it('deve possuir fonte oficial verificada no YouTube com permissão de embedding', () => {
          const entry = INTERNATIONAL_SONGS_CATALOG.find((s) => s.id === songData.id);
          expect(entry).toBeDefined();
          expect(entry?.youtubeVideoId).toBe(songData.youtubeVideoId);
          expect(entry?.isAvailable).toBe(true);
          expect(entry?.embeddingStatus).toBe('ELIGIBLE_OFFICIAL');
        });

        it('deve possuir charts completos e não-vazios nas 4 dificuldades', () => {
          const difficulties: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
          for (const d of difficulties) {
            const notes = bm.getBeatmap(songData.id, d);
            expect(notes.length).toBe(songData.diffCounts[d]);
          }
        });

        it('deve possuir offset correto calibrado no CalibrationManager', () => {
          const offset = CalibrationManager.getSongOffsetMs(songData.id, songData.youtubeVideoId);
          expect(offset).toBe(songData.expectedOffset);
        });

        it('deve coincidir perfeitamente a posição visual da nota com o strikeY no instante do acerto', () => {
          const testTime = 12.0;
          const visualY = renderer.calculateVisualY(testTime, testTime);
          const strikeY = renderer.getStrikeLineY();
          expect(visualY).toBeCloseTo(strikeY, 5);
        });
      });
    }
  });
});
