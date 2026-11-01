/**
 * RockBrazil — RockChartStudioView (Painel Administrativo V14.6.1)
 * 
 * Interface visual do painel exclusivo do administrador totalmente responsiva:
 * - Mobile-first para smartphones Android e iOS (320px, 360px, 390px, 412px)
 * - Layout fluido e adaptativo para tablets e desktops (768px, 1024px, 1440px)
 * - Cabeçalho canônico com identificação V14.6.1 e status do gestor
 * - Seções padronizadas conforme especificação oficial:
 *   • SEÇÃO 1 — BUSCAR MÚSICAS (Chorus Encore / RhythmVerse)
 *   • SEÇÃO 2 — IMPORTAR ARQUIVO (.chart, .mid, .sng, .zip)
 *   • SEÇÃO 3 — CATEGORIA (Minhas Músicas / Músicas Internacionais)
 *   • SEÇÃO 4 — ROCKCOINS (Gratuita vs Bloqueada com preço individual)
 *   • SEÇÃO 5 — SINCRONIZAÇÃO (YouTube, Offset, AutoMatch, Highway Preview)
 *   • SEÇÃO 6 — AÇÕES (Salvar rascunho, Testar partida, Aprovar e publicar, Despublicar)
 * - Dashboard com suporte duplo: Cards no celular e Tabela no desktop
 */

import { RockChartStudio, HighwayPreviewNote } from '../game/rockchart/studio/rockChartStudio';
import { ChartSearchResult, RockChartImportResult } from '../game/rockchart/types';
import { SongMetadata, Difficulty, Note } from '../types';
import { ManagedSong, ImportHistoryEntry } from '../game/catalog/persistentCatalogService';
import { AdminAuthService } from '../firebase/adminAuthService';
import { ProfileManager } from '../game/profileManager';
import { APP_VERSION, STUDIO_TITLE, STUDIO_VERSION_LABEL } from '../version';

export class RockChartStudioView {
  private container: HTMLElement;
  private studio = RockChartStudio.getInstance();

  public onExitRequested?: () => void;
  public onTestPlayRequested?: (song: SongMetadata, difficulty: Difficulty, notes: Note[]) => void;

  public getStudio(): RockChartStudio {
    return this.studio;
  }

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(): void {
    if (!this.studio.isAdminAuthenticated()) {
      this.renderAuthScreen();
      return;
    }
    this.renderStudioInterface();
  }

