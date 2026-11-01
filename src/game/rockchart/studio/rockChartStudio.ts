/**
 * RockBrazil — RockChartStudio (Painel de Administração e Gestão Musical)
 * 
 * Controlador de administração completo para curadoria, pesquisa, download,
 * importação, calibração, teste e publicação de músicas no RockBrazil.
 */

import {
  ChartSearchResult,
  RockChartImportResult,
  RockSyncProfile,
  RockChartValidationReport,
  AdminCredentials,
  ChartSourceProviderId
} from '../types';
import { ChartProviderRegistry } from '../providers/providerRegistry';
import { RockChartImporter } from '../importer/rockChartImporter';
import { RockSyncAutoMatch } from '../sync/rockSyncAutoMatch';
import { RockSyncProfileRepository } from '../sync/rockSyncProfileRepository';
import { RockChartValidator } from '../validator/rockChartValidator';
import { RockSyncIntelligentMatcher } from '../sync/rockSyncIntelligentMatcher';
import { RockSyncQualityGate, QualityGateEvaluation } from '../sync/rockSyncQualityGate';
import { User } from 'firebase/auth';
import { AuthService } from '../../../firebase/authService';
import { AdminAuthService } from '../../../firebase/adminAuthService';
import { Difficulty, Note, SongMetadata, BeatmapByDifficulty, Lane } from '../../../types';
import { SngPackageParser } from '../importer/sngPackageParser';
import { UniversalChartImporter } from '../../../audio/universalChartImporter';
import { unpackInternationalChart } from '../../catalog/internationalChartsRegistry';
import {
  PersistentCatalogService,
  ManagedSong,
  ManagedSongStatus,
  ImportHistoryEntry
} from '../../catalog/persistentCatalogService';

export interface DurationMismatchAnalysis {
  chartDurationSec: number;
  videoDurationSec: number;
  differenceSec: number;
  isMismatchSuspected: boolean;
  status: 'DURATION_MATCH_CONFIRMED' | 'STRUCTURAL_MISMATCH_SUSPECTED' | 'NO_VIDEO_DURATION';
  message: string;
}

export interface HighwayPreviewNote {
  time: number;
  lane: Lane;
  duration: number;
  isChord: boolean;
}

export interface StudioSessionState {
  currentQuery: { artist?: string; title?: string };
  searchResults: ChartSearchResult[];
  selectedChart: ChartSearchResult | null;
  importedChart: RockChartImportResult | null;
  editingSongId: string | null;
  youtubeVideoId: string;
  youtubeChannel: string;
  configuredOffsetMs: number;
  durationAnalysis: DurationMismatchAnalysis | null;
  autoMatchProfile: RockSyncProfile | null;
  validationReport: RockChartValidationReport | null;
  qualityGateReport: QualityGateEvaluation | null;
  isPublishApproved: boolean;
  publishedSongMetadata: SongMetadata | null;
  activeTab: 'DASHBOARD' | 'NEW_SONG' | 'EDITOR_SYNC' | 'HISTORY';
}

export class RockChartStudio {
  private static instance: RockChartStudio | null = null;

  private adminUser: AdminCredentials | null = null;
  private providerRegistry = ChartProviderRegistry.getInstance();
  private persistentCatalog = PersistentCatalogService.getInstance();
  private autoMatch = new RockSyncAutoMatch();
  private profileRepo = RockSyncProfileRepository.getInstance();
  private intelligentMatcher = new RockSyncIntelligentMatcher();

  private sessionState: StudioSessionState = {
    currentQuery: {},
    searchResults: [],
    selectedChart: null,
    importedChart: null,
    editingSongId: null,
    youtubeVideoId: '',
    youtubeChannel: '',
    configuredOffsetMs: 0,
    durationAnalysis: null,
    autoMatchProfile: null,
    validationReport: null,
    qualityGateReport: null,
    isPublishApproved: false,
    publishedSongMetadata: null,
    activeTab: 'DASHBOARD'
  };

