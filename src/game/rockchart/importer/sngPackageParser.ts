/**
 * RockBrazil — SngPackageParser
 * 
 * Parser nativo e puro de contêineres .sng (Songs Next Generation - Clone Hero / Chorus Encore).
 * Especificação baseada na análise do Clone Hero Chart Manager e parse-sng:
 * - Magic prefix: 'SNGPKG' (0x53, 0x4E, 0x47, 0x50, 0x4B, 0x47)
 * - Version: uint32 LE
 * - XOR Mask: 16 bytes
 * - Metadata Table: [keyLen, key, valueLen, value]
 * - File Meta Table: [filenameLen, filename, contentsLen, contentsIndex]
 * - Unmasking: out[i] = buf[i] ^ (xorMask[ci % 16] ^ ci) onde ci = i % 256
 */

export interface SngFileEntry {
  filename: string;
  contentsLen: number;
  contentsIndex: number;
  data?: Uint8Array;
}

export interface SngPackageResult {
  version: number;
  metadata: Record<string, string>;
  files: Map<string, Uint8Array>;
  chartText: string | null;
  midiData: Uint8Array | null;
  iniText: string | null;
  albumArtData: Uint8Array | null;
  albumArtMime?: string;
}

export class SngPackageParser {
  private static readonly SNG_MAGIC = new Uint8Array([0x53, 0x4E, 0x47, 0x50, 0x4B, 0x47]); // 'SNGPKG'

  /**
   * Verifica se o buffer inicia com o cabeçalho mágico 'SNGPKG'
   */
  public static isSng(buffer: ArrayBuffer | Uint8Array): boolean {
    const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (uint8.length < 6) return false;
    for (let i = 0; i < 6; i++) {
      if (uint8[i] !== this.SNG_MAGIC[i]) return false;
    }
    return true;
  }

  /**
   * Remove tags de estilização Unity / RichText (<color=#xxx>, <b>, etc.)
   */
  public static stripRichTags(str: string): string {
    return str.replace(/<\/?(?:color|b|i|u|s|size|material|quad|sprite|alpha|mark|noparse)\b[^>]*>/gi, '').trim();
  }

  public static stripRichText(str: string): string {
    return this.stripRichTags(str);
  }

  /**
   * Desmascara um chunk/arquivo de contêiner .sng usando a máscara cíclica XOR de 16 bytes.
   */
  public static unmaskFile(rawChunk: Uint8Array, xorMask: Uint8Array): Uint8Array {
    const unmasked = new Uint8Array(rawChunk.length);
    for (let i = 0; i < rawChunk.length; i++) {
      const ci = i % 256;
      unmasked[i] = rawChunk[i] ^ (xorMask[ci % 16] ^ ci);
    }
    return unmasked;
  }

