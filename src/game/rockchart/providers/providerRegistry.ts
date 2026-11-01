import { ChartProvider, ChartSearchResult, ChartSourceProviderId } from '../types';
import { ChorusEncoreProvider } from './enchorProvider';
import { RhythmVerseProvider } from './rhythmVerseProvider';

export class ChartProviderRegistry {
  private static instance: ChartProviderRegistry | null = null;
  private providers: Map<ChartSourceProviderId, ChartProvider> = new Map();

  private constructor() {
    this.registerProvider(new ChorusEncoreProvider());
    this.registerProvider(new RhythmVerseProvider());
  }

  public static getInstance(): ChartProviderRegistry {
    if (!this.instance) {
      this.instance = new ChartProviderRegistry();
    }
    return this.instance;
  }

  public registerProvider(provider: ChartProvider): void {
    this.providers.set(provider.providerId, provider);
  }

  public getProvider(id: ChartSourceProviderId): ChartProvider | undefined {
    return this.providers.get(id);
  }

  public getAllProviders(): ChartProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Realiza pesquisa simultânea em todos os provedores registrados
   * com deduplicação de resultados e prevenção de dados duplicados.
   */
  public async searchAll(query: { artist?: string; title?: string }): Promise<{
    results: ChartSearchResult[];
    providerStatus: { providerId: ChartSourceProviderId; name: string; isLive: boolean; totalFound: number; searchUrl: string }[];
  }> {
    const results: ChartSearchResult[] = [];
    const providerStatus: { providerId: ChartSourceProviderId; name: string; isLive: boolean; totalFound: number; searchUrl: string }[] = [];
    const seenSignatures = new Set<string>();

    for (const provider of this.providers.values()) {
      const searchUrl = provider.getDirectWebSearchUrl(query.artist || '', query.title || '');
      let found: ChartSearchResult[] = [];

      try {
        found = await provider.search(query);
      } catch {
        found = [];
      }

      providerStatus.push({
        providerId: provider.providerId,
        name: provider.displayName,
        isLive: provider.isLiveApiAvailable(),
        totalFound: found.length,
        searchUrl
      });

      for (const item of found) {
        // Assinatura única para deduplicação: title + artist + charter + duration
        const sig = `${item.title.toLowerCase()}_${item.artist.toLowerCase()}_${item.charter.toLowerCase()}_${item.durationSec}`;
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          results.push(item);
        }
      }
    }

    return { results, providerStatus };
  }
}
