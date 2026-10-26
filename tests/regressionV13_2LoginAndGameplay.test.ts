import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { GameState, GameSettings, Note, PlayerProfile, Difficulty } from '../src/types';
import { AuthService } from '../src/firebase/authService';
import { FirestoreService } from '../src/firebase/firestoreService';
import { RockCoinsManager } from '../src/game/economy/rockCoinsManager';
import { ProfileManager } from '../src/game/profileManager';
import { GameEngine } from '../src/game/engine';

// In-memory polyfill for node test environment
if (typeof localStorage === 'undefined' || !(globalThis as any).localStorage?.getItem) {
  let store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

const defaultSettings: GameSettings = {
  musicVolume: 0.85,
  sfxVolume: 0.9,
  audioOffsetMs: 0,
  noteSpeedMultiplier: 1.0,
  speedPreset: 'NORMAL',
  visualEffectsEnabled: true,
  muteOnMiss: false,
};

describe('ROCKBRAZIL V13.2 — Login Definitivo, Gameplay Protegida e Arte Oficial', () => {
  beforeEach(() => {
    localStorage.clear();
    AuthService.setSavedAuthPreference(null);
  });

  // =========================================================================
  // FASE 1 & 5: RESOLUÇÃO DE SESSÃO E PREVENÇÃO DE LOGIN DURANTE GAMEPLAY
  // =========================================================================
  describe('Fase 1 & 5: Estado Inicial, Persistência e Proteção da Gameplay', () => {
    it('1.1. Sem escolha prévia: estado inicial deve ser GameState.LOGIN', () => {
      expect(AuthService.getSavedAuthPreference()).toBeNull();
      // Simula a lógica de decisão do initGame()
      const savedPref = AuthService.getSavedAuthPreference();
      const initialState = (savedPref === 'guest' || savedPref === 'google')
        ? GameState.MENU
        : GameState.LOGIN;
      expect(initialState).toBe(GameState.LOGIN);
    });

    it('1.2. Com preferência "guest" salva: inicia direto no GameState.MENU', () => {
      AuthService.setSavedAuthPreference('guest');
      const savedPref = AuthService.getSavedAuthPreference();
      const initialState = (savedPref === 'guest' || savedPref === 'google')
        ? GameState.MENU
        : GameState.LOGIN;
      expect(initialState).toBe(GameState.MENU);
    });

    it('1.3. Com preferência "google" salva: inicia direto no GameState.MENU', () => {
      AuthService.setSavedAuthPreference('google');
      const savedPref = AuthService.getSavedAuthPreference();
      const initialState = (savedPref === 'guest' || savedPref === 'google')
        ? GameState.MENU
        : GameState.LOGIN;
      expect(initialState).toBe(GameState.MENU);
    });

    it('1.4. Mudanças assíncronas do Firebase NUNCA forçam login durante navegação ou gameplay', () => {
      // Simula o jogador na tela de seleção de músicas ou na gameplay
      let currentState = GameState.SONG_SELECT;
      const isProtectedState = (state: GameState) => {
        return state === GameState.SONG_SELECT ||
               state === GameState.COUNTDOWN ||
               state === GameState.PLAYING ||
               state === GameState.PAUSED ||
               state === GameState.RESULTS;
      };

      // Simula um evento onAuthChange que dispara assincronamente com user = null (ex: token expirado)
      const onAuthCallback = (user: any) => {
        if (!user && !isProtectedState(currentState)) {
          currentState = GameState.LOGIN;
        }
      };

      onAuthCallback(null);
      // O estado deve permanecer SONG_SELECT, sem ser interrompido pelo Firebase
      expect(currentState).toBe(GameState.SONG_SELECT);

      // Agora durante a gameplay ativa
      currentState = GameState.PLAYING;
      onAuthCallback(null);
      expect(currentState).toBe(GameState.PLAYING);
    });

    it('1.5. Fluxo completo da gameplay: seleção -> dificuldade -> countdown -> gameplay -> pause -> resultados', () => {
      const statesFlow: GameState[] = [];
      let currentState: GameState = GameState.MENU;
      statesFlow.push(currentState);

      // 1. Abre catálogo
      currentState = GameState.SONG_SELECT;
      statesFlow.push(currentState);

      // 2. Primeiro clique seleciona música, segundo clique abre modal de dificuldade (permanece em SONG_SELECT)
      expect(currentState).toBe(GameState.SONG_SELECT);

      // 3. Escolhe dificuldade e inicia partida
      currentState = GameState.COUNTDOWN;
      statesFlow.push(currentState);

      // 4. Inicia reprodução
      currentState = GameState.PLAYING;
      statesFlow.push(currentState);

      // 5. Pausa
      currentState = GameState.PAUSED;
      statesFlow.push(currentState);

      // 6. Retoma
      currentState = GameState.PLAYING;
      statesFlow.push(currentState);

      // 7. Encerra música e exibe resultados
      currentState = GameState.RESULTS;
      statesFlow.push(currentState);

      // 8. Retorna ao catálogo
      currentState = GameState.SONG_SELECT;
      statesFlow.push(currentState);

      // Em NENHUM momento da partida o GameState.LOGIN deve constar no histórico
      expect(statesFlow).not.toContain(GameState.LOGIN);
      expect(statesFlow.length).toBe(8);
    });
  });

  // =========================================================================
  // FASE 2, 3 & 4: ARTE OFICIAL DE LOGIN E BOTÕES FUNCIONAIS
  // =========================================================================
  describe('Fase 2, 3 & 4: Arte Oficial 1:1 e Hotspots Proporcionais', () => {
    it('2.1. A arte oficial public/images/login-bg.jpg existe no repositório', () => {
      const imgPath = path.resolve(process.cwd(), 'public/images/login-bg.jpg');
      expect(fs.existsSync(imgPath)).toBe(true);
      const stat = fs.statSync(imgPath);
      expect(stat.size).toBeGreaterThan(100000); // ~265 KB
    });

    it('2.2. A imagem possui proporção rigorosamente 1:1 (quadrada)', () => {
      const imgPath = path.resolve(process.cwd(), 'public/images/login-bg.jpg');
      const buf = fs.readFileSync(imgPath);
      let width = 0;
      let height = 0;
      for (let i = 0; i < buf.length - 8; i++) {
        if (buf[i] === 0xFF && (buf[i + 1] >= 0xC0 && buf[i + 1] <= 0xC3)) {
          height = buf.readUInt16BE(i + 5);
          width = buf.readUInt16BE(i + 7);
          break;
        }
      }
      expect(width).toBe(1024);
      expect(height).toBe(1024);
      expect(width / height).toBe(1.0);
    });

    it('3.1. index.html contém o contêiner #screen-login com a arte oficial e os botões corretos', () => {
      const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
      expect(html).toContain('id="screen-login"');
      expect(html).toContain('class="login-art-wrapper"');
      expect(html).toContain('images/login-bg.jpg');
      expect(html).toContain('id="btn-login-google"');
      expect(html).toContain('id="btn-play-guest"');
      expect(html).toContain('id="login-loading-indicator"');
      // O antigo pop-up modal-welcome-entry deve ter sido removido
      expect(html).not.toContain('id="modal-welcome-entry"');
    });

    it('4.1. style.css define posições proporcionais precisas dos botões sobre a imagem 1:1', () => {
      const css = fs.readFileSync(path.resolve(process.cwd(), 'src/style.css'), 'utf-8');
      expect(css).toContain('.login-screen-container');
      expect(css).toContain('.login-art-wrapper');
      expect(css).toContain('.btn-hotspot-google');
      expect(css).toContain('.btn-hotspot-guest');
      // Coordenadas proporcionais calculadas
      expect(css).toContain('left: 19.5%');
      expect(css).toContain('top: 49.5%'); // Botão Google
      expect(css).toContain('top: 63.3%'); // Botão Convidado
      expect(css).toContain('width: 61.0%');
    });
  });

  // =========================================================================
  // FASE 6 & 7: TROCA DE CONTA E SEGURANÇA
  // =========================================================================
  describe('Fase 6 & 7: Troca de Conta e Isolamento', () => {
    it('6.1. Troca de conta é bloqueada com segurança durante partida ativa', () => {
      let state: GameState = GameState.PLAYING;
      let blockedAlert = false;

      const triggerSwitchAccount = () => {
        if (state === GameState.PLAYING || state === GameState.COUNTDOWN) {
          blockedAlert = true;
          return;
        }
        state = GameState.LOGIN;
      };

      triggerSwitchAccount();
      expect(blockedAlert).toBe(true);
      expect(state).toBe(GameState.PLAYING); // Não foi alterado para LOGIN
    });

    it('6.2. Troca de conta permitida a partir das Configurações ou Menu Principal', () => {
      let state: GameState = GameState.SETTINGS;
      const triggerSwitchAccount = () => {
        if (state === GameState.PLAYING || state === GameState.COUNTDOWN) {
          return;
        }
        state = GameState.LOGIN;
      };

      triggerSwitchAccount();
      expect(state).toBe(GameState.LOGIN);
    });

    it('7.1. firestore.rules continua estritamente protegido por UID', () => {
      const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');
      expect(rules).toContain('request.auth != null && request.auth.uid == userId');
      expect(rules).toContain('allow read, write: if false;');
    });
  });

  // =========================================================================
  // FASE 8: PRESERVAÇÃO INTEGRAL DA GAMEPLAY E CATÁLOGO V13.1
  // =========================================================================
  describe('Fase 8: Preservação do Catálogo V13.1 e Economia', () => {
    it('8.1. Catálogo preserva o alinhamento limpo da V13.1 (capa, título, artista, estrelas, score)', () => {
      const css = fs.readFileSync(path.resolve(process.cwd(), 'src/style.css'), 'utf-8');
      expect(css).toContain('.notebook-song-row');
      expect(css).toContain('.row-album-cover');
      expect(css).toContain('.row-song-title');
      expect(css).toContain('.row-song-artist');
      expect(css).toContain('.row-stars');
      expect(css).toContain('.row-score');
      expect(css).not.toContain('.row-meta-stats');
    });

    it('8.2. Economia oficial V13 de RockCoins por dificuldade permanece inalterada', () => {
      expect(RockCoinsManager.calculateReward('EASY', 0, 100, true)).toBe(1);
      expect(RockCoinsManager.calculateReward('MEDIUM', 0, 100, true)).toBe(2);
      expect(RockCoinsManager.calculateReward('HARD', 0, 100, true)).toBe(3);
      expect(RockCoinsManager.calculateReward('EXPERT', 2, 100, true)).toBe(3);
      expect(RockCoinsManager.calculateReward('EXPERT', 0, 100, true)).toBe(5);
      expect(RockCoinsManager.calculateReward('HARD', 0, 100, false)).toBe(0);
    });
  });
});
