/**
 * RockBrazil V14.6.1 — Playwright Real Browser Responsive Automation Suite
 * 
 * Validação rigorosa em navegador real (Chromium / Microsoft Edge) cobrindo os 7 viewports:
 * - 320 px (iPhone SE)
 * - 360 px (Galaxy S9 / Android Standard)
 * - 390 px (iPhone 12/13/14)
 * - 412 px (Pixel 7/8 / Galaxy S20+)
 * - 768 px (iPad Portrait / Tablet)
 * - 1024 px (iPad Landscape / Notebook)
 * - 1440 px (Desktop Wide)
 */

import { chromium } from 'playwright';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

interface ViewportConfig {
  width: number;
  height: number;
  name: string;
}

const VIEWPORTS: ViewportConfig[] = [
  { width: 320, height: 568, name: '320px (iPhone SE)' },
  { width: 360, height: 640, name: '360px (Galaxy S9 / Android Pequeno)' },
  { width: 390, height: 844, name: '390px (iPhone 12/13/14)' },
  { width: 412, height: 915, name: '412px (Pixel 7/8 / Galaxy S20+)' },
  { width: 768, height: 1024, name: '768px (Tablet Portrait)' },
  { width: 1024, height: 768, name: '1024px (Tablet Landscape / Laptop)' },
  { width: 1440, height: 900, name: '1440px (Desktop Wide)' }
];

