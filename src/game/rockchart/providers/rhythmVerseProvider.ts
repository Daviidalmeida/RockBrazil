import { ChartProvider, ChartSearchResult, ChartProviderDetails, ChartSourceProviderId } from '../types';
import { Difficulty } from '../../../types';

export class RhythmVerseProvider implements ChartProvider {
  public readonly providerId: ChartSourceProviderId = 'RHYTHMVERSE';
  public readonly displayName = 'RhythmVerse (rhythmverse.co)';
  public readonly websiteUrl = 'https://rhythmverse.co/';

  /**
   * Conforme diretriz ética e de conformidade do RockBrazil V14.0:
   * O RhythmVerse NÃO disponibiliza API REST pública documentada para terceiros.
   * Não realizamos scraping não autorizado nem contorno de proteção.
   * Fornecemos link de busca direta oficial e importação administrativa de arquivos
   * obtidos legitimamente (.chart, .mid, .ini, .zip).
   */
  public isLiveApiAvailable(): boolean {
    return false;
  }

  public getTermsNotice(): string {
    return 'O RhythmVerse (rhythmverse.co) é uma plataforma comunitária sem API pública aberta para scraping automatizado. Charts devem ser consultados diretamente no portal e importados pelo administrador com respeito aos direitos dos autores.';
  }

  public getDirectWebSearchUrl(artist: string, title: string): string {
    const query = [artist, title].filter(Boolean).join(' ');
    return `https://rhythmverse.co/songfiles/game?search=${encodeURIComponent(query)}`;
  }

  /**
   * Como o RhythmVerse não oferece endpoint de API REST público autorizado,
   * a busca programática não inventa dados nem efetua scraping abusivo.
   * Retorna lista vazia informando a necessidade de importação administrativa legítima.
   */
  public async search(query: { artist?: string; title?: string }): Promise<ChartSearchResult[]> {
    // Transparência: Sem API autorizada, zero resultados inventados
    return [];
  }

  public async getChartDetails(chartId: string): Promise<ChartProviderDetails | null> {
    return null;
  }
}
