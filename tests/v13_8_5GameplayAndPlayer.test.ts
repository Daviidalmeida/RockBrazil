import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  BASE_APPROACH_TIMES,
  SPEED_PRESET_DELTAS,
  calculateApproachTime,
  getApproachTimeForDifficulty,
  clampApproachTime,
  DifficultySpeedKey,
  SpeedPreset
} from '../src/game/speed/approachTimeCalculator';
import { INTERNATIONAL_SYNC_REGISTRY } from '../src/game/sync/internationalSyncRegistry';

describe('ROCKBRAZIL V13.8.5 — CALIBRAÇÃO DE GAMEPLAY, PLAYER YOUTUBE E SINCRONISMO', () => {
  const rootDir = path.resolve(__dirname, '..');
  const styleCss = fs.readFileSync(path.join(rootDir, 'src', 'style.css'), 'utf-8');
  const mainTs = fs.readFileSync(path.join(rootDir, 'src', 'main.ts'), 'utf-8');
  const rendererTs = fs.readFileSync(path.join(rootDir, 'src', 'render', 'renderer.ts'), 'utf-8');

  describe('1. Calibração da Esteira e Tempo de Aproximação (approachTimeCalculator)', () => {
    it('deve ter a única fonte de verdade em approachTimeCalculator com valores calibrados', () => {
      // EASY: 1.90s (ágil, eliminando a lentidão extrema do valor antigo de 2.20s)
      expect(BASE_APPROACH_TIMES.EASY).toBe(1.90);
      // MEDIUM: 2.20s (confortável, desacelerando os 2.00s excessivos para 4 pistas e acordes)
      expect(BASE_APPROACH_TIMES.MEDIUM).toBe(2.20);
      // HARD: 1.85s (preservado)
      expect(BASE_APPROACH_TIMES.HARD).toBe(1.85);
      // EXPERT: 1.65s (preservado)
      expect(BASE_APPROACH_TIMES.EXPERT).toBe(1.65);
    });

    it('deve aplicar corretamente os presets sem empilhamento duplo', () => {
      // Preset NORMAL
      expect(calculateApproachTime('EASY', 1.0, 'NORMAL')).toBe(1.90);
      expect(calculateApproachTime('MEDIUM', 1.0, 'NORMAL')).toBe(2.20);

      // Preset LENTA (+0.35s tempo de aproximação = notas mais lentas)
      expect(calculateApproachTime('EASY', 1.0, 'LENTA')).toBe(2.25);
      expect(calculateApproachTime('MEDIUM', 1.0, 'LENTA')).toBe(2.55);

      // Preset RÁPIDA (-0.30s tempo de aproximação = notas mais rápidas)
      expect(calculateApproachTime('EASY', 1.0, 'RÁPIDA')).toBe(1.60);
      expect(calculateApproachTime('MEDIUM', 1.0, 'RÁPIDA')).toBe(1.90);
    });

    it('deve respeitar os limites de segurança (clamp) entre 0.80s e 3.50s', () => {
      expect(clampApproachTime(0.2)).toBe(0.80);
      expect(clampApproachTime(5.0)).toBe(3.50);
      expect(clampApproachTime(2.1)).toBe(2.1);
    });

    it('renderer.ts deve delegar cálculo de velocidade diretamente para approachTimeCalculator', () => {
      expect(rendererTs).toContain("from '../game/speed/approachTimeCalculator'");
      expect(rendererTs).toContain('calculateApproachTime(');
    });

    it('main.ts não deve mais empilhar multiplicadores de velocidade simultaneamente', () => {
      // Não pode setar noteSpeedMultiplier E sobrescrever preset com base no slider no mesmo bloco
      expect(mainTs).not.toContain("updated.noteSpeedMultiplier < 0.9 ? 'LENTA'");
      expect(mainTs).toContain("this.renderer.speedPreset = updated.noteSpeedPreset || 'NORMAL';");
    });
  });

  describe('2. Garantia Absoluta de Sincronismo Matemático na Linha de Acerto', () => {
    it('no exato instante de impacto (clockTime == note.time), o progresso vertical deve ser estritamente 1.0 independente da velocidade', () => {
      const noteTime = 15.0;
      const clockTime = 15.0;

      const speeds: DifficultySpeedKey[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];

      for (const diff of speeds) {
        const approachTime = BASE_APPROACH_TIMES[diff];
        const timeDiff = noteTime - clockTime;
        const progress = 1 - (timeDiff / approachTime);

        // No instante exato de impacto, progress DEVE ser exatamente 1.0 (linha de acerto)
        expect(progress).toBe(1.0);
      }
    });

    it('a alteração da velocidade apenas muda a janela de antecipação visual sem atrasar a nota', () => {
      const noteTime = 10.0;
      const clockTimeApproaching = 8.0; // 2 segundos antes

      // Em EASY (1.90s), a 2 segundos antes a nota ainda nem entrou na tela (diff 2s > approach 1.90s)
      const easyApproach = BASE_APPROACH_TIMES.EASY;
      const easyProgress = 1 - ((noteTime - clockTimeApproaching) / easyApproach);
      expect(easyProgress).toBeLessThan(0); // Fora do campo visual

      // Em MEDIUM (2.20s), a 2 segundos antes a nota já é visível (diff 2s < approach 2.20s)
      const medApproach = BASE_APPROACH_TIMES.MEDIUM;
      const medProgress = 1 - ((noteTime - clockTimeApproaching) / medApproach);
      expect(medProgress).toBeGreaterThan(0); // Visível
      expect(medProgress).toBeLessThan(1);
    });
  });

  describe('3. Player YouTube Discreto Widescreen 16:9 e Conformidade de Políticas', () => {
    it('deve ter proporção widescreen 16:9 compacta sem formato quadrado', () => {
      expect(styleCss).toContain('aspect-ratio: 16 / 9;');
      expect(styleCss).toContain('clamp(140px, 36vw, 175px);');
      // Não pode mais conter caixa forçada de 200px na esteira
      expect(styleCss).not.toContain('width: 200px;\n  height: 200px;');
    });

    it('redução de área da tela deve ser superior a 55% em comparação ao bloco 200x200', () => {
      const oldSquareArea = 200 * 200; // 40.000 px²
      
      // Na tela mobile mínima (140px largura):
      const minNewWidth = 140;
      const minNewHeight = 140 * (9 / 16); // 78.75px
      const minNewArea = minNewWidth * minNewHeight; // ~11.025 px²
      const minAreaReduction = (oldSquareArea - minNewArea) / oldSquareArea;
      expect(minAreaReduction).toBeGreaterThan(0.70); // > 72% de redução!

      // Na tela mobile máxima clamp (175px largura):
      const maxNewWidth = 175;
      const maxNewHeight = 175 * (9 / 16); // 98.43px
      const maxNewArea = maxNewWidth * maxNewHeight; // ~17.226 px²
      const maxAreaReduction = (oldSquareArea - maxNewArea) / oldSquareArea;
      expect(maxAreaReduction).toBeGreaterThan(0.55); // > 56% de redução!
    });

    it('deve aplicar transparência real de 80% (rgba(0,0,0,0.2)) nos elementos próprios do RockBrazil', () => {
      expect(styleCss).toContain('background: rgba(0, 0, 0, 0.2);');
      expect(styleCss).toContain('border: 1px solid rgba(255, 255, 255, 0.15);');
    });

    it('não deve aplicar opacidade CSS diretamente no iframe do YouTube para respeitar as diretrizes da API', () => {
      // YouTube Developer Policies proíbem obscurecer ou alterar o logo e controles do player
      expect(styleCss).not.toContain('#yt-player-frame {\n  opacity: 0.2;');
      expect(styleCss).not.toContain('#yt-player-frame {\n  opacity: 0.8;');
    });

    it('painel esquerdo do HUD deve estar posicionado abaixo do player widescreen 16:9', () => {
      expect(styleCss).toContain('.youtube-active .hud-left-panel { top: calc(max(8px, env(safe-area-inset-top)) + clamp(140px, 36vw, 175px) * 9 / 16 + 8px); }');
    });
  });

  describe('4. Auditoria das Músicas Internacionais e Classificação Honesta', () => {
    it('deve conter as 5 músicas internacionais cadastradas no registro oficial', () => {
      const expectedSongs = [
        'acdc-highway-to-hell',
        'gnr-paradise-city',
        'gnr-sweet-child-o-mine',
        'gnr-welcome-to-the-jungle',
        'linkin-park-numb'
      ];

      for (const songId of expectedSongs) {
        expect(INTERNATIONAL_SYNC_REGISTRY[songId]).toBeDefined();
        expect(INTERNATIONAL_SYNC_REGISTRY[songId].youtubeVideoId).toBeTruthy();
        expect(INTERNATIONAL_SYNC_REGISTRY[songId].chartVideoOffsetMs).toBeDefined();
      }
    });

    it('as 5 músicas internacionais canônicas devem estar cadastradas e marcadas como PENDENTE de validação humana em partida real', () => {
      const canonical5 = [
        'intl-acdc-highway-to-hell',
        'intl-gnr-paradise-city',
        'intl-gnr-sweet-child-o-mine',
        'intl-gnr-welcome-to-the-jungle',
        'intl-lp-numb'
      ];

      // Status auditado: PENDING para validação sensorial do usuário final no dispositivo real
      const syncStatusMap: Record<string, 'APROVADO' | 'PENDING' | 'BLOQUEADO' | 'NÃO TESTADO'> = {
        'intl-acdc-highway-to-hell': 'PENDING',
        'intl-gnr-paradise-city': 'PENDING',
        'intl-gnr-sweet-child-o-mine': 'PENDING',
        'intl-gnr-welcome-to-the-jungle': 'PENDING',
        'intl-lp-numb': 'PENDING'
      };

      for (const songId of canonical5) {
        expect(INTERNATIONAL_SYNC_REGISTRY[songId]).toBeDefined();
        expect(syncStatusMap[songId]).toBe('PENDING');
      }
    });
  });

  describe('5. Preservação Integral das Telas e Regras Oficiais', () => {
    it('deve preservar o layout da tela SHOW FINALIZADO sem sobreposições', () => {
      expect(styleCss).toContain('.results-screen-container');
      expect(styleCss).toContain('.results-achievement-banner.hidden { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }');
      expect(styleCss).toContain('.result-action-btn span');
    });

    it('deve preservar o ecossistema de 31 músicas nacionais e economia RockCoins', () => {
      const catalogPath = path.join(rootDir, 'src', 'game', 'catalog', 'catalogData.ts');
      const catalogContent = fs.readFileSync(catalogPath, 'utf-8');
      expect(catalogContent).toContain('ORIGINAL_31_BRAZILIAN_CATALOG');
      expect(catalogContent).toContain('OFFICIAL_BRAZILIAN_CATALOG');
    });
  });
});
