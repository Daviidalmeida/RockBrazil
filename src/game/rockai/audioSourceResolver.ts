import { PreparedAudio } from './contracts';
import { SongLibrary } from '../songLibrary';

export type AudioSourceStatus = 'RESOLVED_AUTHORIZED' | 'AWAITING_ANALYZABLE_AUDIO' | 'VIDEO_ONLY';

export interface AudioSourceResult {
  status: AudioSourceStatus;
  sourceType?: 'ADMIN_UPLOAD' | 'AUTHORIZED_LIBRARY' | 'OFFICIAL_API';
  audio?: PreparedAudio;
  message: string;
}

export interface AudioSourceProvider {
  name: string;
  resolveAudio(
    songId: string,
    youtubeVideoId: string,
    title?: string,
    artist?: string
  ): Promise<PreparedAudio | null>;
}

/**
 * In-memory provider for audio directly uploaded or attached by admin.
 */
export class AdminUploadProvider implements AudioSourceProvider {
  public name = 'AdminUploadProvider';
  private static attachedAudios: Map<string, PreparedAudio> = new Map();

  public static setAudio(songId: string, audio: PreparedAudio): void {
    this.attachedAudios.set(songId, audio);
  }

  public static getAudio(songId: string): PreparedAudio | undefined {
    return this.attachedAudios.get(songId);
  }

  public static removeAudio(songId: string): void {
    this.attachedAudios.delete(songId);
  }

  public async resolveAudio(
    songId: string,
    _youtubeVideoId: string,
    _title?: string,
    _artist?: string
  ): Promise<PreparedAudio | null> {
    return AdminUploadProvider.attachedAudios.get(songId) || null;
  }
}

/**
 * Provider searching licensed and pre-authorized song catalog entries.
 */
export class AuthorizedLibraryProvider implements AudioSourceProvider {
  public name = 'AuthorizedLibraryProvider';
  private songLibrary?: SongLibrary;

  constructor(library?: SongLibrary) {
    this.songLibrary = library;
  }

  public async resolveAudio(
    songId: string,
    _youtubeVideoId: string,
    _title?: string,
    _artist?: string
  ): Promise<PreparedAudio | null> {
    if (!this.songLibrary) return null;
    const song = this.songLibrary.getSongById(songId);
    if (song && song.audioBuffer) {
      const pcm = song.audioBuffer.getChannelData(0);
      return {
        name: `${song.title}.wav`,
        format: 'audio/wav',
        duration: song.audioBuffer.duration,
        sampleRate: song.audioBuffer.sampleRate,
        channels: song.audioBuffer.numberOfChannels,
        buffer: pcm,
        peaks: []
      };
    }
    return null;
  }
}

/**
 * ROCKBRAZIL V13.9.2 — AUDIO SOURCE RESOLVER
 *
 * Extensible resolver for locating authorized, analyzable audio sources.
 *
 * Accepted sources:
 * 1. Admin-provided audio (File / ArrayBuffer / In-Memory AudioBuffer)
 * 2. Licensed / Authorized audio library
 * 3. Official API with explicit permission to access raw audio
 *
 * Strictly adheres to terms of service:
 * NEVER downloads, intercepts, captures, scrapes, or proxies audio from YouTube streams!
 * If only a YouTube link exists with no authorized audio, resolves to:
 * 'AWAITING_ANALYZABLE_AUDIO' with 'VÍDEO CADASTRADO / ÁUDIO PARA ANÁLISE INDISPONÍVEL'.
 */
export class AudioSourceResolver {
  private providers: AudioSourceProvider[] = [];

  constructor() {
    this.registerProvider(new AdminUploadProvider());
  }

  public registerProvider(provider: AudioSourceProvider): void {
    // Avoid duplicate provider names
    this.providers = this.providers.filter(p => p.name !== provider.name);
    this.providers.push(provider);
  }

  public getProviders(): AudioSourceProvider[] {
    return [...this.providers];
  }

  /**
   * Resolves audio from registered authorized providers.
   * NEVER downloads or intercepts YouTube streams.
   */
  public async resolve(
    songId: string,
    youtubeVideoId: string,
    title?: string,
    artist?: string
  ): Promise<AudioSourceResult> {
    for (const provider of this.providers) {
      try {
        const audio = await provider.resolveAudio(songId, youtubeVideoId, title, artist);
        if (audio) {
          const sourceType = provider.name === 'AdminUploadProvider'
            ? 'ADMIN_UPLOAD'
            : (provider.name === 'AuthorizedLibraryProvider' ? 'AUTHORIZED_LIBRARY' : 'OFFICIAL_API');
          
          return {
            status: 'RESOLVED_AUTHORIZED',
            sourceType,
            audio,
            message: `Fonte de áudio autorizada localizada via ${provider.name}.`
          };
        }
      } catch (err: any) {
        console.warn(`[AudioSourceResolver] Falha no provedor ${provider.name}:`, err);
      }
    }

    // No authorized audio source available for analysis
    return {
      status: 'AWAITING_ANALYZABLE_AUDIO',
      message: 'VÍDEO CADASTRADO / ÁUDIO PARA ANÁLISE INDISPONÍVEL'
    };
  }
}
