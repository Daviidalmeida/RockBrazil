import { reducedEffects } from '../game/visualEffects';
import { GameStats, HitJudgment, GameState, Lane, SongMetadata, Difficulty, GameSettings } from '../types';
import { PlayerProfile, LeaderboardEntry, RecordMatchResult, AchievementDefinition, ProfileStats } from '../game/profileManager';
import { RockCoinsManager } from '../game/economy/rockCoinsManager';
import { RankingService } from '../firebase/rankingService';
import { INTERNATIONAL_METADATA_CONFIG } from '../game/catalog/internationalCatalog';
import { CalibrationManager } from '../game/sync/calibrationManager';

export function renderAvatarHtml(avatar?: string, className: string = 'avatar-thumb-img'): string {
  if (!avatar) {
    return `<img src="images/avatars/avatar-01.webp" alt="Avatar" class="${className}" onerror="this.onerror=null;this.src='images/default-cover.png';" />`;
  }
  if (avatar.startsWith('rockbrazil-avatar-')) {
    const num = avatar.replace('rockbrazil-avatar-', '');
    return `<img src="images/avatars/avatar-${num}.webp" alt="Avatar ${num}" class="${className}" onerror="this.onerror=null;this.src='images/default-cover.png';" />`;
  }
  if (avatar.startsWith('avatar-') && avatar.endsWith('.webp')) {
    return `<img src="images/avatars/${avatar}" alt="Avatar" class="${className}" onerror="this.onerror=null;this.src='images/default-cover.png';" />`;
  }
  if (avatar.startsWith('http://') || avatar.startsWith('https://')) {
    return `<img src="${avatar}" alt="Avatar" class="${className}" onerror="this.onerror=null;this.src='images/avatars/avatar-01.webp';" />`;
  }
  return `<span class="${className}-emoji">${avatar}</span>`;
}

export class UIManager {
  // In-Game HUD Elements
  private hudElement: HTMLElement;
  private ytPlayerContainer: HTMLElement | null;
  private hudScore: HTMLElement;
  private hudMultiplier: HTMLElement;
  private hudProgressBar: HTMLElement;
  private hudAccuracyFeedback: HTMLElement;
  private hudComboContainer: HTMLElement;
  private hudComboNumber: HTMLElement;
  private meterNeedle: HTMLElement;
  private meterDangerLed: HTMLElement | null = null;
  private meterPctText: HTMLElement;
  private overlayCelebration: HTMLElement | null = null;
  private feedbackTimer: number | null = null;

  // V5: HUD dirty-checking cache to eliminate frame drops & garbage collection
  private lastRenderedScore = -1;
  private lastRenderedCombo = -1;
  private lastRenderedMultiplier = -1;
  private lastRenderedRockMeterPct = -1;
  private lastRenderedProgressPct = -1;
  private comboPopTimeout: any = null;
  private isStartingMatch = false;

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
  private currentActiveProfile: PlayerProfile | null = null;

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
  private resultHits: HTMLElement | null = null;
  private resultPerfect: HTMLElement | null = null;
  private resultGreat: HTMLElement | null = null;
  private resultGood: HTMLElement | null = null;
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
  private checkMuteOnMiss: HTMLInputElement | null = null;
  private screenLogin: HTMLElement | null = null;
  private valMusic: HTMLElement;
  private valSfx: HTMLElement;
  private valOffset: HTMLElement;
  private valSpeed: HTMLElement;
  private overlayUnblockAudio: HTMLElement | null = null;

  // Callbacks
  public onLoginWithGoogleClicked?: () => void;
  public onPlayAsGuestWelcomeClicked?: () => void;
  public onSwitchAccountModeClicked?: () => void;
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
  public onCalibrationOffsetChange?: (deltaMs: number, reset?: boolean) => void;
  public onAdjustSongOffsetClicked?: (deltaMs: number) => void;
  public onUnblockAudioClicked?: () => void;
  public onUnblockCancelClicked?: () => void;
  public onReturnToLibraryClicked?: () => void;
  public onUnlockSongRequested?: (song: SongMetadata) => Promise<{ success: boolean; error?: string; remainingCoins?: number }>;
  public isSongUnlockedChecker?: (songId: string) => boolean;
  public getProfileStatsProvider?: () => any;
  public getAllProfilesProvider?: () => Promise<PlayerProfile[]>;
  private modalUnlockSong: HTMLElement | null = null;
  private modalUnlockCelebration: HTMLElement | null = null;
  private songToUnlock: SongMetadata | null = null;
  private isUnlocking = false;

  // Editor callbacks
  public onOpenEditorClicked?: () => void;
  public onImportZipFile?: (file: File) => void;
  public onPlayAsGuestClicked?: () => void;

  // Profile callbacks
  public onCreateProfileConfirmed?: (name: string, avatar: string) => void;
  public onSwitchProfileRequested?: (id: string) => void;
  public onAvatarConfirmed?: (avatarId: string) => void;
  public googlePhotoUrlProvider?: () => string | undefined;
  public onExportDataRequested?: () => void;
  public onRankingFilterChanged?: (songId: string, diff: Difficulty) => void;
  public onRefreshLinksClicked?: () => void;

  // V13.5 Callbacks
  public onUnlockMysteryRequested?: () => Promise<{ success: boolean; song?: SongMetadata; error?: string; remainingCoins?: number } | void>;
  public onResultRankingClicked?: () => void;
  public onGoogleProfileLoginClicked?: () => void;
  public getAchievementsProvider?: () => { definition: AchievementDefinition; unlocked: boolean; unlockedAt?: number }[];
  private unlockedCelebrationSong?: SongMetadata;

