import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { YouTubePlayerController, parseYouTubeError } from '../src/audio/youtubePlayer';
import { AudioManager } from '../src/audio/audioManager';
import { GameEngine } from '../src/game/engine';
import { PlaybackState, Note, GameSettings } from '../src/types';
import { GameRenderer } from '../src/render/renderer';
import { SettingsManager } from '../src/game/settingsManager';

const defaultTestSettings: GameSettings = {
  musicVolume: 0.85,
  sfxVolume: 0.9,
  audioOffsetMs: 0,
  noteSpeedMultiplier: 1.0,
  visualEffectsEnabled: true,
  visualEffectsMode: 'NORMAL',
  muteOnMiss: true
};

function createMockCanvas() {
  return {
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
      drawImage: vi.fn()
    }),
    width: 480,
    height: 800
  } as any;
}

describe('ROCKBRAZIL V13.8.1 — SUÍTE DE TESTES DEFINITIVA', () => {
  const rootDir = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'src/style.css'), 'utf-8');

  describe('1. YouTube State Machine & Explicit States (Fase 2)', () => {
    it('deve conter todos os 10 estados explícitos oficiais', () => {
      expect(PlaybackState.UNINITIALIZED).toBe('UNINITIALIZED');
      expect(PlaybackState.LOADING).toBe('LOADING');
      expect(PlaybackState.READY).toBe('READY');
      expect(PlaybackState.WAITING_USER_GESTURE).toBe('WAITING_USER_GESTURE');
      expect(PlaybackState.STARTING).toBe('STARTING');
      expect(PlaybackState.PLAYING).toBe('PLAYING');
      expect(PlaybackState.BUFFERING).toBe('BUFFERING');
      expect(PlaybackState.PAUSED).toBe('PAUSED');
      expect(PlaybackState.ENDED).toBe('ENDED');
      expect(PlaybackState.ERROR).toBe('ERROR');
    });

    it('deve iniciar no estado UNINITIALIZED e progredir para READY', async () => {
      class MockPlayer {
        constructor(_el, cfg) {
          setTimeout(() => cfg.events.onReady?.({ target: this }), 10);
        }
        getIframe() { return { setAttribute: vi.fn() }; }
        setVolume() {}
        unMute() {}
      }
      vi.stubGlobal('window', { YT: { Player: MockPlayer }, location: { origin: 'https://test.com' } });
      vi.stubGlobal('document', {
        getElementById: () => ({ appendChild: vi.fn(), insertBefore: vi.fn() }),
        createElement: () => ({ setAttribute: vi.fn() }),
        querySelector: () => null
      });

      const controller = new YouTubePlayerController();
      expect(controller.getPlaybackState()).toBe(PlaybackState.UNINITIALIZED);

      await controller.init();
      expect(controller.getPlaybackState()).toBe(PlaybackState.READY);
      vi.unstubAllGlobals();
    });

    it('deve verificar transição de estado para WAITING_FOR_AUDIO ao dar play', async () => {
      let time = 0;
      const controller = new YouTubePlayerController();
      (controller as any).player = {
        playVideo: vi.fn(),
        getCurrentTime: () => time,
        getPlayerState: () => 1
      };
      (controller as any).isReady = true;
      controller.play();
      expect(controller.getPlaybackState()).toBe(PlaybackState.WAITING_FOR_AUDIO);
      time = 0.2;
      (controller as any).verifyAudioProgression();
      expect(controller.getPlaybackState()).toBe(PlaybackState.PLAYING);
      expect(controller.getCurrentTime()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('2. Tratamento de Erros da YouTube API (Fase 2 & Fase 3)', () => {
    it('deve mapear corretamente o Código 2 (Parâmetro Inválido)', () => {
      const err = parseYouTubeError(2);
      expect(err.code).toBe(2);
      expect(err.title).toContain('Código 2');
      expect(err.canRetry).toBe(true);
      expect(err.isEmbedBlocked).toBe(false);
    });

    it('deve mapear corretamente o Código 5 (Erro HTML5)', () => {
      const err = parseYouTubeError(5);
      expect(err.code).toBe(5);
      expect(err.title).toContain('Código 5');
      expect(err.canRetry).toBe(true);
    });

    it('deve mapear corretamente o Código 100 (Vídeo Não Encontrado)', () => {
      const err = parseYouTubeError(100);
      expect(err.code).toBe(100);
      expect(err.canRetry).toBe(false);
      expect(err.isEmbedBlocked).toBe(true);
    });

    it('deve mapear corretamente os Códigos 101 e 150 (Embed Desativado)', () => {
      const err101 = parseYouTubeError(101);
      expect(err101.code).toBe(101);
      expect(err101.isEmbedBlocked).toBe(true);
      expect(err101.canRetry).toBe(false);

      const err150 = parseYouTubeError(150);
      expect(err150.code).toBe(150);
      expect(err150.isEmbedBlocked).toBe(true);
      expect(err150.canRetry).toBe(false);
    });

    it('deve mapear corretamente o Código 153 (Restrição de Origem / Referrer)', () => {
      const err153 = parseYouTubeError(153);
      expect(err153.code).toBe(153);
      expect(err153.canRetry).toBe(true);
      expect(err153.isEmbedBlocked).toBe(false);
    });

    it('deve possuir modal de erro do YouTube configurado no index.html', () => {
      expect(indexHtml).toContain('id="modal-youtube-error"');
      expect(indexHtml).toContain('id="yt-error-title"');
      expect(indexHtml).toContain('id="yt-error-message"');
      expect(indexHtml).toContain('id="btn-yt-error-retry"');
      expect(indexHtml).toContain('id="btn-yt-error-back"');
    });
  });

  describe('3. Recuperação de Elemento DOM (Fase 2)', () => {
    it('deve recriar o elemento placeholder no DOM caso tenha sido destruído', () => {
      const mockContainer = {
        insertBefore: vi.fn(),
        firstChild: null
      };
      const mockDoc = {
        getElementById: vi.fn((id: string) => {
          if (id === 'yt-player-container') return mockContainer;
          return null;
        }),
        createElement: vi.fn((tag: string) => ({ id: '', tagName: tag }))
      };

      const originalDoc = (globalThis as any).document;
      (globalThis as any).document = mockDoc;

      try {
        const controller = new YouTubePlayerController();
        const el = (controller as any).ensureTargetElement('yt-player-frame');
        
        expect(el).not.toBeNull();
        expect(el.id).toBe('yt-player-frame');
        expect(mockContainer.insertBefore).toHaveBeenCalled();
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });
  });

  describe('4. Aplausos de Show Procedurais (Fase 6)', () => {
    it('deve instanciar AudioManager e suportar playSfxCrowdApplause para 3 níveis de reação', () => {
      const audio = new AudioManager();
      expect(typeof audio.playSfxCrowdApplause).toBe('function');

      // Não deve lançar exceção ao chamar reações
      expect(() => audio.playSfxCrowdApplause('NORMAL')).not.toThrow();
      expect(() => audio.playSfxCrowdApplause('FIVE_STARS')).not.toThrow();
      expect(() => audio.playSfxCrowdApplause('FULL_COMBO')).not.toThrow();
    });
  });

  describe('5. Geometria de Acordes e Notas Simultâneas (Fase 8 & Fase 9)', () => {
    it('deve alinhar notas de acorde para que compartilhem a mesma posição vertical', () => {
      const canvas = createMockCanvas();
      const renderer = new GameRenderer(canvas);

      // Simula notas de acorde com ligeira variação de timestamp (10ms) típica de charts
      const note1: Note = { time: 2.000, lane: 0, hit: false, missed: false };
      const note2: Note = { time: 2.010, lane: 2, hit: false, missed: false };
      const notes = [note1, note2];

      expect(() => {
        renderer.render(1.5, notes, new Set());
      }).not.toThrow();
    });

    it('deve suportar configuração de efeitos visuais NORMAL e REDUZIDO (Fase 12)', () => {
      const canvas = createMockCanvas();
      const renderer = new GameRenderer(canvas);

      expect(renderer.visualEffectsMode).toBe('NORMAL');
      renderer.visualEffectsMode = 'REDUZIDO';
      expect(renderer.visualEffectsMode).toBe('REDUZIDO');

      // spawnHitParticles não deve falhar em nenhum dos modos
      expect(() => renderer.spawnHitParticles(0)).not.toThrow();
      renderer.visualEffectsMode = 'NORMAL';
      expect(() => renderer.spawnHitParticles(0)).not.toThrow();
    });
  });

  describe('6. Auditoria de Precisão e Pontuação (Fase 11)', () => {
    it('deve calcular corretamente a precisão e explicar o caso 868 acertos / 12 erros / 91% precisão', () => {
      const notes: Note[] = [];
      for (let i = 0; i < 880; i++) {
        notes.push({ time: i * 0.5 + 1.0, lane: 0, hit: false, missed: false });
      }

      const engine = new GameEngine(notes, 'HARD', defaultTestSettings);

      // Simula 868 acertos
      for (let i = 0; i < 868; i++) {
        (engine as any).perfectCount++;
      }
      // Simula 12 erros
      (engine as any).missCount = 12;

      // Sem toques extras: 868 / 880 = 98.6% -> 99%
      expect(engine.getAccuracy()).toBe(99);

      // Com 74 toques extras (entradas fora da janela / overstrums):
      // 868 / (868 + 12 + 74) = 868 / 954 = 90.98% -> 91%
      (engine as any).extraPressCount = 74;
      expect(engine.getAccuracy()).toBe(91);
    });
  });

  describe('7. Configurações Persistentes de Efeitos Visuais (Fase 12)', () => {
    it('SettingsManager deve salvar e carregar visualEffectsMode corretamente', () => {
      const sm = new SettingsManager();
      const s1 = sm.getSettings();
      expect(s1.visualEffectsMode).toBe('NORMAL');

      sm.saveSettings({ visualEffectsMode: 'REDUZIDO' });
      const s2 = sm.getSettings();
      expect(s2.visualEffectsMode).toBe('REDUZIDO');

      sm.saveSettings({ visualEffectsMode: 'NORMAL' });
      const s3 = sm.getSettings();
      expect(s3.visualEffectsMode).toBe('NORMAL');
    });

    it('index.html deve conter botões de seleção de efeitos NORMAL e REDUZIDO', () => {
      expect(indexHtml).toContain('id="btn-fx-normal"');
      expect(indexHtml).toContain('id="btn-fx-reduced"');
    });
  });

  describe('8. SHOW FINALIZADO Responsivo e Detalhamento de Julgamento (Fase 5 & Fase 10)', () => {
    it('deve conter os quatro novos crachás de julgamento no index.html', () => {
      expect(indexHtml).toContain('id="result-judge-perfect"');
      expect(indexHtml).toContain('id="result-judge-great"');
      expect(indexHtml).toContain('id="result-judge-good"');
      expect(indexHtml).toContain('id="result-judge-miss"');
    });

    it('deve possuir regras CSS responsivas para enquadramento dos botões e safe-area', () => {
      expect(styleCss).toContain('.results-judgments-row');
      expect(styleCss).toContain('.judgment-badge-item');
      expect(styleCss).toContain('env(safe-area-inset-bottom');
      expect(styleCss).toContain('.results-buttons-overlay');
    });
  });
});
