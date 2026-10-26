import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { GameEngine } from '../src/game/engine';
import { AudioManager } from '../src/audio/audioManager';
import { YouTubePlayerController } from '../src/audio/youtubePlayer';
import { RockCoinsManager } from '../src/game/economy/rockCoinsManager';
import { ProfileManager } from '../src/game/profileManager';
import { AuthService } from '../src/firebase/authService';
import { FirestoreService } from '../src/firebase/firestoreService';
import { Note, GameSettings, Difficulty, PlayerProfile } from '../src/types';

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

describe('ROCKBRAZIL V13 — Mute on Miss, Economia RockCoins, Catálogo e Firebase', () => {
  let profileManager: ProfileManager;

  beforeEach(() => {
    profileManager = new ProfileManager();
  });

  // =========================================================================
  // FASE 1: SISTEMA SILENCIAR MÚSICA AO ERRAR (MUTE ON MISS)
  // =========================================================================
  describe('Fase 1: Silenciar Música ao Errar (Mute on Miss)', () => {
    it('1.1. Configuração desativada por padrão: erros não disparam mudo', () => {
      const engine = new GameEngine([], 'EASY', defaultSettings);
      expect(engine['settings'].muteOnMiss).toBe(false);

      let muteRequested: boolean | null = null;
      engine.onMuteRequested = (muted) => {
        muteRequested = muted;
      };

      const testNotes: Note[] = [{ id: '1', time: 1.0, lane: 0, duration: 0 }];
      engine.reset(testNotes, 'EASY');

      // Avança o tempo além da janela da nota (miss)
      engine.update(2.0);
      expect(engine.getStats().missCount).toBe(1);
      // Com muteOnMiss desativado, onMuteRequested não é disparado
      expect(muteRequested).toBeNull();
    });

    it('1.2. Configuração ativada: erro silencia e próximo acerto restaura o áudio', () => {
      const settingsWithMute: GameSettings = { ...defaultSettings, muteOnMiss: true };
      const testNotes: Note[] = [
        { id: '1', time: 1.0, lane: 0, duration: 0 },
        { id: '2', time: 2.0, lane: 1, duration: 0 },
      ];
      const engine = new GameEngine(testNotes, 'EASY', settingsWithMute);

      const muteEvents: boolean[] = [];
      engine.onMuteRequested = (muted) => {
        muteEvents.push(muted);
      };

      // Nota 1 perdida (miss em t = 1.5s)
      engine.update(1.5);
      expect(engine.getStats().missCount).toBe(1);
      expect(muteEvents).toContain(true);

      // Nota 2 acertada (hit em t = 2.0s)
      engine.handleLanePress(1, 2.0);
      expect(engine.getStats().hitsCount).toBe(1);
      expect(muteEvents[muteEvents.length - 1]).toBe(false);
    });

    it('1.3. Múltiplos erros consecutivos mantêm o estado de silêncio (idempotência)', () => {
      const audio = new AudioManager(defaultSettings);
      expect(audio.isMuted).toBe(false);

      audio.setMuteOnMiss(true);
      expect(audio.isMuted).toBe(true);

      // Erros adicionais mantêm mudo sem conflito
      audio.setMuteOnMiss(true);
      audio.setMuteOnMiss(true);
      expect(audio.isMuted).toBe(true);

      audio.setMuteOnMiss(false);
      expect(audio.isMuted).toBe(false);
    });

    it('1.4. Reinício e troca de partida restauram o volume (resetMuteOnMiss)', () => {
      const audio = new AudioManager(defaultSettings);
      audio.setMuteOnMiss(true);
      expect(audio.isMuted).toBe(true);

      audio.resetMuteOnMiss();
      expect(audio.isMuted).toBe(false);
    });

    it('1.5. YouTubePlayerController suporta setMuted de forma consistente', () => {
      const yt = new YouTubePlayerController();
      expect(typeof yt.setMuted).toBe('function');

      // Chamadas seguras sem estourar exceção mesmo antes do iframe estar carregado
      expect(() => yt.setMuted(true)).not.toThrow();
      expect(() => yt.setMuted(false)).not.toThrow();
    });

    it('1.6. Erros em acordes: se ambas as notas forem perdidas, silencia sem conflito', () => {
      const settingsWithMute: GameSettings = { ...defaultSettings, muteOnMiss: true };
      const chordNotes: Note[] = [
        { id: '1a', time: 1.0, lane: 0, duration: 0 },
        { id: '1b', time: 1.0, lane: 1, duration: 0 },
      ];
      const engine = new GameEngine(chordNotes, 'EASY', settingsWithMute);

      let lastMuteState: boolean | null = null;
      engine.onMuteRequested = (muted) => {
        lastMuteState = muted;
      };

      engine.update(1.5);
      expect(engine.getStats().missCount).toBe(2);
      expect(lastMuteState).toBe(true);
    });
  });

  // =========================================================================
  // FASE 2: ROCKCOINS DEFINITIVAS POR DIFICULDADE
  // =========================================================================
  describe('Fase 2: Tabela Oficial de RockCoins por Dificuldade', () => {
    it('2.1. Fácil: Concluir = 1 RockCoin (mesmo com 100% de precisão)', () => {
      expect(RockCoinsManager.calculateReward('EASY', 0, 100, true)).toBe(1);
      expect(RockCoinsManager.calculateReward('EASY', 5, 100, true)).toBe(1);
      expect(RockCoinsManager.calculateReward('EASY', 0, 50, true)).toBe(1);
    });

    it('2.2. Médio: Concluir = 2 RockCoins (mesmo com 100% de precisão)', () => {
      expect(RockCoinsManager.calculateReward('MEDIUM', 0, 100, true)).toBe(2);
      expect(RockCoinsManager.calculateReward('MEDIUM', 3, 100, true)).toBe(2);
    });

    it('2.3. Difícil: Concluir = 3 RockCoins (mesmo com 100% de precisão)', () => {
      expect(RockCoinsManager.calculateReward('HARD', 0, 100, true)).toBe(3);
      expect(RockCoinsManager.calculateReward('HARD', 10, 100, true)).toBe(3);
    });

    it('2.4. Expert com um ou mais erros: 3 RockCoins', () => {
      expect(RockCoinsManager.calculateReward('EXPERT', 1, 100, true)).toBe(3);
      expect(RockCoinsManager.calculateReward('EXPERT', 5, 100, true)).toBe(3);
    });

    it('2.5. Expert sem nenhum erro: exatamente 5 RockCoins (total, não 3+5)', () => {
      expect(RockCoinsManager.calculateReward('EXPERT', 0, 100, true)).toBe(5);
      // Teto máximo rigoroso de 5 moedas
      expect(RockCoinsManager.calculateReward('EXPERT', 0, 100, true)).toBeLessThanOrEqual(5);
    });

    it('2.6. Partida incompleta, abandonada ou Game Over concede 0 moedas', () => {
      expect(RockCoinsManager.calculateReward('EXPERT', 0, 100, false)).toBe(0);
      expect(RockCoinsManager.calculateReward('HARD', 0, 100, false)).toBe(0);
      expect(RockCoinsManager.calculateReward('MEDIUM', 0, 100, false)).toBe(0);
      expect(RockCoinsManager.calculateReward('EASY', 0, 100, false)).toBe(0);
    });

    it('2.7. Chart sem notas jogáveis concede 0 moedas', () => {
      expect(RockCoinsManager.calculateReward('EXPERT', 0, 0, true)).toBe(0);
    });

    it('2.8. ProfileManager persiste moedas de acordo com a tabela oficial', async () => {
      profileManager.setGuestMode();
      const initial = profileManager.getRockCoins();

      const result = await profileManager.recordMatch(
        'mam-1406',
        '1406',
        'EXPERT',
        {
          score: 80000,
          stars: 5,
          maxCombo: 200,
          accuracy: 100,
          perfectCount: 150,
          greatCount: 50,
          goodCount: 0,
          missCount: 0,
          playableNotesCount: 200,
          combo: 200
        } as any,
        true
      );

      // Expert perfeito = 5 moedas
      expect(result.earnedCoins).toBe(5);
      expect(result.totalCoins).toBe(initial + 5);
      expect(profileManager.getRockCoins()).toBe(initial + 5);
    });
  });

  // =========================================================================
  // FASE 3 & 4: RESULTADOS E REDESIGN DAS ESTATÍSTICAS DO CATÁLOGO
  // =========================================================================
  describe('Fase 3 & 4: Resultados da Partida e Catálogo', () => {
    it('3.1. Tela de resultados e HTML possuem identificador de moedas atualizado', () => {
      const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
      expect(html).toContain('id="result-coins"');
    });

    it('4.1. Catálogo V13.1 utiliza layout simplificado sem estatísticas extras invasivas', () => {
      const css = fs.readFileSync(path.resolve(process.cwd(), 'src/style.css'), 'utf-8');
      expect(css).toContain('.notebook-song-row');
      expect(css).toContain('.row-album-cover');
      expect(css).toContain('.row-song-title');
      expect(css).toContain('.row-song-artist');
      expect(css).toContain('.row-stars');
      expect(css).toContain('.row-score');
      // Garante remoção das pílulas e caixas de meta-estatísticas extras
      expect(css).not.toContain('.row-meta-stats');
      expect(css).not.toContain('.meta-stat-pill');

      const uiCode = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/uiManager.ts'), 'utf-8');
      // Não exibe textos desnecessários
      expect(uiCode).not.toContain('🏆 Melhor:');
      expect(uiCode).not.toContain('Última:');
      expect(uiCode).not.toContain('Partidas:');
      expect(uiCode).not.toContain('Nenhuma partida jogada ainda');
      // Exibe pontuação abaixo das estrelas (0 PTS por padrão)
      expect(uiCode).toContain("bestScore > 0 ? `${bestScore.toLocaleString('pt-BR')} PTS` : '0 PTS'");
    });
  });

  // =========================================================================
  // FASES 5 A 9: FIREBASE AUTH, FIRESTORE E REGRAS DE SEGURANÇA
  // =========================================================================
  describe('Fases 5 a 9: Firebase Auth, Firestore e Segurança', () => {
    it('5.1. firestore.rules existe no repositório com restrição por request.auth.uid', () => {
      const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
      expect(fs.existsSync(rulesPath)).toBe(true);

      const content = fs.readFileSync(rulesPath, 'utf-8');
      expect(content).toContain("service cloud.firestore");
      expect(content).toContain("request.auth != null && request.auth.uid == userId");
      expect(content).toContain("allow read, write: if false;");
      // Não possui regras públicas inseguras
      expect(content).not.toContain("allow read, write: if true;");
    });

    it('6.1. AuthService gerencia a preferência de autenticação de forma persistente', () => {
      AuthService.setSavedAuthPreference('guest');
      expect(AuthService.getSavedAuthPreference()).toBe('guest');

      AuthService.setSavedAuthPreference('google');
      expect(AuthService.getSavedAuthPreference()).toBe('google');

      AuthService.setSavedAuthPreference(null);
      expect(AuthService.getSavedAuthPreference()).toBeNull();
    });

    it('7.1. FirestoreService.mergeProfiles mescla pontuações e RockCoins sem perda de progresso', () => {
      const localProfile: PlayerProfile = {
        id: 'local_1',
        name: 'Jogador Local',
        avatar: '🎸',
        createdAt: 1000,
        lastPlayedAt: 2000,
        rockCoins: 12,
        settings: defaultSettings,
        records: {
          'song-1': {
            EASY: {
              score: 5000,
              bestScore: 5000,
              lastScore: 5000,
              stars: 4,
              bestStars: 4,
              lastStars: 4,
              accuracy: 90,
              bestAccuracy: 90,
              lastAccuracy: 90,
              maxCombo: 50,
              bestMaxCombo: 50,
              lastMaxCombo: 50,
              bestDate: 1000,
              lastDate: 1000,
              playCount: 2
            }
          }
        },
        history: []
      };

      const cloudProfile: Partial<PlayerProfile> = {
        name: 'Jogador Nuvem',
        avatar: '👑',
        rockCoins: 25,
        records: {
          'song-1': {
            EASY: {
              score: 8000,
              bestScore: 8000,
              lastScore: 8000,
              stars: 5,
              bestStars: 5,
              lastStars: 5,
              accuracy: 98,
              bestAccuracy: 98,
              lastAccuracy: 98,
              maxCombo: 100,
              bestMaxCombo: 100,
              lastMaxCombo: 100,
              bestDate: 2000,
              lastDate: 2000,
              playCount: 3
            }
          }
        }
      };

      const merged = FirestoreService.mergeProfiles(localProfile, cloudProfile);

      // Adota maior quantidade de moedas
      expect(merged.rockCoins).toBe(25);
      // Adota maior pontuação
      expect(merged.records['song-1']?.EASY?.bestScore).toBe(8000);
      expect(merged.records['song-1']?.EASY?.bestStars).toBe(5);
      // Adota maior combo
      expect(merged.records['song-1']?.EASY?.bestMaxCombo).toBe(100);
    });

    it('8.1. index.html possui tela de login oficial com opções Google e Convidado', () => {
      const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
      expect(html).toContain('id="screen-login"');
      expect(html).toContain('id="btn-login-google"');
      expect(html).toContain('id="btn-play-guest"');
      expect(html).toContain('id="cfg-mute-on-miss"');
      expect(html).toContain('id="btn-switch-account-mode"');
    });
  });
});