  constructor() {
    this.hudElement = document.getElementById('hud')!;
    this.ytPlayerContainer = document.getElementById('yt-player-container');
    this.setYouTubePlayerVisibility(false);
    this.hudScore = document.getElementById('hud-score')!;
    this.hudMultiplier = document.getElementById('hud-multiplier')!;
    this.hudProgressBar = document.getElementById('song-progress-bar')!;
    this.hudAccuracyFeedback = document.getElementById('hud-accuracy-feedback')!;
    this.hudComboContainer = document.getElementById('hud-combo-container')!;
    this.hudComboNumber = document.getElementById('hud-combo-number')!;
    this.meterNeedle = document.getElementById('rock-meter-needle')!;
    this.meterDangerLed = document.getElementById('rock-meter-danger-led');
    this.meterPctText = document.getElementById('rock-meter-pct-text')!;
    this.overlayCelebration = document.getElementById('overlay-rockbrazil-celebration');

    this.screenMenu = document.getElementById('screen-menu')!;
    this.screenSongSelect = document.getElementById('screen-song-select')!;
    this.modalDifficulty = document.getElementById('modal-difficulty')!;
    this.modalAnalysisProgress = document.getElementById('modal-analysis-progress')!;
    this.modalProfileCreate = document.getElementById('modal-profile-create')!;
    this.modalProfileManager = document.getElementById('modal-player-profiles') || document.getElementById('modal-profile-manager')!;
    this.modalUnlockSong = document.getElementById('modal-unlock-song');
    this.modalUnlockCelebration = document.getElementById('modal-unlock-celebration');
    this.screenRanking = document.getElementById('screen-ranking')!;
    this.screenCountdown = document.getElementById('screen-countdown')!;
    this.countdownNumber = document.getElementById('countdown-number')!;
    this.screenPause = document.getElementById('screen-pause')!;
    this.overlayUnblockAudio = document.getElementById('overlay-unblock-audio');
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
    this.resultHits = document.getElementById('result-hits');
    this.resultPerfect = document.getElementById('result-perfect');
    this.resultGreat = document.getElementById('result-great');
    this.resultGood = document.getElementById('result-good');
    this.resultMiss = document.getElementById('result-miss')!;

    this.gameOverScore = document.getElementById('gameover-score')!;
    this.gameOverCombo = document.getElementById('gameover-combo')!;

    this.sliderMusic = document.getElementById('cfg-volume-music') as HTMLInputElement;
    this.sliderSfx = document.getElementById('cfg-volume-sfx') as HTMLInputElement;
    this.sliderOffset = document.getElementById('cfg-offset') as HTMLInputElement;
    this.sliderSpeed = document.getElementById('cfg-speed') as HTMLInputElement;
    this.checkFx = document.getElementById('cfg-fx') as HTMLInputElement;
    this.checkMuteOnMiss = document.getElementById('cfg-mute-on-miss') as HTMLInputElement;
    this.screenLogin = document.getElementById('screen-login') || document.getElementById('modal-welcome-entry');

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

    // Top Profile Header Pill (Opens PERFIS DE JOGADORES)
    document.getElementById('btn-menu-profile')?.addEventListener('click', () => {
      this.openPlayerProfilesModal();
    });

    document.getElementById('btn-open-create-new-profile')?.addEventListener('click', () => {
      this.modalProfileManager.classList.add('hidden');
      document.getElementById('modal-player-profiles')?.classList.add('hidden');
      this.modalProfileCreate.classList.remove('hidden');
    });

    document.getElementById('btn-close-profile-manager')?.addEventListener('click', () => {
      this.modalProfileManager.classList.add('hidden');
      document.getElementById('modal-player-profiles')?.classList.add('hidden');
    });

    document.getElementById('btn-close-player-profiles')?.addEventListener('click', () => {
      this.modalProfileManager.classList.add('hidden');
      document.getElementById('modal-player-profiles')?.classList.add('hidden');
    });

    document.getElementById('btn-play-as-guest')?.addEventListener('click', () => {
      this.modalProfileManager.classList.add('hidden');
      document.getElementById('modal-player-profiles')?.classList.add('hidden');
      this.onPlayAsGuestClicked?.();
    });

    document.getElementById('btn-cancel-create-profile')?.addEventListener('click', () => {
      this.modalProfileCreate.classList.add('hidden');
    });

    // Song Unlock Confirm / Cancel Handlers (V13.3)
    document.getElementById('btn-confirm-unlock')?.addEventListener('click', async () => {
      if (!this.songToUnlock || this.isUnlocking) return;
      this.isUnlocking = true;
      try {
        const res = await this.onUnlockSongRequested?.(this.songToUnlock);
        if (res && res.success) {
          document.getElementById('modal-unlock-song')?.classList.add('hidden');
          const unlockedSong = this.songToUnlock;
          this.showUnlockCelebration(unlockedSong);
        } else {
          alert('Não foi possível desbloquear a música. Saldo de RockCoins insuficiente.');
        }
      } finally {
        this.isUnlocking = false;
      }
    });

    document.getElementById('btn-cancel-unlock')?.addEventListener('click', () => {
      document.getElementById('modal-unlock-song')?.classList.add('hidden');
    });

    document.getElementById('btn-back-to-catalog')?.addEventListener('click', () => {
      document.getElementById('modal-unlock-song')?.classList.add('hidden');
    });

    // Celebration modal choices (V13.3 & V13.5)
    document.getElementById('btn-celebration-choose-diff')?.addEventListener('click', () => {
      document.getElementById('modal-unlock-celebration')?.classList.add('hidden');
      const targetSong = this.unlockedCelebrationSong || this.songToUnlock;
      if (targetSong) {
        this.openDifficultyModal(targetSong, this.currentActiveProfile);
      }
    });

    document.getElementById('btn-celebration-close')?.addEventListener('click', () => {
      document.getElementById('modal-unlock-celebration')?.classList.add('hidden');
      if (this.cachedSongs.length > 0) {
        this.renderSongLibrary(this.cachedSongs, this.currentActiveProfile);
      }
    });

    // V13.3.1: Avatar Selection Handlers
    document.getElementById('btn-open-change-avatar')?.addEventListener('click', () => {
      const googlePhoto = this.googlePhotoUrlProvider?.();
      this.openSelectAvatarModal(googlePhoto);
    });

    document.getElementById('btn-confirm-avatar')?.addEventListener('click', () => {
      document.getElementById('modal-select-avatar')?.classList.add('hidden');
      if (this.pendingAvatarSelection) {
        this.onAvatarConfirmed?.(this.pendingAvatarSelection);
      }
    });

    document.getElementById('btn-cancel-avatar')?.addEventListener('click', () => {
      document.getElementById('modal-select-avatar')?.classList.add('hidden');
    });

    // V13.3.1: Global Ranking Handlers
    document.getElementById('btn-menu-ranking')?.addEventListener('click', () => {
      this.openGlobalRankingModal();
    });

    document.getElementById('btn-close-ranking')?.addEventListener('click', () => {
      document.getElementById('modal-global-ranking')?.classList.add('hidden');
    });

    document.getElementById('rank-tab-general')?.addEventListener('click', () => {
      this.loadRankingView('general');
    });
    document.getElementById('rank-tab-song')?.addEventListener('click', () => {
      this.loadRankingView('song');
    });
    document.getElementById('rank-tab-diff')?.addEventListener('click', () => {
      this.loadRankingView('difficulty');
    });

    document.getElementById('rank-song-select')?.addEventListener('change', (e) => {
      this.currentRankSongId = (e.target as HTMLSelectElement).value;
      this.loadRankingView('song');
    });

    document.querySelectorAll('.rank-diff-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.rank-diff-btn').forEach(b => b.classList.remove('active'));
        const target = e.currentTarget as HTMLElement;
        target.classList.add('active');
        this.currentRankDiff = (target.dataset.diff as Difficulty) || 'MEDIUM';
        this.loadRankingView('difficulty');
      });
    });

    document.getElementById('btn-open-editor')?.addEventListener('click', () => {
      this.onOpenEditorClicked?.();
    });

    document.getElementById('btn-refresh-youtube-links')?.addEventListener('click', () => {
      this.onRefreshLinksClicked?.();
    });

    const zipInput = document.getElementById('zip-file-input') as HTMLInputElement;
    zipInput?.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files[0]) {
        this.onImportZipFile?.(files[0]);
      }
    });

    // Song select back & play
    document.getElementById('btn-song-select-back')?.addEventListener('click', () => {
      this.onReturnToMenuClicked?.();
    });

    document.getElementById('btn-song-select-play')?.addEventListener('click', () => {
      if (!this.currentSelectedSong) return;
      const isUnlocked = this.isSongUnlockedChecker
        ? this.isSongUnlockedChecker(this.currentSelectedSong.id)
        : (this.currentActiveProfile?.unlockedSongIds ? this.currentActiveProfile.unlockedSongIds.includes(this.currentSelectedSong.id) : true);

      if (!isUnlocked) {
        this.openUnlockModal(this.currentSelectedSong, this.currentActiveProfile);
        return;
      }

      if (this.currentSelectedSong.isAvailable) {
        this.openDifficultyModal(this.currentSelectedSong, this.currentActiveProfile);
      } else {
        alert(`O áudio para "${this.currentSelectedSong.title}" ainda não foi carregado. Utilize o botão "VINCULAR" ou "IMPORTAR MÚSICA" para selecionar seu arquivo.`);
      }
    });

    // Filter tabs
    document.getElementById('tab-songs-all')?.addEventListener('click', (e) => {
      this.currentFilter = 'all';
      document.querySelectorAll('.notebook-filter-tab, .filter-tab').forEach((t) => t.classList.remove('active'));
      (e.currentTarget as HTMLElement).classList.add('active');
      this.onOpenSongSelectClicked?.('all');
    });

    document.getElementById('tab-songs-custom')?.addEventListener('click', (e) => {
      this.currentFilter = 'custom';
      document.querySelectorAll('.notebook-filter-tab, .filter-tab').forEach((t) => t.classList.remove('active'));
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

    // Difficulty modal choices (strictly de-bounced to prevent duplicate match starts)
    document.querySelectorAll('.btn-diff-choice').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (this.isStartingMatch) return;
        const diff = (e.currentTarget as HTMLElement).dataset.diff as Difficulty;
        if (this.currentSelectedSong && diff) {
          this.isStartingMatch = true;
          this.modalDifficulty.classList.add('hidden');
          this.onPlayGameRequested?.(this.currentSelectedSong, diff);
          setTimeout(() => {
            this.isStartingMatch = false;
          }, 1000);
        }
      });
    });

    document.getElementById('btn-diff-cancel')?.addEventListener('click', () => {
      this.modalDifficulty.classList.add('hidden');
    });

    // In-game Pause & Controls (Instant 1-touch response on mobile and desktop)
    const pauseBtn = document.getElementById('btn-pause');
    let lastPauseTriggerTime = 0;
    const triggerPause = (e?: Event) => {
      const now = Date.now();
      if (now - lastPauseTriggerTime < 350) return;
      lastPauseTriggerTime = now;
      if (e && e.cancelable) {
        e.preventDefault();
        e.stopPropagation();
      }
      this.onPauseClicked?.();
    };

    pauseBtn?.addEventListener('pointerdown', (e) => {
      triggerPause(e);
    }, { passive: false });

    pauseBtn?.addEventListener('click', (e) => {
      triggerPause(e);
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

    // Autoplay unblock button
    document.getElementById('btn-unblock-audio')?.addEventListener('click', () => {
      this.showAutoplayUnblockPrompt(false);
      this.onUnblockAudioClicked?.();
    });

    document.getElementById('btn-unblock-cancel')?.addEventListener('click', () => {
      this.showAutoplayUnblockPrompt(false);
      this.onUnblockCancelClicked?.();
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
      if (this.onReturnToLibraryClicked) {
        this.onReturnToLibraryClicked();
      } else {
        this.onReturnToMenuClicked?.();
      }
    });
    document.getElementById('btn-result-ranking')?.addEventListener('click', () => {
      this.onResultRankingClicked?.();
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

    document.getElementById('cfg-effects-mode')?.addEventListener('change', (event) => {
      const effectsMode = (event.target as HTMLSelectElement).value === 'REDUCED' ? 'REDUCED' : 'NORMAL';
      this.onSettingsChanged?.({ effectsMode });
    });
    this.checkFx?.addEventListener('change', () => {
      this.onSettingsChanged?.({ visualEffectsEnabled: this.checkFx.checked });
    });

    this.checkMuteOnMiss?.addEventListener('change', () => {
      this.onSettingsChanged?.({ muteOnMiss: this.checkMuteOnMiss?.checked });
    });

    document.getElementById('btn-login-google')?.addEventListener('click', () => {
      this.onLoginWithGoogleClicked?.();
    });

    document.getElementById('btn-play-guest')?.addEventListener('click', () => {
      this.onPlayAsGuestWelcomeClicked?.();
    });

    document.getElementById('btn-switch-account-mode')?.addEventListener('click', () => {
      this.onSwitchAccountModeClicked?.();
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
    this.currentActiveProfile = profile;
    this.menuProfileAvatar.innerHTML = renderAvatarHtml(profile.avatar, 'profile-avatar-img');
    if (profile.id === 'guest') {
      this.menuProfileName.textContent = profile.name || 'CONVIDADO';
      const hint = document.querySelector('.profile-switch-hint');
      if (hint) hint.textContent = 'Perfil';
    } else {
      this.menuProfileName.textContent = profile.name;
      const hint = document.querySelector('.profile-switch-hint');
      if (hint) hint.textContent = 'Trocar';
    }
    this.updateRankingButtonVisibility(profile);
  }

  updateRankingButtonVisibility(profile: PlayerProfile | null): void {
    const btnMenuRank = document.getElementById('btn-menu-ranking');
    const isGoogle = profile?.accountType === 'google' && profile.id !== 'guest';
    if (btnMenuRank) {
      if (isGoogle) {
        btnMenuRank.classList.remove('hidden');
      } else {
        btnMenuRank.classList.add('hidden');
      }
    }
  }

  async openPlayerProfilesModal(): Promise<void> {
    const modal = document.getElementById('modal-player-profiles') || this.modalProfileManager;
    if (!modal) return;

    const titleEl = modal.querySelector('.profiles-title');
    if (titleEl) titleEl.textContent = 'MEU PERFIL';
    const subtitleEl = modal.querySelector('.profiles-subtitle');
    if (subtitleEl) subtitleEl.textContent = 'Acompanhe suas estatísticas, conquistas e evolução no RockBrazil.';

    const profile = this.currentActiveProfile;
    if (profile) {
      const avatarEl = document.getElementById('active-profile-avatar');
      const nameEl = document.getElementById('active-profile-name');
      const typeEl = document.getElementById('active-profile-type');
      const coinsEl = document.getElementById('active-profile-coins');

      if (avatarEl) avatarEl.innerHTML = renderAvatarHtml(profile.avatar, 'player-avatar-img');
      if (nameEl) nameEl.textContent = profile.name || 'Convidado';
      if (typeEl) {
        typeEl.textContent = profile.accountType === 'google' ? 'Conta Google' : 'Modo Convidado';
      }
      if (coinsEl) {
        coinsEl.textContent = `${profile.rockCoins || 0} RockCoins`;
      }

      // Botão Discreto de Login Google no Perfil (V13.5)
      const googleBtn = document.getElementById('btn-google-profile-action');
      if (googleBtn) {
        const isGoogle = profile.accountType === 'google' && profile.id !== 'guest';
        if (isGoogle) {
          googleBtn.classList.add('connected');
          googleBtn.setAttribute('title', `Conta Google Conectada (${profile.name})`);
          googleBtn.setAttribute('aria-label', `Conta Google Conectada: ${profile.name}`);
        } else {
          googleBtn.classList.remove('connected');
          googleBtn.setAttribute('title', 'Entrar com o Google');
          googleBtn.setAttribute('aria-label', 'Entrar com o Google');
        }
        googleBtn.onclick = () => {
          this.onGoogleProfileLoginClicked?.();
        };
      }

      // V13.5 / V13.7: Renderização das 8 Conquistas da Temporada 1 com animação exclusiva em MEU PERFIL
      if (this.getAchievementsProvider) {
        const achievements = this.getAchievementsProvider();
        const gridEl = document.getElementById('achievements-grid');
        const countEl = document.getElementById('achievements-progress-count');
        const unlockedCount = achievements.filter((a) => a.unlocked).length;
        if (countEl) countEl.textContent = `${unlockedCount} / ${achievements.length}`;

        // Recupera histórico de conquistas já exibidas nesta aba para este perfil
        const seenKey = `rb_seen_achievements_${profile?.id || 'guest'}`;
        let seenIds: string[] = [];
        try {
          seenIds = JSON.parse(localStorage.getItem(seenKey) || '[]');
        } catch {}
        const seenSet = new Set(seenIds);

        let newUnlockIndex = 0;
        const newlySeen: string[] = [];

        if (gridEl) {
          gridEl.innerHTML = achievements.map((a) => {
            const isNewlyUnlocked = a.unlocked && !seenSet.has(a.definition.id);
            if (isNewlyUnlocked) {
              newlySeen.push(a.definition.id);
            }
            const animDelay = isNewlyUnlocked ? `${(newUnlockIndex++) * 0.25}s` : '0s';
            const statusText = a.unlocked ? 'CONQUISTADO' : 'BLOQUEADO';
            return `
              <div class="achievement-card ${a.unlocked ? 'unlocked' : 'locked'} ${isNewlyUnlocked ? 'newly-unlocked' : ''}" style="${isNewlyUnlocked ? `--anim-delay: ${animDelay};` : ''}">
                ${isNewlyUnlocked ? '<div class="achievement-shine-shimmer"></div><span class="achievement-sparkle">✨</span>' : ''}
                <span class="achievement-icon">${a.definition.icon}</span>
                <span class="achievement-title">${a.definition.title}</span>
                <span class="achievement-desc">${a.definition.description}</span>
                <span class="achievement-status-badge">${statusText}</span>
              </div>
            `;
          }).join('');

          // Persiste as conquistas visualizadas para exibir a animação apenas uma vez por conquista
          if (newlySeen.length > 0) {
            try {
              newlySeen.forEach(id => seenSet.add(id));
              localStorage.setItem(seenKey, JSON.stringify(Array.from(seenSet)));
            } catch {}
          }
        }
      }

      const stats = this.getProfileStatsProvider ? this.getProfileStatsProvider() : null;
      if (stats) {
        const songsPlayedEl = document.getElementById('stat-songs-played');
        const matchesEl = document.getElementById('stat-completed-matches');
        const hitsEl = document.getElementById('stat-total-hits');
        const missesEl = document.getElementById('stat-total-misses');
        const accEl = document.getElementById('stat-avg-accuracy');
        const comboEl = document.getElementById('stat-max-combo');

        if (songsPlayedEl) songsPlayedEl.textContent = stats.songsPlayed.toString();
        if (matchesEl) matchesEl.textContent = stats.completedMatches.toString();
        if (hitsEl) hitsEl.textContent = stats.totalHits.toString();
        if (missesEl) missesEl.textContent = stats.totalMisses.toString();
        if (accEl) accEl.textContent = `${stats.avgAccuracy}%`;
        if (comboEl) comboEl.textContent = stats.maxCombo.toString();

        const bestCover = document.getElementById('best-song-cover') as HTMLImageElement;
        const bestTitle = document.getElementById('best-song-title');
        const bestArtist = document.getElementById('best-song-artist');
        const bestDiff = document.getElementById('best-song-diff');
        const bestScore = document.getElementById('best-song-score');

        if (stats.bestSong) {
          if (bestCover) bestCover.src = stats.bestSong.coverUrl || 'images/default-cover.png';
          if (bestTitle) bestTitle.textContent = stats.bestSong.title;
          if (bestArtist) bestArtist.textContent = stats.bestSong.artist;
          if (bestDiff) bestDiff.textContent = stats.bestSong.difficulty;
          if (bestScore) bestScore.textContent = `${stats.bestSong.score.toLocaleString('pt-BR')} PTS`;
        } else {
          if (bestCover) bestCover.src = 'images/default-cover.png';
          if (bestTitle) bestTitle.textContent = '—';
          if (bestArtist) bestArtist.textContent = 'Nenhuma partida concluída ainda';
          if (bestDiff) bestDiff.textContent = '—';
          if (bestScore) bestScore.textContent = '0 PTS';
        }
      }

      if (this.getAllProfilesProvider) {
        const allProfiles = await this.getAllProfilesProvider();
        const listEl = document.getElementById('profiles-scroll-list');
        if (listEl) {
          listEl.innerHTML = allProfiles.map((p) => `
            <div class="profile-select-item ${p.id === profile.id ? 'active' : ''}" data-profile-id="${p.id}">
              <div class="profile-item-left">
                <span class="profile-item-avatar">${renderAvatarHtml(p.avatar, 'profile-item-avatar-img')}</span>
                <span class="profile-item-name">${p.name}</span>
              </div>
              <div class="profile-item-right" style="display:flex; align-items:center; gap:8px;">
                <span class="profile-item-coins">🎸 ${p.rockCoins || 0}</span>
                ${p.id === profile.id ? '<span class="active-badge">ATIVO</span>' : '<button class="notebook-bar-mini-btn btn-choose-profile" data-profile-id="' + p.id + '" style="font-size:10px; padding:2px 8px;">ESCOLHER</button>'}
              </div>
            </div>
          `).join('');

          listEl.querySelectorAll('.profile-select-item').forEach((item) => {
            item.addEventListener('click', (e) => {
              const id = (e.currentTarget as HTMLElement).dataset.profileId;
              if (id && id !== profile.id) {
                this.onSwitchProfileRequested?.(id);
              }
            });
          });
        }
      }
    }

    modal.classList.remove('hidden');
  }

  openUnlockModal(song: SongMetadata, activeProfile?: PlayerProfile | null): void {
    this.songToUnlock = song;
    const profile = activeProfile || this.currentActiveProfile;
    const modal = document.getElementById('modal-unlock-song');
    if (!modal) return;

    const cover = document.getElementById('unlock-song-cover') as HTMLImageElement;
    const title = document.getElementById('unlock-song-title');
    const artist = document.getElementById('unlock-song-artist');
    const costAmount = document.getElementById('unlock-cost-amount');
    const currentBalance = document.getElementById('unlock-current-balance');
    const insufficientMsg = document.getElementById('unlock-insufficient-msg');
    const btnConfirm = document.getElementById('btn-confirm-unlock');
    const btnCancel = document.getElementById('btn-cancel-unlock');
    const btnBack = document.getElementById('btn-back-to-catalog');

    if (cover) cover.src = song.coverUrl || 'images/default-cover.png';
    if (title) title.textContent = song.title;
    if (artist) artist.textContent = song.artist;
    if (costAmount) costAmount.textContent = '5 RockCoins';

    const balance = profile?.rockCoins || 0;
    if (currentBalance) currentBalance.textContent = `${balance} RockCoins`;

    if (balance < 5) {
      insufficientMsg?.classList.remove('hidden');
      btnConfirm?.classList.add('hidden');
      btnCancel?.classList.add('hidden');
      btnBack?.classList.remove('hidden');
    } else {
      insufficientMsg?.classList.add('hidden');
      btnConfirm?.classList.remove('hidden');
      btnCancel?.classList.remove('hidden');
      btnBack?.classList.add('hidden');
    }

    modal.classList.remove('hidden');
  }

  showUnlockCelebration(song: SongMetadata): void {
    const modal = document.getElementById('modal-unlock-celebration');
    if (!modal) return;

    this.unlockedCelebrationSong = song;
    this.songToUnlock = song;
    this.currentSelectedSong = song;

    const cover = document.getElementById('celebration-song-cover') as HTMLImageElement;
    const title = document.getElementById('celebration-song-title');
    const artist = document.getElementById('celebration-song-artist');
    const flipCard = document.getElementById('mystery-flip-card');

    if (cover) cover.src = song.coverUrl || 'images/default-cover.png';
    if (title) title.textContent = song.title;
    if (artist) artist.textContent = song.artist;

    if (flipCard) {
      flipCard.classList.remove('revealed');
    }

    modal.classList.remove('hidden');

    const prefersReducedMotion = reducedEffects() || document.documentElement.dataset.effects === 'reduced';
    if (prefersReducedMotion) {
      if (flipCard) flipCard.classList.add('revealed');
    } else {
      setTimeout(() => {
        if (flipCard) flipCard.classList.add('revealed');
      }, 700);
    }
  }

  private cachedSongs: SongMetadata[] = [];
  private pendingAvatarSelection = 'rockbrazil-avatar-01';
  private currentRankFilter: 'general' | 'song' | 'difficulty' = 'general';
  private currentRankDiff: Difficulty = 'MEDIUM';
  private currentRankSongId = '';

  openSelectAvatarModal(googlePhotoUrl?: string): void {
    const modal = document.getElementById('modal-select-avatar');
    const grid = document.getElementById('avatar-options-grid');
    const previewImg = document.getElementById('avatar-preview-img') as HTMLImageElement;
    const previewLabel = document.getElementById('avatar-preview-label');
    if (!modal || !grid) return;

    this.pendingAvatarSelection = this.currentActiveProfile?.avatar || 'rockbrazil-avatar-01';

    let gridHtml = '';
    // 15 avatares oficiais (todos 100% gratuitos)
    for (let i = 1; i <= 15; i++) {
      const num = String(i).padStart(2, '0');
      const avatarId = `rockbrazil-avatar-${num}`;
      const isSelected = this.pendingAvatarSelection === avatarId;
      gridHtml += `
        <div class="avatar-card-item ${isSelected ? 'selected' : ''}"
             data-avatar-id="${avatarId}"
             data-avatar-name="Avatar ${i}"
             data-avatar-src="images/avatars/avatar-${num}.webp"
             role="radio"
             aria-checked="${isSelected}"
             tabindex="0"
             aria-label="Avatar oficial ${i}">
          <img src="images/avatars/avatar-${num}.webp" alt="Avatar ${i}" class="avatar-thumb-img" loading="lazy" />
        </div>
      `;
    }

    // Opção de Foto da Conta Google se disponível
    if (googlePhotoUrl) {
      const isSelected = this.pendingAvatarSelection === googlePhotoUrl;
      gridHtml += `
        <div class="avatar-card-item ${isSelected ? 'selected' : ''}"
             data-avatar-id="${googlePhotoUrl}"
             data-avatar-name="Foto Google"
             data-avatar-src="${googlePhotoUrl}"
             role="radio"
             aria-checked="${isSelected}"
             tabindex="0"
             aria-label="Foto da Conta Google">
          <img src="${googlePhotoUrl}" alt="Foto Google" class="avatar-thumb-img" loading="lazy" />
        </div>
      `;
    }

    grid.innerHTML = gridHtml;

    const updatePreview = (id: string, name: string, src: string) => {
      this.pendingAvatarSelection = id;
      if (previewImg) previewImg.src = src;
      if (previewLabel) previewLabel.textContent = name;
      grid.querySelectorAll('.avatar-card-item').forEach((item) => {
        const itemEl = item as HTMLElement;
        const matches = itemEl.dataset.avatarId === id;
        itemEl.classList.toggle('selected', matches);
        itemEl.setAttribute('aria-checked', matches ? 'true' : 'false');
      });
    };

    if (this.pendingAvatarSelection.startsWith('rockbrazil-avatar-')) {
      const num = this.pendingAvatarSelection.replace('rockbrazil-avatar-', '');
      updatePreview(this.pendingAvatarSelection, `Avatar ${parseInt(num, 10)}`, `images/avatars/avatar-${num}.webp`);
    } else if (googlePhotoUrl && this.pendingAvatarSelection === googlePhotoUrl) {
      updatePreview(googlePhotoUrl, 'Foto Google', googlePhotoUrl);
    } else {
      updatePreview('rockbrazil-avatar-01', 'Avatar 1', 'images/avatars/avatar-01.webp');
    }

    grid.querySelectorAll('.avatar-card-item').forEach((card) => {
      const c = card as HTMLElement;
      c.addEventListener('click', () => {
        updatePreview(c.dataset.avatarId!, c.dataset.avatarName!, c.dataset.avatarSrc!);
      });
      c.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          updatePreview(c.dataset.avatarId!, c.dataset.avatarName!, c.dataset.avatarSrc!);
        }
      });
    });

    modal.classList.remove('hidden');
  }

  async openGlobalRankingModal(): Promise<void> {
    const modal = document.getElementById('modal-global-ranking');
    if (!modal) return;

    modal.classList.remove('hidden');
    await this.loadRankingView('general');
  }

  async loadRankingView(filter: 'general' | 'song' | 'difficulty'): Promise<void> {
    this.currentRankFilter = filter;
    const container = document.getElementById('ranking-list-container');
    const filtersBar = document.getElementById('ranking-filters-bar');
    const songSelect = document.getElementById('rank-song-select') as HTMLSelectElement;
    const diffSelector = document.getElementById('rank-diff-selector');
    const myPositionCard = document.getElementById('ranking-my-card');

    if (!container) return;

    document.querySelectorAll('.rank-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.filter === filter);
    });

    if (filter === 'general') {
      filtersBar?.classList.add('hidden');
      songSelect?.classList.add('hidden');
      diffSelector?.classList.add('hidden');
    } else if (filter === 'song') {
      filtersBar?.classList.remove('hidden');
      songSelect?.classList.remove('hidden');
      diffSelector?.classList.remove('hidden');

      if (songSelect && (songSelect.options.length === 0 || !this.currentRankSongId)) {
        const brazilianSongs = this.cachedSongs.filter(s => !s.isInternational && !s.id.startsWith('intl-'));
        if (brazilianSongs.length > 0) {
          songSelect.innerHTML = brazilianSongs.map(s => `<option value="${s.id}">${s.title} - ${s.artist}</option>`).join('');
          this.currentRankSongId = songSelect.value || brazilianSongs[0].id;
        }
      }
    } else if (filter === 'difficulty') {
      filtersBar?.classList.remove('hidden');
      songSelect?.classList.add('hidden');
      diffSelector?.classList.remove('hidden');
    }

    container.innerHTML = '<div class="ranking-loading">Carregando pontuações oficiais...</div>';

    try {
      const selectedSongId = filter === 'song'
        ? (this.currentRankSongId || songSelect?.value || (this.cachedSongs.find(s => !s.isInternational)?.id))
        : undefined;
      const selectedDiff = filter === 'difficulty' || filter === 'song'
        ? (this.currentRankDiff || 'MEDIUM')
        : undefined;

      const data = await RankingService.fetchRanking(
        filter,
        selectedSongId,
        selectedDiff,
        30
      );

      if (!data || data.length === 0) {
        container.innerHTML = '<div class="ranking-loading">Nenhum recorde registrado ainda nesta categoria. Seja o primeiro a pontuar!</div>';
        if (myPositionCard) myPositionCard.classList.add('hidden');
        return;
      }

      const currentUid = this.currentActiveProfile?.id;
      let myRankRow: any = null;

      container.innerHTML = data.map((entry: any, index: number) => {
        const rank = index + 1;
        const isMyRow = currentUid && entry.uid === currentUid;
        if (isMyRow) myRankRow = { ...entry, rank };

        let medal = `${rank}º`;
        if (rank === 1) medal = '🥇';
        else if (rank === 2) medal = '🥈';
        else if (rank === 3) medal = '🥉';

        const subDetail = filter === 'general'
          ? `${entry.songsCount || 1} músicas registradas`
          : `${entry.songTitle || ''} (${(entry.difficulty || '').toUpperCase()})`;

        return `
          <div class="ranking-row rank-${rank <= 3 ? rank : 'normal'} ${isMyRow ? 'my-row' : ''}">
            <div class="rank-col-left">
              <span class="rank-pos">${medal}</span>
              <div class="rank-avatar-box">
                ${renderAvatarHtml(entry.avatar, 'rank-avatar-img')}
              </div>
              <div class="rank-info">
                <span class="rank-player-name">${entry.playerName || 'Rockeiro'}${isMyRow ? ' (Você)' : ''}</span>
                <span class="rank-sub-detail">${subDetail}</span>
              </div>
            </div>
            <div class="rank-col-right">
              <span class="rank-score">${(entry.totalScore || entry.score || 0).toLocaleString('pt-BR')} PTS</span>
              ${entry.accuracy !== undefined ? `<span class="rank-accuracy">${entry.accuracy}% precisão</span>` : ''}
            </div>
          </div>
        `;
      }).join('');

    } catch (err: any) {
      container.innerHTML = `<div class="ranking-loading" style="color:#f87171;">Não foi possível carregar o ranking no momento. Verifique sua conexão com a internet.</div>`;
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

    const modeSelect = document.getElementById('cfg-effects-mode') as HTMLSelectElement | null;
    if (modeSelect) modeSelect.value = settings.effectsMode ?? 'NORMAL';
    if (this.checkFx) this.checkFx.checked = settings.visualEffectsEnabled;
    if (this.checkMuteOnMiss) this.checkMuteOnMiss.checked = Boolean(settings.muteOnMiss);
  }

  showLoginLoading(loading: boolean): void {
    const indicator = document.getElementById('login-loading-indicator');
    if (indicator) {
      indicator.classList.toggle('hidden', !loading);
    }
  }

  showWelcomeModal(show: boolean): void {
    this.showScreen(show ? GameState.LOGIN : GameState.MENU);
  }

  showScreen(state: GameState): void {
    if (this.screenLogin) {
      this.screenLogin.classList.toggle('hidden', state !== GameState.LOGIN);
    }
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
      if (state !== GameState.COUNTDOWN && state !== GameState.PAUSED) {
        this.setYouTubePlayerVisibility(false);
      }
    }
  }

  public setYouTubePlayerVisibility(visible: boolean): void {
    document.getElementById('game-app')?.classList.toggle('youtube-active', visible);
    if (!this.ytPlayerContainer) {
      this.ytPlayerContainer = document.getElementById('yt-player-container');
    }
    if (this.ytPlayerContainer) {
      if (visible) {
        this.ytPlayerContainer.classList.remove('hidden');
        this.ytPlayerContainer.style.setProperty('display', 'block', 'important');
      } else {
        this.ytPlayerContainer.classList.add('hidden');
        this.ytPlayerContainer.style.setProperty('display', 'none', 'important');
      }
    }
  }

  public updatePauseOffsetDisplay(_offsetMs: number): void {
    // Painel de offset visual removido da tela de Pause conforme requisitos da V13.7
  }

  setLaneVisualActive(lane: Lane, active: boolean): void {
    if (this.fretButtons[lane]) {
      this.fretButtons[lane].classList.toggle('pressed', active);
    }
  }

  setCountdown(text: string): void {
    this.countdownNumber.textContent = text;
  }

  setPauseCalibrationOffset(_offsetMs: number): void {
    // V13.7: Painel visual de offset removido do menu de pausa
  }

  showAutoplayUnblockPrompt(show: boolean): void {
    document.getElementById('yt-player-container')?.classList.toggle('yt-awaiting-gesture', show);
    if (this.overlayUnblockAudio) {
      this.overlayUnblockAudio.classList.toggle('hidden', !show);
    }
  }

  showJudgment(judgment: 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS'): void {
    const el = document.getElementById('hud-judgment');
    if (!el) return;
    el.textContent = judgment;
    el.className = `judge-${judgment.toLowerCase()}`;
    el.getAnimations?.().forEach(animation => animation.cancel());
    el.animate?.([{ opacity: 1 }, { opacity: 1, offset: 0.65 }, { opacity: 0 }], {
      duration: 500, fill: 'forwards'
    });
  }

  updateHUD(stats: GameStats, currentTime: number, duration: number): void {
    // 1. Score (only format string if score changed)
    if (stats.score !== this.lastRenderedScore) {
      this.lastRenderedScore = stats.score;
      this.hudScore.textContent = stats.score.toLocaleString('pt-BR');
    }

    // 2. Vertical Industrial Rock Performance Meter (0% to 100%)
    const pct = Math.max(0, Math.min(100, Math.round(stats.rockMeter)));
    if (pct !== this.lastRenderedRockMeterPct) {
      this.lastRenderedRockMeterPct = pct;
      if (this.meterNeedle) {
        this.meterNeedle.style.bottom = `${pct}%`;
        this.meterNeedle.style.left = '';
      }
      if (this.meterPctText) {
        this.meterPctText.textContent = `${pct}%`;
      }
      if (this.meterDangerLed) {
        this.meterDangerLed.classList.toggle('hidden', pct >= 30);
      }
    }

    // 3. Multiplier
    if (stats.multiplier !== this.lastRenderedMultiplier) {
      this.lastRenderedMultiplier = stats.multiplier;
      this.hudMultiplier.textContent = `${stats.multiplier}X`;
      this.hudMultiplier.className = `multiplier-badge mult-${stats.multiplier}x`;
    }

    // 4. Song Progress Line
    if (duration > 0) {
      const progressPct = Math.min(100, Math.floor((currentTime / duration) * 100));
      if (progressPct !== this.lastRenderedProgressPct) {
        this.lastRenderedProgressPct = progressPct;
        this.hudProgressBar.style.width = `${progressPct}%`;
      }
    }

    // 5. Combo (dirty-checked, single timer, no continuous allocation)
    if (stats.combo >= 2) {
      if (stats.combo !== this.lastRenderedCombo) {
        const isIncrease = stats.combo > this.lastRenderedCombo;
        this.lastRenderedCombo = stats.combo;
        this.hudComboContainer.classList.remove('hidden');
        this.hudComboNumber.textContent = stats.combo.toString();

        if (isIncrease) {
          if (this.comboPopTimeout !== null) {
            clearTimeout(this.comboPopTimeout);
          }
          this.hudComboContainer.classList.add('pop');
          this.comboPopTimeout = setTimeout(() => {
            this.hudComboContainer.classList.remove('pop');
            this.comboPopTimeout = null;
          }, 120);
        }
      }
    } else {
      if (this.lastRenderedCombo !== 0) {
        this.lastRenderedCombo = 0;
        if (this.comboPopTimeout !== null) {
          clearTimeout(this.comboPopTimeout);
          this.comboPopTimeout = null;
        }
        this.hudComboContainer.classList.remove('pop');
        this.hudComboContainer.classList.add('hidden');
      }
    }
  }

  hidePauseModal(): void {
    if (this.screenPause) {
      this.screenPause.classList.add('hidden');
    }
  }

  showCelebration(onComplete: () => void): void {
    if (document.documentElement.dataset.effects === 'reduced' || reducedEffects()) { onComplete(); return; }
    if (this.overlayCelebration) {
      let isDone = false;
      const done = () => {
        if (isDone) return;
        isDone = true;
        if (this.overlayCelebration) {
          this.overlayCelebration.classList.add('hidden');
          this.overlayCelebration.onclick = null;
        }
        onComplete();
      };
      this.overlayCelebration.classList.remove('hidden');
      this.overlayCelebration.onclick = done;
      setTimeout(done, 650);
    } else {
      onComplete();
    }
  }

  resetHUD(): void {
    this.isStartingMatch = false;
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    if (this.comboPopTimeout !== null) {
      clearTimeout(this.comboPopTimeout);
      this.comboPopTimeout = null;
    }
    this.lastRenderedScore = -1;
    this.lastRenderedCombo = -1;
    this.lastRenderedMultiplier = -1;
    this.lastRenderedRockMeterPct = -1;
    this.lastRenderedProgressPct = -1;

    this.hudScore.textContent = '0';
    this.hudMultiplier.textContent = '1X';
    this.hudMultiplier.className = 'multiplier-badge mult-1x';
    this.hudProgressBar.style.width = '0%';
    this.hudComboContainer.classList.remove('pop');
    this.hudComboContainer.classList.add('hidden');
    this.hudComboNumber.textContent = '0';
    this.meterNeedle.style.bottom = '50%';
    this.meterNeedle.style.left = '';
    this.meterPctText.textContent = '50%';
    this.meterDangerLed?.classList.add('hidden');
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

  showResults(song: SongMetadata, stats: GameStats, recordResult?: RecordMatchResult, difficulty: Difficulty = 'HARD', cleared: boolean = true): void {
    const hits = stats.hitsCount ?? (stats.perfectCount + stats.greatCount + stats.goodCount);
    const misses = stats.missCount ?? 0;
    const playable = stats.playableNotesCount ?? (hits + misses);

    // 1. Header: Capa, Título, Artista, Dificuldade
    this.resultSongTitle.textContent = song.title;
    const artistEl = document.getElementById('result-song-artist');
    if (artistEl) artistEl.textContent = song.artist;
    const diffEl = document.getElementById('result-song-diff');
    if (diffEl) diffEl.textContent = difficulty;
    const coverEl = document.getElementById('result-album-cover') as HTMLImageElement;
    if (coverEl) {
      const fallback = new URL(`${import.meta.env.BASE_URL}images/default-cover.png`, window.location.origin).href;
      coverEl.onerror = () => { coverEl.onerror = null; coverEl.src = fallback; };
      coverEl.src = song.coverUrl || fallback;
    }

    // 2. Stars
    const starCount = stats.stars || 1;
    const starEls = this.resultStarsRow.querySelectorAll('.star-item');
    starEls.forEach((el, idx) => {
      el.classList.toggle('active', idx < starCount);
      (el as HTMLElement).style.setProperty('--star-delay', `${idx * 130}ms`);
    });

    // 3. Central Metallic Panel: Novo Recorde, Pontuação Final, RockCoins
    const bannerEl = document.getElementById('result-record-banner');
    if (bannerEl) {
      if (recordResult?.isNewRecord) {
        bannerEl.classList.remove('hidden');
      } else {
        bannerEl.classList.add('hidden');
      }
    }

    // Counter animation for score
    const targetScore = stats.score;
    const prefersReducedMotion = reducedEffects() || document.documentElement.dataset.effects === 'reduced';
    if (prefersReducedMotion || targetScore === 0) {
      this.resultScore.textContent = `${targetScore.toLocaleString('pt-BR')} PTS`;
    } else {
      let currentVal = 0;
      const duration = 600;
      const startTime = performance.now();
      const updateScore = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        currentVal = Math.floor(progress * targetScore);
        this.resultScore.textContent = `${currentVal.toLocaleString('pt-BR')} PTS`;
        if (progress < 1) {
          requestAnimationFrame(updateScore);
        } else {
          this.resultScore.textContent = `${targetScore.toLocaleString('pt-BR')} PTS`;
        }
      };
      requestAnimationFrame(updateScore);
    }

    const coinsEl = document.getElementById('result-coins');
    if (coinsEl) {
      const earnedCoins = recordResult?.earnedCoins ?? RockCoinsManager.calculateReward(
        difficulty,
        misses,
        playable,
        cleared
      );
      coinsEl.textContent = `+${earnedCoins}`;
    }

    // 4. Quatro Painéis: Acertos, Erros, Precisão, Maior Combo
    if (this.resultHits) {
      this.resultHits.textContent = hits.toString();
    }
    if (this.resultPerfect) {
      this.resultPerfect.textContent = stats.perfectCount.toString();
    }
    if (this.resultGreat) {
      this.resultGreat.textContent = stats.greatCount.toString();
    }
    if (this.resultGood) {
      this.resultGood.textContent = stats.goodCount.toString();
    }
    this.resultMiss.textContent = (misses + (stats.extraPressCount || 0)).toString();
    const noteMiss = document.getElementById('result-note-miss');
    if (noteMiss) noteMiss.textContent = misses.toString();
    const extra = document.getElementById('result-extra');
    if (extra) extra.textContent = String(stats.extraPressCount || 0);

    const extraPresses = (stats as any).extraPressCount || 0;
    // Precisão calculada com base em acertos e erros totais (misses + toques extras)
    let accuracyPct = stats.accuracy !== undefined ? stats.accuracy : 100;
    if (stats.accuracy === undefined) {
      const totalEvalNotes = hits + misses + extraPresses;
      accuracyPct = totalEvalNotes > 0 ? Math.round((hits / totalEvalNotes) * 100) : 0;
    }
    this.resultAccuracy.textContent = `${accuracyPct}%`;
    this.resultMaxCombo.textContent = stats.maxCombo.toString();

    // 5. Faixa de Conquista: FULL COMBO! (Regra Estrita V13.7: 0 misses e 0 toques extras)
    const isFullCombo = Boolean(cleared) && (misses === 0) && (extraPresses === 0) && (playable > 0) && (hits >= playable);
    const achieveBanner = document.getElementById('result-achievement-banner');
    const achieveText = document.getElementById('result-achievement-text');
    if (achieveBanner && achieveText) {
      if (isFullCombo) {
        achieveBanner.classList.remove('hidden');
        achieveText.textContent = 'FULL COMBO!';
      } else {
        achieveBanner.classList.add('hidden');
        achieveText.textContent = '';
      }
    }

    this.showScreen(GameState.RESULTS);
  }

  renderSongLibrary(songs: SongMetadata[], activeProfile?: PlayerProfile | null, filterOverride?: string): void {
    if (filterOverride) {
      this.currentFilter = filterOverride as any;
    }
    const isIntlTab = this.currentFilter === 'custom' || (this.currentFilter as string) === 'international';
    this.cachedSongs = songs;
    if (activeProfile !== undefined) {
      this.currentActiveProfile = activeProfile;
    }
    const profile = this.currentActiveProfile;

    // Regra V13.5: O catálogo exibe SOMENTE as músicas já desbloqueadas pelo jogador!
    // V13.6: Músicas internacionais são sempre desbloqueadas e gratuitas para teste!
    const isSongUnlocked = (songId: string) => {
      const s = songs.find((item) => item.id === songId);
      if (s?.isInternational) {
        return true;
      }
      if (isIntlTab) {
        return true;
      }
      if (this.isSongUnlockedChecker) {
        return this.isSongUnlockedChecker(songId);
      }
      return profile?.unlockedSongIds ? profile.unlockedSongIds.includes(songId) : true;
    };

    const unlockedSongs = songs.filter((s) => isSongUnlocked(s.id));

    // Atualiza saldo permanente de RockCoins no cabeçalho da biblioteca (🪙 [VALOR])
    const coinValEl = document.getElementById('library-rockcoins-val');
    if (coinValEl) {
      coinValEl.textContent = (profile?.rockCoins ?? 0).toString();
    }

    // Atualiza o contador de progresso da coleção
    const progEl = document.getElementById('collection-progress-pill');
    if (progEl) {
      if (isIntlTab) {
        progEl.textContent = `${unlockedSongs.length} INTERNACIONAIS (TESTE)`;
      } else {
        progEl.textContent = `${unlockedSongs.length} / 162 MÚSICAS`;
      }
    }

    const titleEl = document.getElementById('library-screen-title');
    if (titleEl) {
      titleEl.textContent = 'SELEÇÃO DE MÚSICAS';
    }

    if (!this.currentSelectedSong || !unlockedSongs.some((s) => s.id === this.currentSelectedSong?.id)) {
      this.currentSelectedSong = unlockedSongs[0] || null;
    }

    let rowsHtml = unlockedSongs.map((song, index) => {
      const isSelected = this.currentSelectedSong?.id === song.id;

      // Extrai melhor pontuação e estrelas
      let bestStars = 0;
      let bestScore = 0;

      if (profile?.records[song.id]) {
        (['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as Difficulty[]).forEach((d) => {
          const rec = profile.records[song.id]?.[d];
          if (rec) {
            const score = rec.bestScore ?? rec.score ?? 0;
            if (score > bestScore) {
              bestScore = score;
              bestStars = rec.bestStars ?? rec.stars ?? 1;
            }
          }
        });
      }

      // 5 Estrelas
      let starsHtml = '';
      for (let s = 1; s <= 5; s++) {
        if (s <= bestStars) {
          starsHtml += `<span class="star filled">★</span>`;
        } else {
          starsHtml += `<span class="star empty-star">☆</span>`;
        }
      }

      const scoreText = bestScore > 0 ? `${bestScore.toLocaleString('pt-BR')} PTS` : '0 PTS';

      let statusBadgeHtml = '';
      if (song.isInternational) {
        const status = song.internationalStatus || 'PRONTA PARA TESTE';
        const cls = status === 'PRONTA PARA TESTE'
          ? 'status-ready'
          : status === 'CHART EM PREPARAÇÃO'
          ? 'status-prep'
          : status === 'VÍDEO NÃO CONFIGURADO'
          ? 'status-unconfigured'
          : 'status-unavailable';
        statusBadgeHtml = `<span class="intl-status-badge ${cls}">${status}</span>`;
      }

      let fileNoticeHtml = '';
      if (!song.isAvailable && song.requiresFile) {
        fileNoticeHtml = `
          <div class="song-link-box">
            <span>Arquivo necessário: <strong>${song.requiresFile}</strong></span>
            <label class="btn-link-file">
              VINCULAR
              <input type="file" accept="audio/*" class="link-file-input" data-song-id="${song.id}" style="display:none;">
            </label>
          </div>
        `;
      }

      const coverSrc = song.coverUrl || 'images/default-cover.png';

      return `
        <div class="notebook-song-row ${isSelected ? 'selected' : ''}" data-song-id="${song.id}">
          <span class="row-arrow">➡</span>
          <div class="row-song-content">
            <img src="${coverSrc}" class="row-album-cover" alt="${song.title}" loading="lazy" onerror="this.onerror=null;this.src='images/default-cover.png';" />
            <div class="row-song-info">
              <span class="row-song-title">${index + 1}. ${song.title}</span>
              <span class="row-song-artist">${song.artist}</span>
              ${statusBadgeHtml}
              ${fileNoticeHtml}
            </div>
          </div>
          <div class="row-song-stats">
            <div class="row-stars">${starsHtml}</div>
            <div class="row-score">${scoreText}</div>
          </div>
        </div>
      `;
    }).join('');

    // Append Card Misterioso APENAS na aba brasileira
    if (!isIntlTab) {
      if (unlockedSongs.length < 162) {
        rowsHtml += `
          <div class="notebook-song-row mystery-song-card" id="card-mystery-song" role="button" tabindex="0" aria-label="Desbloquear Próxima Música por 5 RockCoins">
            <div class="mystery-card-left">
              <div class="mystery-icon-box">
                <span class="mystery-question-mark">?</span>
              </div>
              <div class="mystery-card-info">
                <span class="mystery-card-title">[?] DESBLOQUEAR PRÓXIMA MÚSICA</span>
                <span class="mystery-card-cost">CUSTO: 5 ROCKCOINS</span>
              </div>
            </div>
            <button type="button" class="btn-unlock-mystery" id="btn-unlock-mystery">
              <span>DESBLOQUEAR</span>
            </button>
          </div>
        `;
      } else {
        rowsHtml += `
          <div class="collection-completed-box" id="collection-completed-box">
            <span class="completed-star-icon">🏆</span>
            <div class="completed-text-content">
              <span class="completed-title">COLEÇÃO COMPLETA!</span>
              <span class="completed-desc">Parabéns! Você desbloqueou todas as 162 músicas do RockBrazil!</span>
            </div>
          </div>
        `;
      }
    }

    this.songsListContainer.innerHTML = rowsHtml;

    // Listeners das linhas de músicas desbloqueadas
    this.songsListContainer.querySelectorAll('.notebook-song-row:not(.mystery-song-card)').forEach((row) => {
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).classList.contains('btn-link-file')) {
          return;
        }

        const songId = (e.currentTarget as HTMLElement).dataset.songId;
        const song = songs.find((s) => s.id === songId);
        if (!song) return;

        if (this.currentSelectedSong?.id === song.id) {
          if (song.isInternational) {
            if (song.internationalStatus && song.internationalStatus !== 'PRONTA PARA TESTE') {
              alert(`Esta música está com status "${song.internationalStatus}" e não pode ser iniciada no momento.`);
              return;
            }
            this.openDifficultyModal(song, profile);
          } else if (song.isAvailable) {
            this.openDifficultyModal(song, profile);
          } else {
            alert(`O arquivo de áudio de "${song.title}" não está disponível no servidor. Utilize "VINCULAR" ou "IMPORTAR MÚSICA" para carregar seu arquivo.`);
          }
        } else {
          this.currentSelectedSong = song;
          this.renderSongLibrary(songs, profile, this.currentFilter);
        }
      });
    });

    // Listeners do Card Misterioso
    const mysteryCard = document.getElementById('card-mystery-song');
    const handleMysteryClick = async (e: Event) => {
      e.stopPropagation();
      if (this.isUnlocking) return;
      const currentCoins = profile?.rockCoins || 0;
      if (currentCoins < 5) {
        alert('Você precisa de 5 RockCoins para desbloquear a próxima música! Complete shows para ganhar mais.');
        return;
      }
      if (this.onUnlockMysteryRequested) {
        this.isUnlocking = true;
        try {
          await this.onUnlockMysteryRequested();
        } finally {
          this.isUnlocking = false;
        }
      }
    };

    if (mysteryCard) {
      mysteryCard.addEventListener('click', handleMysteryClick);
      document.getElementById('btn-unlock-mystery')?.addEventListener('click', handleMysteryClick);
    }

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
    const profile = activeProfile || this.currentActiveProfile;

    const titleEl = document.getElementById('diff-song-title');
    const artistEl = document.getElementById('diff-song-artist');
    if (titleEl) titleEl.textContent = song.title;
    if (artistEl) artistEl.textContent = song.artist;

    const diffs: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
    const config = INTERNATIONAL_METADATA_CONFIG[song.id];
    const allowedDiffs = config ? config.availableDifficulties : diffs;

    diffs.forEach((d) => {
      const btn = document.querySelector(`.btn-diff-choice[data-diff="${d}"]`) as HTMLButtonElement | null;
      if (btn) {
        if (!allowedDiffs.includes(d)) {
          btn.disabled = true;
          btn.style.opacity = '0.35';
          btn.style.pointerEvents = 'none';
        } else {
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.style.pointerEvents = 'auto';
        }
      }

      const recEl = document.getElementById(`record-${d.toLowerCase()}`);
      if (recEl) {
        const rec = profile?.records[song.id]?.[d];
        const score = rec?.bestScore ?? rec?.score ?? 0;
        const stars = rec?.bestStars ?? rec?.stars ?? 0;

        if (rec && score > 0) {
          const starsStr = '★'.repeat(stars) + '☆'.repeat(Math.max(0, 5 - stars));
          recEl.textContent = `${score.toLocaleString('pt-BR')} PTS (${starsStr})`;
          recEl.style.color = '#15803d';
        } else {
          recEl.textContent = 'SEM RECORDE';
          recEl.style.color = '#b71c1c';
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

  /**
   * Adapts the fretboard buttons according to selected difficulty:
   * EASY: 3 lanes (0, 1, 2)
   * MEDIUM: 4 lanes (0, 1, 2, 3)
   * HARD/EXPERT: 5 lanes (0, 1, 2, 3, 4)
   */
  /**
   * Sets the active difficulty and adapts visible fret buttons:
   * - EASY: 3 frets (0: Verde, 1: Vermelho, 2: Amarelo)
   * - MEDIUM: 4 frets (0: Verde, 1: Vermelho, 2: Amarelo, 3: Azul)
   * - HARD / EXPERT: 5 frets (0: Verde, 1: Vermelho, 2: Amarelo, 3: Azul, 4: Laranja)
   */
  setDifficultyLanes(diff: Difficulty, _maxLaneOverride?: number): void {
    const fretBoard = document.getElementById('fret-board');
    if (!fretBoard) return;
    const maxLane = diff === 'EASY' ? 2 : diff === 'MEDIUM' ? 3 : 4;
    fretBoard.querySelectorAll<HTMLElement>('.fret-button').forEach((btn) => {
      const lane = Number(btn.dataset.lane);
      if (lane > maxLane) {
        btn.classList.add('hidden-lane');
      } else {
        btn.classList.remove('hidden-lane');
      }
    });
  }
}
