/**
 * AudioImporter: Handles file validation, cryptographic hash identification, and Web Audio decoding.
 */

export class AudioImporter {
  static async computeFileHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    // Fast and collision-resistant SHA-256 hash using Web Crypto API
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  static validateAudioFile(file: File): { valid: boolean; error?: string } {
    const validExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    const lowerName = file.name.toLowerCase();
    const hasValidExt = validExtensions.some((ext) => lowerName.endsWith(ext));

    if (!hasValidExt && !file.type.startsWith('audio/')) {
      return {
        valid: false,
        error: `Formato de arquivo não suportado (${file.name}). Use arquivos MP3, WAV, OGG ou M4A.`
      };
    }

    if (file.size > 80 * 1024 * 1024) { // 80 MB limit for mobile safety
      return {
        valid: false,
        error: 'Arquivo muito grande. O limite máximo para análise no celular é de 80MB.'
      };
    }

    return { valid: true };
  }

  static async decodeAudio(ctx: AudioContext, file: File): Promise<AudioBuffer> {
    const validation = this.validateAudioFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    const arrayBuffer = await file.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
  }
}
