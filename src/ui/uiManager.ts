import { GameStats, HitJudgment, GameState, Lane, SongMetadata, Difficulty, GameSettings } from '../types';
import { PlayerProfile, LeaderboardEntry } from '../game/profileManager';

export class UIManager {
  // In-Game HUD Elements
  private hudElement: HTMLElement;
  private hudScore: HTMLElement;
  private hudMultiplier: HTMLElement;
  private hudProgressBar: HTMLElement;
  private hudAccuracyFeedback: HTMLElement;
  private hudComboContainer: HTMLElement;
  private hudComboNumber: HTMLElement;
  private meterNeedle: HTMLElement;
  private meterDangerLed: HTMLElement;
  private meterPctText: HTMLElement;
  private feedbackTimer: number | null = null;

  // Screens & Modals
  private screenMenu: HTMLElement;
  private screenSongSelect: HTMLElement;
  private modalDifficulty: HTMLElement;
  private modalAnalysisProgress: HTMLElement;
  private modalProfileCreate: HTMLElement;
  private modalProfileManager: HTMLElement;
  private screenRanking: HTMLElement;
  private screenCountdown: HTMLElement;
  private countdownNumber: HTMLElement;
  private screenPause: HTMLElement;
  private screenGameOver: HTMLElement;
  private screenResult: HTMLElement;
  private screenSettings: HTMLElement;
  private screenHowToPlay: HTMLElement;
  private screenEditor: HTMLElement;

  // Profile elements
  private profileNameInput: HTMLInputElement;
  private profileAvatarGrid: HTMLElement;
  private selectedAvatar = '🎸';
  private menuProfileAvatar: HTMLElement;
  private menuProfileName: HTMLElement;
  private profilesScrollList: HTMLElement;

  // Song Select elements
  private songsListContainer: HTMLElement;
  private currentSelectedSong: SongMetadata | null = null;
  private currentFilter: 'all' | 'custom' = 'all';

  // Ranking elements
  private rankingSongSelect: HTMLSelectElement;
  private rankingDiffSelect: HTMLSelectElement;
  private rankingListContainer: HTMLElement;

  // Circular Fret Buttons
  private fretButtons: HTMLElement[] = [];

  // Result Elements
  private resultSongTitle: HTMLElement;
  private resultStarsRow: HTMLElement;
  private resultScore: HTMLElement;
  private resultAccuracy: HTMLElement;
  private resultMaxCombo: HTMLElement;
  private resultPerfect: HTMLElement;
  private resultGreat: HTMLElement;
  private resultGood: HTMLElement;
  private resultMiss: HTMLElement;

  // Game Over Elements
  private gameOverScore: HTMLElement;
  private gameOverCombo: HTMLElement;

  // Settings Elements
  private sliderMusic: HTMLInputElement;
  private sliderSfx: HTMLInputElement;
  private sliderOffset: HTMLInputElement;
  private sliderSpeed: HTMLInputElement;
  private checkFx: HTMLInputElement;
  private valMusic: HTMLElement;
  private valSfx: HTMLElement;
  private valOffset: HTMLElement;
  private valSpeed: HTMLElement;

  // Callbacks
  public onPlayGameRequested?: (song: SongMetadata, difficulty: Difficulty) => void;
  public onOpenSettingsClicked?: () => void;
  public onOpenHowToPlayClicked?: () => void;
  public onOpenSongSelectClicked?: (filter?: 'all' | 'custom') => void;
  public onOpenRankingClicked?: () => void;
  public onReturnToMenuClicked?: () => void;
  public onResumeClicked?: () => void;
  public onRestartClicked?: () => void;
  public onPauseClicked?: () => void;
  public onNextSongClicked?: () => void;
  public onImportMp3File?: (file: File) => void;
  public onLinkTNTFile?: (file: File) => void;
  public onSettingsChanged?: (settings: Partial<GameSettings>) => void;
  public onTestBeepClicked?: () => void;

  // Editor callbacks
  public onOpenEditorClicked?: () => void;
  public onImportZipFile?: (file: File) => void;
  public onPlayAsGuestClicked?: () => void;

  // Profile callbacks
  public onCreateProfileConfirmed?: (name: string, avatar: string) => void;
  public onSwitchProfileRequested?: (id: string) => void;
  public onExportDataRequested?: () => void;
  public onRankingFilterChanged?: (songId: string, diff: Difficulty) => void;

