/**
 * RockBrazil — PersistentCatalogService
 * 
 * Gerenciador de persistência local e em nuvem para o catálogo administrativo de músicas.
 * Permite que músicas cadastradas, testadas e publicadas pelo administrador estejam
 * disponíveis imediatamente no jogo público sem necessidade de commit, build ou deploy manual.
 */

import { SongMetadata, Difficulty, Note, BeatmapByDifficulty, Lane } from '../../types';
import { CompactCharts, CompactNote, unpackInternationalChart } from './internationalChartsRegistry';
import { UniversalChartImporter } from '../../audio/universalChartImporter';
import { RockSyncProfile } from '../rockchart/types';
import { RockSyncProfileRepository } from '../rockchart/sync/rockSyncProfileRepository';
import { INTERNATIONAL_SYNC_REGISTRY } from '../sync/internationalSyncRegistry';

export type ManagedSongStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';

export interface ManagedSong {
  songId: string;
  metadata: SongMetadata;
  status: ManagedSongStatus;
  charter: string;
  sourceProvider: string;
  sourceUrl?: string;
  downloadUrl?: string;
  albumArtUrl?: string;
  compactCharts: CompactCharts;
  noteCounts: Record<Difficulty, number>;
  bpm: number;
  durationSec: number;
  offsetMs: number;
  youtubeVideoId?: string;
  youtubeChannel?: string;
  qualityGateStatus?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  notes?: string;
  // V14.6 Category, Pricing & RockCoins Integration
  category?: 'MINHAS_MUSICAS' | 'INTERNACIONAL';
  isFree?: boolean;
  unlockCost?: number;
}

export interface ImportHistoryEntry {
  id: string;
  timestamp: string;
  action: 'IMPORT' | 'DRAFT_SAVE' | 'PUBLISH' | 'UNPUBLISH' | 'DELETE' | 'UPDATE';
  songId: string;
  songTitle: string;
  artist: string;
  charter: string;
  source: string;
  details: string;
  user: string;
}

export class PersistentCatalogService {
  private static instance: PersistentCatalogService | null = null;

  private static readonly STORAGE_KEY_MANAGED_SONGS = 'rb_admin_managed_songs_v1';
  private static readonly STORAGE_KEY_HISTORY = 'rb_admin_import_history_v1';

