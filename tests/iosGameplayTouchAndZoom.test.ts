import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { InputController } from '../src/game/input/inputController';
import { GameEngine } from '../src/game/engine';
import { Note, Lane } from '../src/types';

describe('ROCKBRAZIL V13.5.1 — CORREÇÃO URGENTE DE ZOOM NO IPHONE', () => {
  const rootDir = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'src/style.css'), 'utf-8');
  const mainTs = fs.readFileSync(path.join(rootDir, 'src/main.ts'), 'utf-8');
  const inputControllerTs = fs.readFileSync(path.join(rootDir, 'src/game/input/inputController.ts'), 'utf-8');

  // =========================================================================
  // 1. AUDITORIA DE ACESSIBILIDADE E VIEWPORT
  // =========================================================================
  describe('1. Viewport & Preservação da Acessibilidade', () => {
    it('deve possuir meta viewport configurado com viewport-fit=cover e width=device-width', () => {
      expect(indexHtml).toMatch(/<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width[^"']*viewport-fit=cover[^"']*["']/i);
    });

    it('NÃO deve usar user-scalable=no ou maximum-scale=1 como bloqueio principal no viewport', () => {
      // Regra 8: Preservar zoom e acessibilidade fora da partida
      expect(indexHtml).not.toMatch(/<meta\s+name=["']viewport["'][^>]*user-scalable=no/i);
      expect(indexHtml).not.toMatch(/<meta\s+name=["']viewport["'][^>]*maximum-scale=1\.0/i);
    });

    it('NÃO deve aplicar touch-action: none globalmente em html, body', () => {
      // Regra 4: Evitar aplicar bloqueios globais de zoom a menus, tutorial, perfil
      // html, body deve ter touch-action: manipulation para acessibilidade e navegação fluida
      expect(styleCss).toMatch(/html,\s*body\s*\{[^}]*touch-action:\s*manipulation;/);
    });
  });

  // =========================================================================
  // 2. REGRAS CSS DE TOUCH-ACTION E ISOLAMENTO DE TOQUE
  // =========================================================================
  describe('2. Regras CSS de Touch-Action e Isolamento no Safari', () => {
    it('deve aplicar touch-action: none !important na superfície da pista e botões de notas', () => {
      expect(styleCss).toMatch(/\.fret-board-layer\s*\{[^}]*touch-action:\s*none\s*!important;/);
      expect(styleCss).toMatch(/\.fret-button\s*\{[^}]*touch-action:\s*none\s*!important;/);
      expect(styleCss).toMatch(/\.fret-circle\s*\{[^}]*touch-action:\s*none\s*!important;/);
      expect(styleCss).toMatch(/\.fret-inner-core\s*\{[^}]*touch-action:\s*none\s*!important;/);
      expect(styleCss).toMatch(/\.fret-outer-ring\s*\{[^}]*touch-action:\s*none\s*!important;/);
    });

    it('deve aplicar touch-action: none !important no canvas-container e highway', () => {
      expect(styleCss).toMatch(/#canvas-container\s*\{[^}]*touch-action:\s*none\s*!important;/);
      expect(styleCss).toMatch(/#game-canvas\s*\{[^}]*touch-action:\s*none\s*!important;/);
      expect(styleCss).toMatch(/\.highway-flame-bar\s*\{[^}]*touch-action:\s*none\s*!important;/);
    });

    it('deve aplicar user-select: none e -webkit-touch-callout: none para impedir seleção e lupas de texto', () => {
      expect(styleCss).toMatch(/\.fret-board-layer\s*\{[^}]*-webkit-touch-callout:\s*none\s*!important;/);
      expect(styleCss).toMatch(/\.fret-button\s*\{[^}]*-webkit-touch-callout:\s*none\s*!important;/);
      expect(styleCss).toMatch(/#canvas-container\s*\{[^}]*-webkit-touch-callout:\s*none\s*!important;/);
    });

    it('deve desabilitar pointer-events em textos de atalho de tecla (.pc-key-hint)', () => {
      expect(styleCss).toMatch(/\.pc-key-hint\s*\{[^}]*pointer-events:\s*none;/);
    });

    it('deve aplicar touch-action: manipulation aos botões interativos da interface', () => {
      expect(styleCss).toMatch(/button,[^}]*touch-action:\s*manipulation;/);
      expect(styleCss).toMatch(/\.btn-rock,[^}]*touch-action:\s*manipulation;/);
    });
  });

  // =========================================================================
  // 3. LISTENERS DE GESTO E TOQUE NO SAFARI (PREVENÇÃO DE ZOOM ACIDENTAL)
  // =========================================================================
  describe('3. Prevenção de Gestos Nativos no iOS Safari (main.ts)', () => {
    it('deve registrar listeners para gesturestart, gesturechange e gestureend impedindo zoom de 2 dedos', () => {
      expect(mainTs).toContain("document.addEventListener('gesturestart', preventSafariGestureZoom, { passive: false });");
      expect(mainTs).toContain("document.addEventListener('gesturechange', preventSafariGestureZoom, { passive: false });");
      expect(mainTs).toContain("document.addEventListener('gestureend', preventSafariGestureZoom, { passive: false });");
    });

    it('deve restringir preventDefault de gestos estritamente para quando o jogo estiver em PLAYING ou COUNTDOWN', () => {
      expect(mainTs).toContain('(this.state === GameState.PLAYING || this.state === GameState.COUNTDOWN) && e.cancelable');
    });

    it('deve tratar touchstart, touchmove e touchend no fretBoard com passive: false e preventDefault cancelável', () => {
      expect(mainTs).toContain("fretBoard.addEventListener('touchstart', preventFretTouch, { passive: false });");
      expect(mainTs).toContain("fretBoard.addEventListener('touchmove', preventFretTouch, { passive: false });");
      expect(mainTs).toContain("fretBoard.addEventListener('touchend', preventFretTouch, { passive: false });");
    });

    it('deve tratar touch events no canvasContainer para evitar rolagem ou zoom acidental ao tocar próximo às pistas', () => {
      expect(mainTs).toContain("canvasContainer.addEventListener('touchstart', preventCanvasTouch, { passive: false });");
      expect(mainTs).toContain("canvasContainer.addEventListener('touchmove', preventCanvasTouch, { passive: false });");
      expect(mainTs).toContain("canvasContainer.addEventListener('touchend', preventCanvasTouch, { passive: false });");
    });

    it('deve registrar tratamento para touchcancel limpando todas as pistas com releaseAllLanes()', () => {
      expect(mainTs).toContain("window.addEventListener('touchcancel', () => {");
      expect(mainTs).toContain('this.releaseAllLanes();');
    });
  });

  // =========================================================================
  // 4. RECONHECIMENTO DE MULTITOUCH E ACORDES (2, 3, 4 OU 5 NOTAS)
  // =========================================================================
  describe('4. Reconhecimento de Multitouch e Acordes Independentes', () => {
    let pressedLanes: number[] = [];
    let releasedLanes: number[] = [];
    let controller: InputController;

    beforeEach(() => {
      pressedLanes = [];
      releasedLanes = [];
      controller = new InputController({
        onLanePress: (lane) => pressedLanes.push(lane),
        onLaneRelease: (lane) => releasedLanes.push(lane)
      });
    });

    it('deve reconhecer acordes de 2 notas simultâneas (dois dedos em pistas diferentes)', () => {
      // Dedo 1 no Verde (Pista 0), Dedo 2 no Vermelho (Pista 1)
      controller.handlePointerDownEvent(1, 0);
      controller.handlePointerDownEvent(2, 1);

      expect(pressedLanes).toEqual([0, 1]);
      expect(controller.isLanePressed(0)).toBe(true);
      expect(controller.isLanePressed(1)).toBe(true);

      // Solta dedo 1 -> apenas pista 0 liberada
      controller.handlePointerUpEvent(1);
      expect(releasedLanes).toEqual([0]);
      expect(controller.isLanePressed(0)).toBe(false);
      expect(controller.isLanePressed(1)).toBe(true);

      // Solta dedo 2 -> pista 1 liberada
      controller.handlePointerUpEvent(2);
      expect(releasedLanes).toEqual([0, 1]);
      expect(controller.isLanePressed(1)).toBe(false);
    });

    it('deve reconhecer acordes de 3 notas simultâneas (Pistas 0, 2, 4)', () => {
      controller.handlePointerDownEvent(10, 0);
      controller.handlePointerDownEvent(11, 2);
      controller.handlePointerDownEvent(12, 4);

      expect(pressedLanes).toEqual([0, 2, 4]);
      expect(controller.getActiveLanes().size).toBe(3);

      controller.handlePointerUpEvent(11);
      expect(releasedLanes).toEqual([2]);
      expect(controller.getActiveLanes().size).toBe(2);

      controller.handlePointerUpEvent(10);
      controller.handlePointerUpEvent(12);
      expect(releasedLanes).toEqual([2, 0, 4]);
      expect(controller.getActiveLanes().size).toBe(0);
    });

    it('deve reconhecer acordes de até 5 notas simultâneas (todos os dedos)', () => {
      for (let lane = 0; lane < 5; lane++) {
        controller.handlePointerDownEvent(100 + lane, lane as Lane);
      }

      expect(pressedLanes).toEqual([0, 1, 2, 3, 4]);
      expect(controller.getActiveLanes().size).toBe(5);

      for (let lane = 0; lane < 5; lane++) {
        controller.handlePointerUpEvent(100 + lane);
      }

      expect(releasedLanes).toEqual([0, 1, 2, 3, 4]);
      expect(controller.getActiveLanes().size).toBe(0);
    });

    it('deve suportar toques rápidos repetidos sem reter estados presos', () => {
      // 5 toques rápidos seguidos na pista 2 (ex: semicolcheias rápidas)
      for (let i = 0; i < 5; i++) {
        controller.handlePointerDownEvent(200 + i, 2);
        expect(controller.isLanePressed(2)).toBe(true);
        controller.handlePointerUpEvent(200 + i);
        expect(controller.isLanePressed(2)).toBe(false);
      }

      expect(pressedLanes).toEqual([2, 2, 2, 2, 2]);
      expect(releasedLanes).toEqual([2, 2, 2, 2, 2]);
      expect(controller.getActiveLanes().size).toBe(0);
    });

    it('deve liberar todas as pistas em releaseAll() sem deixar nenhuma nota travada', () => {
      controller.handlePointerDownEvent(1, 0);
      controller.handlePointerDownEvent(2, 1);
      controller.handlePointerDownEvent(3, 3);
      expect(controller.getActiveLanes().size).toBe(3);

      controller.releaseAll();
      expect(controller.getActiveLanes().size).toBe(0);
      expect(controller.isLanePressed(0)).toBe(false);
      expect(controller.isLanePressed(1)).toBe(false);
      expect(controller.isLanePressed(3)).toBe(false);
    });
  });

  // =========================================================================
  // 5. MOTOR DE JOGO: SUSTAINS (NOTAS LONGAS) E HIT JUDGMENT
  // =========================================================================
  describe('5. Notas Longas (Sustains) com Multitouch no GameEngine', () => {
    it('deve manter nota longa sustentada enquanto o dedo estiver pressionado', () => {
      const mockNotes: Note[] = [
        { id: 1, lane: 0, time: 1.0, duration: 1.5, hit: false, missed: false } // Sustain de 1.5s
      ];

      const engine = new GameEngine(mockNotes, 'EXPERT', {
        muteOnMiss: true,
        noteSpeedMultiplier: 1.0,
        audioOffsetMs: 0
      });

      // Pressiona na janela do sustain
      const hit = engine.handleLanePress(0, 1.0);
      expect(hit).not.toBeNull();
      const engineNotes = engine.getNotes();
      expect(engineNotes[0].hit).toBe(true);
      expect(engineNotes[0].sustainCompleted).toBeFalsy();

      // Atualiza o tempo enquanto o dedo ainda está abaixado
      engine.update(1.8);
      expect(engineNotes[0].sustainCompleted).toBeFalsy();

      // Solta o dedo após terminar a duração
      engine.handleLaneRelease(0, 2.6);
      expect(engineNotes[0].sustainCompleted).toBe(true);
    });

    it('deve permitir tocar acordes onde uma nota é normal e a outra é sustain', () => {
      const mockNotes: Note[] = [
        { id: 1, lane: 0, time: 1.0, duration: 0, hit: false, missed: false },   // Normal
        { id: 2, lane: 1, time: 1.0, duration: 2.0, hit: false, missed: false }  // Longa
      ];

      const engine = new GameEngine(mockNotes, 'EXPERT', {
        muteOnMiss: true,
        noteSpeedMultiplier: 1.0,
        audioOffsetMs: 0
      });

      // Toca as duas pistas juntas (acorde)
      const hit0 = engine.handleLanePress(0, 1.0);
      const hit1 = engine.handleLanePress(1, 1.0);
      expect(hit0).not.toBeNull();
      expect(hit1).not.toBeNull();

      // Solta a nota normal
      engine.handleLaneRelease(0, 1.1);
      expect(engine.isLanePressed(0)).toBe(false);
      expect(engine.isLanePressed(1)).toBe(true); // Pista 1 continua segurando o sustain!

      // Solta a nota longa posteriormente
      engine.handleLaneRelease(1, 3.1);
      expect(engine.isLanePressed(1)).toBe(false);
      const engineNotes = engine.getNotes();
      expect(engineNotes[1].sustainCompleted).toBe(true);
    });
  });

  // =========================================================================
  // 6. PAUSA E RETOMADA: LIMPEZA DE PISTAS ATIVAS
  // =========================================================================
  describe('6. Limpeza de Pistas Ativas na Pausa e Retomada', () => {
    it('deve chamar releaseAllLanes() ao pausar a partida em pauseGame()', () => {
      expect(mainTs).toMatch(/private pauseGame\(\): void \{[\s\S]*?this\.releaseAllLanes\(\);[\s\S]*?this\.state = GameState\.PAUSED;/);
    });

    it('deve chamar releaseAllLanes() ao finalizar a partida em finishSong()', () => {
      expect(mainTs).toMatch(/private async finishSong\(\): Promise<void> \{[\s\S]*?this\.releaseAllLanes\(\);/);
    });

    it('deve chamar releaseAllLanes() ao iniciar uma nova partida em startNewMatch()', () => {
      expect(mainTs).toMatch(/private async startNewMatch\([\s\S]*?this\.releaseAllLanes\(\);/);
    });

    it('deve limpar activeLanes e visual pressed mesmo se pausado durante releaseLane()', () => {
      // Garante que o release visual sempre ocorra mesmo se isResumingCountdown ou state !== PLAYING
      expect(mainTs).toMatch(/private releaseLane\(lane: Lane\): void \{\s*this\.activeLanes\.delete\(lane\);\s*this\.ui\.setLaneVisualActive\(lane, false\);/);
    });
  });
});
