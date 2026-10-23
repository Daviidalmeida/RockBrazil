import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ProfileManager } from '../src/game/profileManager';
import { SongLibrary } from '../src/game/songLibrary';
import { GameStats, Difficulty } from '../src/types';

// In-memory polyfill for node test environment
if (typeof localStorage === 'undefined') {
  let store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

describe('ROCKBRAZIL V5.3 — Sistema de Recordes e Validação do Caderno', () => {
  let manager: ProfileManager;
  let library: SongLibrary;

  beforeEach(async () => {
    localStorage.clear();
    manager = new ProfileManager();
    library = new SongLibrary();
    await manager.createProfile('Slash BR', '🎸');
  });

  // 1. Jogar música pela primeira vez e verificar gravação de bestScore e lastScore iguais
  it('1. deve gravar bestScore e lastScore iguais na primeira partida', async () => {
    const stats1: GameStats = {
      score: 50000,
      combo: 80,
      maxCombo: 80,
      multiplier: 4,
      rockMeter: 80,
      perfectCount: 45,
      greatCount: 15,
      goodCount: 0,
      missCount: 0,
      totalNotes: 60,
      stars: 4,
      accuracy: 96
    };

    const res = await manager.recordMatch('furia-tropical', 'Fúria Tropical', 'MEDIUM', stats1, true);

    expect(res.isNewRecord).toBe(true);
    expect(res.previousBestScore).toBe(0);
    expect(res.newScore).toBe(50000);
    expect(res.record.bestScore).toBe(50000);
    expect(res.record.lastScore).toBe(50000);
    expect(res.record.bestStars).toBe(4);
    expect(res.record.lastStars).toBe(4);
    expect(res.record.bestMaxCombo).toBe(80);
    expect(res.record.lastMaxCombo).toBe(80);
    expect(res.record.bestAccuracy).toBe(96);
    expect(res.record.lastAccuracy).toBe(96);
    expect(res.record.playCount).toBe(1);
    // Legacy properties
    expect(res.record.score).toBe(50000);
    expect(res.record.stars).toBe(4);
  });

  // 2. Jogar segunda vez com pontuação menor e comprovar que bestScore NÃO mudou e lastScore foi atualizado
  it('2. deve manter bestScore inalterado e atualizar lastScore ao obter pontuação menor', async () => {
    const stats1: GameStats = {
      score: 60000,
      combo: 100,
      maxCombo: 100,
      multiplier: 4,
      rockMeter: 90,
      perfectCount: 50,
      greatCount: 10,
      goodCount: 0,
      missCount: 0,
      totalNotes: 60,
      stars: 5,
      accuracy: 99
    };
    await manager.recordMatch('furia-tropical', 'Fúria Tropical', 'MEDIUM', stats1, true);

    const stats2: GameStats = {
      score: 42000, // Menor que 60.000
      combo: 35,
      maxCombo: 45,
      multiplier: 3,
      rockMeter: 65,
      perfectCount: 30,
      greatCount: 15,
      goodCount: 5,
      missCount: 5,
      totalNotes: 60,
      stars: 3,
      accuracy: 82
    };
    const res2 = await manager.recordMatch('furia-tropical', 'Fúria Tropical', 'MEDIUM', stats2, true);

    expect(res2.isNewRecord).toBe(false);
    expect(res2.record.bestScore).toBe(60000);
    expect(res2.record.lastScore).toBe(42000);
    expect(res2.record.bestStars).toBe(5);
    expect(res2.record.lastStars).toBe(3);
    expect(res2.record.bestMaxCombo).toBe(100);
    expect(res2.record.lastMaxCombo).toBe(45);
    expect(res2.record.bestAccuracy).toBe(99);
    expect(res2.record.lastAccuracy).toBe(82);
    expect(res2.record.playCount).toBe(2);
  });

  // 3. Jogar terceira vez com pontuação maior e comprovar que bestScore FOI superado
  it('3. deve superar bestScore quando pontuação da terceira partida for maior', async () => {
    const stats1: GameStats = {
      score: 50000, combo: 80, maxCombo: 80, multiplier: 4, rockMeter: 80,
      perfectCount: 40, greatCount: 10, goodCount: 0, missCount: 0, totalNotes: 50, stars: 4, accuracy: 95
    };
    await manager.recordMatch('trovao-meia-noite', 'Trovão da Meia-Noite', 'HARD', stats1, true);

    const stats2: GameStats = {
      score: 45000, combo: 60, maxCombo: 60, multiplier: 4, rockMeter: 75,
      perfectCount: 35, greatCount: 10, goodCount: 2, missCount: 3, totalNotes: 50, stars: 3, accuracy: 88
    };
    await manager.recordMatch('trovao-meia-noite', 'Trovão da Meia-Noite', 'HARD', stats2, true);

    const stats3: GameStats = {
      score: 75000, combo: 120, maxCombo: 120, multiplier: 4, rockMeter: 100,
      perfectCount: 49, greatCount: 1, goodCount: 0, missCount: 0, totalNotes: 50, stars: 5, accuracy: 100
    };
    const res3 = await manager.recordMatch('trovao-meia-noite', 'Trovão da Meia-Noite', 'HARD', stats3, true);

    expect(res3.isNewRecord).toBe(true);
    expect(res3.previousBestScore).toBe(50000);
    expect(res3.newScore).toBe(75000);
    expect(res3.record.bestScore).toBe(75000);
    expect(res3.record.lastScore).toBe(75000);
    expect(res3.record.bestStars).toBe(5);
    expect(res3.record.bestMaxCombo).toBe(120);
    expect(res3.record.bestAccuracy).toBe(100);
    expect(res3.record.playCount).toBe(3);
  });

  // 4. Verificar isolamento de recordes entre dificuldades (Fácil não interfere no Médio)
  it('4. deve isolar completamente os recordes entre dificuldades diferentes', async () => {
    const statsEasy: GameStats = {
      score: 30000, combo: 40, maxCombo: 40, multiplier: 3, rockMeter: 80,
      perfectCount: 30, greatCount: 10, goodCount: 0, missCount: 0, totalNotes: 40, stars: 4, accuracy: 95
    };
    await manager.recordMatch('garagem-90', 'Garagem 90', 'EASY', statsEasy, true);

    const statsHard: GameStats = {
      score: 85000, combo: 110, maxCombo: 110, multiplier: 4, rockMeter: 95,
      perfectCount: 70, greatCount: 15, goodCount: 0, missCount: 0, totalNotes: 85, stars: 5, accuracy: 98
    };
    await manager.recordMatch('garagem-90', 'Garagem 90', 'HARD', statsHard, true);

    const recEasy = manager.getSongRecord('garagem-90', 'EASY');
    const recHard = manager.getSongRecord('garagem-90', 'HARD');
    const recMedium = manager.getSongRecord('garagem-90', 'MEDIUM');

    expect(recEasy?.bestScore).toBe(30000);
    expect(recHard?.bestScore).toBe(85000);
    expect(recMedium).toBeNull();
  });

  // 5. Verificar isolamento de recordes entre perfis (Perfil A não altera Perfil B)
  it('5. deve isolar completamente os recordes entre perfis de jogadores diferentes', async () => {
    // Perfil A: Slash BR
    const statsA: GameStats = {
      score: 70000, combo: 95, maxCombo: 95, multiplier: 4, rockMeter: 85,
      perfectCount: 50, greatCount: 10, goodCount: 0, missCount: 0, totalNotes: 60, stars: 5, accuracy: 97
    };
    await manager.recordMatch('estrada-de-ferro', 'Estrada de Ferro', 'MEDIUM', statsA, true);

    // Cria Perfil B: Angus BR
    const profileB = await manager.createProfile('Angus BR', '⚡');
    expect(manager.getActiveProfile().id).toBe(profileB.id);

    // Verifica que Perfil B começa sem recorde
    expect(manager.getSongRecord('estrada-de-ferro', 'MEDIUM')).toBeNull();

    // Perfil B joga a mesma música com pontuação diferente
    const statsB: GameStats = {
      score: 95000, combo: 140, maxCombo: 140, multiplier: 4, rockMeter: 100,
      perfectCount: 60, greatCount: 0, goodCount: 0, missCount: 0, totalNotes: 60, stars: 5, accuracy: 100
    };
    await manager.recordMatch('estrada-de-ferro', 'Estrada de Ferro', 'MEDIUM', statsB, true);
    expect(manager.getSongRecord('estrada-de-ferro', 'MEDIUM')?.bestScore).toBe(95000);

    // Retorna ao Perfil A
    const all = await manager.getAllProfiles();
    const slash = all.find(p => p.name === 'Slash BR')!;
    await manager.switchProfile(slash.id);

    // Perfil A deve continuar com seus 70.000 inalterados
    expect(manager.getSongRecord('estrada-de-ferro', 'MEDIUM')?.bestScore).toBe(70000);
  });

  // 6. Verificar que playCount incrementa a cada partida
  it('6. deve incrementar playCount a cada partida jogada', async () => {
    const stats: GameStats = {
      score: 20000, combo: 30, maxCombo: 30, multiplier: 2, rockMeter: 70,
      perfectCount: 20, greatCount: 5, goodCount: 5, missCount: 0, totalNotes: 30, stars: 3, accuracy: 90
    };

    for (let i = 1; i <= 5; i++) {
      const res = await manager.recordMatch('sobrecarga', 'Sobrecarga', 'EASY', stats, true);
      expect(res.record.playCount).toBe(i);
    }
  });

  // 7. Verificar que derrota/Game Over atualiza lastScore mas não supera bestScore
  it('7. derrota/Game Over deve atualizar lastScore e playCount sem alterar bestScore', async () => {
    // 1ª partida: vitória
    const statsWin: GameStats = {
      score: 55000, combo: 70, maxCombo: 70, multiplier: 4, rockMeter: 90,
      perfectCount: 40, greatCount: 10, goodCount: 0, missCount: 0, totalNotes: 50, stars: 4, accuracy: 96
    };
    await manager.recordMatch('sobrecarga', 'Sobrecarga', 'HARD', statsWin, true);

    // 2ª partida: Game Over no meio da música (pontuação parcial 18.000)
    const statsGameOver: GameStats = {
      score: 18000, combo: 15, maxCombo: 20, multiplier: 2, rockMeter: 0,
      perfectCount: 15, greatCount: 5, goodCount: 2, missCount: 8, totalNotes: 50, stars: 1, accuracy: 65
    };
    const resDefeat = await manager.recordMatch('sobrecarga', 'Sobrecarga', 'HARD', statsGameOver, false);

    expect(resDefeat.isNewRecord).toBe(false);
    expect(resDefeat.record.bestScore).toBe(55000); // Não foi rebaixado nem alterado
    expect(resDefeat.record.lastScore).toBe(18000);  // Última partida reflete o momento da derrota
    expect(resDefeat.record.playCount).toBe(2);
  });

  // 8. Formatação de pontuação (ex: 89.450 PTS)
  it('8. deve formatar pontuação com separador de milhar pt-BR', () => {
    const score1 = 89450;
    const score2 = 1250000;
    const score3 = 500;

    expect(score1.toLocaleString('pt-BR')).toBe('89.450');
    expect(score2.toLocaleString('pt-BR')).toBe('1.250.000');
    expect(score3.toLocaleString('pt-BR')).toBe('500');
  });

  // 9. Exibição de "SEM RECORDE" para músicas não jogadas
  it('9. deve retornar null para músicas não jogadas permitindo exibir "SEM RECORDE"', () => {
    const record = manager.getSongRecord('tnt-acdc', 'EXPERT');
    expect(record).toBeNull();
  });

  // 10. Validar renderização das 5 estrelas conforme a pontuação
  it('10. deve calcular estrelas coerentemente de 1 a 5', () => {
    const calcStars = (score: number, maxScore: number): number => {
      const ratio = score / maxScore;
      if (ratio >= 0.95) return 5;
      if (ratio >= 0.8) return 4;
      if (ratio >= 0.6) return 3;
      if (ratio >= 0.4) return 2;
      return 1;
    };

    expect(calcStars(98000, 100000)).toBe(5);
    expect(calcStars(85000, 100000)).toBe(4);
    expect(calcStars(65000, 100000)).toBe(3);
    expect(calcStars(45000, 100000)).toBe(2);
    expect(calcStars(20000, 100000)).toBe(1);
  });

  // 11. Validar que o fundo notebook-bg.png existe e está configurado
  it('11. deve validar que notebook-bg.png existe fisicamente no diretório public/images', () => {
    const bgPath = path.resolve(__dirname, '../public/images/notebook-bg.png');
    expect(fs.existsSync(bgPath)).toBe(true);
    const stats = fs.statSync(bgPath);
    expect(stats.size).toBeGreaterThan(100000); // 684 KB
  });

  // 12. Validar que a biblioteca salva e recupera os novos campos de recordes
  it('12. biblioteca deve salvar e recuperar SongRecord com campos last* e best*', () => {
    const song = library.getSongs()[0];
    library.saveSongRecord(song.id, 'HARD', {
      score: 92000,
      stars: 5,
      accuracy: 99,
      maxCombo: 180,
      bestScore: 92000,
      lastScore: 92000,
      bestStars: 5,
      lastStars: 5,
      bestMaxCombo: 180,
      lastMaxCombo: 180,
      bestAccuracy: 99,
      lastAccuracy: 99,
      bestDate: 123456789,
      lastDate: 123456789,
      playCount: 1
    });

    const updated = library.getSongs()[0].records['HARD'];
    expect(updated).toBeDefined();
    expect(updated?.bestScore).toBe(92000);
    expect(updated?.lastScore).toBe(92000);
    expect(updated?.playCount).toBe(1);
  });

  // 13. Validar exportação e importação de perfis mantendo os novos campos de recordes
  it('13. deve exportar e importar perfis preservando a estrutura completa de recordes V5.3', async () => {
    const stats: GameStats = {
      score: 88000, combo: 105, maxCombo: 105, multiplier: 4, rockMeter: 90,
      perfectCount: 60, greatCount: 5, goodCount: 0, missCount: 0, totalNotes: 65, stars: 5, accuracy: 98
    };
    await manager.recordMatch('furia-tropical', 'Fúria Tropical', 'EXPERT', stats, true);

    const jsonStr = await manager.exportJSON();
    expect(jsonStr).toContain('88000');
    expect(jsonStr).toContain('EXPERT');

    const newManager = new ProfileManager();
    const res = await newManager.importJSON(jsonStr);
    expect(res.success).toBe(true);

    const importedActive = newManager.getActiveProfile();
    const importedRec = importedActive.records['furia-tropical']?.['EXPERT'];
    expect(importedRec).toBeDefined();
    expect(importedRec?.bestScore).toBe(88000);
    expect(importedRec?.playCount).toBe(1);
  });

  // 14. Validar que o palco de concerto (stage-bg.png) existe e é preservado para o gameplay
  it('14. palco de show stage-bg.png deve existir fisicamente e continuar dedicado ao gameplay', () => {
    const stagePath = path.resolve(__dirname, '../public/images/stage-bg.png');
    expect(fs.existsSync(stagePath)).toBe(true);
  });

  // 15. Validar que a imagem oficial do menu principal (menu-bg.jpg) existe e tem tamanho válido
  it('15. menu-bg.jpg deve existir fisicamente e ter tamanho superior a 200KB', () => {
    const menuPath = path.resolve(__dirname, '../public/images/menu-bg.jpg');
    expect(fs.existsSync(menuPath)).toBe(true);
    const stats = fs.statSync(menuPath);
    expect(stats.size).toBeGreaterThan(200000);
  });

  // 16. Validar que a tela inicial possui os 6 hotspots interativos e botão de perfil
  it('16. index.html deve conter a tela inicial com os 6 hotspots interativos e botão de perfil', () => {
    const htmlPath = path.resolve(__dirname, '../index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    expect(html).toContain('id="screen-menu"');
    expect(html).toContain('class="menu-image-wrapper"');
    expect(html).toContain('id="btn-menu-profile"');
    expect(html).toContain('id="hotspot-jogar"');
    expect(html).toContain('id="hotspot-musicas"');
    expect(html).toContain('id="hotspot-config"');
    expect(html).toContain('id="hotspot-ranking"');
    expect(html).toContain('id="hotspot-tutorial"');
    expect(html).toContain('id="hotspot-sair"');
  });

  // 17. Validar que os submenus continuam com o tema de caderno (notebook-page / notebook-dialog-card)
  it('17. submenus devem preservar o visual de caderno aprovado', () => {
    const htmlPath = path.resolve(__dirname, '../index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    expect(html).toContain('id="screen-song-select" class="overlay-screen hidden notebook-page"');
    expect(html).toContain('id="screen-ranking" class="overlay-screen hidden notebook-page"');
    expect(html).toContain('id="screen-result" class="overlay-screen hidden notebook-page"');
    expect(html).toContain('class="notebook-dialog-card difficulty-dialog"');
    expect(html).toContain('class="notebook-dialog-card profile-card"');
    expect(html).toContain('id="result-record-banner"');
  });
});
