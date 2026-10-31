import { AutochartGenerationResult } from './contracts';
import { RegisteredSongDraft } from './musicSourceManager';

export class RockAIStorageService {
  private static draftsStorageKey = 'rockbrazil_rockai_drafts';
  private static generatedStorageKey = 'rockbrazil_rockai_generated_charts';

  public static saveDraft(draft: RegisteredSongDraft): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const drafts = this.getAllDrafts();
      drafts[draft.id] = draft;
      localStorage.setItem(this.draftsStorageKey, JSON.stringify(drafts));
    } catch (e) {
      console.warn('[RockAIStorageService] Falha ao salvar rascunho:', e);
    }
  }

  public static getAllDrafts(): Record<string, RegisteredSongDraft> {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(this.draftsStorageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  public static getDraft(songId: string): RegisteredSongDraft | null {
    return this.getAllDrafts()[songId] || null;
  }

  public static saveGeneratedChart(result: AutochartGenerationResult): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const all = this.getAllGeneratedCharts();
      all[result.songId] = result;
      localStorage.setItem(this.generatedStorageKey, JSON.stringify(all));
    } catch (e) {
      console.warn('[RockAIStorageService] Falha ao salvar chart gerado:', e);
    }
  }

  public static getAllGeneratedCharts(): Record<string, AutochartGenerationResult> {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(this.generatedStorageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  public static getGeneratedChart(songId: string): AutochartGenerationResult | null {
    return this.getAllGeneratedCharts()[songId] || null;
  }

  public static exportChartAsJson(result: AutochartGenerationResult): string {
    return JSON.stringify(result, null, 2);
  }

  public static importChartFromJson(jsonStr: string): AutochartGenerationResult {
    const parsed = JSON.parse(jsonStr);
    if (!parsed.songId || !parsed.charts || !parsed.charts.EASY) {
      throw new Error('Arquivo JSON de chart inválido ou corrompido.');
    }
    return parsed as AutochartGenerationResult;
  }
}
