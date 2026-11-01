import { RockChartStudio } from '../game/rockchart/studio/rockChartStudio';
import { ChartSearchResult, RockChartImportResult, RockChartValidationReport } from '../game/rockchart/types';
import { SongMetadata, Difficulty, Note } from '../types';

export class RockChartStudioView {
  private container: HTMLElement;
  private studio = RockChartStudio.getInstance();

  public onExitRequested?: () => void;
  public onTestPlayRequested?: (song: SongMetadata, difficulty: Difficulty, notes: Note[]) => void;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(): void {
    const isAuthed = this.studio.isAdminAuthenticated();

    if (!isAuthed) {
      this.renderAuthScreen();
      return;
    }

    this.renderStudioInterface();
  }

  private renderAuthScreen(): void {
    this.container.innerHTML = `
      <div class="rockchart-studio-auth-container" style="max-width: 520px; margin: 40px auto; padding: 28px; background: rgba(18, 20, 29, 0.96); border: 1px solid rgba(255, 107, 0, 0.4); border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); color: #fff; font-family: system-ui, sans-serif;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #ff6b00; margin: 0 0 8px 0; font-size: 24px; letter-spacing: 1px;">ROCKCHART AI STUDIO</h2>
          <p style="color: #94a3b8; font-size: 13px; margin: 0;">Área Exclusiva de Administração e Curadoria Oficial de Charts</p>
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: block; font-size: 13px; color: #cbd5e1; margin-bottom: 6px;">E-mail do Administrador:</label>
          <input type="email" id="studio-admin-email" placeholder="admin@daviidalmeida.com" style="width: 100%; box-sizing: border-box; padding: 10px 14px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; color: #fff; font-size: 14px;" />
        </div>

        <div style="margin-bottom: 24px;">
          <label style="display: block; font-size: 13px; color: #cbd5e1; margin-bottom: 6px;">Chave de Acesso / Token de Autenticação:</label>
          <input type="password" id="studio-admin-token" placeholder="Insira seu token administrativo" style="width: 100%; box-sizing: border-box; padding: 10px 14px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; color: #fff; font-size: 14px;" />
        </div>

        <div id="studio-auth-error" style="color: #ef4444; font-size: 13px; margin-bottom: 16px; display: none;"></div>

        <div style="display: flex; gap: 12px;">
          <button id="btn-studio-login" style="flex: 1; padding: 12px; background: #ff6b00; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; transition: background 0.2s;">
            ACESSAR STUDIO
          </button>
          <button id="btn-studio-cancel" style="padding: 12px 20px; background: #334155; color: #cbd5e1; border: none; border-radius: 6px; cursor: pointer;">
            VOLTAR
          </button>
        </div>
      </div>
    `;

    const btnLogin = this.container.querySelector('#btn-studio-login') as HTMLButtonElement;
    const btnCancel = this.container.querySelector('#btn-studio-cancel') as HTMLButtonElement;
    const emailInput = this.container.querySelector('#studio-admin-email') as HTMLInputElement;
    const tokenInput = this.container.querySelector('#studio-admin-token') as HTMLInputElement;
    const errorMsg = this.container.querySelector('#studio-auth-error') as HTMLElement;

    btnLogin?.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      const token = tokenInput.value.trim();
      const success = await this.studio.authenticateAdmin({ email, token });
      if (success) {
        this.renderStudioInterface();
      } else {
        errorMsg.textContent = 'Acesso não autorizado. Verifique suas credenciais de administrador.';
        errorMsg.style.display = 'block';
      }
    });

    btnCancel?.addEventListener('click', () => {
      this.onExitRequested?.();
    });
  }

  private renderStudioInterface(): void {
    const session = this.studio.getSessionState();

    this.container.innerHTML = `
      <div class="rockchart-studio-dashboard" style="max-width: 980px; margin: 20px auto; padding: 24px; background: rgba(15, 23, 42, 0.98); border: 1px solid #334155; border-radius: 12px; color: #fff; font-family: system-ui, sans-serif;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 20px;">
          <div>
            <h2 style="color: #ff6b00; margin: 0; font-size: 22px;">ROCKCHART AI STUDIO V14.0</h2>
            <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Chorus Encore + RhythmVerse + RockSync AutoMatch</p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button id="btn-studio-logout" style="padding: 6px 14px; background: #334155; color: #cbd5e1; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">Sair</button>
            <button id="btn-studio-close" style="padding: 6px 14px; background: #ef4444; color: #fff; border: none; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer;">Fechar</button>
          </div>
        </div>

        <!-- Seção 1: Pesquisa em Provedores -->
        <div style="background: rgba(30, 41, 59, 0.6); padding: 18px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 12px 0; font-size: 15px; color: #38bdf8;">1. Pesquisa nos Provedores Externos (Chorus Encore & RhythmVerse)</h3>
          <div style="display: flex; gap: 12px; margin-bottom: 12px;">
            <input type="text" id="studio-search-artist" placeholder="Artista (ex: Guns N' Roses)" style="flex: 1; padding: 10px; background: #0f172a; border: 1px solid #475569; border-radius: 6px; color: #fff;" />
            <input type="text" id="studio-search-title" placeholder="Música (ex: Welcome to the Jungle)" style="flex: 1; padding: 10px; background: #0f172a; border: 1px solid #475569; border-radius: 6px; color: #fff;" />
            <button id="btn-studio-search" style="padding: 10px 20px; background: #0284c7; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">PESQUISAR</button>
          </div>
          <div id="studio-search-feedback" style="font-size: 12px; color: #94a3b8;"></div>
        </div>

        <!-- Seção 2: Resultados da Busca -->
        <div id="studio-results-section" style="background: rgba(30, 41, 59, 0.6); padding: 18px; border-radius: 8px; margin-bottom: 20px; display: none;">
          <h3 style="margin: 0 0 12px 0; font-size: 15px; color: #38bdf8;">Resultados Encontrados</h3>
          <div id="studio-results-table-container" style="max-height: 220px; overflow-y: auto;"></div>
        </div>

        <!-- Seção 3: Importador Universal de Arquivos -->
        <div style="background: rgba(30, 41, 59, 0.6); padding: 18px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 8px 0; font-size: 15px; color: #38bdf8;">2. Importação Direta (.chart, .mid, .ini, .zip)</h3>
          <p style="color: #94a3b8; font-size: 12px; margin: 0 0 12px 0;">Importe arquivos obtidos legitimamente das fontes especializadas com preservação integral do chart original.</p>
          <input type="file" id="studio-file-picker" accept=".chart,.mid,.midi,.ini,.zip,.sng" style="color: #cbd5e1; font-size: 13px;" />
          <div id="studio-import-status" style="margin-top: 8px; font-size: 13px; color: #10b981;"></div>
        </div>

        <!-- Seção 4: Associação com YouTube e RockSync -->
        <div style="background: rgba(30, 41, 59, 0.6); padding: 18px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 12px 0; font-size: 15px; color: #38bdf8;">3. RockSync: Associação de Vídeo do YouTube & Calibração</h3>
          <div style="display: flex; gap: 12px; margin-bottom: 12px;">
            <input type="text" id="studio-youtube-id" placeholder="ID do vídeo do YouTube (ex: o1tj2zJ2Wvg)" value="${session.youtubeVideoId || ''}" style="flex: 2; padding: 10px; background: #0f172a; border: 1px solid #475569; border-radius: 6px; color: #fff;" />
            <button id="btn-studio-automatch" style="padding: 10px 20px; background: #16a34a; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">CALIBRAR SINCRONIA</button>
          </div>
          <div id="studio-sync-report" style="font-size: 13px; color: #cbd5e1;"></div>
        </div>

        <!-- Seção 5: Auditoria e Publicação -->
        <div style="background: rgba(30, 41, 59, 0.6); padding: 18px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div id="studio-validation-summary" style="font-size: 13px; color: #e2e8f0;">
            Selecione ou importe um chart para iniciar a validação.
          </div>
          <div style="display: flex; gap: 10px;">
            <button id="btn-studio-preview" style="padding: 10px 18px; background: #f59e0b; color: #000; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">TESTAR PARTIDA</button>
            <button id="btn-studio-approve" style="padding: 10px 18px; background: #059669; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">APROVAR E PUBLICAR</button>
          </div>
        </div>
      </div>
    `;

    this.wireStudioEvents();
  }

  private wireStudioEvents(): void {
    const btnClose = this.container.querySelector('#btn-studio-close') as HTMLButtonElement;
    const btnLogout = this.container.querySelector('#btn-studio-logout') as HTMLButtonElement;
    const btnSearch = this.container.querySelector('#btn-studio-search') as HTMLButtonElement;
    const artistInput = this.container.querySelector('#studio-search-artist') as HTMLInputElement;
    const titleInput = this.container.querySelector('#studio-search-title') as HTMLInputElement;
    const feedback = this.container.querySelector('#studio-search-feedback') as HTMLElement;
    const resultsSection = this.container.querySelector('#studio-results-section') as HTMLElement;
    const tableContainer = this.container.querySelector('#studio-results-table-container') as HTMLElement;
    const filePicker = this.container.querySelector('#studio-file-picker') as HTMLInputElement;
    const importStatus = this.container.querySelector('#studio-import-status') as HTMLElement;
    const ytIdInput = this.container.querySelector('#studio-youtube-id') as HTMLInputElement;
    const btnAutoMatch = this.container.querySelector('#btn-studio-automatch') as HTMLButtonElement;
    const syncReport = this.container.querySelector('#studio-sync-report') as HTMLElement;
    const btnPreview = this.container.querySelector('#btn-studio-preview') as HTMLButtonElement;
    const btnApprove = this.container.querySelector('#btn-studio-approve') as HTMLButtonElement;
    const validSummary = this.container.querySelector('#studio-validation-summary') as HTMLElement;

    btnClose?.addEventListener('click', () => this.onExitRequested?.());
    btnLogout?.addEventListener('click', () => {
      this.studio.logoutAdmin();
      this.render();
    });

    btnSearch?.addEventListener('click', async () => {
      const artist = artistInput.value.trim();
      const title = titleInput.value.trim();
      if (!artist && !title) {
        feedback.textContent = 'Informe o artista ou título da música.';
        return;
      }
      feedback.textContent = 'Consultando Chorus Encore e verificando RhythmVerse...';
      const results = await this.studio.searchCharts(artist, title);

      if (results.length === 0) {
        feedback.innerHTML = `Nenhum chart retornado via API. Você pode <a href="https://rhythmverse.co/songfiles/game?search=${encodeURIComponent(artist + ' ' + title)}" target="_blank" style="color: #38bdf8;">buscar manualmente no RhythmVerse</a> ou <a href="https://www.enchor.us/?search=${encodeURIComponent(artist + ' ' + title)}" target="_blank" style="color: #38bdf8;">no Chorus Encore</a> e importar o arquivo abaixo.`;
        resultsSection.style.display = 'none';
      } else {
        feedback.textContent = `${results.length} charts encontrados.`;
        resultsSection.style.display = 'block';
        tableContainer.innerHTML = `
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #cbd5e1;">
            <thead>
              <tr style="border-bottom: 1px solid #475569; text-align: left;">
                <th style="padding: 6px;">Fonte</th>
                <th style="padding: 6px;">Título</th>
                <th style="padding: 6px;">Charter</th>
                <th style="padding: 6px;">Formato</th>
                <th style="padding: 6px;">Dificuldades</th>
                <th style="padding: 6px;">Ação</th>
              </tr>
            </thead>
            <tbody>
              ${results.map((r, i) => `
                <tr style="border-bottom: 1px solid #334155;">
                  <td style="padding: 6px;">${r.provider === 'CHORUS_ENCORE' ? 'Chorus' : 'RhythmVerse'}</td>
                  <td style="padding: 6px;">${r.artist} - ${r.title}</td>
                  <td style="padding: 6px;">${r.charter}</td>
                  <td style="padding: 6px;">${r.format}</td>
                  <td style="padding: 6px;">${r.difficulties.join(', ')}</td>
                  <td style="padding: 6px;"><button class="btn-select-chart" data-idx="${i}" style="padding: 4px 10px; background: #0284c7; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Selecionar</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;

        tableContainer.querySelectorAll('.btn-select-chart').forEach((b) => {
          b.addEventListener('click', (e) => {
            const idx = Number((e.target as HTMLElement).dataset.idx);
            const chart = results[idx];
            this.studio.selectChart(chart);
            validSummary.textContent = `Chart selecionado: "${chart.title}" por ${chart.charter} (${chart.difficulties.join(', ')}).`;
          });
        });
      }
    });

    filePicker?.addEventListener('change', async () => {
      const file = filePicker.files?.[0];
      if (!file) return;

      importStatus.textContent = `Importando ${file.name}...`;
      try {
        const buffer = await file.arrayBuffer();
        const res = await this.studio.importFile(buffer, file.name);
        importStatus.textContent = `Importado com sucesso: ${res.title} (${res.artist}) — ${res.difficultiesPresent.join(', ')}`;
        validSummary.textContent = `Chart pronto: ${res.totalNotesPerDifficulty.HARD} notas (HARD). Associe o vídeo do YouTube.`;
      } catch (err: any) {
        importStatus.style.color = '#ef4444';
        importStatus.textContent = `Erro na importação: ${err.message}`;
      }
    });

    btnAutoMatch?.addEventListener('click', () => {
      const ytId = ytIdInput.value.trim();
      if (!ytId) {
        syncReport.textContent = 'Informe o identificador do vídeo do YouTube.';
        return;
      }
      try {
        const profile = this.studio.associateYouTubeVideo(ytId);
        const report = this.studio.runValidation('HARD');
        syncReport.innerHTML = `Perfil: <b>${profile.validationStatus}</b> | Offset: <b>${profile.offsetMs}ms</b> | Método: ${profile.syncMethod}<br><span style="color: #94a3b8; font-size: 12px;">${profile.evidenceSource}</span>`;
        validSummary.innerHTML = `Auditoria: <b>${report.overallStatus}</b> | Estrutural: ${report.structural.valid ? 'VÁLIDO' : 'ERROS'} | Musical: ${report.musicalAccuracy.status}`;
      } catch (e: any) {
        syncReport.textContent = `Erro: ${e.message}`;
      }
    });

    btnPreview?.addEventListener('click', () => {
      const session = this.studio.getSessionState();
      if (!session.importedChart) {
        alert('Importe ou selecione um chart primeiro.');
        return;
      }
      const song: SongMetadata = {
        id: session.importedChart.songId,
        title: session.importedChart.title,
        artist: session.importedChart.artist,
        duration: Math.round(session.importedChart.durationSec),
        bpm: session.importedChart.bpm,
        style: '🎸 RockChart Studio Preview',
        type: session.youtubeVideoId ? 'youtube' : 'procedural',
        youtubeVideoId: session.youtubeVideoId || undefined,
        isAvailable: true,
        records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
      };
      this.onTestPlayRequested?.(song, 'HARD', session.importedChart.derivedCharts.HARD);
    });

    btnApprove?.addEventListener('click', () => {
      try {
        this.studio.setApproval(true);
        const published = this.studio.publishToCatalog();
        alert(`Música "${published.title}" aprovada e publicada no catálogo oficial com sucesso!`);
      } catch (e: any) {
        alert(`Erro ao aprovar e publicar: ${e.message}`);
      }
    });
  }
}
