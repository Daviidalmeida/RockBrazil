import { ChartProvider, ChartSearchResult, ChartProviderDetails, ChartSourceProviderId } from '../types';
import { Difficulty } from '../../../types';

export class ChorusEncoreProvider implements ChartProvider {
  public readonly providerId: ChartSourceProviderId = 'CHORUS_ENCORE';
  public readonly displayName = 'Chorus Encore (Enchor.us)';
  public readonly websiteUrl = 'https://www.enchor.us/';

  private readonly apiBaseUrl = 'https://api.enchor.us';
  private liveApiAvailable = true;

  public isLiveApiAvailable(): boolean {
    return this.liveApiAvailable;
  }

  public getTermsNotice(): string {
    return 'Chorus Encore (enchor.us) disponibiliza repositório comunitário sob licença dos criadores de conteúdo (charters). A incorporação ao RockBrazil é realizada apenas com aprovação administrativa.';
  }

  public getDirectWebSearchUrl(artist: string, title: string): string {
    const query = [artist, title].filter(Boolean).join(' ');
    return `https://www.enchor.us/?search=${encodeURIComponent(query)}`;
  }

  /**
   * Realiza pesquisa por artista e/ou título na API pública do Chorus Encore (api.enchor.us).
   * Implementa timeout seguro de 6 segundos, deduplicação por hash e fallback para importação administrativa.
   */
  public async search(query: { artist?: string; title?: string }): Promise<ChartSearchResult[]> {
    const q = [query.artist, query.title].filter(Boolean).join(' ').trim();
    if (!q) return [];

    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;

      const endpoint = `${this.apiBaseUrl}/search?query=${encodeURIComponent(q)}&instrument=guitar`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller?.signal
      }).catch((fetchErr) => {
        // Falhas de rede, CORS ou offline
        this.liveApiAvailable = false;
        return null;
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response || !response.ok) {
        this.liveApiAvailable = false;
        return [];
      }

      const json = await response.json();
      const rawResults: any[] = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);

      // Deduplicação por chartId ou hash
      const seenIds = new Set<string>();
      const results: ChartSearchResult[] = [];

      for (const item of rawResults) {
        const id = String(item.id ?? item.chartId ?? item.md5 ?? item.fileHash ?? Math.random());
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const diffs = this.parseDifficulties(item);
        const format = this.detectFormat(item);

        results.push({
          id: `enchor-${id}`,
          provider: this.providerId,
          title: item.name ?? item.title ?? query.title ?? 'Sem Título',
          artist: item.artist ?? query.artist ?? 'Artista Desconhecido',
          album: item.album,
          year: typeof item.year === 'number' ? item.year : undefined,
          charter: item.charter ?? item.charters?.[0] ?? 'Comunidade Clone Hero',
          durationSec: typeof item.duration === 'number' ? Math.round(item.duration) : (item.song_length ? Math.round(item.song_length / 1000) : 180),
          bpm: typeof item.effectiveBpm === 'number' ? Math.round(item.effectiveBpm) : (typeof item.bpm === 'number' ? Math.round(item.bpm) : 120),
          difficulties: diffs,
          hasFullEMHX: diffs.length === 4,
          format,
          sourceUrl: item.link ?? `https://www.enchor.us/chart/${id}`,
          directDownloadUrl: item.directDownload ?? item.downloadUrl,
          hasGuitar: true,
          hasSolo: Boolean(item.hasSolo ?? item.hasSolos),
          hasLyrics: Boolean(item.hasLyrics),
          version: item.version ?? '1.0',
          fileHash: item.md5 ?? item.fileHash
        });
      }

      this.liveApiAvailable = true;
      return results;
    } catch (e) {
      this.liveApiAvailable = false;
      return [];
    }
  }

  public async getChartDetails(chartId: string): Promise<ChartProviderDetails | null> {
    const rawId = chartId.replace(/^enchor-/, '');
    try {
      const endpoint = `${this.apiBaseUrl}/chart/${encodeURIComponent(rawId)}`;
      const response = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' }
      }).catch(() => null);

      if (!response || !response.ok) return null;
      const item = await response.json();

      const diffs = this.parseDifficulties(item);
      const format = this.detectFormat(item);

      return {
        id: chartId,
        provider: this.providerId,
        title: item.name ?? item.title ?? 'Título',
        artist: item.artist ?? 'Artista',
        charter: item.charter ?? 'Comunidade',
        durationSec: typeof item.duration === 'number' ? item.duration : 180,
        bpm: typeof item.bpm === 'number' ? item.bpm : 120,
        difficulties: diffs,
        hasFullEMHX: diffs.length === 4,
        format,
        sourceUrl: `https://www.enchor.us/chart/${rawId}`,
        directDownloadUrl: item.directDownload ?? item.downloadUrl,
        hasGuitar: true,
        instrumentBreakdown: {
          guitar: true,
          bass: Boolean(item.hasBass),
          drums: Boolean(item.hasDrums),
          keys: Boolean(item.hasKeys)
        },
        tempoChangesCount: item.tempoChanges ?? 1,
        licenseTerms: this.getTermsNotice(),
        isApiAutomated: true,
        administrativeImportRequired: false
      };
    } catch {
      return null;
    }
  }

  private parseDifficulties(item: any): Difficulty[] {
    const diffs: Difficulty[] = [];
    const sourceDiffs = item.difficulties ?? item.diffs ?? {};
    if (sourceDiffs.easy || item.diff_guitar_easy !== undefined) diffs.push('EASY');
    if (sourceDiffs.medium || item.diff_guitar_medium !== undefined) diffs.push('MEDIUM');
    if (sourceDiffs.hard || item.diff_guitar_hard !== undefined) diffs.push('HARD');
    if (sourceDiffs.expert || item.diff_guitar_expert !== undefined) diffs.push('EXPERT');
    return diffs.length > 0 ? diffs : ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
  }

  private detectFormat(item: any): '.chart' | '.mid' | '.sng' | '.zip' | 'ini' {
    const str = `${item.format || ''} ${item.downloadUrl || ''} ${item.name || ''}`.toLowerCase();
    if (str.includes('.chart')) return '.chart';
    if (str.includes('.mid')) return '.mid';
    if (str.includes('.sng')) return '.sng';
    return '.chart';
  }
}
