import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  ProfileManager,
  INITIAL_UNLOCKED_SONG_IDS,
  OFFICIAL_ACHIEVEMENTS,
  SEASON_1_RESET_KEY
} from '../src/game/profileManager';
import { RockCoinsManager } from '../src/game/economy/rockCoinsManager';
import { OFFICIAL_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';
import { GameStats } from '../src/types';

// Polyfill in-memory localStorage para o ambiente de testes Node
if (typeof localStorage === 'undefined' || !(globalThis as any).localStorage?.getItem) {
  let store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

describe('ROCKBRAZIL V13.5 — MEGA ATUALIZAÇÃO OFICIAL', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(SEASON_1_RESET_KEY, 'true');
  });

  describe('Fase 1: Sistema de Músicas Misteriosas & Progressão Sequencial', () => {
    it('1.1. Inicia com exatamente 3 músicas desbloqueadas', () => {
      expect(INITIAL_UNLOCKED_SONG_IDS).toEqual(['mam-1406', 'cap-sua-maneira', 'pit-chip-novo']);
      const pm = new ProfileManager();
      INITIAL_UNLOCKED_SONG_IDS.forEach((id) => {
        expect(pm.isSongUnlocked(id)).toBe(true);
      });
      // 4ª música não está desbloqueada inicialmente
      expect(pm.isSongUnlocked('los-anna-julia')).toBe(false);
    });

    it('1.2. O catálogo canônico totaliza exatamente 162 músicas', () => {
      expect(OFFICIAL_BRAZILIAN_CATALOG.length).toBe(162);
      expect(ProfileManager.getCanonicalSongOrder().length).toBe(162);
      const pm = new ProfileManager();
      expect(pm.getTotalCatalogCount()).toBe(162);
    });

    it('1.3. A próxima música misteriosa segue estritamente a ordem canônica pré-fixada', () => {
      const pm = new ProfileManager();
      const next1 = pm.getNextMysterySong();
      expect(next1).not.toBeNull();
      // O 4º item no catálogo oficial é Anna Júlia ('los-anna-julia')
      expect(next1?.id).toBe(OFFICIAL_BRAZILIAN_CATALOG[3].id);
      expect(next1?.id).toBe('los-anna-julia');
    });

    it('1.4. Impede desbloqueio se o jogador não tiver 5 RockCoins', async () => {
      const pm = new ProfileManager();
      const prof = pm.getActiveProfile();
      prof.rockCoins = 4; // Menos de 5

      const res = await pm.unlockNextMysterySong(5);
      expect(res.success).toBe(false);
      expect(res.error).toBe('ROCKCOINS_INSUFFICIENT');
      expect(res.remainingCoins).toBe(4);
      expect(pm.isSongUnlocked('los-anna-julia')).toBe(false);
    });

    it('1.5. Desbloqueia a próxima música com sucesso quando possui 5 RockCoins', async () => {
      const pm = new ProfileManager();
      const prof = pm.getActiveProfile();
      prof.rockCoins = 10;

      const res = await pm.unlockNextMysterySong(5);
      expect(res.success).toBe(true);
      expect(res.song?.id).toBe('los-anna-julia');
      expect(res.remainingCoins).toBe(5);
      expect(pm.isSongUnlocked('los-anna-julia')).toBe(true);
      expect(pm.getUnlockedSongsCount()).toBe(4);

      // Próxima após Anna Júlia
      const next2 = pm.getNextMysterySong();
      expect(next2?.id).toBe(OFFICIAL_BRAZILIAN_CATALOG[4].id);
    });

    it('1.6. Quando todas as 162 músicas são desbloqueadas, retorna ALL_SONGS_UNLOCKED', async () => {
      const pm = new ProfileManager();
      const prof = pm.getActiveProfile();
      prof.unlockedSongIds = OFFICIAL_BRAZILIAN_CATALOG.map((s) => s.id);
      prof.rockCoins = 100;

      expect(pm.getNextMysterySong()).toBeNull();
      expect(pm.getUnlockedSongsCount()).toBe(162);

      const res = await pm.unlockNextMysterySong(5);
      expect(res.success).toBe(false);
      expect(res.error).toBe('ALL_SONGS_UNLOCKED');
    });
  });

  describe('Fase 2: Animação e Revelação da Música Desbloqueada', () => {
    it('2.1. O HTML contém o modal de celebração com flip card e luz dourada', () => {
      const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
      expect(html).toContain('id="modal-unlock-celebration"');
      expect(html).toContain('golden-glow-rays');
      expect(html).toContain('mystery-flip-stage');
      expect(html).toContain('mystery-flip-card');
      expect(html).toContain('mystery-card-front');
      expect(html).toContain('mystery-card-back');
      expect(html).toContain('id="celebration-song-cover"');
      expect(html).toContain('id="celebration-song-title"');
      expect(html).toContain('id="celebration-song-artist"');
      expect(html).toContain('id="btn-celebration-choose-diff"');
      expect(html).toContain('id="btn-celebration-close"');
    });

    it('2.2. CSS inclui estilos e keyframes de revelação com luz dourada', () => {
      const css = fs.readFileSync(path.resolve(__dirname, '../src/style.css'), 'utf-8');
      expect(css).toContain('.golden-glow-rays');
      expect(css).toContain('rotateGoldenRays');
      expect(css).toContain('.mystery-flip-card');
      expect(css).toContain('rotateY(180deg)');
    });
  });

  describe('Fase 3 & 4: Saldo de RockCoins e Progresso da Coleção na Seleção de Músicas', () => {
    it('3.1. O cabeçalho da Seleção de Músicas exibe o indicador estrito de moedas e o contador de coleção', () => {
      const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
      expect(html).toContain('id="library-coins-badge"');
      expect(html).toContain('id="library-rockcoins-val"');
      expect(html).toContain('id="collection-progress-pill"');
    });

    it('3.2. CSS define os badges de saldo e progresso da coleção', () => {
      const css = fs.readFileSync(path.resolve(__dirname, '../src/style.css'), 'utf-8');
      expect(css).toContain('.library-coins-badge');
      expect(css).toContain('.collection-progress-pill');
    });
  });

  describe('Fase 5: Aba Músicas Internacionais (EM BREVE...) Desativada', () => {
    it('5.1. A aba de músicas secundárias foi renomeada para EM BREVE... e está totalmente desabilitada', () => {
      const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
      expect(html).toContain('id="tab-songs-custom"');
      expect(html).toContain('disabled');
      expect(html).toContain('aria-disabled="true"');
      expect(html).toContain('disabled-tab');
      expect(html).toContain('EM BREVE...');
    });

    it('5.2. CSS aplica pointer-events: none e opacidade reduzida na aba desabilitada', () => {
      const css = fs.readFileSync(path.resolve(__dirname, '../src/style.css'), 'utf-8');
      expect(css).toContain('.notebook-filter-tab.disabled-tab');
      expect(css).toContain('pointer-events: none !important');
    });
  });

  describe('Fase 6: Correção Definitiva da Tela Show Finalizado e Bug do Full Combo', () => {
    it('6.1. O Full Combo NUNCA é concedido se houver 1 ou mais erros (missCount >= 1)', () => {
      const diff = 'EXPERT';
      const misses = 1;
      const playable = 100;
      const cleared = true;

      // Recompensa sem FC = 3
      const reward = RockCoinsManager.calculateReward(diff, misses, playable, cleared);
      expect(reward).toBe(3);
    });

    it('6.2. No Expert com 0 erros, o prêmio é de 5 RockCoins no total (não 3 + 5)', () => {
      const diff = 'EXPERT';
      const misses = 0;
      const playable = 100;
      const cleared = true;

      const reward = RockCoinsManager.calculateReward(diff, misses, playable, cleared);
      expect(reward).toBe(5);
    });

    it('6.3. Em dificuldades Fácil, Médio e Difícil, 0 erros NÃO concede bônus de 5 moedas', () => {
      expect(RockCoinsManager.calculateReward('EASY', 0, 100, true)).toBe(1);
      expect(RockCoinsManager.calculateReward('MEDIUM', 0, 100, true)).toBe(2);
      expect(RockCoinsManager.calculateReward('HARD', 0, 100, true)).toBe(3);
    });

    it('6.4. CSS oculta estritamente o banner de Full Combo quando a classe hidden estiver presente', () => {
      const css = fs.readFileSync(path.resolve(__dirname, '../src/style.css'), 'utf-8');
      expect(css).toContain('.results-achievement-banner.hidden');
      expect(css).toContain('display: none !important');
    });

    it('6.5. Os três botões de ação inferiores da tela de resultados estão presentes no HTML', () => {
      const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
      expect(html).toContain('id="btn-play-again"');
      expect(html).toContain('id="btn-menu-result"');
      expect(html).toContain('id="btn-result-ranking"');
    });
  });

  describe('Fase 7: Conquistas e Medalhas Oficiais (Temporada 1)', () => {
    it('7.1. Existem exatamente 8 conquistas oficiais com seus respectivos critérios', () => {
      expect(OFFICIAL_ACHIEVEMENTS.length).toBe(8);
      const ids = OFFICIAL_ACHIEVEMENTS.map((a) => a.id);
      expect(ids).toContain('first_show');
      expect(ids).toContain('rookie_5_songs');
      expect(ids).toContain('rocker_20_songs');
      expect(ids).toContain('veteran_50_songs');
      expect(ids).toContain('first_full_combo');
      expect(ids).toContain('collector_10');
      expect(ids).toContain('super_collector_50');
      expect(ids).toContain('rock_legend_162');
    });

    it('7.2. Desbloqueia "Primeiro Show" ao concluir a primeira partida', async () => {
      const pm = new ProfileManager();
      const stats: GameStats = {
        score: 50000,
        combo: 20,
        maxCombo: 20,
        multiplier: 4,
        rockMeter: 80,
        perfectCount: 15,
        greatCount: 5,
        goodCount: 0,
        missCount: 2,
        totalNotes: 22,
        stars: 4,
        accuracy: 90,
        hitsCount: 20,
        playableNotesCount: 22
      };

      await pm.recordMatch('mam-1406', '1406', 'MEDIUM', stats, true);
      const achievements = pm.getAchievements();
      const firstShow = achievements.find((a) => a.definition.id === 'first_show');
      expect(firstShow?.unlocked).toBe(true);

      // Como cometeu 2 erros, NÃO deve desbloquear Primeiro Full Combo!
      const fcAch = achievements.find((a) => a.definition.id === 'first_full_combo');
      expect(fcAch?.unlocked).toBe(false);
    });

    it('7.3. Desbloqueia "Primeiro Full Combo" apenas ao concluir com 0 erros', async () => {
      const pm = new ProfileManager();
      const stats: GameStats = {
        score: 120000,
        combo: 50,
        maxCombo: 50,
        multiplier: 4,
        rockMeter: 100,
        perfectCount: 45,
        greatCount: 5,
        goodCount: 0,
        missCount: 0,
        totalNotes: 50,
        stars: 5,
        accuracy: 100,
        hitsCount: 50,
        playableNotesCount: 50
      };

      await pm.recordMatch('cap-sua-maneira', 'À Sua Maneira', 'HARD', stats, true);
      const achievements = pm.getAchievements();
      const fcAch = achievements.find((a) => a.definition.id === 'first_full_combo');
      expect(fcAch?.unlocked).toBe(true);
    });

    it('7.4. Desbloqueia "Colecionador" ao atingir 10 músicas misteriosas desbloqueadas', () => {
      const pm = new ProfileManager();
      const prof = pm.getActiveProfile();
      // 3 iniciais + 10 = 13 músicas no total
      prof.unlockedSongIds = OFFICIAL_BRAZILIAN_CATALOG.slice(0, 13).map((s) => s.id);

      const res = pm.checkAndUnlockAchievements();
      expect(res.allUnlocked).toContain('collector_10');

      const achievements = pm.getAchievements();
      const colAch = achievements.find((a) => a.definition.id === 'collector_10');
      expect(colAch?.unlocked).toBe(true);
    });

    it('7.5. O HTML contém a seção de Minhas Conquistas no modal Meu Perfil', () => {
      const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
      expect(html).toContain('class="achievements-section"');
      expect(html).toContain('id="achievements-progress-count"');
      expect(html).toContain('id="achievements-grid"');
    });
  });

  describe('Fase 8 & 9: Login Google Discreto no Meu Perfil', () => {
    it('8.1. O HTML contém o botão discreto com SVG do Google no card do perfil', () => {
      const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
      expect(html).toContain('id="btn-google-profile-action"');
      expect(html).toContain('btn-google-discreet');
      expect(html).toContain('google-discreet-icon');
    });

    it('8.2. CSS estiliza o botão discreto e classe connected', () => {
      const css = fs.readFileSync(path.resolve(__dirname, '../src/style.css'), 'utf-8');
      expect(css).toContain('.btn-google-discreet');
      expect(css).toContain('.btn-google-discreet.connected');
    });
  });

  describe('Fase 11: Atualização do Tutorial Oficial', () => {
    it('11.1. O tutorial aborda as músicas misteriosas, ordem fixa e custo de 5 RockCoins', () => {
      const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
      expect(html).toContain('Músicas Misteriosas & Desbloqueio Sequencial');
      expect(html).toContain('159 músicas do catálogo são misteriosas');
      expect(html).toContain('[?] DESBLOQUEAR PRÓXIMA MÚSICA');
      expect(html).toContain('5 no total');
      expect(html).toContain('Conquistas & Medalhas');
    });
  });
});