  constructor() {
    this.hudElement = document.getElementById('hud')!;
    this.hudScore = document.getElementById('hud-score')!;
    this.hudMultiplier = document.getElementById('hud-multiplier')!;
    this.hudProgressBar = document.getElementById('song-progress-bar')!;
    this.hudAccuracyFeedback = document.getElementById('hud-accuracy-feedback')!;
    this.hudComboContainer = document.getElementById('hud-combo-container')!;
    this.hudComboNumber = document.getElementById('hud-combo-number')!;
    this.meterNeedle = document.getElementById('rock-meter-needle')!;
    this.meterDangerLed = document.getElementById('rock-meter-danger-led')!;
    this.meterPctText = document.getElementById('rock-meter-pct-text')!;

    this.screenMenu = document.getElementById('screen-menu')!;
    this.screenSongSelect = document.getElementById('screen-song-select')!;
    this.modalDifficulty = document.getElementById('modal-difficulty')!;
    this.modalAnalysisProgress = document.getElementById('modal-analysis-progress')!;
    this.modalProfileCreate = document.getElementById('modal-profile-create')!;
    this.modalProfileManager = document.getElementById('modal-profile-manager')!;
    this.screenRanking = document.getElementById('screen-ranking')!;
    this.screenCountdown = document.getElementById('screen-countdown')!;
    this.countdownNumber = document.getElementById('countdown-number')!;
    this.screenPause = document.getElementById('screen-pause')!;
    this.screenGameOver = document.getElementById('screen-game-over')!;
    this.screenResult = document.getElementById('screen-result')!;
    this.screenSettings = document.getElementById('screen-settings')!;
    this.screenHowToPlay = document.getElementById('screen-howtoplay')!;
    this.screenEditor = document.getElementById('screen-editor')!;

    this.profileNameInput = document.getElementById('profile-name-input') as HTMLInputElement;
    this.profileAvatarGrid = document.querySelector('.avatar-grid')!;
    this.menuProfileAvatar = document.getElementById('menu-profile-avatar')!;
    this.menuProfileName = document.getElementById('menu-profile-name')!;
    this.profilesScrollList = document.getElementById('profiles-scroll-list')!;

    this.songsListContainer = document.getElementById('songs-list')!;

    this.rankingSongSelect = document.getElementById('ranking-song-select') as HTMLSelectElement;
    this.rankingDiffSelect = document.getElementById('ranking-diff-select') as HTMLSelectElement;
    this.rankingListContainer = document.getElementById('ranking-list')!;

    this.resultSongTitle = document.getElementById('result-song-title')!;
    this.resultStarsRow = document.getElementById('result-stars-row')!;
    this.resultScore = document.getElementById('result-score')!;
    this.resultAccuracy = document.getElementById('result-accuracy')!;
    this.resultMaxCombo = document.getElementById('result-maxcombo')!;
    this.resultPerfect = document.getElementById('result-perfect')!;
    this.resultGreat = document.getElementById('result-great')!;
    this.resultGood = document.getElementById('result-good')!;
    this.resultMiss = document.getElementById('result-miss')!;

    this.gameOverScore = document.getElementById('gameover-score')!;
    this.gameOverCombo = document.getElementById('gameover-combo')!;

    this.sliderMusic = document.getElementById('cfg-volume-music') as HTMLInputElement;
    this.sliderSfx = document.getElementById('cfg-volume-sfx') as HTMLInputElement;
    this.sliderOffset = document.getElementById('cfg-offset') as HTMLInputElement;
    this.sliderSpeed = document.getElementById('cfg-speed') as HTMLInputElement;
    this.checkFx = document.getElementById('cfg-fx') as HTMLInputElement;

    this.valMusic = document.getElementById('val-cfg-music')!;
    this.valSfx = document.getElementById('val-cfg-sfx')!;
    this.valOffset = document.getElementById('val-cfg-offset')!;
    this.valSpeed = document.getElementById('val-cfg-speed')!;

    for (let i = 0; i < 5; i++) {
      const btn = document.querySelector(`.fret-button.lane-${i}`) as HTMLElement;
      if (btn) this.fretButtons.push(btn);
    }

    this.bindEvents();
  }

