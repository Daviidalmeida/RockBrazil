import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { GameEngine } from '../src/game/engine';
import { Note, GameSettings, Difficulty } from '../src/types';
import { YouTubePlayerController } from '../src/audio/youtubePlayer';
import { RankingService } from '../src/firebase/rankingService';

describe('ROCKBRAZIL V13.7 — SUÍTE DE ESTABILIZAÇÃO GERAL, GAMEPLAY, YOUTUBE E RANKING', () => {

  const dummySettings: GameSettings = {
    audioOffsetMs: 0,
    musicVolume: 1.0,
    sfxVolume: 1.0,
    speed: 1.0,
    muteOnMiss: true
  };

  // --------------------------------------------------------------------------
  // FASE 2 & 3: PAUSE DEFINITIVO E REMOÇÃO DO PAINEL DE OFFSET
  // --------------------------------------------------------------------------
  describe('Fase 2 & 3: Pause Responsivo e Limpeza de Painel de Offset', () => {
    it('1. Deve ter removido completamente o painel de offset e botões do Pause no HTML e CSS', () => {
      const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
      const css = fs.readFileSync(path.resolve(process.cwd(), 'src/style.css'), 'utf-8');

      expect(html).not.toContain('id="pause-sync-box"');
      expect(html).not.toContain('id="btn-pause-offset-minus"');
      expect(html).not.toContain('id="btn-pause-offset-plus"');
      expect(html).not.toContain('id="pause-offset-val"');
      expect(html).not.toContain('Ajuste de Offset (Áudio/Vídeo)');

      expect(css).not.toContain('.pause-sync-box');
      expect(css).not.toContain('.btn-offset-step');
      expect(css).not.toContain('.pause-offset-val');
    });

    it('2. Botão Pause no HUD deve possuir dimensões mínimas de 44x44px (touch target seguro)', () => {
      const css = fs.readFileSync(path.resolve(process.cwd(), 'src/style.css'), 'utf-8');
      expect(css).toContain('.hud-pause-btn');
      expect(css).toContain('min-width: 46px');
      expect(css).toContain('min-height: 46px');
      expect(css).toContain('touch-action: manipulation');
    });

    it('3. Gestos multitouch globais no main.ts devem isentar o botão Pause e menu de pausa', () => {
      const mainTs = fs.readFileSync(path.resolve(process.cwd(), 'src/main.ts'), 'utf-8');
      expect(mainTs).toContain("closest('#btn-pause, .hud-pause-btn, #screen-pause')");
    });
  });

  // --------------------------------------------------------------------------
  // FASE 4: JULGAMENTO DAS CINCO PISTAS E PENALIZAÇÃO DE TOQUES EXTRAS
  // --------------------------------------------------------------------------
  describe('Fase 4: Motor de Julgamento, Cinco Pistas e Precisão', () => {
    it('4. Toque correto em uma pista registra Hit e incrementa combo', () => {
      const notes: Note[] = [
        { id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
      ];
      const engine = new GameEngine(notes, 'MEDIUM', dummySettings);

      const hit = engine.handleLanePress(0, 2.0);
      expect(hit).not.toBeNull();
      expect(hit?.lane).toBe(0);
      expect(engine.getStats().combo).toBe(1);
      expect(engine.getStats().missCount).toBe(0);
      expect(engine.getStats().extraPressCount).toBe(0);
      expect(engine.getStats().accuracy).toBe(100);
    });

    it('5. Toque em pista incorreta sem nota deve quebrar o combo e registrar toque extra', () => {
      const notes: Note[] = [
        { id: 1, time: 2.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
      ];
      const engine = new GameEngine(notes, 'MEDIUM', dummySettings);

      // Acerta nota na pista 0
      engine.handleLanePress(0, 2.0);
      expect(engine.getStats().combo).toBe(1);

      // Pressiona pista 2 (onde não há nenhuma nota)
      const missPress = engine.handleLanePress(2, 2.0);
      expect(missPress).toBeNull();
      expect(engine.getStats().combo).toBe(0); // Combo quebrado imediatamente
      expect(engine.getStats().extraPressCount).toBe(1);
      expect(engine.getStats().accuracy).toBe(50); // 1 acerto em 2 tentativas (1 hit, 1 extra)
    });

    it('6. Pressionar todas as 5 pistas simultaneamente em nota única NÃO PODE dar 100% de precisão', () => {
      const notes: Note[] = [
        { id: 1, time: 1.0, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
      ];
      const engine = new GameEngine(notes, 'EXPERT', dummySettings);

      // Jogador pressiona simultaneamente as 5 pistas no instante da nota
      engine.handleLanePress(0, 1.0); // Pista correta
      engine.handleLanePress(1, 1.0); // Pista incorreta (extra)
      engine.handleLanePress(2, 1.0); // Pista incorreta (extra)
      engine.handleLanePress(3, 1.0); // Pista incorreta (extra)
      engine.handleLanePress(4, 1.0); // Pista incorreta (extra)

      const stats = engine.getStats();
      expect(stats.hitsCount).toBe(1);
      expect(stats.extraPressCount).toBe(4);
      expect(stats.combo).toBe(0); // Combo deve estar zerado
      expect(stats.accuracy).toBe(20); // 1 / (1 + 0 + 4) = 20%
      expect(stats.accuracy).not.toBe(100);
    });

    it('7. Acordes legítimos de duas ou mais pistas funcionam sem registrar toques extras', () => {
      const chordNotes: Note[] = [
        { id: 1, time: 1.5, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
        { id: 2, time: 1.5, lane: 1, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
      ];
      const engine = new GameEngine(chordNotes, 'EXPERT', dummySettings);

      const hit0 = engine.handleLanePress(0, 1.5);
      const hit1 = engine.handleLanePress(1, 1.5);

      expect(hit0).not.toBeNull();
      expect(hit1).not.toBeNull();
      expect(engine.getStats().hitsCount).toBe(2);
      expect(engine.getStats().extraPressCount).toBe(0);
      expect(engine.getStats().combo).toBe(2);
      expect(engine.getStats().accuracy).toBe(100);
    });

    it('8. Pressionar 5 pistas em acorde de 2 pistas penaliza as 3 pistas excedentes', () => {
      const chordNotes: Note[] = [
        { id: 1, time: 1.5, lane: 0, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 },
        { id: 2, time: 1.5, lane: 2, duration: 0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
      ];
      const engine = new GameEngine(chordNotes, 'EXPERT', dummySettings);

      engine.handleLanePress(0, 1.5); // Válida
      engine.handleLanePress(1, 1.5); // Extra
      engine.handleLanePress(2, 1.5); // Válida
      engine.handleLanePress(3, 1.5); // Extra
      engine.handleLanePress(4, 1.5); // Extra

      const stats = engine.getStats();
      expect(stats.hitsCount).toBe(2);
      expect(stats.extraPressCount).toBe(3);
      expect(stats.combo).toBe(0);
      expect(stats.accuracy).toBe(40); // 2 / (2 + 3) = 40%
    });

    it('9. Dedo mantido pressionado (sustain) não penaliza repetidamente', () => {
      const sustainNotes: Note[] = [
        { id: 1, time: 1.0, lane: 0, duration: 2.0, hit: false, missed: false, sustainCompleted: false, sustainHeldTime: 0 }
      ];
      const engine = new GameEngine(sustainNotes, 'HARD', dummySettings);

      engine.handleLanePress(0, 1.0);
      expect(engine.getStats().hitsCount).toBe(1);
      expect(engine.getStats().extraPressCount).toBe(0);

      // Simula passagem de tempo sem novo press
      engine.update(1.5);
      engine.update(2.0);
      engine.update(2.5);

      expect(engine.getStats().extraPressCount).toBe(0);

      // Liberação de sustain
      engine.handleLaneRelease(0, 3.0);
      expect(engine.getStats().extraPressCount).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // FASE 5: YOUTUBE CONTROLLER E ARQUITETURA
  // --------------------------------------------------------------------------
  describe('Fase 5: YouTube IFrame Controller e Incorporação', () => {
    it('10. index.html deve pré-carregar o script oficial da YouTube IFrame API', () => {
      const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
      expect(html).toContain('https://www.youtube.com/iframe_api');
    });

    it('11. Container do YouTube Miniplayer deve estar desacoplado do hud.hidden para não ficar invisível no Countdown', () => {
      const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
      // Deve estar sob game-app e antes de <header id="hud"
      const containerIdx = html.indexOf('id="yt-player-container"');
      const hudIdx = html.indexOf('<header id="hud"');
      expect(containerIdx).toBeGreaterThan(0);
      expect(hudIdx).toBeGreaterThan(containerIdx);
    });

    it('12. YouTubePlayerController deve ter o método prime() para gesto do usuário', () => {
      const yt = new YouTubePlayerController();
      expect(typeof yt.prime).toBe('function');
    });
  });

  // --------------------------------------------------------------------------
  // FASE 6: RANKING GLOBAL COMPLETO E ÍNDICES FIRESTORE
  // --------------------------------------------------------------------------
  describe('Fase 6: Índices do Firestore e Consultas do Ranking Global', () => {
    it('13. Arquivo firestore.indexes.json deve existir e conter índices compostos para rankings_song', () => {
      const indexesPath = path.resolve(process.cwd(), 'firestore.indexes.json');
      expect(fs.existsSync(indexesPath)).toBe(true);

      const json = JSON.parse(fs.readFileSync(indexesPath, 'utf-8'));
      expect(json.indexes).toBeDefined();
      expect(json.indexes.length).toBeGreaterThanOrEqual(4);

      const hasSongScoreIndex = json.indexes.some((idx: any) =>
        idx.collectionGroup === 'rankings_song' &&
        idx.fields.some((f: any) => f.fieldPath === 'songId') &&
        idx.fields.some((f: any) => f.fieldPath === 'score')
      );
      expect(hasSongScoreIndex).toBe(true);

      const hasDiffScoreIndex = json.indexes.some((idx: any) =>
        idx.collectionGroup === 'rankings_song' &&
        idx.fields.some((f: any) => f.fieldPath === 'difficulty') &&
        idx.fields.some((f: any) => f.fieldPath === 'score')
      );
      expect(hasDiffScoreIndex).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // FASE 7: ANIMAÇÃO DE CONQUISTAS NO PERFIL
  // --------------------------------------------------------------------------
  describe('Fase 7: Animação de Conquistas em MEU PERFIL', () => {
    it('14. CSS deve conter animações keyframe de revelação de conquistas e respeitar prefers-reduced-motion', () => {
      const css = fs.readFileSync(path.resolve(process.cwd(), 'src/style.css'), 'utf-8');
      expect(css).toContain('@keyframes achievementRevealGlow');
      expect(css).toContain('@keyframes shimmerSweep');
      expect(css).toContain('.achievement-card.newly-unlocked');
      expect(css).toContain('prefers-reduced-motion: reduce');
    });

    it('15. uiManager.ts deve persistir as conquistas visualizadas no localStorage para não repetir animação', () => {
      const uiManagerTs = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/uiManager.ts'), 'utf-8');
      expect(uiManagerTs).toContain('rb_seen_achievements_');
      expect(uiManagerTs).toContain('isNewlyUnlocked');
      expect(uiManagerTs).toContain('achievement-shine-shimmer');
    });
  });
});