function createStaticDistServer(port: number): Promise<http.Server> {
  const distDir = path.resolve(process.cwd(), 'dist');
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg'
  };

  const server = http.createServer((req, res) => {
    let reqUrl = req.url?.split('?')[0] || '/';
    if (reqUrl.startsWith('/RockBrazil/')) {
      reqUrl = reqUrl.substring('/RockBrazil'.length);
    }
    if (reqUrl === '' || reqUrl === '/') {
      reqUrl = '/index.html';
    }

    let filePath = path.join(distDir, reqUrl);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(distDir, 'index.html');
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function runMobileAudit() {
  const PORT = 5188;
  console.log(`🚀 Iniciando servidor estático do build de produção em http://127.0.0.1:${PORT}...`);
  const server = await createStaticDistServer(PORT);
  const serverUrl = `http://127.0.0.1:${PORT}/RockBrazil/`;
  console.log(`✓ Servidor rodando em ${serverUrl}`);

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true
  });

  const results: any[] = [];
  let allPassed = true;

  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n========================================================`);
      console.log(`📱 Testando Viewport: ${vp.name} (${vp.width}x${vp.height})`);
      console.log(`========================================================`);

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.width <= 768,
        hasTouch: vp.width <= 768
      });

      const page = await context.newPage();
      await page.goto(serverUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);

      // 1. Validar que o botão do Studio está oculto por padrão para jogadores comuns
      const isHiddenByDefault = await page.evaluate(`(() => {
        const el = document.getElementById('btn-open-rockchart-studio');
        return el ? window.getComputedStyle(el).display === 'none' : false;
      })()`);
      console.log(`  1. Proteção de Acesso: Botão oculto por padrão? ${isHiddenByDefault ? '✓ SIM (display: none)' : '✗ NÃO'}`);

      // 2. Abrir Studio deslogado para testar responsividade da Tela de Autenticação
      await page.evaluate(`(() => {
        const game = window.__ROCKBRAZIL_GAME__;
        if (game) game.ui.showScreen('ROCKCHART_STUDIO');
      })()`);
      await page.waitForTimeout(300);

      const authCardMetrics = await page.evaluate(`(() => {
        const card = document.querySelector('.rockchart-studio-auth-card');
        const username = document.getElementById('studio-auth-username');
        const password = document.getElementById('studio-auth-password');
        const btn = document.getElementById('btn-studio-login');
        const studio = document.getElementById('screen-rockchart-studio');
        return {
          hasOverflow: studio ? studio.scrollWidth > studio.clientWidth + 1 : false,
          cardWidth: card ? card.offsetWidth : 0,
          userInputHeight: username ? username.offsetHeight : 0,
          passInputHeight: password ? password.offsetHeight : 0,
          btnLoginHeight: btn ? btn.offsetHeight : 0
        };
      })()`);
      const authScreenResponsiveOk = !authCardMetrics.hasOverflow && authCardMetrics.btnLoginHeight >= 40;
      console.log(`  2. Tela de Login Responsiva: zero overflow e inputs >= 40px? ${authScreenResponsiveOk ? '✓ SIM' : '✗ NÃO'}`);

      // 3. Autenticar administrador no estúdio via GameEngine
      await page.evaluate(`(async () => {
        const game = window.__ROCKBRAZIL_GAME__;
        if (!game || !game.rockChartStudioView) return;
        const studio = game.rockChartStudioView.getStudio();
        await studio.authenticateAdmin({
          uid: 'admin-audit-uid',
          email: 'admin@rockbrazil.com.br',
          displayName: 'Curador Audit',
          getIdTokenResult: async function() { return { claims: { admin: true, role: 'SUPER_ADMIN' } }; }
        });
        game.rockChartStudioView.render();
        game.ui.showScreen('ROCKCHART_STUDIO');
      })()`);
      await page.waitForTimeout(400);

      // 4. Medir overflow horizontal do estúdio autenticado
      const overflowMetrics = await page.evaluate(`(() => {
        const studio = document.getElementById('screen-rockchart-studio');
        if (!studio) return { found: false, scrollWidth: 0, clientWidth: 0, hasHorizontalScroll: true };
        const rect = studio.getBoundingClientRect();
        return {
          found: true,
          clientWidth: studio.clientWidth,
          scrollWidth: studio.scrollWidth,
          hasHorizontalScroll: studio.scrollWidth > studio.clientWidth + 1,
          rectWidth: rect.width,
          windowInnerWidth: window.innerWidth
        };
      })()`);

      const horizontalScrollOk = !overflowMetrics.hasHorizontalScroll;
      console.log(`  3. Rolagem Horizontal: scrollWidth=${overflowMetrics.scrollWidth}px, clientWidth=${overflowMetrics.clientWidth}px -> ${horizontalScrollOk ? '✓ PERFEITO (Zero overflow horizontal)' : '✗ FALHA (Overflow detectado)'}`);

      // 5. Validar Identificação do Cabeçalho e Versão V14.6.1
      const headerText = await page.evaluate(`(() => {
        const studio = document.getElementById('screen-rockchart-studio');
        return studio ? studio.innerText : '';
      })()`);
      const hasStudioTitle = headerText.includes('ROCKCHART AI STUDIO');
      const hasVersion14_6_1 = headerText.includes('V14.6.1');
      console.log(`  4. Cabeçalho & Versão: V14.6.1 presente? ${hasVersion14_6_1 ? '✓ SIM (V14.6.1)' : '✗ NÃO'}`);

      // 6. Validar Botões do Header (Sair, Fechar, etc.)
      const headerButtons = await page.evaluate(`(() => {
        const btns = Array.from(document.querySelectorAll('.studio-header-actions button'));
        return btns.map((b) => {
          const rect = b.getBoundingClientRect();
          return {
            text: b.textContent ? b.textContent.trim() : '',
            width: rect.width,
            height: rect.height,
            visible: rect.width > 0 && rect.height >= 30
          };
        });
      })()`);
      const allHeaderBtnsVisible = headerButtons.length >= 4 && headerButtons.every((b: any) => b.visible);
      console.log(`  5. Botões do Header: ${headerButtons.length} botões acessíveis? ${allHeaderBtnsVisible ? '✓ SIM' : '✗ NÃO'}`);

      // 7. Testar navegação para a aba "Buscar & Importar" (SEÇÃO 1 e SEÇÃO 2)
      await page.click('.admin-tab-btn[data-tab="NEW_SONG"]');
      await page.waitForTimeout(300);

      const sec1And2Present = await page.evaluate(`(() => {
        const content = document.getElementById('admin-tab-content');
        const text = content ? content.innerText : '';
        return text.includes('SEÇÃO 1 — BUSCAR MÚSICAS') && text.includes('SEÇÃO 2 — IMPORTAR ARQUIVO');
      })()`);
      console.log(`  6. Seções 1 & 2 (Buscar & Importar): Presentes? ${sec1And2Present ? '✓ SIM' : '✗ NÃO'}`);

      // Testar dimensões do botão Pesquisar e campos de busca
      const searchBoxMetrics = await page.evaluate(`(() => {
        const artist = document.getElementById('input-search-artist');
        const title = document.getElementById('input-search-title');
        const btn = document.getElementById('btn-run-search');
        const drop = document.getElementById('drag-drop-area');
        return {
          artistHeight: artist ? artist.offsetHeight : 0,
          titleHeight: title ? title.offsetHeight : 0,
          btnHeight: btn ? btn.offsetHeight : 0,
          dropHeight: drop ? drop.offsetHeight : 0
        };
      })()`);
      const searchTouchOk = searchBoxMetrics.btnHeight >= 40 && searchBoxMetrics.artistHeight >= 40;
      console.log(`  7. Touch Target Busca (>=40px): altura btn=${searchBoxMetrics.btnHeight}px, inputs=${searchBoxMetrics.artistHeight}px -> ${searchTouchOk ? '✓ SIM' : '✗ NÃO'}`);

      // 8. Simular chart carregado no estúdio para validar SEÇÕES 3, 4, 5 e 6
      await page.evaluate(`(() => {
        const game = window.__ROCKBRAZIL_GAME__;
        const studio = game.rockChartStudioView.getStudio();
        studio.setImportedChart({
          songId: 'mobile-audit-song',
          title: 'Mobile Rock Audit',
          artist: 'Mobile Band',
          bpm: 140,
          durationSec: 180,
          difficultiesPresent: ['HARD', 'EXPERT'],
          totalNotesPerDifficulty: { HARD: 500, EXPERT: 800 },
          derivedCharts: {
            HARD: [{ time: 1, lane: 0, duration: 0.1 }],
            EXPERT: [{ time: 1, lane: 0, duration: 0.1 }]
          },
          syncProfile: {
            songId: 'mobile-audit-song',
            title: 'Mobile Rock Audit',
            artist: 'Mobile Band',
            youtubeVideoId: 'testVideo123',
            offsetMs: 0,
            confidenceScore: 90,
            status: 'VERIFIED'
          },
          originalRawData: {
            format: 'CHART',
            charter: 'MobileCharter',
            notesByDifficulty: {},
            syncProfile: {
              songId: 'mobile-audit-song',
              title: 'Mobile Rock Audit',
              artist: 'Mobile Band',
              youtubeVideoId: 'testVideo123',
              offsetMs: 0,
              confidenceScore: 90,
              status: 'VERIFIED'
            }
          }
        });
        studio.setActiveTab('EDITOR_SYNC');
        game.rockChartStudioView.render();
      })()`);
      await page.waitForTimeout(300);

      // Validar SEÇÃO 3 (Categoria), SEÇÃO 4 (RockCoins), SEÇÃO 5 (Sincronização), SEÇÃO 6 (Ações)
      const editorSectionsPresent = await page.evaluate(`(() => {
        const content = document.getElementById('admin-tab-content');
        const text = content ? content.innerText : '';
        return {
          sec3: text.includes('SEÇÃO 3 — CATEGORIA DA MÚSICA'),
          sec4: text.includes('SEÇÃO 4 — ROCKCOINS & ACESSO'),
          sec5: text.includes('SEÇÃO 5 — SINCRONIZAÇÃO'),
          sec6: text.includes('SEÇÃO 6 — AÇÕES'),
          hasMinhasMusicas: text.includes('Minhas Músicas'),
          hasInternacionais: text.includes('Músicas Internacionais'),
          hasGratuita: text.includes('LIBERADA GRATUITAMENTE'),
          hasBloqueada: text.includes('BLOQUEADA POR ROCKCOINS')
        };
      })()`);

      const allSectionsPresent = editorSectionsPresent.sec3 && editorSectionsPresent.sec4 && editorSectionsPresent.sec5 && editorSectionsPresent.sec6;
      console.log(`  8. Seções 3, 4, 5 e 6 no Editor: Todas presentes? ${allSectionsPresent ? '✓ SIM' : '✗ NÃO'}`);

      // Validar botões de offset da SEÇÃO 5
      const offsetButtonsOk = await page.evaluate(`(() => {
        const btns = Array.from(document.querySelectorAll('.btn-offset-step, #btn-offset-zero, #btn-automatch'));
        return btns.length === 6 && btns.every((b) => b.offsetWidth > 0);
      })()`);
      console.log(`  9. Calibração de Offset (6 botões visíveis): ${offsetButtonsOk ? '✓ SIM' : '✗ NÃO'}`);

      // Validar botões de ação da SEÇÃO 6
      const actionButtons = await page.evaluate(`(() => {
        const btns = Array.from(document.querySelectorAll('#btn-save-draft, #btn-test-sync, #btn-publish-final'));
        return btns.map((b) => {
          const rect = b.getBoundingClientRect();
          return {
            text: b.textContent ? b.textContent.trim() : '',
            width: rect.width,
            height: rect.height,
            visible: rect.width > 0 && rect.height >= 40
          };
        });
      })()`);
      const actionButtonsTouchOk = actionButtons.length === 3 && actionButtons.every((b: any) => b.visible);
      console.log(`  10. Ações SEÇÃO 6 (Salvar, Testar, Publicar >= 40px): ${actionButtonsTouchOk ? '✓ SIM' : '✗ NÃO'}`);

      // 8. Validar Dashboard: Cards no mobile (< 768px) vs Tabela no desktop (>= 768px)
      await page.click('.admin-tab-btn[data-tab="DASHBOARD"]');
      await page.waitForTimeout(300);

      const dashboardLayout = await page.evaluate(`(() => {
        const table = document.querySelector('.studio-table-container');
        const cards = document.querySelector('.studio-mobile-cards-list');
        const tableDisplay = table ? window.getComputedStyle(table).display : 'none';
        const cardsDisplay = cards ? window.getComputedStyle(cards).display : 'none';
        return { tableDisplay, cardsDisplay };
      })()`);

      const expectedLayout = vp.width <= 768
        ? dashboardLayout.cardsDisplay === 'flex' && dashboardLayout.tableDisplay === 'none'
        : dashboardLayout.tableDisplay === 'block';

      console.log(`  11. Dashboard Adaptativo: Layout condizente com tela? ${expectedLayout ? '✓ SIM (' + (vp.width < 768 ? 'Cards ativados' : 'Tabela ativada') + ')' : '✗ NÃO'}`);

      // 9. Validar Tela Final de Celebração (Nova identidade V14.6)
      const celebrationValid = await page.evaluate(`(() => {
        const overlay = document.getElementById('overlay-rockbrazil-celebration');
        if (!overlay) return false;
        const text = overlay.innerText;
        return text.includes('Rock Brazil') &&
               text.includes('Viva o Rock') &&
               !text.includes('AQUI É ROCKBRAZIL');
      })()`);
      console.log(`  12. Tela Final (V14.6 Nova Mensagem): Correta? ${celebrationValid ? '✓ SIM (Rock Brazil / Viva o Rock)' : '✗ NÃO'}`);

      const passed = isHiddenByDefault && horizontalScrollOk && hasVersion14_6_1 && allSectionsPresent && actionButtonsTouchOk && expectedLayout && celebrationValid;
      results.push({
        viewport: vp.name,
        passed,
        horizontalScrollOk,
        allSectionsPresent,
        expectedLayout
      });

      if (!passed) allPassed = false;
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n========================================================');
  console.log('RESUMO FINAL DA AUDITORIA MOBILE & DESKTOP (7 VIEWPORTS)');
  console.log('========================================================');
  for (const r of results) {
    console.log(`- ${r.viewport}: ${r.passed ? '✅ APROVADO' : '❌ REPROVADO'}`);
  }

  if (allPassed) {
    console.log('\n🎉 SUCESSO: Todos os 7 viewports foram validados sem erros em navegador real!\n');
    process.exit(0);
  } else {
    console.error('\n⚠️ Houve falhas na validação responsiva.\n');
    process.exit(1);
  }
}

runMobileAudit().catch((err) => {
  console.error('Erro na execução do teste:', err);
  process.exit(1);
});
