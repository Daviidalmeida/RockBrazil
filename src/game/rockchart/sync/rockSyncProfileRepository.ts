import { RockSyncProfile, ValidationStatus, SyncMethod, ChartSourceProviderId } from '../types';
import { Difficulty } from '../../../types';

export class RockSyncProfileRepository {
  private static readonly STORAGE_KEY = 'rockbrazil_sync_profiles_v14_2_1';
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

  /**
   * Busca perfil ativo para uma música, opcionalmente filtrando por vídeo e dificuldade.
   */
  public getProfileForSong(songId: string, youtubeVideoId?: string, difficulty?: Difficulty): RockSyncProfile | null {
    const cleanSong = songId.trim();
    for (const [, prof] of this.profiles.entries()) {
      if (prof.songId === cleanSong) {
        if (youtubeVideoId && prof.youtubeVideoId !== youtubeVideoId.trim()) {
          continue;
        }
        if (difficulty && prof.difficulty !== difficulty) {
          continue;
        }
        return { ...prof };
      }
    }
    // Fallback sem filtrar por dificuldade se houver perfil para a música
    for (const [, prof] of this.profiles.entries()) {
      if (prof.songId === cleanSong) {
        if (!youtubeVideoId || prof.youtubeVideoId === youtubeVideoId.trim()) {
          return { ...prof, difficulty: difficulty || 'HARD' };
        }
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
        recordingId: 'rec-gnr-wttj-topic-audio',
        youtubeVideoId: 'FN7ECSHb5xs',
        difficulty: 'HARD',
        offsetMs: 0,
        timeScale: 1.0,
        syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
        evidenceSource: 'Áudio Oficial Topic / Appetite for Destruction (Universal Music Group)',
        validationStatus: 'VERIFIED',
        notes: 'Áudio oficial Topic sem narrativa de ônibus. Riff de delay entra em 0.0s e 1º acorde em 3.269s coincidente com chart em 0ms.',
        updatedAt: '2026-11-01T00:00:00Z'
      },
      {
        songId: 'intl-gnr-welcome-to-the-jungle',
        chartId: 'chart-gnr-wttj-canonical',
        chartVersion: '1.0',
        chartSource: 'ROCKBRAZIL_INTERNAL',
        recordingId: 'rec-gnr-wttj-official-video-legacy',
        youtubeVideoId: 'o1tj2zJ2Wvg',
        difficulty: 'HARD',
        offsetMs: -3800,
        timeScale: 1.0,
        syncMethod: 'OFFICIAL_VIDEO_ALIGNMENT',
        evidenceSource: 'Auditoria visual e temporal do clipe oficial Appetite for Destruction 1987 (Intro Detector V2)',
        validationStatus: 'VERIFIED',
        notes: 'Perfil histórico para o clipe MTV de 1987 (3.8s de intro narrativa do ônibus).',
        updatedAt: '2026-10-31T22:25:00Z'
      },
      {
        songId: 'intl-acdc-highway-to-hell',
        chartId: 'chart-acdc-hth-river-plate',
        chartVersion: '1.0',
        chartSource: 'ROCKBRAZIL_INTERNAL',
        recordingId: 'rec-acdc-river-plate-live',
        youtubeVideoId: 'gEPmA3USJdI',
        difficulty: 'HARD',
        offsetMs: -2000,
        timeScale: 1.0,
        syncMethod: 'OFFICIAL_VIDEO_ALIGNMENT',
        evidenceSource: 'Gravação ao vivo River Plate 2009',
        validationStatus: 'VERIFIED',
        notes: 'Offset oficial de -2000ms compensando abertura da plateia argentina.',
        updatedAt: '2026-10-31T21:40:00Z'
      },
      {
        songId: 'intl-gnr-sweet-child-o-mine',
        chartId: 'chart-gnr-scom-canonical',
        chartVersion: '1.0',
        chartSource: 'ROCKBRAZIL_INTERNAL',
        recordingId: 'rec-gnr-scom-topic-audio',
        youtubeVideoId: 'MNrgf3GNNXw',
        difficulty: 'HARD',
        offsetMs: 0,
        timeScale: 1.0,
        syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
        evidenceSource: 'Áudio Oficial Topic / Appetite for Destruction (Universal Music Group)',
        validationStatus: 'VERIFIED',
        notes: 'Áudio oficial Topic de estúdio em 0ms.',
        updatedAt: '2026-11-01T00:00:00Z'
      },
      {
        songId: 'intl-lp-numb',
        chartId: 'chart-lp-numb-harmonix',
        chartVersion: '1.0',
        chartSource: 'COMMUNITY_UPLOAD',
        recordingId: 'rec-lp-numb-topic-audio',
        youtubeVideoId: 'u-IcadiJCrE',
        difficulty: 'HARD',
        offsetMs: 0,
        timeScale: 1.0,
        syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
        evidenceSource: 'Áudio Oficial Topic / Meteora (Warner Records)',
        validationStatus: 'VERIFIED',
        notes: 'Áudio oficial Topic de estúdio em 0ms.',
        updatedAt: '2026-11-01T00:00:00Z'
      },
      {
        songId: 'intl-gnr-paradise-city',
        chartId: 'chart-gnr-pc-zantor',
        chartVersion: '1.0',
        chartSource: 'ROCKBRAZIL_INTERNAL',
        recordingId: 'rec-gnr-pc-topic-audio',
        youtubeVideoId: 'WJUInYShJYo',
        difficulty: 'HARD',
        offsetMs: 0,
        timeScale: 1.0,
        syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
        evidenceSource: 'Áudio Oficial Topic / Appetite for Destruction (Universal Music Group)',
        validationStatus: 'VERIFIED',
        notes: 'Áudio oficial Topic de estúdio em 0ms.',
        updatedAt: '2026-11-01T00:00:00Z'
      },
      {
        songId: 'intl-lp-given-up',
        chartId: 'chart-lp-given-up-canonical',
        chartVersion: '1.0',
        chartSource: 'ROCKBRAZIL_INTERNAL',
        recordingId: 'rec-lp-given-up-topic-audio',
        youtubeVideoId: 'D93vYwuMeUw',
        difficulty: 'HARD',
        offsetMs: 0,
        timeScale: 1.0,
        syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
        evidenceSource: 'Áudio Oficial Topic / Minutes to Midnight (Warner Records)',
        validationStatus: 'VERIFIED',
        notes: 'Áudio oficial Topic de estúdio em 0ms.',
        updatedAt: '2026-11-01T00:00:00Z'
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
