import {
  MusicSourceManager,
  AudioPreparationService,
  RockAIJobManager,
  ChartVideoAlignmentService,
  RockAIStorageService,
  AutochartGenerationResult,
  AlignmentCalibrationState,
  PILOT_SONG_V13_9
} from '../game/rockai';
import { VisualEditor } from '../editor/visualEditor';
import { Note, Lane, Difficulty, SongMetadata } from '../types';

export class RockAIView {
  private container: HTMLElement;
  private jobManager: RockAIJobManager;
  private currentJobId: string | null = null;
  private currentResult: AutochartGenerationResult | null = null;
  private currentAlignment: AlignmentCalibrationState | null = null;

  // UI Elements
  private tabButtons: NodeListOf<HTMLButtonElement>;
  private tabPanels: NodeListOf<HTMLElement>;
  private ytUrlInput: HTMLInputElement;
  private songTitleInput: HTMLInputElement;
  private songArtistInput: HTMLInputElement;
  private songCategoryInput: HTMLInputElement;
  private audioFileInput: HTMLInputElement;
  private btnAnalyze: HTMLButtonElement;
  private progressBar: HTMLElement;
  private progressText: HTMLElement;
  private stepLabel: HTMLElement;
  private btnCancelJob: HTMLButtonElement;
  private offsetDisplay: HTMLElement;
  private alignStatusBadge: HTMLElement;
  private draftListContainer: HTMLElement;

  // Callbacks
  public onExitRequested?: () => void;
  public onOpenInEditorRequested?: (songId: string, result: AutochartGenerationResult) => void;
  public onTestPlayRequested?: (song: SongMetadata, difficulty: Difficulty, notes: Note[]) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.jobManager = new RockAIJobManager();

    // Query elements
    this.tabButtons = container.querySelectorAll('.rockai-tab-btn');
    this.tabPanels = container.querySelectorAll('.rockai-tab-panel');
    this.ytUrlInput = container.querySelector('#rockai-yt-url') as HTMLInputElement;
    this.songTitleInput = container.querySelector('#rockai-song-title') as HTMLInputElement;
    this.songArtistInput = container.querySelector('#rockai-song-artist') as HTMLInputElement;
    this.songCategoryInput = container.querySelector('#rockai-song-category') as HTMLInputElement;
    this.audioFileInput = container.querySelector('#rockai-audio-file') as HTMLInputElement;
    this.btnAnalyze = container.querySelector('#btn-rockai-analyze') as HTMLButtonElement;
    this.progressBar = container.querySelector('#rockai-progress-bar') as HTMLElement;
    this.progressText = container.querySelector('#rockai-progress-text') as HTMLElement;
    this.stepLabel = container.querySelector('#rockai-step-label') as HTMLElement;
    this.btnCancelJob = container.querySelector('#btn-rockai-cancel') as HTMLButtonElement;
    this.offsetDisplay = container.querySelector('#rockai-offset-val') as HTMLElement;
    this.alignStatusBadge = container.querySelector('#rockai-align-status') as HTMLElement;
    this.draftListContainer = container.querySelector('#rockai-drafts-list') as HTMLElement;

