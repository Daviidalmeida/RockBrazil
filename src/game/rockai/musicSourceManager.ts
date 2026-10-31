import { SongMetadataInput, YouTubeValidationResult } from './contracts';

export interface RegisteredSongDraft {
  id: string;
  title: string;
  artist: string;
  category: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  hasAuthorizedAudio: boolean;
  status: 'AGUARDANDO ÁUDIO AUTORIZADO' | 'PRONTO PARA ANÁLISE' | 'ANALISADO';
  audioFileName?: string;
  audioFileSize?: number;
  registeredAt: string;
  licenseNotice?: string;
}

/**
 * ROCKBRAZIL V13.9 — MUSIC SOURCE MANAGER
 *
 * Responsibilities:
 * - Legitimate YouTube URL validation & ID extraction.
 * - Authorized audio file registration (WAV, MP3, FLAC, OGG, M4A).
 * - Strict prohibition of YouTube audio scraping.
 */
export class MusicSourceManager {
  /**
   * Validates a YouTube link and extracts its official 11-character video ID.
   * Accepts:
   * - https://www.youtube.com/watch?v=XXXXXXXXXXX
   * - https://youtu.be/XXXXXXXXXXX
   * - https://www.youtube.com/shorts/XXXXXXXXXXX
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
   * Creates a registered song entry.
   * If no authorized audio file is provided, flags strictly as 'AGUARDANDO ÁUDIO AUTORIZADO'.
   */
  public static registerSong(input: SongMetadataInput): RegisteredSongDraft {
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

    return {
      id: songId,
      title,
      artist,
      category,
      youtubeUrl: ytValidation.canonicalUrl!,
      youtubeVideoId: ytValidation.videoId,
      hasAuthorizedAudio: hasAudio,
      status: hasAudio ? 'PRONTO PARA ANÁLISE' : 'AGUARDANDO ÁUDIO AUTORIZADO',
      audioFileName: input.audioFileName,
      audioFileSize: audioSize,
      registeredAt: new Date().toISOString()
    };
  }
}
