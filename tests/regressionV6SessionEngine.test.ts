import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MusicTimeline, AudioTimeSource } from '../src/game/timeline/musicTimeline';
import { ChartTimeline } from '../src/game/timeline/chartTimeline';
import { NoteHighway } from '../src/game/highway/noteHighway';
import { InputController } from '../src/game/input/inputController';
import { HitJudgmentSystem } from '../src/game/judgment/hitJudgment';
import { GameSessionController, SessionResourceProvider, SessionUiEvents } from '../src/game/session/gameSessionController';
import { SessionState } from '../src/game/session/sessionState';
import { Note, PlaybackState, SongMetadata, GameSettings } from '../src/types';

describe('ROCKBRAZIL BETA V6 — ARQUITETURA DO MOTOR E CONTROLE DE SESSÃO', () => {

  const defaultSettings: GameSettings = {
    musicVolume: 0.8,
    sfxVolume: 0.8,
    audioOffsetMs: 50,
    noteSpeedMultiplier: 1.0,
    visualEffectsEnabled: true
  };

  const mockSong: SongMetadata = {
    id: 'kua-de-borest',
    title: 'De Borest',
    artist: 'Kuase Nada',
    album: 'De Borest (Single)',
    year: 2008,
    genre: 'Rock Nacional / Hard Rock',
    bpm: 132,
    duration: 218,
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=60',
    type: 'youtube',
    youtubeVideoId: 'SdfL13b63D8',
    isAvailable: true
  };

  // ==========================================================================
  // 1. MusicTimeline
  // ==========================================================================
  describe('1. MusicTimeline — Linha do Tempo Musical Unificada', () => {
    let timeline: MusicTimeline;

    beforeEach(() => {
      timeline = new MusicTimeline();
    });

    it('deve calcular pré-roll visual durante a contagem regressiva (descida suave das primeiras notas)', () => {
      const prerollSec = 3.0;
      timeline.startCountdown(prerollSec);

      // No início da contagem regressiva (tick 3), o tempo visual é -3.0s
      expect(timeline.getTime()).toBeCloseTo(-3.0, 3);
      expect(timeline.isCountdownState()).toBe(true);

      // Meio da contagem (tick 2 / progresso 50%) -> -1.5s
      timeline.setPrerollProgress(0.5, prerollSec);
      expect(timeline.getTime()).toBeCloseTo(-1.5, 3);

      // Final da contagem (ROCK! / progresso 100%) -> 0.0s
      timeline.setPrerollProgress(1.0, prerollSec);
      expect(timeline.getTime()).toBeCloseTo(0.0, 3);
    });

    it('deve aplicar offsets de calibração exatamente uma vez após o início da reprodução', () => {
      timeline.setOffsets(135, 50); // 135ms música + 50ms usuário = 185ms total
      expect(timeline.getTotalOffsetSec()).toBeCloseTo(0.185, 3);

      let mockAudioTime = 1.0;
      const mockSource: AudioTimeSource = {
        getCurrentTime: () => mockAudioTime,
        getPlaybackState: () => PlaybackState.PLAYING,
        isBuffering: () => false
      };
      timeline.setSource(mockSource);
      timeline.startPlayback();

      // getTime() = 1.0 + 0.185 = 1.185s
      expect(timeline.getTime()).toBeCloseTo(1.185, 3);
      expect(timeline.isCountdownState()).toBe(false);
    });

    it('deve congelar o tempo durante pausa e buffering sem acúmulo de drift', () => {
      let mockAudioTime = 2.0;
      let isBuffering = false;
      const mockSource: AudioTimeSource = {
        getCurrentTime: () => mockAudioTime,
        getPlaybackState: () => isBuffering ? PlaybackState.BUFFERING : PlaybackState.PLAYING,
        isBuffering: () => isBuffering
      };
      timeline.setSource(mockSource);
      timeline.startPlayback();
      const timeBeforePause = timeline.getTime();

      // Pausa o jogo
      timeline.pause();
      expect(timeline.isPausedState()).toBe(true);
      mockAudioTime = 5.0; // Áudio externo avançaria
      expect(timeline.getTime()).toBeCloseTo(timeBeforePause, 3); // Relógio do jogo NÃO avança!

      // Retoma o jogo
      timeline.resume();
      expect(timeline.isPausedState()).toBe(false);

      // Entra em buffering
      isBuffering = true;
      timeline.setBuffering(true);
      expect(timeline.isBuffering()).toBe(true);
      const timeAtBuffering = timeline.getTime();
      mockAudioTime = 8.0;
      expect(timeline.getTime()).toBeCloseTo(timeAtBuffering, 3); // Permanece congelado
    });

    it('deve garantir progressão monotônica não decrescente mesmo com jitter de áudio', () => {
      let mockAudioTime = 3.0;
      const mockSource: AudioTimeSource = {
        getCurrentTime: () => mockAudioTime,
        getPlaybackState: () => PlaybackState.PLAYING,
        isBuffering: () => false
      };
      timeline.setSource(mockSource);
      timeline.startPlayback();
      expect(timeline.getTime()).toBe(3.0);

      // Simula jitter de áudio temporariamente retornando tempo ligeiramente anterior
      mockAudioTime = 2.98;
      expect(timeline.getTime()).toBe(3.0); // Não regride!
    });
  });

  // ==========================================================================
  // 2. ChartTimeline
  // ==========================================================================
  describe('2. ChartTimeline — Indexação e Janela Temporal O(1)', () => {
    const mockNotes: Note[] = [
      { id: 1, time: 6.56, lane: 0, duration: 0, hit: false, missed: false },
      { id: 2, time: 6.80, lane: 1, duration: 0, hit: false, missed: false },
      { id: 3, time: 7.10, lane: 2, duration: 0, hit: false, missed: false },
      { id: 4, time: 10.0, lane: 0, duration: 0, hit: false, missed: false },
      { id: 5, time: 15.0, lane: 3, duration: 0, hit: false, missed: false }
    ];

    it('deve carregar notas autênticas preservando timestamps originais', () => {
      const chart = new ChartTimeline(mockNotes);
      expect(chart.getTotalNotesCount()).toBe(5);
      expect(chart.getFirstNoteTime()).toBe(6.56);
      expect(chart.getLastNoteTime()).toBe(15.0);
      expect(chart.hasIntroDelay(3.0)).toBe(true); // 6.56s > 3.0s
    });

    it('deve retornar janela de notas ativas O(1) sem percorrer todo o array', () => {
      const chart = new ChartTimeline(mockNotes);
      // Em t=6.0s com janela de visualização de 2.0s (tempo 5.5s a 8.0s)
      const windowNotes = chart.getNotesInWindow(6.0, 2.0);
      expect(windowNotes.length).toBe(3); // notas em 6.56, 6.80 e 7.10
      expect(windowNotes.map(n => n.id)).toEqual([1, 2, 3]);

      // Em t=14.0s (tempo 13.5s a 16.0s)
      const windowNotes2 = chart.getNotesInWindow(14.0, 2.0);
      expect(windowNotes2.length).toBe(1);
      expect(windowNotes2[0].id).toBe(5);
    });

    it('deve indexar notas por pista com precisão', () => {
      const chart = new ChartTimeline(mockNotes);
      const lane0Notes = chart.getNotesByLane(0);
      expect(lane0Notes.length).toBe(2);
      expect(lane0Notes[0].id).toBe(1);
      expect(lane0Notes[1].id).toBe(4);
    });
  });

  // ==========================================================================
  // 3. NoteHighway
  // ==========================================================================
  describe('3. NoteHighway — Projeção 3D da Esteira e Geometria dos Trastes', () => {
    let highway: NoteHighway;

    beforeEach(() => {
      highway = new NoteHighway(); // Headless mock context
    });

    it('deve calcular progresso exato da nota (0.0 no horizonte, 1.0 na linha de acerto)', () => {
      const noteTime = 5.0;
      const travelTime = highway.travelTime; // baseTravelTime = 0.92

      // Quando o tempo da música é 5.0 - 0.92 = 4.08s -> nota nasce no horizonte (progresso 0.0)
      const progressHorizon = highway.calculateNoteProgress(noteTime, noteTime - travelTime);
      expect(progressHorizon).toBeCloseTo(0.0, 3);

      // Quando o tempo da música é 5.0 - 0.46 = 4.54s -> nota no meio da esteira (progresso 0.5)
      const progressMid = highway.calculateNoteProgress(noteTime, noteTime - travelTime * 0.5);
      expect(progressMid).toBeCloseTo(0.5, 3);

      // Quando o tempo da música é exatamente 5.0s -> nota alinhada no centro do traste (progresso 1.0)
      const progressHit = highway.calculateNoteProgress(noteTime, noteTime);
      expect(progressHit).toBeCloseTo(1.0, 3);
    });

    it('deve projetar coordenadas 3D estritamente proporcionais à perspectiva', () => {
      const width = 800;
      const height = 600;

      // Ponto no horizonte (progresso 0.0)
      const projHorizon = highway.projectLanePoint(2, 0.0, width, height, 5);
      expect(projHorizon.y).toBeCloseTo(height * 0.085, 1);
      expect(projHorizon.scale).toBeCloseTo(0.35, 2);

      // Ponto na linha de acerto (progresso 1.0)
      const projHit = highway.projectLanePoint(2, 1.0, width, height, 5);
      expect(projHit.y).toBeCloseTo(height * 0.82, 1);
      expect(projHit.scale).toBeCloseTo(1.0, 2);
      expect(projHit.y).toBeGreaterThan(projHorizon.y);
    });

    it('deve calcular geometria dos trastes arredondados estilo Guitar Flash sem encavalar notas', () => {
      const radius = highway.calculateFretRadius(80, 1.0);
      expect(radius.rx).toBeCloseTo(35.2, 1); // 0.44 * 80
      expect(radius.ry).toBeCloseTo(13.6, 1); // 0.17 * 80
      expect(radius.rx).toBeGreaterThan(radius.ry); // Formato achatado oval característico
    });
  });

  // ==========================================================================
  // 4. InputController
  // ==========================================================================
  describe('4. InputController — Normalização e Desacoplamento de Input', () => {
    it('deve normalizar eventos de teclado e prevenir repetições indesejadas (repeat)', () => {
      const pressed: number[] = [];
      const released: number[] = [];

      const controller = new InputController({
        onLanePress: (lane) => pressed.push(lane),
        onLaneRelease: (lane) => released.push(lane)
      });

      // Pressiona Tecla A (pista 0)
      controller.handleKeyDownEvent('KeyA', 'a', false);
      expect(pressed).toEqual([0]);
      expect(controller.isLanePressed(0)).toBe(true);

      // Repetição do SO (repeat = true) não deve disparar novo press
      controller.handleKeyDownEvent('KeyA', 'a', true);
      expect(pressed).toEqual([0]);

      // Solta Tecla A
      controller.handleKeyUpEvent('KeyA', 'a');
      expect(released).toEqual([0]);
      expect(controller.isLanePressed(0)).toBe(false);
    });

    it('deve rastrear multitouch sem travar botões quando um dedo é solto', () => {
      const pressed: number[] = [];
      const released: number[] = [];

      const controller = new InputController({
        onLanePress: (lane) => pressed.push(lane),
        onLaneRelease: (lane) => released.push(lane)
      });

      // Dedo 1 toca na pista 1
      controller.handlePointerDownEvent(101, 1);
      expect(pressed).toEqual([1]);

      // Dedo 2 toca na pista 2 (acorde de 2 dedos)
      controller.handlePointerDownEvent(102, 2);
      expect(pressed).toEqual([1, 2]);

      // Dedo 1 é levantado -> apenas pista 1 deve ser liberada
      controller.handlePointerUpEvent(101);
      expect(released).toEqual([1]);
      expect(controller.isLanePressed(1)).toBe(false);
      expect(controller.isLanePressed(2)).toBe(true); // Pista 2 permanece pressionada!

      // Dedo 2 é levantado -> agora pista 2 é liberada
      controller.handlePointerUpEvent(102);
      expect(released).toEqual([1, 2]);
      expect(controller.isLanePressed(2)).toBe(false);
    });
  });

  // ==========================================================================
  // 5. HitJudgmentSystem
  // ==========================================================================
  describe('5. HitJudgmentSystem — Julgamento Preciso e Medidor Rock', () => {
    it('deve classificar acertos em PERFECT, GREAT, GOOD e registrar pontuação com multiplicador', () => {
      const mockNotes: Note[] = [
        { id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false }
      ];
      // Adiciona mais notas para testar escalada do multiplicador
      for (let i = 2; i <= 35; i++) {
        mockNotes.push({ id: i, time: 2.0 + (i - 1) * 0.1, lane: 0, duration: 0, hit: false, missed: false });
      }

      const chart = new ChartTimeline(mockNotes);
      const judgment = new HitJudgmentSystem(chart, 'MEDIUM', defaultSettings);

      // Toque em t=2.01s (diferença +10ms <= ±65ms) -> PERFECT
      const resPerfect = judgment.judgeLanePress(0, 2.01);
      expect(resPerfect).not.toBeNull();
      expect(resPerfect?.judgment).toBe('PERFECT');
      expect(resPerfect?.scoreGained).toBe(100);
      expect(judgment.getStats().combo).toBe(1);

      // Multiplicador progride para 2x após 10 combos, 3x após 20, 4x após 30
      for (let i = 2; i <= 10; i++) {
        judgment.judgeLanePress(0, 2.0 + (i - 1) * 0.1);
      }
      expect(judgment.getStats().combo).toBe(10);
      expect(judgment.getMultiplier()).toBe(2);

      // Próximo acerto com combo 10 pontua com multiplicador 2x (200 pontos para PERFECT)
      const res2x = judgment.judgeLanePress(0, 2.0 + 10 * 0.1);
      expect(res2x?.scoreGained).toBe(200);
    });

    it('deve resetar combo e aplicar penalidade no medidor de vida ao errar (MISS)', () => {
      const mockNotes: Note[] = [
        { id: 1, time: 1.0, lane: 0, duration: 0, hit: false, missed: false },
        { id: 2, time: 2.0, lane: 0, duration: 0, hit: false, missed: false }
      ];
      const chart = new ChartTimeline(mockNotes);
      const judgment = new HitJudgmentSystem(chart, 'MEDIUM', defaultSettings);

      judgment.judgeLanePress(0, 1.0); // combo = 1
      expect(judgment.getStats().combo).toBe(1);

      // Em t=2.5s, a nota em 2.0s passou além da janela GOOD (0.160s)
      judgment.update(2.5, new Set());
      expect(judgment.getStats().combo).toBe(0);
      expect(judgment.getStats().missCount).toBe(1);
    });
  });

  // ==========================================================================
  // 6. GameSessionController & Eliminação da Contagem Dupla
  // ==========================================================================
  describe('6. GameSessionController — Ciclo de Vida da Sessão e Eliminação de Contagem Dupla', () => {
    let sessionController: GameSessionController;
    let mockTimeline: MusicTimeline;
    let mockChart: ChartTimeline;

    beforeEach(() => {
      mockTimeline = new MusicTimeline();
      mockChart = new ChartTimeline([]);
      sessionController = new GameSessionController(mockTimeline, mockChart);
    });

    it('NUNCA deve duplicar ou reiniciar a contagem regressiva se startSession for invocado em rápida sucessão', async () => {
      const countdownTicks: number[] = [];
      const rocks: string[] = [];

      const resources: SessionResourceProvider = {
        prepareChart: () => true,
        prepareRenderer: () => {},
        prepareAudio: async () => true,
        startAudioPlayback: () => {},
        isAudioPlaying: () => true,
        isAudioBuffering: () => false
      };

      const events: SessionUiEvents = {
        onStateChange: () => {},
        onCountdownTick: (count) => countdownTicks.push(count),
        onCountdownRock: () => rocks.push('ROCK!'),
        onWaitingAudio: () => {},
        onAutoplayBlocked: () => {},
        onGameStart: () => {},
        onSongFinished: () => {},
        onGameOver: () => {}
      };

      // Inicia a primeira sessão
      const s1Promise = sessionController.startSession(mockSong, 'MEDIUM', resources, events);
      const s1 = await s1Promise;
      expect(s1).toBe(1);
      expect(sessionController.getState()).toBe(SessionState.COUNTDOWN);

      // Segunda chamada imediata (ex: duplo-clique acidental do usuário no modal de dificuldade)
      const s2Promise = sessionController.startSession(mockSong, 'MEDIUM', resources, events);
      const s2 = await s2Promise;
      expect(s2).toBe(2);
      expect(sessionController.getSessionId()).toBe(2);
      expect(sessionController.getState()).toBe(SessionState.COUNTDOWN);

      // Cancela timers para fechar o teste limpamente
      sessionController.cancelTimers();
    });

    it('deve transicionar para WAITING_AUDIO ("AGUARDANDO ÁUDIO...") se o YouTube demorar para carregar, sem repetir 3, 2, 1', async () => {
      let waitingAudioCalled = false;
      let gameStartCalled = false;
      let isPlaying = false;

      const resources: SessionResourceProvider = {
        prepareChart: () => true,
        prepareRenderer: () => {},
        prepareAudio: async () => true,
        startAudioPlayback: () => {},
        isAudioPlaying: () => isPlaying,
        isAudioBuffering: () => false
      };

      const events: SessionUiEvents = {
        onStateChange: () => {},
        onCountdownTick: () => {},
        onCountdownRock: () => {},
        onWaitingAudio: () => { waitingAudioCalled = true; },
        onAutoplayBlocked: () => {},
        onGameStart: () => { gameStartCalled = true; },
        onSongFinished: () => {},
        onGameOver: () => {}
      };

      const sessionId = await sessionController.startSession(mockSong, 'MEDIUM', resources, events);

      // Simula contagem finalizando quando áudio AINDA NÃO está tocando
      // O timer chama transitionToWaitingAudio
      (sessionController as any).transitionToWaitingAudio(sessionId, resources, events);

      expect(sessionController.getState()).toBe(SessionState.WAITING_AUDIO);
      expect(waitingAudioCalled).toBe(true);
      expect(gameStartCalled).toBe(false);

      // Quando o áudio finalmente confirma reprodução: transiciona direto para PLAYING sem repetir contagem!
      isPlaying = true;
      sessionController.transitionToPlaying(sessionId, events);

      expect(sessionController.getState()).toBe(SessionState.PLAYING);
      expect(gameStartCalled).toBe(true);

      // Nova confirmação duplicada de reprodução não deve reiniciar o jogo
      let duplicateGameStart = false;
      events.onGameStart = () => { duplicateGameStart = true; };
      sessionController.transitionToPlaying(sessionId, events);
      expect(duplicateGameStart).toBe(false); // Ignorada!

      sessionController.cancelTimers();
    });
  });
});