    this.setupEventListeners();
    this.ensurePilotSongRegistered();
    this.renderDraftsList();
  }

  private setupEventListeners(): void {
    // 1. Tab Navigation
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.selectTab(targetTab || 'create');
      });
    });

    // 2. YouTube URL Auto-detection
    this.ytUrlInput?.addEventListener('input', () => {
      const val = this.ytUrlInput.value.trim();
      const res = MusicSourceManager.validateYouTubeUrl(val);
      const hint = this.container.querySelector('#rockai-yt-hint') as HTMLElement;
      if (hint) {
        if (res.isValid && res.videoId) {
          hint.textContent = `✓ ID Detectado: ${res.videoId}`;
          hint.style.color = '#10b981';

          // Auto-fill pilot song metadata if pilot video ID is entered
          if (res.videoId === PILOT_SONG_V13_9.youtubeVideoId) {
            this.songTitleInput.value = PILOT_SONG_V13_9.title;
            this.songArtistInput.value = PILOT_SONG_V13_9.artist;
            this.songCategoryInput.value = PILOT_SONG_V13_9.category;
          }
        } else if (val.length > 0) {
          hint.textContent = res.error || 'URL inválida';
          hint.style.color = '#ef4444';
        } else {
          hint.textContent = '';
        }
      }
    });

    // 3. Audio File Validation
    this.audioFileInput?.addEventListener('change', () => {
      const file = this.audioFileInput.files?.[0];
      const hint = this.container.querySelector('#rockai-file-hint') as HTMLElement;
      if (file && hint) {
        const valRes = AudioPreparationService.validateFile(file);
        if (valRes.isValid) {
          const mb = (file.size / (1024 * 1024)).toFixed(1);
          hint.textContent = `✓ Arquivo válido: ${file.name} (${mb} MB)`;
          hint.style.color = '#10b981';
        } else {
          hint.textContent = valRes.error || 'Arquivo incompatível';
          hint.style.color = '#ef4444';
        }
      }
    });

    // 4. Analyze Button
    this.btnAnalyze?.addEventListener('click', () => this.handleAnalyzeClicked());

    // 5. Cancel Job Button
    this.btnCancelJob?.addEventListener('click', () => {
      if (this.currentJobId) {
        this.jobManager.cancelJob(this.currentJobId);
      }
    });

    // 6. Back Button
    this.container.querySelector('#btn-rockai-back')?.addEventListener('click', () => {
      this.onExitRequested?.();
    });

    // 7. Offset Calibration Buttons
    const offsetButtons = this.container.querySelectorAll('[data-offset-delta]');
    offsetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const delta = parseInt(btn.getAttribute('data-offset-delta') || '0', 10);
        if (this.currentAlignment && delta !== 0) {
          this.currentAlignment = ChartVideoAlignmentService.adjustOffset(this.currentAlignment, delta);
          ChartVideoAlignmentService.saveAlignment(this.currentAlignment);
          this.updateAlignmentUI();
        }
      });
    });

    // 8. Alignment Status Dropdown / Button
    this.container.querySelector('#btn-rockai-validate-sync')?.addEventListener('click', () => {
      if (this.currentAlignment) {
        this.currentAlignment = ChartVideoAlignmentService.setValidationStatus(
          this.currentAlignment,
          'VALIDADO_PELO_USUARIO'
        );
        ChartVideoAlignmentService.saveAlignment(this.currentAlignment);
        this.updateAlignmentUI();
        alert('Sincronização validada com sucesso pelo usuário!');
      }
    });
  }

  public selectTab(tabName: string): void {
    this.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
    this.tabPanels.forEach(panel => {
      panel.classList.toggle('hidden', panel.getAttribute('data-tab') !== tabName);
    });
  }

  private async handleAnalyzeClicked(): Promise<void> {
    const ytUrl = this.ytUrlInput.value.trim();
    const title = this.songTitleInput.value.trim();
    const artist = this.songArtistInput.value.trim();
    const category = this.songCategoryInput.value.trim() || 'Rock';
    const file = this.audioFileInput.files?.[0];

    const ytValidation = MusicSourceManager.validateYouTubeUrl(ytUrl);
    if (!ytValidation.isValid) {
      alert(ytValidation.error || 'Informe uma URL válida do YouTube.');
      return;
    }

    if (!file) {
      // Register song draft as 'AGUARDANDO ÁUDIO AUTORIZADO'
      const draft = MusicSourceManager.registerSong({
        title,
        artist,
        category,
        youtubeUrl: ytUrl
      });
      RockAIStorageService.saveDraft(draft);
      this.renderDraftsList();
      alert(`Música registrada com sucesso!\n\nStatus: AGUARDANDO ÁUDIO AUTORIZADO.\nPara processar com IA, anexe o arquivo de áudio autorizado correspondente.`);
      return;
    }

    // Switch to progress tab
    this.selectTab('progress');
    this.btnCancelJob.classList.remove('hidden');

    try {
      const result = await this.jobManager.executeJob({
        title,
        artist,
        category,
        youtubeUrl: ytUrl,
        audioFile: file,
        audioFileName: file.name
      }, (prog) => {
        this.currentJobId = prog.jobId;
        if (this.progressBar) this.progressBar.style.width = `${prog.progressPercent}%`;
        if (this.progressText) this.progressText.textContent = `${prog.progressPercent}%`;
        if (this.stepLabel) this.stepLabel.textContent = prog.currentStep;

        if (prog.status === 'COMPLETED' && prog.result) {
          this.currentResult = prog.result;
          RockAIStorageService.saveGeneratedChart(prog.result);
          this.renderDraftsList();
          setTimeout(() => {
            alert('Análise da ROCK AI concluída com sucesso! Os 4 charts foram gerados e validados.');
            this.currentAlignment = ChartVideoAlignmentService.getAlignment(prog.result!.songId);
            this.updateAlignmentUI();
            this.selectTab('sync');
          }, 400);
        } else if (prog.status === 'FAILED') {
          alert(`Falha no processamento: ${prog.error}`);
        }
      });
    } catch (err: any) {
      console.error('[RockAIView] Erro ao executar job:', err);
    }
  }

  private updateAlignmentUI(): void {
    if (!this.currentAlignment) return;
    if (this.offsetDisplay) {
      const sign = this.currentAlignment.chartVideoOffsetMs > 0 ? '+' : '';
      this.offsetDisplay.textContent = `${sign}${this.currentAlignment.chartVideoOffsetMs} ms`;
    }
    if (this.alignStatusBadge) {
      this.alignStatusBadge.textContent = this.currentAlignment.status;
      this.alignStatusBadge.className = `rockai-status-badge ${this.currentAlignment.status.toLowerCase()}`;
    }
  }

  private ensurePilotSongRegistered(): void {
    const existing = RockAIStorageService.getDraft(PILOT_SONG_V13_9.id);
    if (!existing) {
      RockAIStorageService.saveDraft(PILOT_SONG_V13_9);
    }
  }

  public renderDraftsList(): void {
    if (!this.draftListContainer) return;
    const drafts = Object.values(RockAIStorageService.getAllDrafts());
    const generated = RockAIStorageService.getAllGeneratedCharts();

    if (drafts.length === 0) {
      this.draftListContainer.innerHTML = '<p style="color: rgba(255,255,255,0.5); font-size: 13px;">Nenhum rascunho cadastrado.</p>';
      return;
    }

    let html = '';
    for (const d of drafts) {
      const chartResult = generated[d.id];
      const isPilot = d.youtubeVideoId === PILOT_SONG_V13_9.youtubeVideoId;
      const statusClass = d.status === 'ANALISADO' || chartResult ? 'completed' : 'pending';
      const statusText = chartResult ? 'CHARTS GERADOS (4 DIFICULDADES)' : d.status;

      html += `
        <div class="rockai-draft-card" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: bold; font-size: 14px; color: #fff;">${d.title} ${isPilot ? '<span style="background: #f59e0b; color: #000; font-size: 10px; padding: 2px 5px; border-radius: 4px; font-weight: 800; margin-left: 6px;">PILOTO V13.9</span>' : ''}</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.6);">${d.artist} • ${d.category}</div>
            <div style="font-size: 11px; margin-top: 4px; font-weight: 600;" class="rockai-draft-status ${statusClass}">Status: ${statusText}</div>
          </div>
          <div style="display: flex; gap: 6px;">
            ${chartResult ? `
              <button class="btn-rockai-open-editor" data-song-id="${d.id}" style="padding: 5px 9px; font-size: 11px; background: #6366f1; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">EDITAR</button>
              <button class="btn-rockai-sync-song" data-song-id="${d.id}" style="padding: 5px 9px; font-size: 11px; background: #10b981; color: #000; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">SINCRONIZAR</button>
            ` : `
              <button class="btn-rockai-attach-audio" data-song-id="${d.id}" style="padding: 5px 9px; font-size: 11px; background: rgba(255,255,255,0.15); color: #fff; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; cursor: pointer;">ENVIAR ÁUDIO</button>
            `}
          </div>
        </div>
      `;
    }

    this.draftListContainer.innerHTML = html;

    // Attach click listeners
    this.draftListContainer.querySelectorAll('.btn-rockai-open-editor').forEach(btn => {
      btn.addEventListener('click', () => {
        const songId = btn.getAttribute('data-song-id');
        if (songId) {
          const res = generated[songId];
          if (res) this.onOpenInEditorRequested?.(songId, res);
        }
      });
    });

    this.draftListContainer.querySelectorAll('.btn-rockai-sync-song').forEach(btn => {
      btn.addEventListener('click', () => {
        const songId = btn.getAttribute('data-song-id');
        if (songId) {
          this.currentResult = generated[songId] || null;
          this.currentAlignment = ChartVideoAlignmentService.getAlignment(songId) || ChartVideoAlignmentService.createInitialAlignment(songId, generated[songId].youtubeVideoId);
          this.updateAlignmentUI();
          this.selectTab('sync');
        }
      });
    });
  }
}
