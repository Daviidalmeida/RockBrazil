import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { INTERNATIONAL_SYNC_REGISTRY } from '../src/game/sync/internationalSyncRegistry';
import { CalibrationManager } from '../src/game/sync/calibrationManager';

describe('ROCKBRAZIL V13.8.4 — HUD COMPACTO, SHOW FINALIZADO E SINCRONISMO INTERNACIONAL', () => {
  const rootDir = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'src/style.css'), 'utf-8');

  describe('1. SHOW FINALIZADO Definitivo — Estrutura e Ordem Visual Rigorosa (1 a 9)', () => {
    it('deve conter as 9 seções na ordem visual e semântica exata', () => {
      // 1. Logo RockBrazil
      const idxLogo = indexHtml.indexOf('class="results-brand-art"');
      expect(idxLogo).toBeGreaterThan(-1);

      // 2. Título SHOW FINALIZADO
      const idxTitle = indexHtml.indexOf('id="result-title"');
      expect(idxTitle).toBeGreaterThan(-1);

      // 3. Card da Música
      const idxCard = indexHtml.indexOf('class="results-header-overlay"');
      expect(idxCard).toBeGreaterThan(-1);

      // 4. Estrelas
      const idxStars = indexHtml.indexOf('id="result-stars-row"');
      expect(idxStars).toBeGreaterThan(-1);

      // 5. Acertos e Erros
      const idxHitsMisses = indexHtml.indexOf('class="results-stats-row results-hits-misses-row"');
      expect(idxHitsMisses).toBeGreaterThan(-1);

      // 6. Precisão e Maior Combo
      const idxAccCombo = indexHtml.indexOf('class="results-stats-row results-acc-combo-row"');
      expect(idxAccCombo).toBeGreaterThan(-1);

      // 7. Julgamentos Detalhados
      const idxJudgments = indexHtml.indexOf('class="results-judgments-row"');
      expect(idxJudgments).toBeGreaterThan(-1);

      // 8. RockCoins e Pontuação
      const idxReward = indexHtml.indexOf('class="results-central-panel results-reward-panel"');
      expect(idxReward).toBeGreaterThan(-1);

      // 9. Botões de Ação
      const idxButtons = indexHtml.indexOf('class="results-buttons-overlay"');
      expect(idxButtons).toBeGreaterThan(-1);

      // Verificação da ordem sequencial
      expect(idxLogo).toBeLessThan(idxTitle);
      expect(idxTitle).toBeLessThan(idxCard);
      expect(idxCard).toBeLessThan(idxStars);
      expect(idxStars).toBeLessThan(idxHitsMisses);
      expect(idxHitsMisses).toBeLessThan(idxAccCombo);
      expect(idxAccCombo).toBeLessThan(idxJudgments);
      expect(idxJudgments).toBeLessThan(idxReward);
      expect(idxReward).toBeLessThan(idxButtons);
    });

    it('não deve possuir posicionamento absoluto top percentual colidente nos filhos do resultado', () => {
      expect(styleCss).not.toMatch(/\.results-stats-quad\s*\{[^}]*position:\s*absolute/);
      expect(styleCss).not.toMatch(/\.results-judgments-row\s*\{[^}]*position:\s*absolute/);
      expect(styleCss).not.toMatch(/\.results-buttons-overlay\s*\{[^}]*position:\s*absolute/);
    });

    it('deve possuir container com rolagem segura para viewports compactos', () => {
      expect(styleCss).toContain('overflow-y: auto');
      expect(styleCss).toContain('-webkit-overflow-scrolling: touch');
    });
  });

  describe('2. HUD Compacto à Esquerda e Ausência de Contadores Fixos no Gameplay', () => {
    it('deve conter a Linha 1 com multiplicador imediatamente à esquerda da pontuação', () => {
      expect(indexHtml).toContain('class="hud-primary-row"');
      const idxPrimary = indexHtml.indexOf('class="hud-primary-row"');
      const idxMult = indexHtml.indexOf('id="hud-multiplier"', idxPrimary);
      const idxScore = indexHtml.indexOf('id="hud-score"', idxPrimary);

      expect(idxMult).toBeGreaterThan(idxPrimary);
      expect(idxScore).toBeGreaterThan(idxMult);
    });

    it('deve conter a Linha 2 com o combo logo abaixo da pontuação', () => {
      const idxPrimary = indexHtml.indexOf('class="hud-primary-row"');
      const idxCombo = indexHtml.indexOf('id="hud-combo-container"');
      expect(idxCombo).toBeGreaterThan(idxPrimary);
    });

    it('deve conter indicador de julgamento momentâneo sem contadores permanentes durante a partida', () => {
      expect(indexHtml).toContain('id="hud-judgement"');
      // No HUD de gameplay não deve existir contador permanente cumulativo exibido em tela
      expect(indexHtml).not.toMatch(/<div[^>]*class="[^"]*hud-layer[^"]*"[\s\S]*?<span[^>]*>PERFEITO:\s*<\/span>/);
      expect(indexHtml).not.toMatch(/<div[^>]*class="[^"]*hud-layer[^"]*"[\s\S]*?<span[^>]*>ÓTIMO:\s*<\/span>/);
    });

    it('deve possuir animação de combo milestone (múltiplos de 10) no CSS', () => {
      expect(styleCss).toContain('.combo-container.combo-milestone-pop');
      expect(styleCss).toContain('@keyframes comboPopScale');
    });
  });

  describe('3. Posicionamento da Barra de Desempenho (Rock Meter)', () => {
    it('deve estar posicionado no painel direito em altura intermediária', () => {
      expect(styleCss).toContain('.hud-right-panel');
      expect(styleCss).toContain('top: calc(max(10px, env(safe-area-inset-top)) + clamp(90px, 16vh, 140px));');
      expect(styleCss).toContain('right: max(10px, env(safe-area-inset-right));');
    });
  });

  describe('4. Player YouTube Discreto (16:9 widescreen compacto e 80% de transparência)', () => {
    it('deve ter proporção widescreen 16:9 compacta sem bloquear a esteira', () => {
      expect(styleCss).toContain('aspect-ratio: 16 / 9;');
      expect(styleCss).toContain('clamp(140px, 36vw, 175px);');
    });

    it('deve ter wrapper com 80% de transparência (rgba(0,0,0,0.2)) e borda discreta', () => {
      expect(styleCss).toContain('background: rgba(0, 0, 0, 0.2);');
      expect(styleCss).toContain('border: 1px solid rgba(255, 255, 255, 0.15);');
      expect(styleCss).toContain('box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);');
    });
  });

  describe('5. Registro e Sincronização de Músicas Internacionais', () => {
    it('deve ter registro oficial para as 5 músicas com dados de charter e offsets calibrados', () => {
      expect(INTERNATIONAL_SYNC_REGISTRY['acdc-highway-to-hell']).toBeDefined();
      expect(INTERNATIONAL_SYNC_REGISTRY['acdc-highway-to-hell'].chartVideoOffsetMs).toBe(-2000);
      expect(INTERNATIONAL_SYNC_REGISTRY['acdc-highway-to-hell'].youtubeVideoId).toBe('gEPmA3USJdI');

      expect(INTERNATIONAL_SYNC_REGISTRY['gnr-paradise-city']).toBeDefined();
      expect(INTERNATIONAL_SYNC_REGISTRY['gnr-paradise-city'].chartVideoOffsetMs).toBe(0);

      expect(INTERNATIONAL_SYNC_REGISTRY['gnr-sweet-child-o-mine']).toBeDefined();
      expect(INTERNATIONAL_SYNC_REGISTRY['gnr-sweet-child-o-mine'].chartVideoOffsetMs).toBe(0);

      expect(INTERNATIONAL_SYNC_REGISTRY['gnr-welcome-to-the-jungle']).toBeDefined();
      expect(INTERNATIONAL_SYNC_REGISTRY['gnr-welcome-to-the-jungle'].chartVideoOffsetMs).toBe(0);

      expect(INTERNATIONAL_SYNC_REGISTRY['linkin-park-numb']).toBeDefined();
      expect(INTERNATIONAL_SYNC_REGISTRY['linkin-park-numb'].chartVideoOffsetMs).toBe(0);
    });

    it('CalibrationManager deve respeitar o offset padrão do registro internacional', () => {
      const offsetAcdc = CalibrationManager.getOffsetForSong('acdc-highway-to-hell');
      expect(offsetAcdc).toBe(-2000);

      const offsetGnr = CalibrationManager.getOffsetForSong('gnr-paradise-city');
      expect(offsetGnr).toBe(0);
    });
  });

  describe('6. Blueprint Arquitetural Android', () => {
    it('deve possuir o documento PLANO_ANDROID_ROCKBRAZIL.md com as 10 seções arquiteturais', () => {
      const planPath = path.join(rootDir, 'PLANO_ANDROID_ROCKBRAZIL.md');
      expect(fs.existsSync(planPath)).toBe(true);
      const planContent = fs.readFileSync(planPath, 'utf-8');

      expect(planContent).toContain('1. VISÃO GERAL E ESCOLHA DE RUNTIME HÍBRIDO');
      expect(planContent).toContain('2. ACELERAÇÃO POR HARDWARE E CONFIGURAÇÃO DA WEBVIEW');
      expect(planContent).toContain('3. ARQUITETURA DE ÁUDIO DE BAIXA LATÊNCIA');
      expect(planContent).toContain('4. INTEGRAÇÃO COMPATÍVEL COM YOUTUBE IFRAME NO ANDROID');
      expect(planContent).toContain('5. FIREBASE AUTHENTICATION & FIRESTORE NO ANDROID');
      expect(planContent).toContain('6. PERSISTÊNCIA LOCAL, SINCRONIZAÇÃO EM NUVEM E CACHE OFFLINE');
      expect(planContent).toContain('7. ORIENTAÇÃO DE TELA, MODO IMERSIVO E SAFE AREAS');
      expect(planContent).toContain('8. TAXA DE ATUALIZAÇÃO (90HZ / 120HZ) E LATÊNCIA DE TOQUE');
      expect(planContent).toContain('9. PACOTE DE DISTRIBUIÇÃO E ANDROID APP BUNDLE (AAB)');
      expect(planContent).toContain('10. CONFORMIDADE COM A GOOGLE PLAY STORE E PERMISSÕES');
    });
  });
});