  private managedSongs: Map<string, ManagedSong> = new Map();
  private history: ImportHistoryEntry[] = [];
  private onCatalogChangedListeners: Set<() => void> = new Set();

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): PersistentCatalogService {
    if (!this.instance) {
      this.instance = new PersistentCatalogService();
    }
    return this.instance;
  }

  public static resetInstance(): void {
    PersistentCatalogService.instance = null as any;
  }

  /**
   * Registra um listener para atualizações no catálogo publicado
   */
  public onCatalogChanged(callback: () => void): () => void {
    this.onCatalogChangedListeners.add(callback);
    return () => this.onCatalogChangedListeners.delete(callback);
  }

  private notifyCatalogChanged(): void {
    for (const listener of this.onCatalogChangedListeners) {
      try {
        listener();
      } catch {
        // Ignora erros em listeners
      }
    }
  }

  /**
   * Carrega músicas gerenciadas e histórico do armazenamento local persistente
   */
  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const rawSongs = localStorage.getItem(PersistentCatalogService.STORAGE_KEY_MANAGED_SONGS);
      if (rawSongs) {
        const parsed = JSON.parse(rawSongs) as ManagedSong[];
        for (const song of parsed) {
          this.managedSongs.set(song.songId, song);
          // Se estiver publicada, registra o chart convertido para execução imediata
          if (song.status === 'PUBLISHED') {
            this.registerPublishedSongToEngines(song);
          }
        }
      }
    } catch (err) {
      console.warn('[PersistentCatalogService] Erro ao carregar músicas salvas:', err);
    }

    try {
      const rawHistory = localStorage.getItem(PersistentCatalogService.STORAGE_KEY_HISTORY);
      if (rawHistory) {
        this.history = JSON.parse(rawHistory);
      }
    } catch (err) {
      console.warn('[PersistentCatalogService] Erro ao carregar histórico:', err);
    }
  }

  /**
   * Salva músicas gerenciadas no armazenamento persistente
   */
  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const songsArray = Array.from(this.managedSongs.values());
      localStorage.setItem(PersistentCatalogService.STORAGE_KEY_MANAGED_SONGS, JSON.stringify(songsArray));
      localStorage.setItem(PersistentCatalogService.STORAGE_KEY_HISTORY, JSON.stringify(this.history.slice(0, 100)));
    } catch (err) {
      console.warn('[PersistentCatalogService] Falha ao persistir no localStorage:', err);
    }
  }

  /**
   * Registra o chart nos subsistemas do jogo para execução imediata
   */
  private registerPublishedSongToEngines(song: ManagedSong): void {
    // 1. Converte e registra no UniversalChartImporter
    const unpacked = unpackInternationalChart(song.compactCharts);
    UniversalChartImporter.registerConvertedChart(song.songId, unpacked);

    // 2. Registra perfil de sincronização
    if (song.youtubeVideoId) {
      const profile: RockSyncProfile = {
        songId: song.songId,
        youtubeVideoId: song.youtubeVideoId,
        chartId: `chart-${song.songId}`,
        chartSource: song.sourceProvider as any,
        chartVersion: '1.0',
        offsetMs: song.offsetMs,
        syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
        validationStatus: 'VERIFIED',
        confidenceScore: 95,
        audioReferenceMatch: 'EXACT_MATCH',
        firstAcousticNoteSec: unpacked.HARD?.[0]?.time ?? 0,
        detectedIntroSilenceSec: 0,
        evidenceSource: `Publicado via RockBrazil Admin por ${song.charter}`,
        updatedAt: song.publishedAt || new Date().toISOString()
      };
      RockSyncProfileRepository.getInstance().saveProfile(profile);

      INTERNATIONAL_SYNC_REGISTRY[song.songId] = {
        songId: song.songId,
        title: song.metadata.title,
        artist: song.metadata.artist,
        youtubeVideoId: song.youtubeVideoId,
        youtubeChannel: song.youtubeChannel || 'Oficial',
        recordingVersion: 'Áudio Oficial (Publicado via Admin)',
        chartAuthor: song.charter,
        year: Number(song.metadata.year) || 2026,
        chartVideoOffsetMs: song.offsetMs,
        verified: true,
        syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
        audioReferenceMatch: 'EXACT_MATCH',
        notes: song.notes || `Chart importado de ${song.sourceProvider} por ${song.charter}.`
      };
    }
  }

  /**
   * Retorna todas as músicas gerenciadas no painel
   */
  public getAllManagedSongs(): ManagedSong[] {
    return Array.from(this.managedSongs.values());
  }

  /**
   * Retorna uma música gerenciada por ID
   */
  public getManagedSong(songId: string): ManagedSong | undefined {
    return this.managedSongs.get(songId);
  }

  /**
   * Retorna todas as músicas com status PUBLISHED prontas para o catálogo público de jogadores
   */
  public getPublishedSongs(): SongMetadata[] {
    return Array.from(this.managedSongs.values())
      .filter((s) => s.status === 'PUBLISHED')
      .map((s) => ({ ...s.metadata }));
  }

  /**
   * Retorna o beatmap de uma música gerenciada (descompactado)
   */
  public getManagedBeatmap(songId: string): BeatmapByDifficulty | undefined {
    const managed = this.managedSongs.get(songId);
    if (!managed) return undefined;
    return unpackInternationalChart(managed.compactCharts);
  }

  /**
   * Salva ou atualiza uma música como RASCUNHO (DRAFT)
   */
  public saveDraft(params: {
    songId: string;
    metadata: SongMetadata;
    charter: string;
    sourceProvider: string;
    sourceUrl?: string;
    downloadUrl?: string;
    albumArtUrl?: string;
    compactCharts: CompactCharts;
    noteCounts: Record<Difficulty, number>;
    bpm: number;
    durationSec: number;
    offsetMs: number;
    youtubeVideoId?: string;
    youtubeChannel?: string;
    qualityGateStatus?: string;
    notes?: string;
    user?: string;
    category?: 'MINHAS_MUSICAS' | 'INTERNACIONAL';
    isFree?: boolean;
    unlockCost?: number;
  }): ManagedSong {
    const existing = this.managedSongs.get(params.songId);
    const now = new Date().toISOString();

    const category = params.category || existing?.category || params.metadata.category || 'MINHAS_MUSICAS';
    const isFree = params.isFree !== undefined ? params.isFree : (existing?.isFree !== undefined ? existing.isFree : (params.metadata.isFree !== undefined ? params.metadata.isFree : true));
    const unlockCost = isFree ? 0 : (params.unlockCost !== undefined ? Math.max(0, params.unlockCost) : (existing?.unlockCost !== undefined ? existing.unlockCost : (params.metadata.unlockCost || 5)));

    const managed: ManagedSong = {
      songId: params.songId,
      metadata: {
        ...params.metadata,
        id: params.songId,
        charter: params.charter,
        chartStatus: 'CUSTOM',
        category,
        isInternational: category === 'INTERNACIONAL',
        isFree,
        unlockCost,
        internationalStatus: 'RASCUNHO ADMIN',
        isAvailable: false // Rascunhos não aparecem para o jogador comum
      },
      status: 'DRAFT',
      category,
      isFree,
      unlockCost,
      charter: params.charter,
      sourceProvider: params.sourceProvider,
      sourceUrl: params.sourceUrl,
      downloadUrl: params.downloadUrl,
      albumArtUrl: params.albumArtUrl,
      compactCharts: params.compactCharts,
      noteCounts: params.noteCounts,
      bpm: params.bpm,
      durationSec: params.durationSec,
      offsetMs: params.offsetMs,
      youtubeVideoId: params.youtubeVideoId,
      youtubeChannel: params.youtubeChannel,
      qualityGateStatus: params.qualityGateStatus,
      notes: params.notes,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    this.managedSongs.set(params.songId, managed);
    this.saveToStorage();

    this.addHistoryEntry({
      action: 'DRAFT_SAVE',
      songId: params.songId,
      songTitle: params.metadata.title,
      artist: params.metadata.artist,
      charter: params.charter,
      source: params.sourceProvider,
      details: `Rascunho salvo com ${params.noteCounts.EXPERT || params.noteCounts.HARD || 0} notas (Expert/Hard).`,
      user: params.user || 'admin'
    });

    return managed;
  }

  /**
   * Publica uma música no catálogo oficial do jogo
   */
  public publishSong(songId: string, user = 'admin'): { success: boolean; error?: string; song?: SongMetadata; managedSong?: ManagedSong } {
    const managed = this.managedSongs.get(songId);
    if (!managed) {
      return { success: false, error: `Música "${songId}" não encontrada.` };
    }

    if (!managed.youtubeVideoId) {
      return { success: false, error: 'A música deve possuir um vídeo do YouTube associado antes da publicação.' };
    }

    const totalNotes = Object.values(managed.noteCounts).reduce((a, b) => a + b, 0);
    if (totalNotes === 0) {
      return { success: false, error: 'O chart não possui nenhuma nota jogável cadastrada.' };
    }

    const now = new Date().toISOString();
    managed.status = 'PUBLISHED';
    managed.publishedAt = now;
    managed.updatedAt = now;
    const songCategory = managed.category || 'MINHAS_MUSICAS';
    const songIsFree = managed.isFree !== undefined ? managed.isFree : true;
    const songUnlockCost = songIsFree ? 0 : (managed.unlockCost !== undefined ? managed.unlockCost : 5);

    managed.category = songCategory;
    managed.isFree = songIsFree;
    managed.unlockCost = songUnlockCost;
    managed.metadata = {
      ...managed.metadata,
      category: songCategory,
      isInternational: songCategory === 'INTERNACIONAL',
      isFree: songIsFree,
      unlockCost: songUnlockCost,
      isAvailable: true,
      internationalStatus: 'PRONTA PARA TESTE',
      chartStatus: 'COMMUNITY_VERIFIED'
    };

    this.registerPublishedSongToEngines(managed);
    this.saveToStorage();
    this.notifyCatalogChanged();

    this.addHistoryEntry({
      action: 'PUBLISH',
      songId: managed.songId,
      songTitle: managed.metadata.title,
      artist: managed.metadata.artist,
      charter: managed.charter,
      source: managed.sourceProvider,
      details: `Publicada oficialmente no catálogo (${songCategory}, ${songIsFree ? 'Gratuita' : `${songUnlockCost} RockCoins`}). Offset: ${managed.offsetMs}ms. Vídeo: ${managed.youtubeVideoId}`,
      user
    });

    return { success: true, song: managed.metadata, managedSong: managed };
  }

  /**
   * V14.6: Atualiza a categoria da música sem alterar o songId, preservando todos os dados e histórico.
   */
  public updateSongCategory(
    songId: string,
    category: 'MINHAS_MUSICAS' | 'INTERNACIONAL',
    user = 'admin'
  ): ManagedSong {
    const managed = this.managedSongs.get(songId);
    if (!managed) {
      throw new Error(`Música "${songId}" não encontrada para atualização de categoria.`);
    }
    const prevCategory = managed.category || (managed.metadata.isInternational ? 'INTERNACIONAL' : 'MINHAS_MUSICAS');
    const now = new Date().toISOString();
    managed.category = category;
    managed.updatedAt = now;
    managed.metadata.category = category;
    managed.metadata.isInternational = (category === 'INTERNACIONAL');

    if (managed.status === 'PUBLISHED') {
      this.registerPublishedSongToEngines(managed);
    }
    this.saveToStorage();
    this.notifyCatalogChanged();

    this.addHistoryEntry({
      action: 'UPDATE',
      songId: managed.songId,
      songTitle: managed.metadata.title,
      artist: managed.metadata.artist,
      charter: managed.charter,
      source: managed.sourceProvider,
      details: `Categoria alterada de ${prevCategory} para ${category}. ID preservado.`,
      user
    });

    return managed;
  }

  /**
   * V14.6: Atualiza status de gratuidade e custo em RockCoins individualmente.
   */
  public updateSongPricing(
    songId: string,
    isFree: boolean,
    unlockCost: number,
    user = 'admin'
  ): ManagedSong {
    const managed = this.managedSongs.get(songId);
    if (!managed) {
      throw new Error(`Música "${songId}" não encontrada para atualização de preço.`);
    }
    const cleanCost = isFree ? 0 : Math.max(0, Math.round(unlockCost));
    const now = new Date().toISOString();
    managed.isFree = isFree;
    managed.unlockCost = cleanCost;
    managed.updatedAt = now;
    managed.metadata.isFree = isFree;
    managed.metadata.unlockCost = cleanCost;

    if (managed.status === 'PUBLISHED') {
      this.registerPublishedSongToEngines(managed);
    }
    this.saveToStorage();
    this.notifyCatalogChanged();

    this.addHistoryEntry({
      action: 'UPDATE',
      songId: managed.songId,
      songTitle: managed.metadata.title,
      artist: managed.metadata.artist,
      charter: managed.charter,
      source: managed.sourceProvider,
      details: `Precificação alterada para: ${isFree ? 'Gratuita' : `Bloqueada por ${cleanCost} RockCoins`}.`,
      user
    });

    return managed;
  }

  /**
   * Despublica uma música (torna indisponível para jogadores sem apagar os dados do painel)
   */
  public unpublishSong(songId: string, user = 'admin'): boolean {
    const managed = this.managedSongs.get(songId);
    if (!managed) return false;

    managed.status = 'UNPUBLISHED';
    managed.updatedAt = new Date().toISOString();
    managed.metadata.isAvailable = false;
    managed.metadata.internationalStatus = 'SUSPENSA / DESPUBLICADA';

    this.saveToStorage();
    this.notifyCatalogChanged();

    this.addHistoryEntry({
      action: 'UNPUBLISH',
      songId: managed.songId,
      songTitle: managed.metadata.title,
      artist: managed.metadata.artist,
      charter: managed.charter,
      source: managed.sourceProvider,
      details: 'Música despublicada e removida do catálogo ativo de jogadores.',
      user
    });

    return true;
  }

  /**
   * Exclui permanentemente uma música do catálogo gerenciado
   */
  public deleteSong(songId: string, user = 'admin'): boolean {
    const managed = this.managedSongs.get(songId);
    if (!managed) return false;

    this.managedSongs.delete(songId);
    UniversalChartImporter.deregisterConvertedChart(songId);
    delete INTERNATIONAL_SYNC_REGISTRY[songId];
    this.saveToStorage();
    this.notifyCatalogChanged();

    this.addHistoryEntry({
      action: 'DELETE',
      songId,
      songTitle: managed.metadata.title,
      artist: managed.metadata.artist,
      charter: managed.charter,
      source: managed.sourceProvider,
      details: 'Música e charts excluídos definitivamente pelo administrador.',
      user
    });

    return true;
  }

  /**
   * Atualiza metadados ou calibração de uma música existente
   */
  public updateSong(
    songId: string,
    updates: Partial<ManagedSong>,
    user = 'admin'
  ): ManagedSong | undefined {
    const managed = this.managedSongs.get(songId);
    if (!managed) return undefined;

    Object.assign(managed, updates);
    managed.updatedAt = new Date().toISOString();

    if (updates.metadata) {
      managed.metadata = { ...managed.metadata, ...updates.metadata };
    }

    if (managed.status === 'PUBLISHED') {
      this.registerPublishedSongToEngines(managed);
      this.notifyCatalogChanged();
    }

    this.saveToStorage();

    this.addHistoryEntry({
      action: 'UPDATE',
      songId,
      songTitle: managed.metadata.title,
      artist: managed.metadata.artist,
      charter: managed.charter,
      source: managed.sourceProvider,
      details: 'Metadados ou calibração de offset atualizados.',
      user
    });

    return managed;
  }

  /**
   * Histórico de importações e operações administrativas
   */
  public getHistory(): ImportHistoryEntry[] {
    return [...this.history];
  }

  public addHistoryEntry(entry: Omit<ImportHistoryEntry, 'id' | 'timestamp'>): void {
    const item: ImportHistoryEntry = {
      ...entry,
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString()
    };
    this.history.unshift(item);
    if (this.history.length > 200) {
      this.history.pop();
    }
  }

  /**
   * Exporta todo o catálogo gerenciado em formato JSON para backup ou compartilhamento
   */
  public exportCatalogJson(): string {
    const payload = {
      schemaVersion: '1.0',
      version: '1.0',
      app: 'RockBrazil',
      exportDate: new Date().toISOString(),
      system: 'RockBrazil Admin Catalog Bundle',
      songs: Array.from(this.managedSongs.values()),
      history: this.history.slice(0, 50)
    };
    return JSON.stringify(payload, null, 2);
  }

  /**
   * Importa um pacote de catálogo em formato JSON
   */
  public importCatalogJson(jsonStr: string, user = 'admin'): { success: boolean; importedCount: number; imported: number; errors: string[] } {
    const errors: string[] = [];
    let count = 0;

    try {
      const parsed = JSON.parse(jsonStr);
      const list: ManagedSong[] = Array.isArray(parsed?.songs) ? parsed.songs : (Array.isArray(parsed) ? parsed : []);

      for (const item of list) {
        if (!item.songId || !item.metadata || !item.compactCharts) {
          errors.push(`Entrada inválida ignorada (ausência de songId ou compactCharts).`);
          continue;
        }
        this.managedSongs.set(item.songId, item);
        if (item.status === 'PUBLISHED') {
          this.registerPublishedSongToEngines(item);
        }
        count++;
      }

      this.saveToStorage();
      this.notifyCatalogChanged();

      this.addHistoryEntry({
        action: 'IMPORT',
        songId: 'catalog-bundle',
        songTitle: 'Pacote de Catálogo JSON',
        artist: 'Vários',
        charter: 'Importação em Lote',
        source: 'Arquivo JSON',
        details: `Importadas com sucesso ${count} músicas do pacote externo.`,
        user
      });
    } catch (e: any) {
      errors.push(`Erro fatal ao decodificar JSON: ${e.message}`);
    }

    return { success: errors.length === 0, importedCount: count, imported: count, errors };
  }

  /**
   * Utilitário para converter notas em formato CompactCharts
   */
  public static convertBeatmapToCompact(charts: BeatmapByDifficulty): CompactCharts {
    const result: CompactCharts = {
      EASY: this.notesToCompactArray(charts.EASY || []),
      MEDIUM: this.notesToCompactArray(charts.MEDIUM || []),
      HARD: this.notesToCompactArray(charts.HARD || []),
      EXPERT: this.notesToCompactArray(charts.EXPERT || [])
    };
    return result;
  }

  private static notesToCompactArray(notes: Note[]): CompactNote[] {
    const timeMap = new Map<number, Note[]>();
    for (const n of notes) {
      const t = Math.round(n.time * 1000) / 1000;
      if (!timeMap.has(t)) timeMap.set(t, []);
      timeMap.get(t)!.push(n);
    }

    const res: CompactNote[] = [];
    for (const [t, group] of timeMap.entries()) {
      const isChord = group.length > 1 ? 1 : 0;
      for (const n of group) {
        const dur = Math.max(0, Math.round(n.duration * 1000) / 1000);
        if (isChord) {
          res.push([t, n.lane as Lane, dur, 1]);
        } else if (dur > 0) {
          res.push([t, n.lane as Lane, dur]);
        } else {
          res.push([t, n.lane as Lane, 0]);
        }
      }
    }

    res.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return res;
  }
}