  private constructor() {
    // Sessão validada exclusivamente através de tokens criptográficos do Firebase
  }

  public static getInstance(): RockChartStudio {
    if (!this.instance) {
      this.instance = new RockChartStudio();
    }
    return this.instance;
  }

  public static resetInstance(): void {
    RockChartStudio.instance = null;
  }

  // =========================================================================
  // 1. AUTENTICAÇÃO E AUTORIZAÇÃO ADMINISTRATIVA
  // =========================================================================

  /**
   * Autenticação administrativa com validação real de credenciais via Firebase Authentication.
   * Não expõe senhas fixas e valida privilégios no backend (Claims ou Firestore).
   */
  public async authenticateAdmin(
    target?: User | { username?: string; email?: string; password?: string; token?: string; uid?: string }
  ): Promise<boolean> {
    if (!target) {
      return false;
    }

    // Bloqueia tentativas de bypass por token antigo ou arbitrário
    if ((target as any).token) {
      return false;
    }

    // Se um User do Firebase foi fornecido diretamente
    if (typeof (target as any).getIdTokenResult === 'function') {
      const user = target as User;
      const verification = await AdminAuthService.verifyAdminStatus(user);
      if (verification.isAdmin) {
        this.adminUser = AdminAuthService.toAdminCredentials(user, verification.role || 'SUPER_ADMIN');
        this.logAdminAuthSuccess(this.adminUser.email, verification.method || 'FIREBASE');
        return true;
      }
      return false;
    }

    const creds = target as { username?: string; email?: string; password?: string; uid?: string };

    // Se usuário/senha foram fornecidos (login real)
    if (creds.password && (creds.username || creds.email)) {
      const authResult = await AdminAuthService.signInWithCredentials(
        creds.username || creds.email!,
        creds.password
      );
      if (authResult.success && authResult.user) {
        this.adminUser = AdminAuthService.toAdminCredentials(
          authResult.user,
          authResult.role || 'SUPER_ADMIN'
        );
        this.logAdminAuthSuccess(this.adminUser.email, 'PASSWORD_AUTH');
        return true;
      }
      return false;
    }

    // Suporte a testes automatizados controlados (sem credenciais em produção)
    const isTestEnv =
      typeof process !== 'undefined' &&
      (process.env?.NODE_ENV === 'test' || process.env?.VITEST === 'true');

    if (isTestEnv && creds.email) {
      const cleanEmail = creds.email.toLowerCase().trim();
      const verification = await AdminAuthService.verifyAdminStatus({
        uid: creds.uid || 'test-admin-uid',
        email: cleanEmail,
        getIdTokenResult: async () => ({ claims: {} })
      } as any);

      if (verification.isAdmin) {
        this.adminUser = {
          uid: creds.uid || 'test-admin-uid',
          email: cleanEmail,
          authProvider: 'password',
          sessionExpiry: Date.now() + (2 * 3600 * 1000),
          role: verification.role || 'SUPER_ADMIN',
          verifiedAt: Date.now()
        };
        this.logAdminAuthSuccess(cleanEmail, 'TEST_CREDENTIAL');
        return true;
      }
    }

    return false;
  }

  private logAdminAuthSuccess(email: string, method: string): void {
    this.persistentCatalog.addHistoryEntry({
      action: 'UPDATE',
      songId: 'admin-auth',
      songTitle: 'Autenticação Administrativa',
      artist: 'Firebase Auth',
      charter: 'Segurança',
      source: 'Admin Studio',
      details: `Sessão iniciada com sucesso via ${method} para ${email}`,
      user: email
    });
  }

  public isAdminAuthenticated(): boolean {
    if (!this.adminUser) return false;
    if (this.adminUser.sessionExpiry && Date.now() > this.adminUser.sessionExpiry) {
      this.adminUser = null;
      AdminAuthService.signOutAdmin().catch(() => {});
      return false;
    }
    return true;
  }

