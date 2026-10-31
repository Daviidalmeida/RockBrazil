import { SongMetadataInput, YouTubeValidationResult } from './contracts';

export type SongDraftStatus = 
  | 'AGUARDANDO ÁUDIO AUTORIZADO' 
  | 'PRONTO PARA ANÁLISE' 
  | 'ANALISADO' 
  | 'VÍDEO CADASTRADO / ÁUDIO PARA ANÁLISE INDISPONÍVEL'
  | 'AGUARDANDO FONTE DE ÁUDIO ANALISÁVEL';

export interface RegisteredSongDraft {
  id: string;
  title: string;
  artist: string;
  category: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  hasAuthorizedAudio: boolean;
  status: SongDraftStatus;
  mode?: 'YOUTUBE_LINK_ONLY' | 'AUDIO_FILE_AI';
  audioFileName?: string;
  audioFileSize?: number;
  registeredAt: string;
  licenseNotice?: string;
  isEmbeddable?: boolean;
}

/**
 * ROCKBRAZIL V13.9.2 — MUSIC SOURCE MANAGER
 *
 * Responsibilities:
 * - Legitimate YouTube URL validation & ID extraction.
 * - Mode A: YouTube Link Only (registers video, associates in catalog, prepares charts without requiring MP3).
 * - Mode B: Audio File Complete AI (full Demucs + Basic Pitch pipeline).
 * - Strict prohibition of YouTube audio scraping.
 */
export class MusicSourceManager {
  /**
   * Validates a YouTube link and extracts its official 11-character video ID.
   * Accepts:
   * - https://www.youtube.com/watch?v=XXXXXXXXXXX
   * - https://youtu.be/XXXXXXXXXXX
   * - https://www.youtube.com/shorts/XXXXXXXXXXX
   * - https://www.youtube.com/embed/XXXXXXXXXXX
   * - Raw 11-character ID
   */
  public static validateYouTubeUrl(url: string): YouTubeValidationResult {
    if (!url || typeof url !== 'string') {
      return { isValid: false, videoId: null, canonicalUrl: null, error: 'URL do YouTube não fornecida.' };
    }

    const trimmed = url.trim();

    // Regex matching standard YouTube watch, short, and share URLs
    const patterns = [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})(?:&.*)?/,
      /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?.*)?/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?:\?.*)?/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\?.*)?/
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        const videoId = match[1];
        return {
          isValid: true,
          videoId,
          canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`
        };
      }
    }

    // Direct 11-char ID check
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return {
        isValid: true,
        videoId: trimmed,
        canonicalUrl: `https://www.youtube.com/watch?v=${trimmed}`
      };
    }

    return {
      isValid: false,
      videoId: null,
      canonicalUrl: null,
      error: 'Formato de URL do YouTube inválido. Use youtube.com/watch?v=, youtu.be/ ou o ID oficial do vídeo.'
    };
  }

  /**
   * Checks if video ID is valid format for embedding.
   */
  public static isEmbeddableVideoId(videoId: string): boolean {
    return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
  }

  /**
   * Creates a registered song entry.
   * In YouTube-only mode (mode === 'YOUTUBE_LINK_ONLY' or when no audio is passed),
   * sets status to 'VÍDEO CADASTRADO / ÁUDIO PARA ANÁLISE INDISPONÍVEL' or 'AGUARDANDO FONTE DE ÁUDIO ANALISÁVEL'.
   */
  public static registerSong(
    input: SongMetadataInput,
    mode: 'YOUTUBE_LINK_ONLY' | 'AUDIO_FILE_AI' = 'YOUTUBE_LINK_ONLY'
  ): RegisteredSongDraft {
    const ytValidation = this.validateYouTubeUrl(input.youtubeUrl);
    if (!ytValidation.isValid || !ytValidation.videoId) {
      throw new Error(ytValidation.error || 'URL do YouTube inválida.');
    }

    const title = input.title?.trim() || 'Música Sem Título';
    const artist = input.artist?.trim() || 'Artista Desconhecido';
    const category = input.category?.trim() || 'Geral';
    const songId = `rockai-${ytValidation.videoId}`;

    const hasAudio = Boolean(input.audioFile);
    const audioSize = input.audioFile instanceof Blob ? input.audioFile.size : 
                      input.audioFile instanceof ArrayBuffer ? input.audioFile.byteLength : undefined;

    let status: SongDraftStatus;
    if (hasAudio) {
      status = 'PRONTO PARA ANÁLISE';
    } else if (mode === 'YOUTUBE_LINK_ONLY') {
      status = 'VÍDEO CADASTRADO / ÁUDIO PARA ANÁLISE INDISPONÍVEL';
    } else {
      status = 'AGUARDANDO ÁUDIO AUTORIZADO';
    }

    return {
      id: songId,
      title,
      artist,
      category,
      youtubeUrl: ytValidation.canonicalUrl!,
      youtubeVideoId: ytValidation.videoId,
      hasAuthorizedAudio: hasAudio,
      status,
      mode,
      audioFileName: input.audioFileName,
      audioFileSize: audioSize,
      registeredAt: new Date().toISOString(),
      isEmbeddable: this.isEmbeddableVideoId(ytValidation.videoId)
    };
  }
}