  private bindEvents(): void {
    // 6 Menu Hotspot Buttons
    document.getElementById('hotspot-jogar')?.addEventListener('click', () => {
      this.currentFilter = 'all';
      this.onOpenSongSelectClicked?.('all');
    });

    document.getElementById('hotspot-musicas')?.addEventListener('click', () => {
      this.currentFilter = 'custom';
      this.onOpenSongSelectClicked?.('custom');
    });

    document.getElementById('hotspot-config')?.addEventListener('click', () => {
      this.onOpenSettingsClicked?.();
    });

    document.getElementById('hotspot-ranking')?.addEventListener('click', () => {
      this.onOpenRankingClicked?.();
    });

    document.getElementById('hotspot-tutorial')?.addEventListener('click', () => {
      this.onOpenHowToPlayClicked?.();
    });

    document.getElementById('hotspot-sair')?.addEventListener('click', () => {
      if (confirm('Deseja realmente sair do RockBrazil?')) {
        window.close();
      }
    });

    // Profile pill in menu
    document.getElementById('btn-menu-profile')?.addEventListener('click', () => {
      this.modalProfileManager.classList.remove('hidden');
    });

    // Profile create modal
    this.profileAvatarGrid?.querySelectorAll('.avatar-option').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.profileAvatarGrid.querySelectorAll('.avatar-option').forEach((b) => b.classList.remove('selected'));
        const target = e.currentTarget as HTMLElement;
        target.classList.add('selected');
        this.selectedAvatar = target.dataset.avatar || '🎸';
      });
    });

    document.getElementById('btn-confirm-create-profile')?.addEventListener('click', () => {
      const name = this.profileNameInput.value.trim() || 'Rockeiro';
      this.modalProfileCreate.classList.add('hidden');
      this.onCreateProfileConfirmed?.(name, this.selectedAvatar);
    });

    document.getElementById('btn-open-create-new-profile')?.addEventListener('click', () => {
      this.modalProfileManager.classList.add('hidden');
      this.modalProfileCreate.classList.remove('hidden');
    });

    document.getElementById('btn-close-profile-manager')?.addEventListener('click', () => {
      this.modalProfileManager.classList.add('hidden');
    });

    document.getElementById('btn-play-as-guest')?.addEventListener('click', () => {
      this.modalProfileManager.classList.add('hidden');
      this.onPlayAsGuestClicked?.();
    });

    document.getElementById('btn-cancel-create-profile')?.addEventListener('click', () => {
      this.modalProfileCreate.classList.add('hidden');
    });

    document.getElementById('btn-open-editor')?.addEventListener('click', () => {
      this.onOpenEditorClicked?.();
    });

    const zipInput = document.getElementById('zip-file-input') as HTMLInputElement;
    zipInput?.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files[0]) {
        this.onImportZipFile?.(files[0]);
      }
    });

    // Song select back
    document.getElementById('btn-song-select-back')?.addEventListener('click', () => {
      this.onReturnToMenuClicked?.();
    });

    // Filter tabs
    document.getElementById('tab-songs-all')?.addEventListener('click', (e) => {
      this.currentFilter = 'all';
      document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
      (e.currentTarget as HTMLElement).classList.add('active');
      this.onOpenSongSelectClicked?.('all');
    });

    document.getElementById('tab-songs-custom')?.addEventListener('click', (e) => {
      this.currentFilter = 'custom';
      document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
      (e.currentTarget as HTMLElement).classList.add('active');
      this.onOpenSongSelectClicked?.('custom');
    });

    // Import MP3 input
    const fileInput = document.getElementById('mp3-file-input') as HTMLInputElement;
    fileInput?.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files[0]) {
        this.onImportMp3File?.(files[0]);
      }
    });

    // Difficulty modal choices
    document.querySelectorAll('.btn-diff-choice').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const diff = (e.currentTarget as HTMLElement).dataset.diff as Difficulty;
        if (this.currentSelectedSong && diff) {
          this.modalDifficulty.classList.add('hidden');
          this.onPlayGameRequested?.(this.currentSelectedSong, diff);
        }
      });
    });

    document.getElementById('btn-diff-cancel')?.addEventListener('click', () => {
      this.modalDifficulty.classList.add('hidden');
    });

    // In-game Pause & Controls
    document.getElementById('btn-pause')?.addEventListener('click', () => {
      this.onPauseClicked?.();
    });
    document.getElementById('btn-resume')?.addEventListener('click', () => {
      this.onResumeClicked?.();
    });
    document.getElementById('btn-restart-pause')?.addEventListener('click', () => {
      this.onRestartClicked?.();
    });
    document.getElementById('btn-config-pause')?.addEventListener('click', () => {
      this.onOpenSettingsClicked?.();
    });
    document.getElementById('btn-songs-pause')?.addEventListener('click', () => {
      this.onOpenSongSelectClicked?.();
    });

    // Game Over buttons
    document.getElementById('btn-retry-gameover')?.addEventListener('click', () => {
      this.onRestartClicked?.();
    });
    document.getElementById('btn-songs-gameover')?.addEventListener('click', () => {
      this.onOpenSongSelectClicked?.();
    });

    // Results screen buttons
    document.getElementById('btn-play-again')?.addEventListener('click', () => {
      this.onRestartClicked?.();
    });
    document.getElementById('btn-next-song')?.addEventListener('click', () => {
      this.onNextSongClicked?.();
    });
    document.getElementById('btn-menu-result')?.addEventListener('click', () => {
      this.onReturnToMenuClicked?.();
    });

    // How to Play close
    document.getElementById('btn-close-howtoplay')?.addEventListener('click', () => {
      this.onReturnToMenuClicked?.();
    });

    // Ranking controls
    document.getElementById('btn-ranking-back')?.addEventListener('click', () => {
      this.onReturnToMenuClicked?.();
    });

    document.getElementById('btn-export-profile-json')?.addEventListener('click', () => {
      this.onExportDataRequested?.();
    });

    this.rankingSongSelect?.addEventListener('change', () => this.handleRankingFilterChange());
    this.rankingDiffSelect?.addEventListener('change', () => this.handleRankingFilterChange());

    // Settings inputs
    this.sliderMusic?.addEventListener('input', () => {
      const val = Number(this.sliderMusic.value);
      this.valMusic.textContent = `${val}%`;
      this.onSettingsChanged?.({ musicVolume: val / 100 });
    });

    this.sliderSfx?.addEventListener('input', () => {
      const val = Number(this.sliderSfx.value);
      this.valSfx.textContent = `${val}%`;
      this.onSettingsChanged?.({ sfxVolume: val / 100 });
    });

    this.sliderOffset?.addEventListener('input', () => {
      const val = Number(this.sliderOffset.value);
      this.valOffset.textContent = `${val > 0 ? `+${val}` : val} ms`;
      this.onSettingsChanged?.({ audioOffsetMs: val });
    });

    this.sliderSpeed?.addEventListener('input', () => {
      const val = (Number(this.sliderSpeed.value) / 10).toFixed(1);
      this.valSpeed.textContent = `${val}x`;
      this.onSettingsChanged?.({ noteSpeedMultiplier: Number(val) });
    });

    this.checkFx?.addEventListener('change', () => {
      this.onSettingsChanged?.({ visualEffectsEnabled: this.checkFx.checked });
    });

    document.getElementById('btn-test-beep')?.addEventListener('click', () => {
      this.onTestBeepClicked?.();
    });

    document.getElementById('btn-save-settings')?.addEventListener('click', () => {
      this.onReturnToMenuClicked?.();
    });
  }

  private handleRankingFilterChange(): void {
    const songId = this.rankingSongSelect.value;
    const diff = this.rankingDiffSelect.value as Difficulty;
    this.onRankingFilterChanged?.(songId, diff);
  }

  setProfileHeader(profile: PlayerProfile): void {
    if (profile.id === 'guest') {
      this.menuProfileAvatar.textContent = '👤';
      this.menuProfileName.textContent = 'ENTRAR';
      const hint = document.querySelector('.profile-switch-hint');
      if (hint) hint.textContent = 'Perfil';
    } else {
      this.menuProfileAvatar.textContent = profile.avatar;
      this.menuProfileName.textContent = profile.name;
      const hint = document.querySelector('.profile-switch-hint');
      if (hint) hint.textContent = 'Trocar';
    }
  }

  showProfileCreateModal(): void {
    this.modalProfileCreate.classList.remove('hidden');
  }

  renderProfileList(profiles: PlayerProfile[], activeId: string): void {
    this.profilesScrollList.innerHTML = profiles.map((p) => `
      <div class="profile-list-item ${p.id === activeId ? 'active' : ''}" data-profile-id="${p.id}">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:22px;">${p.avatar}</span>
          <div>
            <div style="font-weight:800; font-size:14px; color:#fff;">${p.name}</div>
            <div style="font-size:10px; color:#8c90a3;">Última vez: ${new Date(p.lastPlayedAt).toLocaleDateString()}</div>
          </div>
        </div>
        ${p.id === activeId ? '<span style="color:#00ff88; font-size:11px; font-weight:800;">ATIVO</span>' : '<button class="btn-small btn-switch-p" data-profile-id="' + p.id + '">Escolher</button>'}
      </div>
    `).join('');

    this.profilesScrollList.querySelectorAll('.btn-switch-p').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.profileId;
        if (id) {
          this.modalProfileManager.classList.add('hidden');
          this.onSwitchProfileRequested?.(id);
        }
      });
    });
  }

  showAnalysisProgress(show: boolean, stepDesc = 'Analisando eventos de guitarra...'): void {
    this.modalAnalysisProgress.classList.toggle('hidden', !show);
    const descEl = document.getElementById('analysis-step-desc');
    if (descEl) descEl.textContent = stepDesc;
  }

  initSettingsValues(settings: GameSettings): void {
    if (this.sliderMusic) this.sliderMusic.value = Math.round(settings.musicVolume * 100).toString();
    if (this.valMusic) this.valMusic.textContent = `${Math.round(settings.musicVolume * 100)}%`;

    if (this.sliderSfx) this.sliderSfx.value = Math.round(settings.sfxVolume * 100).toString();
    if (this.valSfx) this.valSfx.textContent = `${Math.round(settings.sfxVolume * 100)}%`;

    if (this.sliderOffset) this.sliderOffset.value = settings.audioOffsetMs.toString();
    if (this.valOffset) this.valOffset.textContent = `${settings.audioOffsetMs > 0 ? `+${settings.audioOffsetMs}` : settings.audioOffsetMs} ms`;

    if (this.sliderSpeed) this.sliderSpeed.value = Math.round(settings.noteSpeedMultiplier * 10).toString();
    if (this.valSpeed) this.valSpeed.textContent = `${settings.noteSpeedMultiplier.toFixed(1)}x`;

    if (this.checkFx) this.checkFx.checked = settings.visualEffectsEnabled;
  }

  showScreen(state: GameState): void {
    this.screenMenu.classList.toggle('hidden', state !== GameState.MENU);
    this.screenSongSelect.classList.toggle('hidden', state !== GameState.SONG_SELECT);
    this.screenCountdown.classList.toggle('hidden', state !== GameState.COUNTDOWN);
    this.screenPause.classList.toggle('hidden', state !== GameState.PAUSED);
    this.screenGameOver.classList.toggle('hidden', state !== GameState.GAME_OVER);
    this.screenResult.classList.toggle('hidden', state !== GameState.RESULTS);
    this.screenSettings.classList.toggle('hidden', state !== GameState.SETTINGS);
    this.screenHowToPlay.classList.toggle('hidden', state !== GameState.HOW_TO_PLAY);
    this.screenRanking.classList.toggle('hidden', (state as any) !== 'RANKING');
    this.screenEditor.classList.toggle('hidden', state !== GameState.NOTE_EDITOR);

    if (state === GameState.PLAYING) {
      this.hudElement.classList.remove('hidden');
    } else {
      this.hudElement.classList.add('hidden');
    }
  }

  setLaneVisualActive(lane: Lane, active: boolean): void {
    if (this.fretButtons[lane]) {
      this.fretButtons[lane].classList.toggle('pressed', active);
    }
  }

  setCountdown(text: string): void {
    this.countdownNumber.textContent = text;
  }

  updateHUD(stats: GameStats, currentTime: number, duration: number): void {
    this.hudScore.textContent = stats.score.toLocaleString('pt-BR');

    // Vertical Rock Performance Meter
    const pct = Math.max(0, Math.min(100, Math.round(stats.rockMeter)));
    this.meterNeedle.style.bottom = `${pct}%`;
    this.meterPctText.textContent = `${pct}%`;

    // Danger LED when life < 30%
    this.meterDangerLed.classList.toggle('hidden', pct >= 30);

    // Multiplier
    this.hudMultiplier.textContent = `${stats.multiplier}X`;
    this.hudMultiplier.className = `multiplier-badge mult-${stats.multiplier}x`;

    // Song Progress Line
    if (duration > 0) {
      const progressPct = Math.min(100, (currentTime / duration) * 100);
      this.hudProgressBar.style.width = `${progressPct}%`;
    }

    // Combo
    if (stats.combo >= 2) {
      this.hudComboContainer.classList.remove('hidden');
      this.hudComboNumber.textContent = stats.combo.toString();
      this.hudComboContainer.classList.add('pop');
      setTimeout(() => this.hudComboContainer.classList.remove('pop'), 120);
    } else {
      this.hudComboContainer.classList.add('hidden');
    }
  }

  resetHUD(): void {
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.hudScore.textContent = '0';
    this.hudMultiplier.textContent = '1X';
    this.hudMultiplier.className = 'multiplier-badge mult-1x';
    this.hudProgressBar.style.width = '0%';
    this.hudComboContainer.classList.add('hidden');
    this.hudComboNumber.textContent = '0';
    this.meterNeedle.style.bottom = '50%';
    this.meterPctText.textContent = '50%';
    this.meterDangerLed.classList.add('hidden');
    if (this.hudAccuracyFeedback) {
      this.hudAccuracyFeedback.textContent = '';
      this.hudAccuracyFeedback.className = 'accuracy-text';
    }
    this.fretButtons.forEach((btn) => btn.classList.remove('pressed'));
  }

  showHitFeedback(_judgment: HitJudgment): void {
    // V5.1: Textos flutuantes de julgamento removidos conforme Prioridade 2
    // A visualização das notas fica 100% limpa, mantendo a precisão, combo,
    // pontuação e feedback luminoso discreto nos botões.
    if (this.hudAccuracyFeedback) {
      this.hudAccuracyFeedback.textContent = '';
      this.hudAccuracyFeedback.className = 'accuracy-text';
    }
  }

  showGameOver(stats: GameStats): void {
    this.gameOverScore.textContent = stats.score.toLocaleString('pt-BR');
    this.gameOverCombo.textContent = stats.maxCombo.toString();
    this.showScreen(GameState.GAME_OVER);
  }

  showResults(song: SongMetadata, stats: GameStats): void {
    this.resultSongTitle.textContent = `${song.title} - ${song.artist}`;
    this.resultScore.textContent = stats.score.toLocaleString('pt-BR');
    this.resultAccuracy.textContent = `${stats.accuracy || 0}%`;
    this.resultMaxCombo.textContent = stats.maxCombo.toString();
    this.resultPerfect.textContent = stats.perfectCount.toString();
    this.resultGreat.textContent = stats.greatCount.toString();
    this.resultGood.textContent = stats.goodCount.toString();
    this.resultMiss.textContent = stats.missCount.toString();

    const starCount = stats.stars || 1;
    const starEls = this.resultStarsRow.querySelectorAll('.star-item');
    starEls.forEach((el, idx) => {
      el.classList.toggle('active', idx < starCount);
    });

    this.showScreen(GameState.RESULTS);
  }

  renderSongLibrary(songs: SongMetadata[], activeProfile?: PlayerProfile | null): void {
    const filtered = this.currentFilter === 'custom'
      ? songs.filter((s) => s.type === 'audio-file')
      : songs;

    const titleEl = document.getElementById('library-screen-title');
    if (titleEl) {
      titleEl.textContent = this.currentFilter === 'custom' ? 'MINHAS MÚSICAS' : 'BIBLIOTECA DE MÚSICAS';
    }

    this.songsListContainer.innerHTML = filtered.map((song) => {
      const mins = Math.floor(song.duration / 60);
      const secs = Math.floor(song.duration % 60).toString().padStart(2, '0');

      let statusHtml = '';
      if (!song.isAvailable && song.requiresFile) {
        statusHtml = `
          <div class="song-status-box">
            <span>Arquivo necessário: <strong>${song.requiresFile}</strong></span>
            <label class="btn-small" style="cursor:pointer; background:#ff2a5f;">
              VINCULAR ${song.requiresFile}
              <input type="file" accept="audio/*" class="link-file-input" data-song-id="${song.id}" style="display:none;">
            </label>
          </div>
        `;
      } else if (song.id === 'tnt-acdc' && song.isAvailable) {
        statusHtml = `<div class="song-status-box" style="color:#00ff88;">⚡ ÁUDIO TNT.mp3 VINCULADO COM SUCESSO!</div>`;
      }

      // Best score on this song from profile
      let bestStars = 0;
      let bestScore = 0;
      if (activeProfile?.records[song.id]) {
        Object.values(activeProfile.records[song.id]).forEach((rec) => {
          if (rec && rec.score > bestScore) {
            bestScore = rec.score;
            bestStars = rec.stars || 1;
          }
        });
      }

      return `
        <div class="song-card" data-song-id="${song.id}">
          <div class="song-card-header">
            <div>
              <span class="song-style-badge">${song.style}</span>
              <h3 class="song-title-text">${song.title}</h3>
              <span class="song-artist-text">${song.artist}</span>
            </div>
            ${bestScore > 0 ? `<div style="text-align:right;"><div style="color:#ffe600; font-size:12px;">${'⭐'.repeat(bestStars)}</div><div style="font-size:10px; color:#8c90a3;">${bestScore.toLocaleString()} pts</div></div>` : ''}
          </div>

          <div class="song-meta-row">
            <span>⏱ ${mins}:${secs}</span>
            <span>🥁 ${song.bpm} BPM</span>
            <span>🎸 4 Dificuldades</span>
          </div>

          ${statusHtml}

          <div class="song-card-actions">
            <button class="btn-song-play" data-song-id="${song.id}" ${!song.isAvailable ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''}>
              TOCAR
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.songsListContainer.querySelectorAll('.btn-song-play').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const songId = (e.currentTarget as HTMLElement).dataset.songId;
        const song = songs.find((s) => s.id === songId);
        if (song && song.isAvailable) {
          this.openDifficultyModal(song, activeProfile);
        }
      });
    });

    this.songsListContainer.querySelectorAll('.link-file-input').forEach((input) => {
      input.addEventListener('change', (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files && files[0]) {
          this.onLinkTNTFile?.(files[0]);
        }
      });
    });
  }

  openDifficultyModal(song: SongMetadata, activeProfile?: PlayerProfile | null): void {
    this.currentSelectedSong = song;
    const titleEl = document.getElementById('diff-song-title');
    const artistEl = document.getElementById('diff-song-artist');
    if (titleEl) titleEl.textContent = song.title;
    if (artistEl) artistEl.textContent = song.artist;

    const diffs: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
    diffs.forEach((d) => {
      const recEl = document.getElementById(`record-${d.toLowerCase()}`);
      if (recEl) {
        const rec = activeProfile?.records[song.id]?.[d];
        if (rec) {
          recEl.textContent = `Recorde: ${rec.score.toLocaleString()} pts (${'⭐'.repeat(rec.stars || 1)})`;
        } else {
          recEl.textContent = `Ainda não jogado`;
        }
      }
    });

    this.modalDifficulty.classList.remove('hidden');
  }

  initRankingDropdowns(songs: SongMetadata[]): void {
    this.rankingSongSelect.innerHTML = songs.map((s) => `<option value="${s.id}">${s.title}</option>`).join('');
  }

  renderLeaderboard(entries: LeaderboardEntry[]): void {
    if (entries.length === 0) {
      this.rankingListContainer.innerHTML = `
        <div style="text-align:center; padding:30px; color:#8c90a3;">
          <div style="font-size:32px; margin-bottom:8px;">🏆</div>
          Nenhum recorde registrado nesta música e dificuldade ainda.<br>Seja o primeiro a tocar!
        </div>
      `;
      return;
    }

    this.rankingListContainer.innerHTML = entries.map((entry, idx) => `
      <div class="ranking-row">
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="ranking-rank">#${idx + 1}</span>
          <span style="font-size:20px;">${entry.avatar}</span>
          <div>
            <div style="font-weight:800; font-size:14px; color:#fff;">${entry.playerName}</div>
            <div style="font-size:10px; color:#8c90a3;">Precisão: ${entry.accuracy}% • Combo: ${entry.maxCombo}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:var(--font-display); font-size:22px; color:#ffe600;">${entry.score.toLocaleString('pt-BR')}</div>
          <div style="font-size:10px; color:#ffe600;">${'⭐'.repeat(entry.stars)}</div>
        </div>
      </div>
    `).join('');
  }
}