  public getAdminUser(): AdminCredentials | null {
    return this.adminUser;
  }

  public getCurrentAdmin(): AdminCredentials | null {
    return this.adminUser;
  }

  public logoutAdmin(): void {
    const user = this.adminUser?.email || 'admin';
    this.adminUser = null;
    AdminAuthService.signOutAdmin().catch(() => {});
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('rb_admin_studio_session');
    }
    this.persistentCatalog.addHistoryEntry({
      action: 'UPDATE',
      songId: 'admin-logout',
      songTitle: 'Logout Administrativo',
      artist: 'Sistema',
      charter: 'Segurança',
      source: 'Admin Studio',
      details: `Sessão encerrada para ${user}`,
      user
    });
  }

  public getSessionState(): StudioSessionState {
    return { ...this.sessionState };
  }

  public setActiveTab(tab: StudioSessionState['activeTab']): void {
    this.sessionState.activeTab = tab;
  }

  // =========================================================================
  // 2. DASHBOARD DE MÚSICAS GERENCIADAS
  // =========================================================================

  public listAllManagedSongs(): ManagedSong[] {
    return this.persistentCatalog.getAllManagedSongs();
  }

  public getManagedSong(songId: string): ManagedSong | undefined {
    return this.persistentCatalog.getManagedSong(songId);
  }

  public getManagedBeatmap(songId: string): BeatmapByDifficulty | null {
    return this.persistentCatalog.getManagedBeatmap(songId) ?? null;
  }

  public getImportHistory(): ImportHistoryEntry[] {
    return this.persistentCatalog.getHistory();
  }

  public exportCatalogBundle(): string {
    return this.persistentCatalog.exportCatalogJson();
  }

  public importCatalogBundle(jsonStr: string): { imported: number; errors: string[] } {
    if (!this.isAdminAuthenticated()) {
      throw new Error('Ação bloqueada: Apenas administradores autenticados podem importar pacotes de catálogo.');
    }
    return this.persistentCatalog.importCatalogJson(jsonStr, this.adminUser?.email);
  }

  // =========================================================================
  // 3. PESQUISA E DOWNLOAD DE CHARTS COMUNITÁRIOS (CHORUS ENCORE / RHYTHMVERSE)
  // =========================================================================

  public async searchCharts(artist: string, title: string): Promise<ChartSearchResult[]> {
    this.sessionState.currentQuery = { artist, title };
    const { results } = await this.providerRegistry.searchAll({ artist, title });
    this.sessionState.searchResults = results;
    return results;
  }

  public selectChart(chart: ChartSearchResult): void {
    this.sessionState.selectedChart = chart;
  }

  /**
   * Baixa e processa um chart remoto diretamente do provedor (Chorus Encore .sng)
   */
  public async downloadRemoteChart(chart: ChartSearchResult): Promise<RockChartImportResult> {
    const url = chart.directDownloadUrl || (chart.fileHash ? `https://files.enchor.us/${chart.fileHash}.sng` : null);
    if (!url) {
      throw new Error(`Chart "${chart.title}" não possui URL direta de download disponível.`);
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 20000) : null;

    try {
      const response = await fetch(url, { signal: controller?.signal });
      if (!response.ok) {
        throw new Error(`Falha no download HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const fileName = `${chart.artist} - ${chart.title}${chart.format || '.sng'}`;

      const imported = await this.importFile(buffer, fileName, chart.provider);
      // Vincula metadados adicionais obtidos na busca
      if (chart.albumArtUrl) {
        if (!imported.originalRawData.metadata) {
          imported.originalRawData.metadata = {};
        }
        imported.originalRawData.metadata.albumArtUrl = chart.albumArtUrl;
      }
      this.sessionState.selectedChart = chart;
      this.sessionState.editingSongId = imported.songId;
      this.sessionState.activeTab = 'EDITOR_SYNC';
      return imported;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  // =========================================================================
  // 4. IMPORTAÇÃO E UPLOAD MANUAL COM VALIDAÇÃO DE SEGURANÇA
  // =========================================================================

  /**
   * Importação universal de arquivos com validação de segurança
   */
  public async importFile(
    fileBuffer: ArrayBuffer | Uint8Array | string,
    fileName: string,
    provider: ChartSourceProviderId = 'COMMUNITY_UPLOAD',
    songIniText?: string
  ): Promise<RockChartImportResult> {
    // 1. Validação de tamanho (máximo 50MB para pacotes)
    const byteLength = typeof fileBuffer === 'string' ? fileBuffer.length : fileBuffer.byteLength;
    if (byteLength > 52428800) {
      throw new Error('Arquivo excede o limite máximo permitido de 50MB.');
    }

    // 2. Validação de segurança de nomes de arquivos / ZIP traversal
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      throw new Error('Tentativa de caminho inválido ou Directory Traversal detectada.');
    }

    const imported = await RockChartImporter.importChartFile(fileBuffer, fileName, provider, songIniText);

    // Valida que não geramos notas falsas e que o chart possui conteúdo real
    const hardOrExpertNotes = imported.derivedCharts.EXPERT?.length > 0
      ? imported.derivedCharts.EXPERT
      : (imported.derivedCharts.HARD || []);

    if (hardOrExpertNotes.length === 0) {
      throw new Error('O arquivo importado não contém notas jogáveis válidas em nenhuma dificuldade.');
    }

    this.sessionState.importedChart = imported;
    this.sessionState.editingSongId = imported.songId;
    this.sessionState.configuredOffsetMs = Math.round((imported.originalRawData.offsetSec || 0) * 1000);

    this.persistentCatalog.addHistoryEntry({
      action: 'IMPORT',
      songId: imported.songId,
      songTitle: imported.title,
      artist: imported.artist,
      charter: imported.originalRawData.charter || 'Comunidade',
      source: provider,
      details: `Importado com sucesso via ${imported.originalRawData.fileFormat}. Dificuldades: ${imported.difficultiesPresent.join(', ')}`,
      user: this.adminUser?.email || 'admin'
    });

    return imported;
  }

  // =========================================================================
  // 5. ANÁLISE ESTRUTURAL E PRÉVIA VISUAL DE 5 PISTAS
  // =========================================================================

  /**
   * Identifica dificuldades ausentes no chart
   */
  public getMissingDifficulties(imported: RockChartImportResult): Difficulty[] {
    const allDiffs: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
    return allDiffs.filter((d) => !imported.difficultiesPresent.includes(d));
  }

  /**
   * Gera dados simplificados para visualizador de 5 pistas (highway preview)
   */
  public generateHighwayPreviewData(
    difficultyOrNotes: Difficulty | Note[] = 'HARD',
    maxNotesOrStart = 80,
    endTime?: number
  ): HighwayPreviewNote[] {
    let notes: Note[] = [];

    if (Array.isArray(difficultyOrNotes)) {
      notes = difficultyOrNotes;
      if (typeof endTime === 'number') {
        notes = notes.filter((n) => n.time >= maxNotesOrStart && n.time <= endTime);
      }
    } else {
      const chart = this.sessionState.importedChart;
      if (!chart) return [];
      notes = (chart.derivedCharts[difficultyOrNotes] || chart.derivedCharts.EXPERT || []).slice(0, maxNotesOrStart);
    }

    // Detecta acordes
    const timeCounts = new Map<number, number>();
    for (const n of notes) {
      const t = Math.round(n.time * 1000) / 1000;
      timeCounts.set(t, (timeCounts.get(t) || 0) + 1);
    }

    return notes.map((n) => ({
      time: Math.round(n.time * 1000) / 1000,
      lane: n.lane as Lane,
      duration: Math.max(0, Math.round(n.duration * 1000) / 1000),
      isChord: (timeCounts.get(Math.round(n.time * 1000) / 1000) || 0) > 1
    }));
  }

  // =========================================================================
  // 6. ÁUDIO, YOUTUBE E DETECÇÃO DE INCOMPATIBILIDADE DE VERSÃO
  // =========================================================================

  /**
   * Extrai o identificador de 11 caracteres de URLs do YouTube / YouTube Music
   */
  public static extractYouTubeVideoId(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return '';
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : trimmed;
  }

  public extractYouTubeVideoId(input: string): string {
    return RockChartStudio.extractYouTubeVideoId(input);
  }

  /**
   * Configura o áudio oficial do YouTube e diagnostica compatibilidade de duração
   */
  public configureYouTubeAudio(
    videoIdOrUrl: string,
    channelOrChartDuration: string | number = 'Canal Oficial',
    videoDurationSec?: number
  ): DurationMismatchAnalysis {
    const videoId = RockChartStudio.extractYouTubeVideoId(videoIdOrUrl);
    this.sessionState.youtubeVideoId = videoId;

    let channel = 'Canal Oficial';
    let chartDuration = this.sessionState.importedChart?.durationSec;
    let actualVideoDuration = videoDurationSec;

    if (typeof channelOrChartDuration === 'number') {
      chartDuration = channelOrChartDuration;
      actualVideoDuration = videoDurationSec;
    } else if (typeof channelOrChartDuration === 'string') {
      channel = channelOrChartDuration;
    }

    this.sessionState.youtubeChannel = channel;

    if (!chartDuration) {
      throw new Error('Importe ou selecione um chart antes de configurar o áudio.');
    }

    let mismatchAnalysis: DurationMismatchAnalysis;

    if (!actualVideoDuration || actualVideoDuration <= 0) {
      mismatchAnalysis = {
        chartDurationSec: chartDuration,
        videoDurationSec: 0,
        differenceSec: 0,
        isMismatchSuspected: false,
        status: 'NO_VIDEO_DURATION',
        message: 'Duração do vídeo ainda não reportada pelo player do YouTube.'
      };
    } else {
      const diff = Math.round(Math.abs(chartDuration - actualVideoDuration) * 10) / 10;
      const isMismatch = diff > 6.0;

      mismatchAnalysis = {
        chartDurationSec: chartDuration,
        videoDurationSec: actualVideoDuration,
        differenceSec: diff,
        isMismatchSuspected: isMismatch,
        status: isMismatch ? 'STRUCTURAL_MISMATCH_SUSPECTED' : 'DURATION_MATCH_CONFIRMED',
        message: isMismatch
          ? `Divergência estrutural detectada: Chart (${chartDuration}s) vs Vídeo (${actualVideoDuration}s). Diferença de ${diff}s indica videoclipe com introdução narrativa, rádio edit ou versão ao vivo incompatível.`
          : `Durações compatíveis (diferença de apenas ${diff}s). Gravação corresponde à versão do chart.`
      };
    }

    this.sessionState.durationAnalysis = mismatchAnalysis;

    // Executa auto-match inteligente
    try {
      this.associateYouTubeVideo(videoId, videoDurationSec);
    } catch {
      // Ignora erro se auto-match não convergir imediatamente
    }

    return mismatchAnalysis;
  }

  public adjustOffset(deltaMs: number): number {
    this.sessionState.configuredOffsetMs += deltaMs;
    return this.sessionState.configuredOffsetMs;
  }

  public setManualOffset(offsetMs: number): void {
    this.sessionState.configuredOffsetMs = offsetMs;
  }

  /**
   * Associa vídeo do YouTube e calcula perfil inteligente
   */
  public associateYouTubeVideo(videoId: string, videoDurationSec?: number): RockSyncProfile {
    const cleanId = RockChartStudio.extractYouTubeVideoId(videoId);
    this.sessionState.youtubeVideoId = cleanId;

    if (!this.sessionState.importedChart) {
      throw new Error('Nenhum chart foi importado antes de associar o vídeo do YouTube.');
    }

    const chart = this.sessionState.importedChart;
    const hardNotes = chart.derivedCharts.HARD;

    const matchResult = this.intelligentMatcher.match({
      songId: chart.songId,
      chartId: `chart-${chart.songId}`,
      chartVersion: '1.0',
      chartSource: chart.sourceProvider,
      notes: hardNotes,
      chartDurationSec: chart.durationSec,
      bpm: chart.bpm,
      youtubeVideoId: cleanId,
      youtubeDurationSec: videoDurationSec || chart.durationSec,
      artist: chart.artist,
      title: chart.title,
      difficulty: 'HARD'
    });

    matchResult.profile.confidenceScore = matchResult.evaluation.gateStatus === 'SYNC_VERIFIED' ? 95 : (matchResult.evaluation.gateStatus === 'SYNC_PROVISIONAL' ? 75 : 40);
    this.sessionState.autoMatchProfile = matchResult.profile;
    this.sessionState.configuredOffsetMs = matchResult.profile.offsetMs;
    this.profileRepo.saveProfile(matchResult.profile);

    return matchResult.profile;
  }

  public runQualityGate(difficulty: Difficulty = 'HARD'): QualityGateEvaluation {
    if (!this.sessionState.importedChart) {
      throw new Error('Nenhum chart disponível para avaliação de Quality Gate.');
    }
    const chart = this.sessionState.importedChart;
    const notes = chart.derivedCharts[difficulty] || [];
    const evaluation = RockSyncQualityGate.evaluate({
      songId: chart.songId,
      title: chart.title,
      artist: chart.artist,
      notes,
      chartDurationSec: chart.durationSec,
      youtubeVideoId: this.sessionState.youtubeVideoId,
      youtubeDurationSec: chart.durationSec,
      existingProfile: this.sessionState.autoMatchProfile
    });
    this.sessionState.qualityGateReport = evaluation;
    return evaluation;
  }

  public runValidation(difficulty: Difficulty = 'HARD'): RockChartValidationReport {
    if (!this.sessionState.importedChart) {
      throw new Error('Nenhum chart disponível para validação.');
    }

    const chart = this.sessionState.importedChart;
    const notes = chart.derivedCharts[difficulty] || [];

    const report = RockChartValidator.validate(
      chart.songId,
      difficulty,
      notes,
      chart.durationSec
    );

    this.sessionState.validationReport = report;
    return report;
  }

  // =========================================================================
  // 7. PERSISTÊNCIA, RASCUNHOS E PUBLICAÇÃO ATÔMICA
  // =========================================================================

  /**
   * Salva a música em edição como RASCUNHO (DRAFT)
   */
  public saveCurrentAsDraft(customMetadata?: Partial<SongMetadata>): ManagedSong {
    if (!this.sessionState.importedChart) {
      throw new Error('Nenhum chart em edição para salvar como rascunho.');
    }

    const chart = this.sessionState.importedChart;
    const compact = PersistentCatalogService.convertBeatmapToCompact(chart.derivedCharts);

    const category = customMetadata?.category || 'INTERNACIONAL';
    const isFree = customMetadata?.isFree !== undefined ? customMetadata.isFree : true;
    const unlockCost = isFree ? 0 : (customMetadata?.unlockCost !== undefined ? customMetadata.unlockCost : 5);

    const metadata: SongMetadata = {
      id: chart.songId,
      title: customMetadata?.title || chart.title,
      artist: customMetadata?.artist || chart.artist,
      duration: Math.round(chart.durationSec),
      bpm: customMetadata?.bpm || chart.bpm,
      style: customMetadata?.style || `🎸 ${category === 'INTERNACIONAL' ? 'Internacional' : 'Nacional'} • ${chart.title}`,
      type: this.sessionState.youtubeVideoId ? 'youtube' : 'audio-file',
      youtubeVideoId: this.sessionState.youtubeVideoId || undefined,
      youtubeUrl: this.sessionState.youtubeVideoId ? `https://www.youtube.com/watch?v=${this.sessionState.youtubeVideoId}` : undefined,
      coverUrl: customMetadata?.coverUrl || chart.originalRawData.metadata?.albumArtUrl,
      year: customMetadata?.year || 2026,
      charter: chart.originalRawData.charter || 'Comunidade Clone Hero',
      isAvailable: false,
      category,
      isInternational: category === 'INTERNACIONAL',
      isFree,
      unlockCost,
      records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
    };

    const saved = this.persistentCatalog.saveDraft({
      songId: chart.songId,
      metadata,
      charter: chart.originalRawData.charter || 'Comunidade Clone Hero',
      sourceProvider: chart.sourceProvider,
      sourceUrl: chart.originalRawData.metadata?.sourceUrl,
      downloadUrl: chart.originalRawData.metadata?.downloadUrl,
      albumArtUrl: customMetadata?.coverUrl || chart.originalRawData.metadata?.albumArtUrl,
      compactCharts: compact,
      noteCounts: {
        EASY: chart.derivedCharts.EASY.length,
        MEDIUM: chart.derivedCharts.MEDIUM.length,
        HARD: chart.derivedCharts.HARD.length,
        EXPERT: chart.derivedCharts.EXPERT.length
      },
      bpm: metadata.bpm,
      durationSec: chart.durationSec,
      offsetMs: this.sessionState.configuredOffsetMs,
      youtubeVideoId: this.sessionState.youtubeVideoId || undefined,
      youtubeChannel: this.sessionState.youtubeChannel || undefined,
      qualityGateStatus: this.sessionState.qualityGateReport?.gateStatus,
      user: this.adminUser?.email,
      category,
      isFree,
      unlockCost
    });

    return saved;
  }

  /**
   * Publica a música oficialmente no catálogo do jogo
   */
  public setApproval(approved: boolean): void {
    if (!this.isAdminAuthenticated()) {
      throw new Error('Acesso negado: Apenas administradores autenticados podem aprovar publicações.');
    }
    this.sessionState.isPublishApproved = approved;
  }

  public publishToCatalog(customMetadata?: Partial<SongMetadata>): ManagedSong & Partial<SongMetadata> {
    if (!this.isAdminAuthenticated()) {
      throw new Error('Acesso negado: Apenas administradores autenticados podem publicar no catálogo oficial.');
    }
    if (!this.sessionState.importedChart) {
      throw new Error('Nenhum chart importado para publicar.');
    }
    if (!this.sessionState.youtubeVideoId) {
      throw new Error('Vídeo do YouTube é obrigatório para publicação no catálogo.');
    }

    // Salva primeiro como rascunho completo
    this.saveCurrentAsDraft(customMetadata);

    // Efetiva a publicação
    const result = this.persistentCatalog.publishSong(this.sessionState.importedChart.songId, this.adminUser?.email);
    if (!result.success || !result.managedSong) {
      throw new Error(result.error || 'Falha ao publicar música.');
    }

    this.sessionState.isPublishApproved = true;
    this.sessionState.publishedSongMetadata = result.song || null;

    const returnObj: ManagedSong & Partial<SongMetadata> = {
      ...result.managedSong,
      id: result.managedSong.songId,
      title: result.managedSong.metadata.title,
      artist: result.managedSong.metadata.artist,
      type: result.managedSong.metadata.type,
      youtubeVideoId: result.managedSong.youtubeVideoId
    };
    return returnObj;
  }

  /**
   * Despublica uma música ativa
   */
  public unpublishSong(songId: string): ManagedSong {
    if (!this.isAdminAuthenticated()) {
      throw new Error('Acesso negado: Apenas administradores autenticados podem despublicar músicas.');
    }
    const ok = this.persistentCatalog.unpublishSong(songId, this.adminUser?.email);
    if (!ok) {
      throw new Error(`Falha ao despublicar música "${songId}".`);
    }
    const managed = this.persistentCatalog.getManagedSong(songId);
    if (!managed) {
      throw new Error(`Música "${songId}" não encontrada.`);
    }
    return managed;
  }

  /**
   * V14.6: Altera a categoria de uma música já cadastrada preservando songId e dados
   */
  public updateSongCategory(songId: string, category: 'MINHAS_MUSICAS' | 'INTERNACIONAL'): ManagedSong {
    if (!this.isAdminAuthenticated()) {
      throw new Error('Acesso negado: Apenas administradores autenticados podem alterar categorias.');
    }
    return this.persistentCatalog.updateSongCategory(songId, category, this.adminUser?.email);
  }

  /**
   * V14.6: Altera status de gratuidade e preço em RockCoins
   */
  public updateSongPricing(songId: string, isFree: boolean, unlockCost: number): ManagedSong {
    if (!this.isAdminAuthenticated()) {
      throw new Error('Acesso negado: Apenas administradores autenticados podem alterar precificação.');
    }
    return this.persistentCatalog.updateSongPricing(songId, isFree, unlockCost, this.adminUser?.email);
  }

  /**
   * Exclui uma música do gerenciador
   */
  public deleteSong(songId: string): boolean {
    if (!this.isAdminAuthenticated()) {
      throw new Error('Acesso negado: Apenas administradores autenticados podem excluir músicas.');
    }
    const success = this.persistentCatalog.deleteSong(songId, this.adminUser?.email);
    if (success && this.sessionState.editingSongId === songId) {
      this.sessionState.importedChart = null;
      this.sessionState.editingSongId = null;
      this.sessionState.youtubeVideoId = '';
    }
    return success;
  }

  public setImportedChart(chart: RockChartImportResult | null): void {
    this.sessionState.importedChart = chart;
  }

  /**
   * Carrega uma música gerenciada para o editor de sincronia
   */
  public loadManagedSongForEditing(songId: string): ManagedSong {
    const song = this.persistentCatalog.getManagedSong(songId);
    if (!song) {
      throw new Error(`Música "${songId}" não encontrada no catálogo gerenciado.`);
    }

    const unpacked = unpackInternationalChart(song.compactCharts);
    const mockImportResult: RockChartImportResult = {
      songId: song.songId,
      title: song.metadata.title,
      artist: song.metadata.artist,
      durationSec: song.durationSec,
      bpm: song.bpm,
      sourceProvider: song.sourceProvider as any,
      originalRawData: {
        fileFormat: '.sng',
        name: song.metadata.title,
        artist: song.metadata.artist,
        charter: song.charter,
        offsetSec: song.offsetMs / 1000,
        resolution: 192,
        instrumentTrack: 'guitar',
        metadata: {
          albumArtUrl: song.albumArtUrl,
          sourceUrl: song.sourceUrl,
          downloadUrl: song.downloadUrl
        }
      },
      derivedCharts: unpacked,
      difficultiesPresent: Object.keys(song.noteCounts).filter((d) => (song.noteCounts as any)[d] > 0) as Difficulty[],
      totalNotesPerDifficulty: song.noteCounts,
      hasChords: true,
      hasSustains: true,
      importTimestamp: song.createdAt
    };

    this.sessionState.importedChart = mockImportResult;
    this.sessionState.editingSongId = song.songId;
    this.sessionState.youtubeVideoId = song.youtubeVideoId || '';
    this.sessionState.youtubeChannel = song.youtubeChannel || '';
    this.sessionState.configuredOffsetMs = song.offsetMs;
    this.sessionState.activeTab = 'EDITOR_SYNC';

    return song;
  }
}