  /**
   * Desempacota o contêiner .sng e extrai todos os seus arquivos desmascarados
   */
  public static parseSngPackage(buffer: ArrayBuffer | Uint8Array): SngPackageResult {
    const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

    if (!this.isSng(uint8)) {
      throw new Error('Arquivo não possui a assinatura válida de contêiner SNGPKG.');
    }

    const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
    let pos = 6;

    if (pos + 4 > uint8.length) throw new Error('Contêiner .sng truncado: ausência de versão.');
    const version = view.getUint32(pos, true);
    pos += 4;

    if (pos + 16 > uint8.length) throw new Error('Contêiner .sng truncado: ausência de máscara XOR.');
    const xorMask = uint8.subarray(pos, pos + 16);
    pos += 16;

    if (pos + 16 > uint8.length) throw new Error('Contêiner .sng truncado: cabeçalho de metadados incompleto.');
    const metadataLen = Number(view.getBigUint64(pos, true));
    pos += 8;
    const metadataCount = Number(view.getBigUint64(pos, true));
    pos += 8;

    const metadata: Record<string, string> = {};
    const textDecoder = new TextDecoder('utf-8', { fatal: false });

    for (let i = 0; i < metadataCount; i++) {
      if (pos + 4 > uint8.length) break;
      const keyLen = view.getInt32(pos, true);
      pos += 4;
      if (pos + keyLen > uint8.length) break;
      const key = textDecoder.decode(uint8.subarray(pos, pos + keyLen));
      pos += keyLen;

      if (pos + 4 > uint8.length) break;
      const valLen = view.getInt32(pos, true);
      pos += 4;
      if (pos + valLen > uint8.length) break;
      const val = textDecoder.decode(uint8.subarray(pos, pos + valLen));
      pos += valLen;

      metadata[key] = this.stripRichTags(val);
    }

    if (pos + 16 > uint8.length) throw new Error('Contêiner .sng truncado: cabeçalho de arquivos incompleto.');
    const fileMetaLen = Number(view.getBigUint64(pos, true));
    pos += 8;
    const fileMetaCount = Number(view.getBigUint64(pos, true));
    pos += 8;

    const fileEntries: SngFileEntry[] = [];
    for (let i = 0; i < fileMetaCount; i++) {
      if (pos + 1 > uint8.length) break;
      const filenameLen = uint8[pos];
      pos += 1;
      if (pos + filenameLen > uint8.length) break;
      const filename = textDecoder.decode(uint8.subarray(pos, pos + filenameLen));
      pos += filenameLen;

      if (pos + 16 > uint8.length) break;
      const contentsLen = Number(view.getBigUint64(pos, true));
      pos += 8;
      const contentsIndex = Number(view.getBigUint64(pos, true));
      pos += 8;

      fileEntries.push({ filename, contentsLen, contentsIndex });
    }

    const files = new Map<string, Uint8Array>();
    let chartText: string | null = null;
    let midiData: Uint8Array | null = null;
    let iniText: string | null = null;
    let albumArtData: Uint8Array | null = null;
    let albumArtMime: string | undefined = undefined;

    for (const entry of fileEntries) {
      if (entry.contentsIndex + entry.contentsLen > uint8.length) {
        continue;
      }

      const rawChunk = uint8.subarray(entry.contentsIndex, entry.contentsIndex + entry.contentsLen);
      const unmasked = this.unmaskFile(rawChunk, xorMask);

      files.set(entry.filename, unmasked);
      const lower = entry.filename.toLowerCase();

      if (lower.endsWith('.chart') && !chartText) {
        chartText = textDecoder.decode(unmasked);
      } else if ((lower.endsWith('notes.mid') || lower.endsWith('.mid') || lower.endsWith('.midi')) && !midiData) {
        midiData = unmasked;
      } else if (lower.endsWith('song.ini') && !iniText) {
        iniText = textDecoder.decode(unmasked);
      } else if (lower.startsWith('album.') || lower.startsWith('cover.')) {
        albumArtData = unmasked;
        if (lower.endsWith('.png')) albumArtMime = 'image/png';
        else if (lower.endsWith('.webp')) albumArtMime = 'image/webp';
        else albumArtMime = 'image/jpeg';
      }
    }

    // Se não houver song.ini empacotado explicitamente, reconstrói a partir dos metadados do cabeçalho
    if (!iniText && Object.keys(metadata).length > 0) {
      iniText = this.generateSongIniFromMetadata(metadata);
    }

    return {
      version,
      metadata,
      files,
      chartText,
      midiData,
      iniText,
      albumArtData,
      albumArtMime
    };
  }

  /**
   * Reconstrói o formato padrão song.ini a partir do dicionário de metadados do SNG
   */
  public static generateSongIniFromMetadata(metadata: Record<string, string>): string {
    const lines = ['[song]'];
    for (const [key, val] of Object.entries(metadata)) {
      if (val !== undefined && val !== null && val !== '') {
        lines.push(`${key} = ${val}`);
      }
    }
    return lines.join('\n') + '\n';
  }
}
