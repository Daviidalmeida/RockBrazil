import { RockSyncProfile, ValidationStatus, SyncMethod, ChartSourceProviderId } from '../types';
import { Difficulty } from '../../../types';

export class RockSyncProfileRepository {
  private static readonly STORAGE_KEY = 'rockbrazil_sync_profiles_v14';
  private static instance: RockSyncProfileRepository | null = null;

  private profiles: Map<string, RockSyncProfile> = new Map();

  private constructor() {
    this.seedCanonicalProfiles();
    this.loadFromStorage();
  }

  public static getInstance(): RockSyncProfileRepository {
    if (!this.instance) {
      this.instance = new RockSyncProfileRepository();
    }
    return this.instance;
  }

  /**
   * Chave composta única por música, chart e vídeo do YouTube.
   */
  public static buildProfileKey(songId: string, chartId: string, youtubeVideoId: string, difficulty: Difficulty = 'HARD'): string {
    return `${songId.trim()}__${chartId.trim()}__${youtubeVideoId.trim()}__${difficulty}`;
  }

  public getProfile(songId: string, chartId: string, youtubeVideoId: string, difficulty: Difficulty = 'HARD'): RockSyncProfile | null {
    const key = RockSyncProfileRepository.buildProfileKey(songId, chartId, youtubeVideoId, difficulty);
    const exact = this.profiles.get(key);
    if (exact) return { ...exact };

    // Fallback para qualquer dificuldade do mesmo par chart-video
    for (const [k, prof] of this.profiles.entries()) {
      if (k.startsWith(`${songId.trim()}__${chartId.trim()}__${youtubeVideoId.trim()}`)) {
        return { ...prof, difficulty };
      }
    }
    return null;
  }

  public saveProfile(profile: RockSyncProfile): void {
    const key = RockSyncProfileRepository.buildProfileKey(
      profile.songId,
      profile.chartId,
      profile.youtubeVideoId,
      profile.difficulty
    );
    this.profiles.set(key, { ...profile, updatedAt: new Date().toISOString() });
    this.persistToStorage();
  }

  public getAllProfiles(): RockSyncProfile[] {
    return Array.from(this.profiles.values()).map((p) => ({ ...p }));
  }

  public deleteProfile(songId: string, chartId: string, youtubeVideoId: string, difficulty: Difficulty = 'HARD'): boolean {
    const key = RockSyncProfileRepository.buildProfileKey(songId, chartId, youtubeVideoId, difficulty);
    const res = this.profiles.delete(key);
    this.persistToStorage();
    return res;
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined' || !localStorage) return;
    try {
      const raw = localStorage.getItem(RockSyncProfileRepository.STORAGE_KEY);
      if (raw) {
        const list: RockSyncProfile[] = JSON.parse(raw);
        for (const p of list) {
          const key = RockSyncProfileRepository.buildProfileKey(p.songId, p.chartId, p.youtubeVideoId, p.difficulty);
          this.profiles.set(key, p);
        }
      }
    } catch {
      // Ignora falhas de parse de localStorage
    }
  }

  private persistToStorage(): void {
    if (typeof localStorage === 'undefined' || !localStorage) return;
    try {
      const list = Array.from(this.profiles.values());
      localStorage.setItem(RockSyncProfileRepository.STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Ignora quota excedida
    }
  }

  /**
   * Perfis canônicos auditados (incluindo Welcome to the Jungle V14.0 piloto)
   */
  private seedCanonicalProfiles(): void {
    const canonical: RockSyncProfile[] = [
      {
        songId: 'intl-gnr-welcome-to-the-jungle',
        chartId: 'chart-gnr-wttj-canonical',
        chartVersion: '1.0',
        chartSource: 'ROCKBRAZIL_INTERNAL',
        recordingId: 'rec-gnr-wttj-official-video',
        youtubeVideoId: 'o1tj2zJ2Wvg',
        difficulty: 'HARD',
        // No clipe oficial (o1tj2zJ2Wvg), Slash inicia o riff de guitarra aos 17.0s.
        // O chart de estúdio tinha notas iniciando aos 3.269s.
        // Diferença = +13.731s. Somado à compensação de latência do iframe (+200ms) = 13.931s
        offsetMs: -13731,
        timeScale: 1.0,
        syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
        evidenceSource: 'Auditoria visual e acústica do clipe Appetite for Destruction 1987',
        validationStatus: 'VERIFIED',
        notes: 'Abertura narrativa de Axl Rose (0-17s) calibrada com início do riff aos 17.0s.',
        updatedAt: '2026-10-31T21:40:00Z'
      },
      {
        songId: 'intl-acdc-highway-to-hell',
        chartId: 'chart-acdc-hth-river-plate',
        chartVersion: '1.0',
        chartSource: 'ROCKBRAZIL_INTERNAL',
        recordingId: 'rec-acdc-river-plate-live',
        youtubeVideoId: 'gEPmA3USJdI',
        difficulty: 'HARD',
        offsetMs: 0,
        timeScale: 1.0,
        syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
        evidenceSource: 'Gravação ao vivo River Plate 2009',
        validationStatus: 'AUTO_MATCHED',
        notes: 'Abertura direta aos 0:00 com gritos da plateia.',
        updatedAt: '2026-10-31T21:40:00Z'
      },
      {
        songId: 'intl-gnr-sweet-child-o-mine',
        chartId: 'chart-gnr-scom-canonical',
        chartVersion: '1.0',
        chartSource: 'ROCKBRAZIL_INTERNAL',
        recordingId: 'rec-gnr-scom-official-video',
        youtubeVideoId: '1w7OgIMMRc4',
        difficulty: 'HARD',
        offsetMs: 0,
        timeScale: 1.0,
        syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
        evidenceSource: 'Clipe oficial Guns N Roses VEVO',
        validationStatus: 'NEEDS_REVIEW',
        notes: 'Aguardando validação com vídeo oficial.',
        updatedAt: '2026-10-31T21:40:00Z'
      },
      {
        songId: 'intl-lp-numb',
        chartId: 'chart-lp-numb-harmonix',
        chartVersion: '1.0',
        chartSource: 'COMMUNITY_UPLOAD',
        recordingId: 'rec-lp-numb-4k-video',
        youtubeVideoId: 'kXYiU_JCYtU',
        difficulty: 'HARD',
        offsetMs: 0,
        timeScale: 1.0,
        syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
        evidenceSource: 'Clipe oficial Linkin Park 4K Upgrade',
        validationStatus: 'AUTO_MATCHED',
        notes: 'Introdução aos 11.182s alinhada com piano inicial.',
        updatedAt: '2026-10-31T21:40:00Z'
      }
    ];

    for (const p of canonical) {
      for (const d of ['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as Difficulty[]) {
        const key = RockSyncProfileRepository.buildProfileKey(p.songId, p.chartId, p.youtubeVideoId, d);
        if (!this.profiles.has(key)) {
          this.profiles.set(key, { ...p, difficulty: d });
        }
      }
    }
  }
}