  // =========================================================================
  // TELA DE AUTENTICAÇÃO COM USUÁRIO E SENHA (FIREBASE AUTH)
  // =========================================================================
  private renderAuthScreen(): void {
    this.container.innerHTML = `
      <div class="studio-scroll-wrapper">
        <div class="rockchart-studio-auth-card" style="width: 100%; max-width: 420px; margin: 30px auto; padding: 24px 20px; background: rgba(15, 23, 42, 0.98); border: 1px solid rgba(255, 107, 0, 0.4); border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,0.85); color: #fff; box-sizing: border-box; font-family: system-ui, sans-serif;">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="font-size: 38px; margin-bottom: 6px;">🎸</div>
            <h2 style="color: #ff6b00; margin: 0 0 4px 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">${STUDIO_TITLE}</h2>
            <div style="display: inline-block; background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3); font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: bold; margin-bottom: 6px;">${STUDIO_VERSION_LABEL} OFICIAL</div>
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">Painel de Gestão e Curadoria Musical</p>
          </div>

          <form id="studio-login-form" autocomplete="off" onsubmit="return false;">
            <div style="margin-bottom: 14px;">
              <label style="display: block; font-size: 13px; font-weight: bold; color: #cbd5e1; margin-bottom: 6px;">Usuário:</label>
              <input type="text" id="studio-auth-username" class="studio-input" placeholder="Admin" required autocomplete="username" />
            </div>

            <div style="margin-bottom: 18px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <label style="font-size: 13px; font-weight: bold; color: #cbd5e1;">Senha:</label>
                <button type="button" id="btn-forgot-password" style="background: transparent; border: none; color: #38bdf8; font-size: 12px; cursor: pointer; text-decoration: underline; padding: 4px;">Esqueceu a senha?</button>
              </div>
              <input type="password" id="studio-auth-password" class="studio-input" placeholder="••••••••••••" required autocomplete="current-password" />
            </div>

            <div id="studio-auth-error" style="color: #ef4444; font-size: 13px; margin-bottom: 14px; display: none; padding: 10px 12px; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.25); border-radius: 8px; line-height: 1.4;"></div>
            <div id="studio-auth-info" style="color: #38bdf8; font-size: 13px; margin-bottom: 14px; display: none; padding: 10px 12px; background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.25); border-radius: 8px; line-height: 1.4;"></div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              <button type="submit" id="btn-studio-login" class="studio-touch-btn" style="background: linear-gradient(135deg, #ff6b00, #ea580c); color: #fff; border: none; font-weight: bold; font-size: 15px; box-shadow: 0 4px 14px rgba(255, 107, 0, 0.35);">
                ENTRAR NO ESTÚDIO
              </button>
              <button type="button" id="btn-studio-cancel" class="studio-touch-btn" style="background: transparent; color: #94a3b8; border: 1px solid #334155; font-size: 13px;">
                VOLTAR AO JOGO
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const form = this.container.querySelector('#studio-login-form') as HTMLFormElement;
    const usernameInput = this.container.querySelector('#studio-auth-username') as HTMLInputElement;
    const passwordInput = this.container.querySelector('#studio-auth-password') as HTMLInputElement;
    const btnLogin = this.container.querySelector('#btn-studio-login') as HTMLButtonElement;
    const btnCancel = this.container.querySelector('#btn-studio-cancel') as HTMLButtonElement;
    const btnForgot = this.container.querySelector('#btn-forgot-password') as HTMLButtonElement;
    const errorBox = this.container.querySelector('#studio-auth-error') as HTMLElement;
    const infoBox = this.container.querySelector('#studio-auth-info') as HTMLElement;

    const handleLogin = async () => {
      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      errorBox.style.display = 'none';
      infoBox.style.display = 'none';

      if (!username || !password) {
        errorBox.textContent = 'Preencha o usuário e a senha.';
        errorBox.style.display = 'block';
        return;
      }

      btnLogin.disabled = true;
      btnLogin.style.opacity = '0.7';
      btnLogin.textContent = 'VERIFICANDO...';

      try {
        const result = await AdminAuthService.signInWithCredentials(username, password);
        if (result.success && result.user) {
          await this.studio.authenticateAdmin(result.user);
          this.renderStudioInterface();
        } else {
          errorBox.textContent = result.error || 'Credenciais inválidas. Verifique seu usuário e senha.';
          errorBox.style.display = 'block';
          btnLogin.disabled = false;
          btnLogin.style.opacity = '1';
          btnLogin.textContent = 'ENTRAR NO ESTÚDIO';
        }
      } catch (err: any) {
        errorBox.textContent = `Erro ao autenticar: ${err.message || err}`;
        errorBox.style.display = 'block';
        btnLogin.disabled = false;
        btnLogin.style.opacity = '1';
        btnLogin.textContent = 'ENTRAR NO ESTÚDIO';
      }
    };

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLogin();
    });

    btnForgot?.addEventListener('click', async () => {
      const username = usernameInput.value.trim() || 'Admin';
      const ok = confirm(`Deseja enviar um link seguro de recuperação de senha para o e-mail da conta "${username}"?`);
      if (!ok) return;

      infoBox.textContent = 'Enviando e-mail de recuperação...';
      infoBox.style.display = 'block';
      errorBox.style.display = 'none';

      const resetResult = await AdminAuthService.sendPasswordReset(username);
      if (resetResult.success) {
        infoBox.textContent = `Link de recuperação enviado com sucesso para ${resetResult.emailSentTo}. Verifique sua caixa de entrada.`;
      } else {
        errorBox.textContent = resetResult.error || 'Não foi possível enviar o e-mail de recuperação.';
        errorBox.style.display = 'block';
        infoBox.style.display = 'none';
      }
    });

    btnCancel?.addEventListener('click', () => {
      this.onExitRequested?.();
    });
  }

  // =========================================================================
  // PAINEL ADMINISTRATIVO PRINCIPAL (COM ABAS E SEÇÕES PADRONIZADAS)
  // =========================================================================
  private renderStudioInterface(): void {
    const admin = this.studio.getCurrentAdmin();
    const session = this.studio.getSessionState();

    this.container.innerHTML = `
      <div class="studio-scroll-wrapper">
        <div class="rockchart-admin-container">
          <!-- CABEÇALHO CANÔNICO -->
          <div class="studio-header">
            <div class="studio-header-title-box">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-size: 22px;">🎸</span>
                <h2 style="color: #ff6b00; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">ROCKCHART AI STUDIO</h2>
                <span style="background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3); font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: bold; white-space: nowrap;">
                  ${STUDIO_VERSION_LABEL}
                </span>
              </div>
              <p style="color: #64748b; font-size: 12px; margin: 2px 0 0 0;">
                Gestor Musical • Usuário: <b style="color: #cbd5e1;">${admin?.email || 'Admin'}</b>
              </p>
            </div>
            <div class="studio-header-actions">
              <button id="btn-admin-change-pass" class="studio-touch-btn" style="background: #1e293b; color: #f59e0b; border: 1px solid #d97706; font-size: 12px; font-weight: 600;">
                🔑 Alterar Senha
              </button>
              <button id="btn-admin-export" class="studio-touch-btn" style="background: #1e293b; color: #38bdf8; border: 1px solid #0284c7; font-size: 12px; font-weight: 600;">
                📥 Exportar
              </button>
              <button id="btn-admin-logout" class="studio-touch-btn" style="background: #334155; color: #cbd5e1; border: none; font-size: 12px;">
                🚪 Sair
              </button>
              <button id="btn-admin-close" class="studio-touch-btn" style="background: #ef4444; color: #fff; border: none; font-size: 12px; font-weight: bold;">
                ✕ Voltar ao Jogo
              </button>
            </div>
          </div>

          <!-- Abas de Navegação Responsivas -->
          <div class="studio-nav-tabs">
            <button class="admin-tab-btn studio-tab-btn" data-tab="DASHBOARD" style="${session.activeTab === 'DASHBOARD' ? 'background: #ff6b00; color: #fff;' : 'background: #1e293b; color: #94a3b8;'}">
              📊 Catálogo Gerenciado
            </button>
            <button class="admin-tab-btn studio-tab-btn" data-tab="NEW_SONG" style="${session.activeTab === 'NEW_SONG' ? 'background: #ff6b00; color: #fff;' : 'background: #1e293b; color: #94a3b8;'}">
              ➕ Buscar & Importar
            </button>
            <button class="admin-tab-btn studio-tab-btn" data-tab="EDITOR_SYNC" style="${session.activeTab === 'EDITOR_SYNC' ? 'background: #ff6b00; color: #fff;' : 'background: #1e293b; color: #94a3b8;'}">
              ⚙️ Editor & Sincronia
            </button>
            <button class="admin-tab-btn studio-tab-btn" data-tab="HISTORY" style="${session.activeTab === 'HISTORY' ? 'background: #ff6b00; color: #fff;' : 'background: #1e293b; color: #94a3b8;'}">
              📜 Histórico & Logs
            </button>
          </div>

          <!-- Conteúdo da Aba Ativa -->
          <div id="admin-tab-content"></div>
        </div>
      </div>
    `;

    this.wireGlobalEvents();
    this.renderCurrentTabContent();
  }

  private wireGlobalEvents(): void {
    const btnClose = this.container.querySelector('#btn-admin-close') as HTMLButtonElement;
    const btnLogout = this.container.querySelector('#btn-admin-logout') as HTMLButtonElement;
    const btnExport = this.container.querySelector('#btn-admin-export') as HTMLButtonElement;
    const btnChangePass = this.container.querySelector('#btn-admin-change-pass') as HTMLButtonElement;

    btnChangePass?.addEventListener('click', async () => {
      const newPassword = prompt('Digite sua nova senha definitiva (mínimo 8 caracteres, com letras e números):');
      if (!newPassword) return;
      const confirmPassword = prompt('Confirme a nova senha:');
      if (newPassword !== confirmPassword) {
        alert('As senhas informadas não coincidem.');
        return;
      }
      const res = await AdminAuthService.changePassword(newPassword);
      if (res.success) {
        alert('Senha alterada com sucesso no Firebase Authentication!');
      } else {
        alert(res.error || 'Falha ao alterar senha.');
      }
    });

    btnClose?.addEventListener('click', () => this.onExitRequested?.());
    btnLogout?.addEventListener('click', () => {
      this.studio.logoutAdmin();
      this.render();
    });

    btnExport?.addEventListener('click', () => {
      const json = this.studio.exportCatalogBundle();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rockbrazil-catalog-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    this.container.querySelectorAll('.admin-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).dataset.tab as any;
        this.studio.setActiveTab(tab);
        this.renderStudioInterface();
      });
    });
  }

  private renderCurrentTabContent(): void {
    const tabContainer = this.container.querySelector('#admin-tab-content') as HTMLElement;
    if (!tabContainer) return;

    const session = this.studio.getSessionState();

    switch (session.activeTab) {
      case 'DASHBOARD':
        this.renderDashboardTab(tabContainer);
        break;
      case 'NEW_SONG':
        this.renderNewSongTab(tabContainer);
        break;
      case 'EDITOR_SYNC':
        this.renderEditorSyncTab(tabContainer);
        break;
      case 'HISTORY':
        this.renderHistoryTab(tabContainer);
        break;
    }
  }

  // =========================================================================
  // ABA 1: DASHBOARD DE MÚSICAS GERENCIADAS (COM SUPORTE MOBILE E DESKTOP)
  // =========================================================================
  private renderDashboardTab(container: HTMLElement): void {
    const songs = this.studio.listAllManagedSongs();
    const publishedCount = songs.filter((s) => s.status === 'PUBLISHED').length;
    const draftCount = songs.filter((s) => s.status === 'DRAFT').length;
    const unpublishedCount = songs.filter((s) => s.status === 'UNPUBLISHED').length;

    container.innerHTML = `
      <div>
        <!-- Cards de Métricas Responsivos -->
        <div class="studio-metrics-grid">
          <div style="background: rgba(30, 41, 59, 0.7); padding: 12px; border-radius: 8px; border: 1px solid #334155;">
            <div style="font-size: 11px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Total Gerenciadas</div>
            <div style="font-size: 22px; font-weight: 800; color: #38bdf8; margin-top: 2px;">${songs.length}</div>
          </div>
          <div style="background: rgba(30, 41, 59, 0.7); padding: 12px; border-radius: 8px; border: 1px solid #334155;">
            <div style="font-size: 11px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Publicadas</div>
            <div style="font-size: 22px; font-weight: 800; color: #22c55e; margin-top: 2px;">${publishedCount}</div>
          </div>
          <div style="background: rgba(30, 41, 59, 0.7); padding: 12px; border-radius: 8px; border: 1px solid #334155;">
            <div style="font-size: 11px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Rascunhos</div>
            <div style="font-size: 22px; font-weight: 800; color: #f59e0b; margin-top: 2px;">${draftCount}</div>
          </div>
          <div style="background: rgba(30, 41, 59, 0.7); padding: 12px; border-radius: 8px; border: 1px solid #334155;">
            <div style="font-size: 11px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">Suspensas</div>
            <div style="font-size: 22px; font-weight: 800; color: #94a3b8; margin-top: 2px;">${unpublishedCount}</div>
          </div>
        </div>

        <!-- Barra de Ações do Dashboard -->
        <div class="studio-dashboard-bar">
          <input type="text" id="dashboard-filter-input" class="studio-input" placeholder="Filtrar por título, artista ou charter..." style="flex: 1; max-width: 400px;" />
          <button id="btn-dashboard-new-song" class="studio-touch-btn" style="background: #ff6b00; color: #fff; border: none; font-weight: bold; font-size: 13px;">
            ➕ Cadastrar Nova Música
          </button>
        </div>

        <!-- Versão Desktop: Tabela com Overflow Horizontal Seguro -->
        <div class="studio-table-container">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; min-width: 720px;">
            <thead>
              <tr style="background: #1e293b; color: #cbd5e1; border-bottom: 1px solid #334155;">
                <th style="padding: 10px;">Faixa</th>
                <th style="padding: 10px;">Categoria</th>
                <th style="padding: 10px;">Preço</th>
                <th style="padding: 10px;">Charter / Fonte</th>
                <th style="padding: 10px;">Andamento</th>
                <th style="padding: 10px;">Dificuldades</th>
                <th style="padding: 10px;">Status</th>
                <th style="padding: 10px; text-align: right;">Ações</th>
              </tr>
            </thead>
            <tbody id="dashboard-table-body">
              ${songs.length === 0 ? `
                <tr>
                  <td colspan="8" style="padding: 24px; text-align: center; color: #64748b;">
                    Nenhuma música gerenciada ainda. Clique em <b>+ Cadastrar Nova Música</b> para buscar no Chorus Encore ou enviar um arquivo.
                  </td>
                </tr>
              ` : songs.map((s) => this.renderSongRow(s)).join('')}
            </tbody>
          </table>
        </div>

        <!-- Versão Mobile: Cards Verticais Otimizados para Celular -->
        <div id="dashboard-mobile-cards-list" class="studio-mobile-cards-list">
          ${songs.length === 0 ? `
            <div style="padding: 24px; text-align: center; color: #64748b; background: rgba(30, 41, 59, 0.5); border-radius: 8px;">
              Nenhuma música gerenciada ainda. Toque em <b>+ Cadastrar Nova Música</b> acima para começar.
            </div>
          ` : songs.map((s) => this.renderSongMobileCard(s)).join('')}
        </div>
      </div>
    `;

    // Eventos do Dashboard
    const btnNew = container.querySelector('#btn-dashboard-new-song') as HTMLButtonElement;
    btnNew?.addEventListener('click', () => {
      this.studio.setActiveTab('NEW_SONG');
      this.renderStudioInterface();
    });

    const filterInput = container.querySelector('#dashboard-filter-input') as HTMLInputElement;
    filterInput?.addEventListener('input', () => {
      const q = filterInput.value.toLowerCase().trim();
      const filtered = songs.filter((s) =>
        s.metadata.title.toLowerCase().includes(q) ||
        s.metadata.artist.toLowerCase().includes(q) ||
        s.charter.toLowerCase().includes(q)
      );

      // Atualiza tabela desktop
      const tbody = container.querySelector('#dashboard-table-body') as HTMLElement;
      if (tbody) {
        tbody.innerHTML = filtered.length === 0
          ? `<tr><td colspan="8" style="padding: 16px; text-align: center; color: #64748b;">Nenhuma música coincide com o filtro.</td></tr>`
          : filtered.map((s) => this.renderSongRow(s)).join('');
      }

      // Atualiza cards mobile
      const mobileList = container.querySelector('#dashboard-mobile-cards-list') as HTMLElement;
      if (mobileList) {
        mobileList.innerHTML = filtered.length === 0
          ? `<div style="padding: 16px; text-align: center; color: #64748b;">Nenhuma música coincide com o filtro.</div>`
          : filtered.map((s) => this.renderSongMobileCard(s)).join('');
      }

      this.wireDashboardRowEvents(container);
    });

    this.wireDashboardRowEvents(container);
  }

  private renderSongRow(s: ManagedSong): string {
    const statusColor = s.status === 'PUBLISHED' ? '#22c55e' : (s.status === 'DRAFT' ? '#f59e0b' : '#94a3b8');
    const statusLabel = s.status === 'PUBLISHED' ? 'PUBLICADA' : (s.status === 'DRAFT' ? 'RASCUNHO' : 'SUSPENSA');
    const isIntl = s.category === 'INTERNACIONAL' || s.metadata.isInternational;
    const categoryLabel = isIntl ? '🌍 Internacional' : '🇧🇷 Minhas Músicas';
    const isFree = s.isFree !== false;
    const priceLabel = isFree ? '🟢 Gratuita' : `🔒 ${s.unlockCost || 5} RC`;

    const diffBadges = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'].map((d) => {
      const count = (s.noteCounts as any)[d] || 0;
      return count > 0
        ? `<span style="font-size: 10px; padding: 2px 5px; border-radius: 3px; background: #334155; color: #38bdf8; font-weight: bold; margin-right: 2px;">${d[0]}:${count}</span>`
        : `<span style="font-size: 10px; padding: 2px 5px; border-radius: 3px; background: #1e293b; color: #64748b; margin-right: 2px;">${d[0]}:-</span>`;
    }).join('');

    return `
      <tr style="border-bottom: 1px solid #1e293b;" data-song-id="${s.songId}">
        <td style="padding: 10px;">
          <div style="font-weight: bold; color: #fff;">${s.metadata.title}</div>
          <div style="font-size: 12px; color: #94a3b8;">${s.metadata.artist}</div>
        </td>
        <td style="padding: 10px;">
          <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #1e293b; color: #38bdf8; border: 1px solid #334155; white-space: nowrap;">
            ${categoryLabel}
          </span>
        </td>
        <td style="padding: 10px;">
          <span style="font-size: 11px; font-weight: bold; color: ${isFree ? '#22c55e' : '#ffe600'}; background: ${isFree ? '#22c55e15' : '#eab30815'}; border: 1px solid ${isFree ? '#22c55e44' : '#eab30844'}; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">
            ${priceLabel}
          </span>
        </td>
        <td style="padding: 10px;">
          <div style="color: #cbd5e1;">${s.charter}</div>
          <div style="font-size: 11px; color: #64748b;">${s.sourceProvider}</div>
        </td>
        <td style="padding: 10px;">
          <div>${s.bpm} BPM</div>
          <div style="font-size: 11px; color: #64748b;">${Math.round(s.durationSec)}s | ${s.offsetMs}ms</div>
        </td>
        <td style="padding: 10px; white-space: nowrap;">${diffBadges}</td>
        <td style="padding: 10px;">
          <span style="font-size: 11px; font-weight: bold; color: ${statusColor}; border: 1px solid ${statusColor}44; background: ${statusColor}11; padding: 2px 6px; border-radius: 4px;">
            ${statusLabel}
          </span>
        </td>
        <td style="padding: 10px; text-align: right; white-space: nowrap;">
          <button class="btn-row-category studio-touch-btn" data-id="${s.songId}" title="Mudar Categoria" style="padding: 4px 8px; background: #334155; color: #38bdf8; border: 1px solid #475569; font-size: 11px; margin-right: 4px;">🔄 Cat</button>
          <button class="btn-row-pricing studio-touch-btn" data-id="${s.songId}" title="Mudar Preço" style="padding: 4px 8px; background: #334155; color: #ffe600; border: 1px solid #475569; font-size: 11px; margin-right: 4px;">🪙 Preço</button>
          <button class="btn-row-edit studio-touch-btn" data-id="${s.songId}" style="padding: 4px 8px; background: #0284c7; color: #fff; border: none; font-size: 11px; margin-right: 4px;">Editar</button>
          ${s.status === 'PUBLISHED'
            ? `<button class="btn-row-unpublish studio-touch-btn" data-id="${s.songId}" style="padding: 4px 8px; background: #475569; color: #fff; border: none; font-size: 11px; margin-right: 4px;">Despublicar</button>`
            : `<button class="btn-row-publish studio-touch-btn" data-id="${s.songId}" style="padding: 4px 8px; background: #16a34a; color: #fff; border: none; font-size: 11px; margin-right: 4px;">Publicar</button>`
          }
          <button class="btn-row-test studio-touch-btn" data-id="${s.songId}" style="padding: 4px 8px; background: #f59e0b; color: #000; border: none; font-size: 11px; font-weight: bold; margin-right: 4px;">Testar</button>
          <button class="btn-row-delete studio-touch-btn" data-id="${s.songId}" style="padding: 4px 8px; background: #ef4444; color: #fff; border: none; font-size: 11px;">Excluir</button>
        </td>
      </tr>
    `;
  }

  private renderSongMobileCard(s: ManagedSong): string {
    const statusColor = s.status === 'PUBLISHED' ? '#22c55e' : (s.status === 'DRAFT' ? '#f59e0b' : '#94a3b8');
    const statusLabel = s.status === 'PUBLISHED' ? 'PUBLICADA' : (s.status === 'DRAFT' ? 'RASCUNHO' : 'SUSPENSA');
    const isIntl = s.category === 'INTERNACIONAL' || s.metadata.isInternational;
    const categoryLabel = isIntl ? '🌍 Internacional' : '🇧🇷 Minhas Músicas';
    const isFree = s.isFree !== false;
    const priceLabel = isFree ? '🟢 Gratuita' : `🔒 ${s.unlockCost || 5} RC`;

    const diffBadges = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'].map((d) => {
      const count = (s.noteCounts as any)[d] || 0;
      return count > 0
        ? `<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #1e293b; color: #38bdf8; font-weight: bold; margin-right: 4px;">${d}: ${count}</span>`
        : '';
    }).filter(Boolean).join('');

    return `
      <div class="studio-song-mobile-card" data-song-id="${s.songId}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
          <div>
            <div style="font-size: 16px; font-weight: 800; color: #fff; line-height: 1.2;">${s.metadata.title}</div>
            <div style="font-size: 13px; color: #94a3b8; margin-top: 2px;">${s.metadata.artist}</div>
          </div>
          <span style="font-size: 11px; font-weight: bold; color: ${statusColor}; border: 1px solid ${statusColor}55; background: ${statusColor}15; padding: 3px 8px; border-radius: 6px; white-space: nowrap;">
            ${statusLabel}
          </span>
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;">
          <span style="font-size: 12px; padding: 3px 8px; border-radius: 4px; background: #1e293b; color: #38bdf8; border: 1px solid #334155;">
            ${categoryLabel}
          </span>
          <span style="font-size: 12px; font-weight: bold; color: ${isFree ? '#22c55e' : '#ffe600'}; background: ${isFree ? '#22c55e15' : '#eab30815'}; border: 1px solid ${isFree ? '#22c55e44' : '#eab30844'}; padding: 3px 8px; border-radius: 4px;">
            ${priceLabel}
          </span>
          <span style="font-size: 12px; color: #cbd5e1; padding: 3px 8px; background: #0f172a; border-radius: 4px;">
            ${s.bpm} BPM
          </span>
        </div>

        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 12px;">
          Charter: <b style="color: #cbd5e1;">${s.charter}</b> • Duração: <b>${Math.round(s.durationSec)}s</b>
          <div style="margin-top: 6px;">${diffBadges}</div>
        </div>

        <!-- Grade de Ações Mobile com Touch Targets >= 44x44 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding-top: 10px; border-top: 1px solid #334155;">
          <button class="btn-row-category studio-touch-btn" data-id="${s.songId}" style="background: #1e293b; color: #38bdf8; border: 1px solid #475569; font-size: 12px; font-weight: bold;">
            🔄 Mudar Cat
          </button>
          <button class="btn-row-pricing studio-touch-btn" data-id="${s.songId}" style="background: #1e293b; color: #ffe600; border: 1px solid #475569; font-size: 12px; font-weight: bold;">
            🪙 Preço RC
          </button>
          <button class="btn-row-edit studio-touch-btn" data-id="${s.songId}" style="background: #0284c7; color: #fff; border: none; font-size: 12px; font-weight: bold;">
            ✏️ Editar
          </button>
          <button class="btn-row-test studio-touch-btn" data-id="${s.songId}" style="background: #f59e0b; color: #000; border: none; font-size: 12px; font-weight: 900;">
            ▶️ Testar
          </button>
          ${s.status === 'PUBLISHED'
            ? `<button class="btn-row-unpublish studio-touch-btn" data-id="${s.songId}" style="background: #475569; color: #fff; border: none; font-size: 12px; font-weight: bold;">⏸️ Despublicar</button>`
            : `<button class="btn-row-publish studio-touch-btn" data-id="${s.songId}" style="background: #16a34a; color: #fff; border: none; font-size: 12px; font-weight: bold;">🚀 Publicar</button>`
          }
          <button class="btn-row-delete studio-touch-btn" data-id="${s.songId}" style="background: #ef4444; color: #fff; border: none; font-size: 12px; font-weight: bold;">
            🗑️ Excluir
          </button>
        </div>
      </div>
    `;
  }

  private wireDashboardRowEvents(container: HTMLElement): void {
    container.querySelectorAll('.btn-row-category').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const s = this.studio.getManagedSong(id);
        if (!s) return;
        const currentIsIntl = s.category === 'INTERNACIONAL' || s.metadata.isInternational;
        const newCategory = currentIsIntl ? 'MINHAS_MUSICAS' : 'INTERNACIONAL';
        this.studio.updateSongCategory(id, newCategory);
        this.renderStudioInterface();
      });
    });

    container.querySelectorAll('.btn-row-pricing').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const s = this.studio.getManagedSong(id);
        if (!s) return;
        const currentIsFree = s.isFree !== false;
        const currentCost = s.unlockCost || 5;
        const choice = prompt(
          `Configurar precificação para "${s.metadata.title}":\nDigite "0" para GRATUITA ou informe a quantidade de RockCoins para bloquear:`,
          currentIsFree ? '0' : currentCost.toString()
        );
        if (choice !== null) {
          const num = parseInt(choice.trim(), 10);
          if (isNaN(num) || num <= 0) {
            this.studio.updateSongPricing(id, true, 0);
          } else {
            this.studio.updateSongPricing(id, false, num);
          }
          this.renderStudioInterface();
        }
      });
    });

    container.querySelectorAll('.btn-row-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        this.studio.loadManagedSongForEditing(id);
        this.renderStudioInterface();
      });
    });

    container.querySelectorAll('.btn-row-publish').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const res = this.studio.publishToCatalog();
        alert(`Música "${res.metadata.title}" publicada com sucesso no catálogo oficial!`);
        this.renderStudioInterface();
      });
    });

    container.querySelectorAll('.btn-row-unpublish').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        if (confirm('Deseja realmente despublicar esta música? Ela será suspensa e não aparecerá para os jogadores.')) {
          this.studio.unpublishSong(id);
          this.renderStudioInterface();
        }
      });
    });

    container.querySelectorAll('.btn-row-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        if (confirm('ATENÇÃO: Deseja excluir permanentemente este chart e seus dados? Esta ação não pode ser desfeita.')) {
          this.studio.deleteSong(id);
          this.renderStudioInterface();
        }
      });
    });

    container.querySelectorAll('.btn-row-test').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        const song = this.studio.getManagedSong(id);
        if (!song) return;
        const beatmap = this.studio.getManagedBeatmap(id);
        const hardNotes = beatmap?.HARD || beatmap?.EXPERT || [];
        ProfileManager.getInstance().setAdminTestMode(true);
        this.onTestPlayRequested?.(song.metadata, 'HARD', hardNotes);
      });
    });
  }

  // =========================================================================
  // ABA 2: SEÇÃO 1 (BUSCAR MÚSICAS) & SEÇÃO 2 (IMPORTAR ARQUIVO)
  // =========================================================================
  private renderNewSongTab(container: HTMLElement): void {
    container.innerHTML = `
      <div>
        <!-- SEÇÃO 1 — BUSCAR MÚSICAS -->
        <div class="studio-section-card">
          <h3 class="studio-section-title">SEÇÃO 1 — BUSCAR MÚSICAS</h3>
          <p class="studio-section-desc">Pesquisa em repositórios da comunidade (Chorus Encore v2) com download direto do chart.</p>
          
          <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px;">
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <input type="text" id="input-search-artist" class="studio-input" placeholder="Artista (ex: Linkin Park)" style="flex: 1; min-width: 140px;" />
              <input type="text" id="input-search-title" class="studio-input" placeholder="Música (ex: Given Up)" style="flex: 1; min-width: 140px;" />
            </div>
            <button id="btn-run-search" class="studio-touch-btn" style="background: #0284c7; color: #fff; border: none; font-weight: bold; width: 100%;">
              🔍 PESQUISAR CHARTS
            </button>
          </div>
          <div id="search-feedback" style="font-size: 13px; color: #94a3b8; line-height: 1.4;"></div>

          <div id="search-results-box" style="margin-top: 14px; display: none;">
            <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #cbd5e1;">Charts Encontrados:</h4>
            <div id="search-results-table-container" style="max-height: 280px; overflow-y: auto; border: 1px solid #334155; border-radius: 8px;"></div>
          </div>
        </div>

        <!-- SEÇÃO 2 — IMPORTAR ARQUIVO -->
        <div class="studio-section-card">
          <h3 class="studio-section-title">SEÇÃO 2 — IMPORTAR ARQUIVO</h3>
          <p class="studio-section-desc">Envie arquivos suportados (.chart, .mid, .sng, .zip). O motor extrai BPM, notas e todas as dificuldades.</p>

          <div id="drag-drop-area" style="border: 2px dashed #475569; padding: 24px 16px; text-align: center; border-radius: 10px; background: rgba(15, 23, 42, 0.5); cursor: pointer; transition: border-color 0.2s; box-sizing: border-box;">
            <div style="font-size: 36px; margin-bottom: 8px;">📁</div>
            <div style="font-size: 15px; font-weight: bold; color: #cbd5e1; margin-bottom: 4px;">Toque para selecionar ou arraste o arquivo</div>
            <div style="font-size: 12px; color: #94a3b8;">Formatos suportados: .chart, .mid, .sng e .zip (até 50MB)</div>
            <input type="file" id="manual-file-input" accept=".sng,.chart,.mid,.midi,.zip,.ini" style="display: none;" />
          </div>

          <div id="upload-status" style="margin-top: 12px; font-size: 13px; line-height: 1.4;"></div>
        </div>
      </div>
    `;

    // Eventos de Busca
    const btnSearch = container.querySelector('#btn-run-search') as HTMLButtonElement;
    const artistIn = container.querySelector('#input-search-artist') as HTMLInputElement;
    const titleIn = container.querySelector('#input-search-title') as HTMLInputElement;
    const feedback = container.querySelector('#search-feedback') as HTMLElement;
    const resultsBox = container.querySelector('#search-results-box') as HTMLElement;
    const tableContainer = container.querySelector('#search-results-table-container') as HTMLElement;

    btnSearch?.addEventListener('click', async () => {
      const artist = artistIn.value.trim();
      const title = titleIn.value.trim();
      if (!artist && !title) {
        feedback.textContent = 'Informe o artista ou título da música.';
        return;
      }
      feedback.textContent = 'Consultando API do Chorus Encore e provedores parceiros...';
      try {
        const results = await this.studio.searchCharts(artist, title);
        if (results.length === 0) {
          feedback.innerHTML = `Nenhum chart retornado automaticamente. Você pode consultar no <a href="https://www.enchor.us/?search=${encodeURIComponent(artist + ' ' + title)}" target="_blank" style="color: #38bdf8;">Chorus Encore</a> ou no <a href="https://rhythmverse.co/songfiles/game?search=${encodeURIComponent(artist + ' ' + title)}" target="_blank" style="color: #38bdf8;">RhythmVerse</a> e enviar o arquivo na Seção 2 abaixo.`;
          resultsBox.style.display = 'none';
        } else {
          feedback.textContent = `${results.length} charts encontrados.`;
          resultsBox.style.display = 'block';

          tableContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; padding: 8px;">
              ${results.map((r, i) => `
                <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid #334155; border-radius: 8px; padding: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                  <div>
                    <div style="font-weight: bold; color: #fff; font-size: 14px;">${r.title}</div>
                    <div style="font-size: 12px; color: #94a3b8;">${r.artist} • Charter: <b style="color: #cbd5e1;">${r.charter}</b></div>
                    <div style="font-size: 11px; color: #38bdf8; margin-top: 2px;">Dificuldades: ${r.difficulties.join(', ')}</div>
                  </div>
                  <button class="btn-import-remote studio-touch-btn" data-idx="${i}" style="background: #16a34a; color: #fff; border: none; font-weight: bold; font-size: 12px; padding: 8px 14px;">
                    📥 Importar Chart
                  </button>
                </div>
              `).join('')}
            </div>
          `;

          tableContainer.querySelectorAll('.btn-import-remote').forEach((b) => {
            b.addEventListener('click', async (e) => {
              const idx = Number((e.currentTarget as HTMLElement).dataset.idx);
              const chart = results[idx];
              feedback.textContent = `Baixando e processando pacote de ${chart.charter}...`;
              try {
                await this.studio.downloadRemoteChart(chart);
                this.renderStudioInterface();
              } catch (err: any) {
                feedback.innerHTML = `<span style="color: #ef4444;">Erro no download do chart: ${err.message}</span>`;
              }
            });
          });
        }
      } catch (err: any) {
        feedback.innerHTML = `<span style="color: #ef4444;">Erro na pesquisa: ${err.message}</span>`;
      }
    });

    // Eventos de Drag & Drop e Upload
    const dropArea = container.querySelector('#drag-drop-area') as HTMLElement;
    const fileInput = container.querySelector('#manual-file-input') as HTMLInputElement;
    const uploadStatus = container.querySelector('#upload-status') as HTMLElement;

    dropArea?.addEventListener('click', () => fileInput?.click());
    dropArea?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropArea.style.borderColor = '#ff6b00';
    });
    dropArea?.addEventListener('dragleave', () => {
      dropArea.style.borderColor = '#475569';
    });
    dropArea?.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropArea.style.borderColor = '#475569';
      const file = e.dataTransfer?.files?.[0];
      if (file) this.processUploadedFile(file, uploadStatus);
    });

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) this.processUploadedFile(file, uploadStatus);
    });
  }

  private async processUploadedFile(file: File, statusEl: HTMLElement): Promise<void> {
    statusEl.innerHTML = `<span style="color: #38bdf8;">Processando arquivo ${file.name}...</span>`;
    try {
      const buffer = await file.arrayBuffer();
      const res = await this.studio.importFile(buffer, file.name);
      statusEl.innerHTML = `<span style="color: #22c55e;">Importado com sucesso! ${res.title} (${res.artist}) — ${res.difficultiesPresent.join(', ')}. Redirecionando para Seções 3-6...</span>`;
      setTimeout(() => {
        this.studio.setActiveTab('EDITOR_SYNC');
        this.renderStudioInterface();
      }, 700);
    } catch (err: any) {
      statusEl.innerHTML = `<span style="color: #ef4444;">Falha na importação: ${err.message}</span>`;
    }
  }

  // =========================================================================
  // ABA 3: SEÇÃO 3 (CATEGORIA), SEÇÃO 4 (ROCKCOINS), SEÇÃO 5 (SINCRONIZAÇÃO), SEÇÃO 6 (AÇÕES)
  // =========================================================================
  private renderEditorSyncTab(container: HTMLElement): void {
    const session = this.studio.getSessionState();
    const chart = session.importedChart;

    if (!chart) {
      container.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: #94a3b8; background: rgba(30, 41, 59, 0.5); border-radius: 10px; border: 1px solid #334155;">
          <div style="font-size: 38px; margin-bottom: 10px;">🔍</div>
          <h3 style="color: #cbd5e1; margin: 0 0 8px 0; font-size: 18px;">Nenhum chart carregado para edição</h3>
          <p style="margin: 0 0 20px 0; font-size: 13px; line-height: 1.5;">Selecione uma música existente no Dashboard ou importe um chart novo na aba Buscar & Importar.</p>
          <button id="btn-go-search" class="studio-touch-btn" style="background: #ff6b00; color: #fff; border: none; font-weight: bold; font-size: 14px;">
            Ir para Buscar & Importar
          </button>
        </div>
      `;
      container.querySelector('#btn-go-search')?.addEventListener('click', () => {
        this.studio.setActiveTab('NEW_SONG');
        this.renderStudioInterface();
      });
      return;
    }

    const managedEditing = session.editingSongId ? this.studio.getManagedSong(session.editingSongId) : null;
    const currentCategory = managedEditing?.category || 'MINHAS_MUSICAS';
    const isFree = managedEditing?.isFree !== undefined ? managedEditing.isFree : true;
    const unlockCost = managedEditing?.unlockCost !== undefined ? managedEditing.unlockCost : 5;

    const missingDiffs = this.studio.getMissingDifficulties(chart);
    const previewNotes = this.studio.generateHighwayPreviewData('HARD', 40);

    container.innerHTML = `
      <div>
        <div class="studio-editor-grid">
          <!-- Coluna 1: SEÇÃO 3 (Categoria) + SEÇÃO 4 (RockCoins) + Metadados -->
          <div>
            <!-- SEÇÃO 3 — CATEGORIA -->
            <div class="studio-section-card">
              <h3 class="studio-section-title">SEÇÃO 3 — CATEGORIA DA MÚSICA</h3>
              <p class="studio-section-desc">Seletor obrigatório que define a aba do catálogo onde a faixa será exibida aos jogadores.</p>
              
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #0f172a; border-radius: 8px; border: 1px solid #334155; cursor: pointer; min-height: 44px; box-sizing: border-box;">
                  <input type="radio" name="meta-category" value="MINHAS_MUSICAS" ${currentCategory !== 'INTERNACIONAL' ? 'checked' : ''} style="transform: scale(1.2);" />
                  <span style="font-size: 13px; font-weight: bold; color: #fff;">🇧🇷 Minhas Músicas</span>
                </label>
                <label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #0f172a; border-radius: 8px; border: 1px solid #334155; cursor: pointer; min-height: 44px; box-sizing: border-box;">
                  <input type="radio" name="meta-category" value="INTERNACIONAL" ${currentCategory === 'INTERNACIONAL' ? 'checked' : ''} style="transform: scale(1.2);" />
                  <span style="font-size: 13px; font-weight: bold; color: #fff;">🌍 Músicas Internacionais</span>
                </label>
              </div>
            </div>

            <!-- SEÇÃO 4 — ROCKCOINS -->
            <div class="studio-section-card">
              <h3 class="studio-section-title">SEÇÃO 4 — ROCKCOINS & ACESSO</h3>
              <p class="studio-section-desc">Configure se a música é gratuita para todos ou bloqueada por pagamento único com RockCoins.</p>

              <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
                <label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #0f172a; border-radius: 8px; border: 1px solid #334155; cursor: pointer; min-height: 44px; box-sizing: border-box;">
                  <input type="radio" name="meta-pricing-status" value="FREE" ${isFree ? 'checked' : ''} style="transform: scale(1.2);" />
                  <span style="font-size: 13px; font-weight: bold; color: #22c55e;">🟢 LIBERADA GRATUITAMENTE</span>
                </label>
                <label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #0f172a; border-radius: 8px; border: 1px solid #334155; cursor: pointer; min-height: 44px; box-sizing: border-box;">
                  <input type="radio" name="meta-pricing-status" value="LOCKED" ${!isFree ? 'checked' : ''} style="transform: scale(1.2);" />
                  <span style="font-size: 13px; font-weight: bold; color: #ffe600;">🔒 BLOQUEADA POR ROCKCOINS</span>
                </label>
              </div>

              <div id="price-input-container" style="display: ${isFree ? 'none' : 'flex'}; flex-direction: column; gap: 6px; padding: 12px; background: #0f172a; border-radius: 8px; border: 1px solid #eab30844;">
                <label style="font-size: 12px; font-weight: bold; color: #cbd5e1;">PREÇO DE DESBLOQUEIO:</label>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <input type="number" id="meta-unlock-cost" min="1" max="99999" value="${unlockCost || 5}" class="studio-input" style="max-width: 140px; color: #ffe600; font-weight: bold;" />
                  <span style="font-size: 13px; font-weight: bold; color: #ffe600;">RockCoins</span>
                </div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                  Desbloqueio definitivo e vitalício para o jogador que adquirir a faixa.
                </div>
              </div>
            </div>

            <!-- Metadados da Canção -->
            <div class="studio-section-card">
              <h3 class="studio-section-title" style="font-size: 14px; color: #94a3b8;">INFORMAÇÕES ADICIONAIS DO CHART</h3>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div>
                  <label style="display: block; font-size: 11px; font-weight: bold; color: #94a3b8; margin-bottom: 4px;">TÍTULO:</label>
                  <input type="text" id="meta-title" value="${chart.title}" class="studio-input" />
                </div>
                <div>
                  <label style="display: block; font-size: 11px; font-weight: bold; color: #94a3b8; margin-bottom: 4px;">ARTISTA:</label>
                  <input type="text" id="meta-artist" value="${chart.artist}" class="studio-input" />
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                  <div>
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #94a3b8; margin-bottom: 4px;">BPM:</label>
                    <input type="number" id="meta-bpm" value="${chart.bpm}" class="studio-input" />
                  </div>
                  <div>
                    <label style="display: block; font-size: 11px; font-weight: bold; color: #94a3b8; margin-bottom: 4px;">ANO:</label>
                    <input type="number" id="meta-year" value="2026" class="studio-input" />
                  </div>
                </div>
                <div>
                  <label style="display: block; font-size: 11px; font-weight: bold; color: #94a3b8; margin-bottom: 4px;">CHARTER / CRÉDITOS:</label>
                  <input type="text" id="meta-charter" value="${chart.originalRawData.charter || 'Comunidade'}" class="studio-input" />
                </div>
                <div>
                  <label style="display: block; font-size: 11px; font-weight: bold; color: #94a3b8; margin-bottom: 4px;">URL DA CAPA:</label>
                  <input type="text" id="meta-cover" value="${chart.originalRawData.metadata?.albumArtUrl || ''}" placeholder="https://..." class="studio-input" />
                </div>

                <!-- Dificuldades do Chart -->
                <div style="padding: 10px; background: #0f172a; border-radius: 8px; border: 1px solid #334155; font-size: 12px; margin-top: 6px;">
                  <div style="font-weight: bold; color: #cbd5e1; margin-bottom: 6px;">Dificuldades Presentes no Chart:</div>
                  <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px;">
                    ${chart.difficultiesPresent.map((d) => `<span style="background: #22c55e22; color: #22c55e; border: 1px solid #22c55e44; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">${d} (${chart.totalNotesPerDifficulty[d]})</span>`).join('')}
                  </div>
                  ${missingDiffs.length > 0 ? `<div style="color: #f59e0b; font-size: 11px;">⚠️ Dificuldades não criadas pelo charter: <b>${missingDiffs.join(', ')}</b> (o motor não inventa notas artificiais).</div>` : `<div style="color: #22c55e; font-size: 11px;">✓ Chart completo com todas as 4 dificuldades (EMHX).</div>`}
                </div>
              </div>
            </div>
          </div>

          <!-- Coluna 2: SEÇÃO 5 (Sincronização) + SEÇÃO 6 (Ações) -->
          <div>
            <!-- SEÇÃO 5 — SINCRONIZAÇÃO -->
            <div class="studio-section-card">
              <h3 class="studio-section-title">SEÇÃO 5 — SINCRONIZAÇÃO</h3>
              <p class="studio-section-desc">Vincule a gravação oficial do YouTube e calibre o offset musical milissegundo a milissegundo.</p>

              <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 11px; font-weight: bold; color: #94a3b8; margin-bottom: 4px;">LINK OU ID DO YOUTUBE:</label>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <input type="text" id="sync-yt-id" value="${session.youtubeVideoId || ''}" placeholder="Ex: D93vYwuMeUw ou https://youtube.com/..." class="studio-input" style="flex: 1; min-width: 160px;" />
                  <button id="btn-check-yt" class="studio-touch-btn" style="background: #0284c7; color: #fff; border: none; font-weight: bold; font-size: 13px;">
                    Carregar
                  </button>
                </div>
              </div>

              <!-- Mismatch / Duração -->
              <div id="mismatch-feedback-box" style="margin-bottom: 12px; font-size: 12px;">
                ${session.durationAnalysis ? this.renderMismatchHtml(session.durationAnalysis) : `<div style="color: #64748b;">Informe o vídeo do YouTube para diagnosticar compatibilidade de versão.</div>`}
              </div>

              <!-- Offset de Sincronia Responsivo -->
              <div style="padding: 12px; background: #0f172a; border-radius: 8px; border: 1px solid #334155; margin-bottom: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <span style="font-size: 12px; font-weight: bold; color: #cbd5e1;">OFFSET DE SINCRONIA:</span>
                  <span id="label-offset-display" style="font-size: 20px; font-weight: 800; color: #ff6b00;">${session.configuredOffsetMs}ms</span>
                </div>
                <!-- Grade 3x2 responsiva de controles de offset -->
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                  <button class="btn-offset-step studio-touch-btn" data-delta="-100" style="background: #1e293b; color: #cbd5e1; border: 1px solid #475569; font-size: 12px;">-100ms</button>
                  <button class="btn-offset-step studio-touch-btn" data-delta="-25" style="background: #1e293b; color: #cbd5e1; border: 1px solid #475569; font-size: 12px;">-25ms</button>
                  <button id="btn-offset-zero" class="studio-touch-btn" style="background: #334155; color: #fff; border: 1px solid #64748b; font-size: 12px;">0ms</button>
                  <button class="btn-offset-step studio-touch-btn" data-delta="25" style="background: #1e293b; color: #cbd5e1; border: 1px solid #475569; font-size: 12px;">+25ms</button>
                  <button class="btn-offset-step studio-touch-btn" data-delta="100" style="background: #1e293b; color: #cbd5e1; border: 1px solid #475569; font-size: 12px;">+100ms</button>
                  <button id="btn-automatch" class="studio-touch-btn" style="background: #16a34a; color: #fff; border: none; font-size: 12px; font-weight: bold;">⚡ AutoMatch</button>
                </div>
              </div>

              <!-- Mini Highway Preview das 5 Pistas -->
              <div style="display: flex; flex-direction: column;">
                <div style="font-size: 11px; font-weight: bold; color: #94a3b8; margin-bottom: 4px;">PRÉVIA VISUAL DAS 5 PISTAS (PRIMEIRAS NOTAS):</div>
                <div style="height: 80px; width: 100%; background: #000; border-radius: 8px; border: 1px solid #334155; position: relative; overflow: hidden; display: flex; box-sizing: border-box;">
                  ${this.renderMiniHighway(previewNotes)}
                </div>
              </div>
            </div>

            <!-- SEÇÃO 6 — AÇÕES -->
            <div class="studio-section-card" style="border-color: rgba(255, 107, 0, 0.4);">
              <h3 class="studio-section-title" style="color: #ff6b00;">SEÇÃO 6 — AÇÕES</h3>
              <p class="studio-section-desc">Salve rascunhos, teste partidas sem gastar moedas e publique de forma persistente.</p>

              <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="btn-save-draft" class="studio-touch-btn" style="background: #334155; color: #f59e0b; border: 1px solid #f59e0b; font-weight: bold; font-size: 14px; width: 100%;">
                  💾 Salvar Rascunho
                </button>
                <button id="btn-test-sync" class="studio-touch-btn" style="background: #f59e0b; color: #000; border: none; font-weight: 900; font-size: 14px; width: 100%;">
                  ▶️ Testar Partida no Jogo (Modo Admin)
                </button>
                <button id="btn-publish-final" class="studio-touch-btn" style="background: linear-gradient(135deg, #16a34a, #15803d); color: #fff; border: none; font-weight: 800; font-size: 15px; width: 100%; box-shadow: 0 4px 14px rgba(22, 163, 74, 0.4);">
                  🚀 APROVAR E PUBLICAR NO JOGO
                </button>
                ${managedEditing?.status === 'PUBLISHED' ? `
                  <button id="btn-unpublish-editor" class="studio-touch-btn" style="background: #475569; color: #cbd5e1; border: 1px solid #64748b; font-size: 13px; width: 100%;">
                    ⏸️ Despublicar do Catálogo
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.wireEditorEvents(container);
  }

  private renderMismatchHtml(a: any): string {
    if (a.status === 'STRUCTURAL_MISMATCH_SUSPECTED') {
      return `
        <div style="padding: 8px 10px; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; color: #fca5a5;">
          <b>⚠️ Alerta de Incompatibilidade de Versão:</b><br>
          ${a.message}
        </div>
      `;
    }
    if (a.status === 'DURATION_MATCH_CONFIRMED') {
      return `
        <div style="padding: 8px 10px; background: rgba(34, 197, 94, 0.15); border: 1px solid #22c55e; border-radius: 6px; color: #86efac;">
          <b>✓ Versão Confirmada:</b> ${a.message}
        </div>
      `;
    }
    return `<div style="color: #64748b;">${a.message}</div>`;
  }

  private renderMiniHighway(notes: HighwayPreviewNote[]): string {
    const laneColors = ['#22c55e', '#ef4444', '#eab308', '#3b82f6', '#f97316'];
    const maxT = notes.length > 0 ? notes[notes.length - 1].time : 10;
    const minT = notes.length > 0 ? notes[0].time : 0;
    const range = Math.max(1, maxT - minT);

    const laneColumns = [0, 1, 2, 3, 4].map((lane) => {
      const laneNotes = notes.filter((n) => n.lane === lane);
      return `
        <div style="flex: 1; border-right: 1px solid rgba(255,255,255,0.06); position: relative; height: 100%;">
          ${laneNotes.map((n) => {
            const leftPct = ((n.time - minT) / range) * 85 + 5;
            return `
              <div style="position: absolute; left: ${leftPct}%; top: 38%; width: 8px; height: 14px; background: ${laneColors[lane]}; border-radius: 2px; box-shadow: 0 0 4px ${laneColors[lane]};"></div>
            `;
          }).join('')}
        </div>
      `;
    }).join('');

    return laneColumns;
  }

  private wireEditorEvents(container: HTMLElement): void {
    const ytIn = container.querySelector('#sync-yt-id') as HTMLInputElement;
    const btnCheckYt = container.querySelector('#btn-check-yt') as HTMLButtonElement;
    const offsetDisplay = container.querySelector('#label-offset-display') as HTMLElement;
    const btnAutoMatch = container.querySelector('#btn-automatch') as HTMLButtonElement;
    const btnZero = container.querySelector('#btn-offset-zero') as HTMLButtonElement;
    const btnSaveDraft = container.querySelector('#btn-save-draft') as HTMLButtonElement;
    const btnTestSync = container.querySelector('#btn-test-sync') as HTMLButtonElement;
    const btnPublish = container.querySelector('#btn-publish-final') as HTMLButtonElement;
    const btnUnpublish = container.querySelector('#btn-unpublish-editor') as HTMLButtonElement;

    btnCheckYt?.addEventListener('click', () => {
      const val = ytIn.value.trim();
      if (!val) return;
      try {
        const res = this.studio.configureYouTubeAudio(val);
        const box = container.querySelector('#mismatch-feedback-box');
        if (box) box.innerHTML = this.renderMismatchHtml(res);
        offsetDisplay.textContent = `${this.studio.getSessionState().configuredOffsetMs}ms`;
      } catch (err: any) {
        alert(err.message);
      }
    });

    container.querySelectorAll('.btn-offset-step').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const delta = Number((e.currentTarget as HTMLElement).dataset.delta);
        const newOffset = this.studio.adjustOffset(delta);
        offsetDisplay.textContent = `${newOffset}ms`;
      });
    });

    btnZero?.addEventListener('click', () => {
      this.studio.setManualOffset(0);
      offsetDisplay.textContent = `0ms`;
    });

    btnAutoMatch?.addEventListener('click', () => {
      const val = ytIn.value.trim();
      if (!val) {
        alert('Informe o ID ou link do YouTube primeiro.');
        return;
      }
      try {
        const profile = this.studio.associateYouTubeVideo(val);
        offsetDisplay.textContent = `${profile.offsetMs}ms`;
        alert(`AutoMatch calculou offset de ${profile.offsetMs}ms (Confiança: ${profile.confidenceScore}%).`);
      } catch (err: any) {
        alert(`Erro no AutoMatch: ${err.message}`);
      }
    });

    container.querySelectorAll('input[name="meta-pricing-status"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const val = (e.target as HTMLInputElement).value;
        const priceBox = container.querySelector('#price-input-container') as HTMLElement;
        if (priceBox) {
          priceBox.style.display = val === 'LOCKED' ? 'flex' : 'none';
        }
      });
    });

    const collectMetadata = (): Partial<SongMetadata> => {
      const category = (container.querySelector('input[name="meta-category"]:checked') as HTMLInputElement)?.value as ('MINHAS_MUSICAS' | 'INTERNACIONAL') || 'MINHAS_MUSICAS';
      const isFree = (container.querySelector('input[name="meta-pricing-status"]:checked') as HTMLInputElement)?.value !== 'LOCKED';
      const unlockCost = isFree ? 0 : (Number((container.querySelector('#meta-unlock-cost') as HTMLInputElement)?.value) || 5);
      return {
        title: (container.querySelector('#meta-title') as HTMLInputElement)?.value.trim(),
        artist: (container.querySelector('#meta-artist') as HTMLInputElement)?.value.trim(),
        bpm: Number((container.querySelector('#meta-bpm') as HTMLInputElement)?.value) || 120,
        year: Number((container.querySelector('#meta-year') as HTMLInputElement)?.value) || 2026,
        charter: (container.querySelector('#meta-charter') as HTMLInputElement)?.value.trim(),
        coverUrl: (container.querySelector('#meta-cover') as HTMLInputElement)?.value.trim(),
        category,
        isInternational: category === 'INTERNACIONAL',
        isFree,
        unlockCost
      };
    };

    btnSaveDraft?.addEventListener('click', () => {
      try {
        const meta = collectMetadata();
        const saved = this.studio.saveCurrentAsDraft(meta);
        alert(`Rascunho de "${saved.metadata.title}" salvo com sucesso!`);
      } catch (err: any) {
        alert(`Erro ao salvar rascunho: ${err.message}`);
      }
    });

    btnTestSync?.addEventListener('click', () => {
      const session = this.studio.getSessionState();
      if (!session.importedChart) return;
      const meta = collectMetadata();
      const song: SongMetadata = {
        id: session.importedChart.songId,
        title: meta.title || session.importedChart.title,
        artist: meta.artist || session.importedChart.artist,
        duration: Math.round(session.importedChart.durationSec),
        bpm: meta.bpm || session.importedChart.bpm,
        style: '🎸 RockBrazil Admin Preview',
        type: session.youtubeVideoId ? 'youtube' : 'procedural',
        youtubeVideoId: session.youtubeVideoId || undefined,
        category: meta.category,
        isInternational: meta.isInternational,
        isFree: meta.isFree,
        unlockCost: meta.unlockCost,
        isAvailable: true,
        records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
      };
      const notes = session.importedChart.derivedCharts.HARD || session.importedChart.derivedCharts.EXPERT || [];
      ProfileManager.getInstance().setAdminTestMode(true);
      this.onTestPlayRequested?.(song, 'HARD', notes);
    });

    btnPublish?.addEventListener('click', () => {
      try {
        const meta = collectMetadata();
        const published = this.studio.publishToCatalog(meta);
        alert(`Música "${published.metadata.title}" publicada com sucesso no catálogo oficial do RockBrazil! Ela já está disponível para todos os jogadores.`);
        this.studio.setActiveTab('DASHBOARD');
        this.renderStudioInterface();
      } catch (err: any) {
        alert(`Erro na publicação: ${err.message}`);
      }
    });

    btnUnpublish?.addEventListener('click', () => {
      const session = this.studio.getSessionState();
      if (!session.editingSongId) return;
      if (confirm('Deseja realmente despublicar esta música? Ela será suspensa do catálogo dos jogadores.')) {
        this.studio.unpublishSong(session.editingSongId);
        alert('Música despublicada com sucesso.');
        this.studio.setActiveTab('DASHBOARD');
        this.renderStudioInterface();
      }
    });
  }

  // =========================================================================
  // ABA 4: HISTÓRICO & AUDITORIA DE LOGS
  // =========================================================================
  private renderHistoryTab(container: HTMLElement): void {
    const history = this.studio.getImportHistory();

    container.innerHTML = `
      <div>
        <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #38bdf8;">Histórico de Importações e Auditoria</h3>
        <p style="color: #94a3b8; font-size: 12px; margin: 0 0 16px 0;">Registro cronológico e imutável de todas as ações administrativas realizadas no estúdio.</p>

        <!-- Versão Desktop: Tabela -->
        <div class="studio-table-container">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; min-width: 600px;">
            <thead>
              <tr style="background: #1e293b; color: #cbd5e1; border-bottom: 1px solid #334155;">
                <th style="padding: 10px;">Data/Hora</th>
                <th style="padding: 10px;">Ação</th>
                <th style="padding: 10px;">Música</th>
                <th style="padding: 10px;">Charter / Fonte</th>
                <th style="padding: 10px;">Detalhes</th>
                <th style="padding: 10px;">Usuário</th>
              </tr>
            </thead>
            <tbody>
              ${history.length === 0 ? `
                <tr><td colspan="6" style="padding: 20px; text-align: center; color: #64748b;">Nenhuma ação registrada no histórico recente.</td></tr>
              ` : history.map((h) => `
                <tr style="border-bottom: 1px solid #1e293b;">
                  <td style="padding: 8px; color: #64748b; white-space: nowrap;">${new Date(h.timestamp).toLocaleString()}</td>
                  <td style="padding: 8px;"><b>${h.action}</b></td>
                  <td style="padding: 8px; color: #fff;">${h.songTitle}</td>
                  <td style="padding: 8px; color: #94a3b8;">${h.charter} (${h.source})</td>
                  <td style="padding: 8px; color: #cbd5e1;">${h.details}</td>
                  <td style="padding: 8px; color: #38bdf8;">${h.user}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Versão Mobile: Cards -->
        <div class="studio-mobile-cards-list">
          ${history.length === 0 ? `
            <div style="padding: 16px; text-align: center; color: #64748b; background: rgba(30, 41, 59, 0.5); border-radius: 8px;">
              Nenhuma ação registrada no histórico recente.
            </div>
          ` : history.map((h) => `
            <div style="background: rgba(30, 41, 59, 0.8); border: 1px solid #334155; border-radius: 8px; padding: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <b style="color: #38bdf8; font-size: 13px;">${h.action}</b>
                <span style="font-size: 11px; color: #64748b;">${new Date(h.timestamp).toLocaleTimeString()}</span>
              </div>
              <div style="font-weight: bold; color: #fff; font-size: 14px;">${h.songTitle}</div>
              <div style="font-size: 12px; color: #94a3b8; margin: 2px 0 6px 0;">Charter: ${h.charter} (${h.source})</div>
              <div style="font-size: 12px; color: #cbd5e1; background: #0f172a; padding: 6px 8px; border-radius: 4px;">${h.details}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}
