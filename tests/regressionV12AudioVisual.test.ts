import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SongLibrary } from '../src/game/songLibrary';
import { RockCoinsManager } from '../src/game/economy/rockCoinsManager';
import { GameEngine } from '../src/game/engine';
import { AudioManager } from '../src/audio/audioManager';
import { NOTE_VISUAL_THEME } from '../src/render/renderer';
import { ProfileManager } from '../src/game/profileManager';
import { Note, GameSettings } from '../src/types';

const defaultSettings: GameSettings = {
  musicVolume: 0.8,
  sfxVolume: 0.8,
  audioOffsetMs: 0,
  noteSpeedMultiplier: 1.0,
  speedPreset: 'NORMAL',
  visualEffectsEnabled: true,
  bgBrightness: 0.5,
  hitWindowScale: 1.0,
  showFps: false,
  lowPerformanceMode: false,
};

describe('ROCKBRAZIL V12 — Revisão Geral, Conforto Visual, Áudio iOS, Resultados e Economia', () => {
  let library: SongLibrary;
  let profileManager: ProfileManager;

  beforeEach(() => {
    library = new SongLibrary();
    profileManager = new ProfileManager();
  });

  // =========================================================================
  // FASE 1: CAPAS DAS MÚSICAS NA ESTEIRA (162 FAIXAS)
  // =========================================================================
  describe('Fase 1: Capas das Músicas para todas as 162 Faixas', () => {
    it('1.1. Todas as 162 músicas cadastradas possuem coverUrl configurado', () => {
      const allSongs = library.getActiveSongs();
      expect(allSongs.length).toBe(162);

      const missingCovers = allSongs.filter((s) => !s.coverUrl || s.coverUrl.trim() === '');
      expect(missingCovers.length, `Músicas sem coverUrl: ${missingCovers.map((s) => s.id).join(', ')}`).toBe(0);
    });

    it('1.2. Todos os arquivos de capa existem fisicamente no disco no diretório public/', () => {
      const allSongs = library.getActiveSongs();
      const cwd = process.cwd();

      for (const song of allSongs) {
        const coverRelative = song.coverUrl!;
        const coverPath = path.resolve(cwd, 'public', coverRelative.replace(/^\//, ''));
        expect(fs.existsSync(coverPath), `Capa física não encontrada para [${song.id}] em ${coverPath}`).toBe(true);

        const stat = fs.statSync(coverPath);
        expect(stat.size).toBeGreaterThan(100); // Arquivo válido, não vazio
      }
    });

    it('1.3. A capa padrão de fallback (default-cover.png) existe e é válida', () => {
      const defaultCoverPath = path.resolve(process.cwd(), 'public/images/default-cover.png');
      expect(fs.existsSync(defaultCoverPath)).toBe(true);
      const stat = fs.statSync(defaultCoverPath);
      expect(stat.size).toBeGreaterThan(500);
    });
  });

  // =========================================================================
  // FASE 2: REDUZIR CANSAÇO VISUAL DAS NOTAS
  // =========================================================================
  describe('Fase 2: Conforto Visual e Redução de Cansaço das Notas', () => {
    it('2.1. Configuração centralizada NOTE_VISUAL_THEME exportada com 5 pistas distintas', () => {
      expect(NOTE_VISUAL_THEME).toBeDefined();
      expect(NOTE_VISUAL_THEME.laneColors.length).toBe(5);

      NOTE_VISUAL_THEME.laneColors.forEach((color) => {
        expect(color.core).toBeDefined();
        expect(color.glow).toBeDefined();
        expect(color.dark).toBeDefined();
        expect(color.light).toBeDefined();
      });
    });

    it('2.2. Parâmetros visuais de brilho e reflexo estão atenuados (sem estourar)', () => {
      // Highlight suave (max 0.40)
      expect(NOTE_VISUAL_THEME.highlightAlpha).toBeLessThanOrEqual(0.40);
      // Chrome rim atenuado (max 0.75)
      expect(NOTE_VISUAL_THEME.chromeRimAlpha).toBeLessThanOrEqual(0.75);
      // Marca d'água elegante da capa na esteira (~22%)
      expect(NOTE_VISUAL_THEME.coverWatermarkAlpha).toBeGreaterThanOrEqual(0.15);
      expect(NOTE_VISUAL_THEME.coverWatermarkAlpha).toBeLessThanOrEqual(0.30);
    });
  });

  // =========================================================================
  // FASE 3: ÁUDIO iOS SAFARI E WEBKIT
  // =========================================================================
  describe('Fase 3: Áudio iOS Safari e Resiliência WebKit', () => {
    it('3.1. AudioManager possui método de detecção de dispositivos Apple', () => {
      expect(typeof AudioManager.isAppleDevice).toBe('function');
      expect(typeof AudioManager.isAppleDevice()).toBe('boolean');
    });

    it('3.2. AudioManager possui método de detecção de suporte a codec OGG', () => {
      expect(typeof AudioManager.isOggSupported).toBe('function');
      expect(typeof AudioManager.isOggSupported()).toBe('boolean');
    });

    it('3.3. AudioManager expõe unlockAudioContext para desbloqueio por gesto síncrono', () => {
      const audio = new AudioManager(defaultSettings);
      expect(typeof audio.unlockAudioContext).toBe('function');
    });
  });

  // =========================================================================
  // FASE 4: ECONOMIA E RECOMPENSAS ROCKCOINS
  // =========================================================================
  describe('Fase 4: Balanceamento de RockCoins (1 a 7 moedas)', () => {
    it('4.1. Concessão proporcional a estrelas (1 a 5 moedas)', () => {
      expect(RockCoinsManager.calculateReward(1, 70, true)).toBe(1);
      expect(RockCoinsManager.calculateReward(2, 75, true)).toBe(2);
      expect(RockCoinsManager.calculateReward(3, 85, true)).toBe(3);
      expect(RockCoinsManager.calculateReward(4, 92, true)).toBe(4);
      expect(RockCoinsManager.calculateReward(5, 96, true)).toBe(5);
    });

    it('4.2. Bônus de +2 moedas para 100% de precisão (teto estrito de 7 moedas)', () => {
      // 5 estrelas + 100% precisão = 5 + 2 = 7 moedas
      expect(RockCoinsManager.calculateReward(5, 100, true)).toBe(7);
      // 4 estrelas + 100% precisão = 4 + 2 = 6 moedas
      expect(RockCoinsManager.calculateReward(4, 100, true)).toBe(6);
      // Nunca excede 7 moedas
      expect(RockCoinsManager.calculateReward(5, 100, true)).toBeLessThanOrEqual(7);
    });

    it('4.3. Partida não completada ou falhada concede 0 moedas', () => {
      expect(RockCoinsManager.calculateReward(5, 100, false)).toBe(0);
      expect(RockCoinsManager.calculateReward(3, 80, false)).toBe(0);
    });

    it('4.4. ProfileManager atualiza saldo de RockCoins de forma atômica', async () => {
      profileManager.setGuestMode();
      const initialCoins = profileManager.getRockCoins();

      const stats: any = {
        score: 50000,
        stars: 5,
        maxCombo: 100,
        accuracy: 100,
        perfectCount: 100,
        greatCount: 0,
        goodCount: 0,
        missCount: 0,
        combo: 100
      };

      const result = await profileManager.recordMatch(
        'mam-1406',
        '1406',
        'EASY',
        stats,
        true
      );

      expect(result.earnedCoins).toBe(7);
      expect(result.totalCoins).toBe(initialCoins + 7);
      expect(profileManager.getRockCoins()).toBe(initialCoins + 7);
    });
  });

  // =========================================================================
  // FASE 5: SIMPLIFICAÇÃO DOS RESULTADOS E PRECISÃO
  // =========================================================================
  describe('Fase 5: Simplificação dos Resultados e Cálculo de Precisão', () => {
    it('5.1. Se todas as notas jogáveis forem acertadas, a precisão é rigorosamente 100%', () => {
      const testNotes: Note[] = [
        { id: '1', time: 1.0, lane: 0, duration: 0 },
        { id: '2', time: 2.0, lane: 1, duration: 0 },
        { id: '3', time: 3.0, lane: 2, duration: 0 },
      ];
      const engine = new GameEngine(testNotes, 'EASY', defaultSettings);

      // Acerta todas as notas (mesmo com julgamentos diferentes: Good, Great, Perfect)
      engine.handleLanePress(0, 1.09); // Good
      engine.handleLanePress(1, 2.05); // Great
      engine.handleLanePress(2, 3.0);  // Perfect

      const stats = engine.getStats();
      expect(stats.missCount).toBe(0);
      expect(stats.hitsCount).toBe(3);
      expect(stats.accuracy).toBe(100);
    });

    it('5.2. Precisão com erros reflete exatamente (Acertos / (Acertos + Erros)) * 100', () => {
      const testNotes: Note[] = [
        { id: '1', time: 1.0, lane: 0, duration: 0 },
        { id: '2', time: 2.0, lane: 1, duration: 0 },
        { id: '3', time: 3.0, lane: 2, duration: 0 },
        { id: '4', time: 4.0, lane: 0, duration: 0 },
      ];
      const engine = new GameEngine(testNotes, 'EASY', defaultSettings);

      engine.handleLanePress(0, 1.0); // Hit 1
      engine.handleLanePress(1, 2.0); // Hit 2
      engine.handleLanePress(2, 3.0); // Hit 3
      // Nota 4 perdida (miss)
      engine.update(5.0);

      const stats = engine.getStats();
      expect(stats.hitsCount).toBe(3);
      expect(stats.missCount).toBe(1);
      // 3 acertos em 4 notas = 75%
      expect(stats.accuracy).toBe(75);
    });

    it('5.3. Precisão com zero notas retorna 0%', () => {
      const engine = new GameEngine([], 'EASY', defaultSettings);
      expect(engine.getAccuracy()).toBe(0);
    });

    it('5.4. Interface HTML exibe Acertos, Erros, Precisão e Maior Combo', () => {
      const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
      expect(html).toContain('id="result-hits"');
      expect(html).toContain('id="result-miss"');
      expect(html).toContain('id="result-accuracy"');
      expect(html).toContain('id="result-maxcombo"');
      // Garante que não existem mais os cards visíveis de Perfeito, Ótimo e Bom na grade
      expect(html).not.toContain('id="result-perfect"');
      expect(html).not.toContain('id="result-great"');
      expect(html).not.toContain('id="result-good"');
    });
  });

  // =========================================================================
  // PRESERVAÇÃO INTEGRAL DE CORREÇÕES ANTERIORES (V10 / V11)
  // =========================================================================
  describe('Preservação de Correções das Versões Anteriores', () => {
    it('Preserva 160 músicas com áudio local e 2 faixas bônus', () => {
      const allSongs = library.getActiveSongs();
      const localSongs = allSongs.filter((s) => s.type === 'audio-file' || Boolean(s.audioUrl));
      expect(localSongs.length).toBe(160);
      const ytSongs = allSongs.filter((s) => s.type === 'youtube');
      expect(ytSongs.length).toBe(2);
    });

    it('Preserva áudio e chart autêntico de Pitty - Máscara (293.8s)', () => {
      const mascara = library.getSongById('pit-mascara');
      expect(mascara).toBeDefined();
      expect(mascara?.duration).toBe(294);
    });

    it('Preserva sincronização autêntica de De Borest sem offset artificial', () => {
      const song = library.getSongById('kua-de-borest');
      expect(song).toBeDefined();
      expect(song?.audioUrl).toBe('songs/kua-de-borest/song.ogg');
    });
  });
});
