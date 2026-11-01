import { ChartProvider, ChartSearchResult, ChartProviderDetails, ChartSourceProviderId } from '../types';
import { Difficulty } from '../../../types';
import { SngPackageParser } from '../importer/sngPackageParser';

export class ChorusEncoreProvider implements ChartProvider {
  public readonly providerId: ChartSourceProviderId = 'CHORUS_ENCORE';
  public readonly displayName = 'Chorus Encore (Enchor.us)';
  public readonly websiteUrl = 'https://www.enchor.us/';

  private readonly apiBaseUrl = 'https://api.enchor.us';
  private readonly filesBaseUrl = 'https://files.enchor.us';
  private liveApiAvailable = true;
  private readonly customFetchFn?: typeof fetch;

  constructor(options?: { fetchFn?: typeof fetch }) {
    if (options?.fetchFn) {
      this.customFetchFn = options.fetchFn;
    }
  }

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
   * Realiza pesquisa por artista e/ou título na API oficial do Chorus Encore (api.enchor.us).
   * Utiliza POST /search com timeout seguro, tratamento de rate-limit e deduplicação.
   */
  public async search(query: string | { artist?: string; title?: string }, records = 25): Promise<ChartSearchResult[]> {
    const q = typeof query === 'string' ? query.trim() : [query.artist, query.title].filter(Boolean).join(' ').trim();
    if (!q) return [];

    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;

      const endpoint = `${this.apiBaseUrl}/search`;
      const fetchImpl = this.customFetchFn || (typeof fetch !== 'undefined' ? fetch : (globalThis as any).fetch);
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
        },
        body: JSON.stringify({
          search: q,
          page: 1,
          per_page: records
        }),
        signal: controller?.signal
      }).catch(() => {
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
        const id = String(item.chartId ?? item.id ?? item.md5 ?? Math.random());
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        const hasGuitar = item.notesData?.instruments
          ? item.notesData.instruments.includes('guitar')
          : (item.diff_guitar !== undefined ? item.diff_guitar !== -1 : (item.notesData?.hasInstrument !== false));

        if (!hasGuitar) continue;

        const diffs = this.parseDifficulties(item);
        const format = this.detectFormat(item);
        const rawCharter = item.charter ?? item.charters?.[0] ?? 'Comunidade Clone Hero';
        const cleanCharter = SngPackageParser.stripRichTags(rawCharter);
        const md5 = item.md5 ?? '';
        const albumArtMd5 = item.albumArtMd5 ?? '';

        const directDownloadUrl = md5 ? `${this.filesBaseUrl}/${md5}.sng` : (item.directDownload ?? item.downloadUrl);

        results.push({
          id: `enchor-${id}`,
          provider: this.providerId,
          title: item.name ?? item.title ?? (typeof query === 'string' ? query : query.title) ?? 'Sem Título',
          artist: item.artist ?? (typeof query === 'string' ? undefined : query.artist) ?? 'Artista Desconhecido',
          album: item.album || undefined,
          year: typeof item.year === 'number' ? item.year : (item.year ? parseInt(String(item.year), 10) || undefined : undefined),
          charter: cleanCharter,
          durationSec: typeof item.song_length === 'number' ? Math.round(item.song_length / 1000) : (typeof item.duration === 'number' ? Math.round(item.duration) : 180),
          bpm: typeof item.effectiveBpm === 'number' ? Math.round(item.effectiveBpm) : (typeof item.bpm === 'number' ? Math.round(item.bpm) : 120),
          difficulties: diffs,
          hasFullEMHX: diffs.length === 4,
          format,
          sourceUrl: md5 ? `https://www.enchor.us/chart/${md5}` : `https://www.enchor.us/chart/${id}`,
          directDownloadUrl,
          albumArtUrl: albumArtMd5 ? `${this.filesBaseUrl}/${albumArtMd5}.jpg` : undefined,
          hasGuitar: item.notesData?.instruments ? item.notesData.instruments.includes('guitar') : (item.diff_guitar !== -1),
          hasSolo: Boolean(item.notesData?.hasSoloSections ?? item.hasSolo ?? item.hasSolos),
          hasLyrics: Boolean(item.notesData?.hasLyrics ?? item.hasLyrics),
          version: item.version ?? '1.0',
          fileHash: md5 || item.fileHash
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
      const endpoint = `${this.apiBaseUrl}/search`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          search: rawId,
          page: 1,
          per_page: 5
        })
      }).catch(() => null);

      if (!response || !response.ok) return null;
      const json = await response.json();
      const item = Array.isArray(json?.data) ? json.data[0] : null;
      if (!item) return null;

      const diffs = this.parseDifficulties(item);
      const format = this.detectFormat(item);
      const rawCharter = item.charter ?? 'Comunidade';
      const cleanCharter = SngPackageParser.stripRichTags(rawCharter);
      const md5 = item.md5 ?? '';

      return {
        id: chartId,
        provider: this.providerId,
        title: item.name ?? item.title ?? 'Título',
        artist: item.artist ?? 'Artista',
        charter: cleanCharter,
        durationSec: typeof item.song_length === 'number' ? Math.round(item.song_length / 1000) : 180,
        bpm: typeof item.bpm === 'number' ? item.bpm : 120,
        difficulties: diffs,
        hasFullEMHX: diffs.length === 4,
        format,
        sourceUrl: md5 ? `https://www.enchor.us/chart/${md5}` : `https://www.enchor.us/chart/${rawId}`,
        directDownloadUrl: md5 ? `${this.filesBaseUrl}/${md5}.sng` : (item.directDownload ?? item.downloadUrl),
        hasGuitar: true,
        instrumentBreakdown: {
          guitar: true,
          bass: item.diff_bass !== -1,
          drums: item.diff_drums !== -1,
          keys: item.diff_keys !== -1
        },
        tempoChangesCount: item.notesData?.tempoMarkerCount ?? 1,
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
    const counts = item.notesData?.noteCounts;

    if (Array.isArray(counts) && counts.length > 0) {
      const guitarCounts = counts.filter((c: any) => c.instrument === 'guitar' && (typeof c.count !== 'number' || c.count > 0));
      for (const entry of guitarCounts) {
        const d = String(entry.difficulty).toLowerCase();
        if (d === 'easy' && !diffs.includes('EASY')) diffs.push('EASY');
        if (d === 'medium' && !diffs.includes('MEDIUM')) diffs.push('MEDIUM');
        if (d === 'hard' && !diffs.includes('HARD')) diffs.push('HARD');
        if (d === 'expert' && !diffs.includes('EXPERT')) diffs.push('EXPERT');
      }
    }

    if (diffs.length === 0) {
      if (item.diff_guitar !== undefined && item.diff_guitar >= 0) {
        diffs.push('EXPERT');
      }
    }

    return diffs.length > 0 ? diffs : ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
  }

  private detectFormat(item: any): '.chart' | '.mid' | '.sng' | '.zip' | 'ini' {
    if (item.md5) return '.sng';
    const str = `${item.format || ''} ${item.downloadUrl || ''} ${item.name || ''}`.toLowerCase();
    if (str.includes('.chart')) return '.chart';
    if (str.includes('.mid')) return '.mid';
    if (str.includes('.sng')) return '.sng';
    return '.sng';
  }
}
