import { SongMetadata, Difficulty, SongRecord } from '../types';
import { OFFICIAL_BRAZILIAN_CATALOG } from './catalog/catalogData';
import { INTERNATIONAL_SONGS_CATALOG } from './catalog/internationalCatalog';

export const LEGACY_PROCEDURAL_SONGS: SongMetadata[] = [
  {
    id: 'furia-tropical',
    title: 'Fúria Tropical',
    artist: 'RockBrazil Band',
    duration: 51.5,
    bpm: 132,
    style: '⚡ Hard Rock Brasil',
    type: 'procedural',
    proceduralTrackId: 'furia-tropical',
    isAvailable: true,
    records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
  },
  {
    id: 'trovao-meia-noite',
    title: 'Trovão da Meia-Noite',
    artist: 'Os Metaleiros',
    duration: 46.0,
    bpm: 148,
    style: '🔥 Heavy Metal Veloz',
    type: 'procedural',
    proceduralTrackId: 'trovao-meia-noite',
    isAvailable: true,
    records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
  },
  {
    id: 'garagem-90',
    title: 'Garagem 90',
    artist: 'Distorção Pura',
    duration: 48.0,
    bpm: 116,
    style: '🎸 Grunge / Alt Rock',
    type: 'procedural',
    proceduralTrackId: 'garagem-90',
    isAvailable: true,
    records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
  },
  {
    id: 'estrada-de-ferro',
    title: 'Estrada de Ferro',
    artist: 'Trem de Ferro',
    duration: 46.0,
    bpm: 126,
    style: '🚂 Blues Rock Boogie',
    type: 'procedural',
    proceduralTrackId: 'estrada-de-ferro',
    isAvailable: true,
    records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
  },
  {
    id: 'sobrecarga',
    title: 'Sobrecarga',
    artist: 'Circuito Quebrado',
    duration: 42.0,
    bpm: 160,
    style: '⚡ Speed Punk Rock',
    type: 'procedural',
    proceduralTrackId: 'sobrecarga',
    isAvailable: true,
    records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
  },
  {
    id: 'tnt-acdc',
    title: 'T.N.T.',
    artist: 'AC/DC',
    duration: 216.0,
    bpm: 126,
    style: '💣 Classic Hard Rock',
    type: 'audio-file',
    requiresFile: 'TNT.mp3',
    isAvailable: false,
    records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
  }
];

export class SongLibrary {
  private songs: SongMetadata[] = [];
  private legacyBackup: SongMetadata[] = LEGACY_PROCEDURAL_SONGS;

  constructor() {
    this.initDefaultSongs();
    this.loadRecordsFromStorage();
  }

  private initDefaultSongs(): void {
    // Official Brazilian Catalog (162 songs)
    const brazilianCatalog = OFFICIAL_BRAZILIAN_CATALOG.map((s) => ({
      ...s,
      records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
    }));

    // Official International Catalog (V13.6 + V13.9.3 T.N.T.)
    const internationalCatalog = INTERNATIONAL_SONGS_CATALOG.map((s) => ({
      ...s,
      records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
    }));

    // Preserves procedural songs as legacy backup so existing regression tests and features remain stable
    // Filter out tnt-acdc from legacy procedural so there is NO duplicate!
    const filteredLegacy = this.legacyBackup.filter((s) => s.id !== 'tnt-acdc').map((s) => ({ ...s }));
    this.songs = [...brazilianCatalog, ...internationalCatalog, ...filteredLegacy];
  }

  /**
   * Returns active songs according to active tab filter:
   * - 'all' (default): 162 Brazilian songs
   * - 'custom' | 'international': 5 International songs
   */
  getActiveSongs(filter = 'all'): SongMetadata[] {
    if (filter === 'custom' || filter === 'international') {
      return this.songs.filter((s) => s.isInternational === true);
    }
    return this.songs.filter((s) => !s.isInternational && (s.type === 'youtube' || s.type === 'audio-file' || s.id.startsWith('custom-')) && s.id !== 'tnt-acdc');
  }

  getBrazilianSongs(): SongMetadata[] {
    return this.getActiveSongs('all');
  }

  getInternationalSongs(): SongMetadata[] {
    return this.getActiveSongs('international');
  }

  /**
   * Returns all songs including legacy procedural backup
   */
  getSongs(): SongMetadata[] {
    return this.songs;
  }

  getSongById(id: string): SongMetadata | undefined {
    return this.songs.find((s) => s.id === id);
  }

  getLegacySongs(): SongMetadata[] {
    return this.legacyBackup;
  }

  /**
   * Links an AudioBuffer to a song entry (e.g. for TNT or custom imports)
   */
  attachAudioBuffer(songId: string, buffer: AudioBuffer, duration?: number): void {
    const song = this.getSongById(songId);
    if (song) {
      song.audioBuffer = buffer;
      if (duration) song.duration = duration;
      song.isAvailable = true;
    }
  }

  /**
   * Adds a newly imported custom song to the library
   */
  addCustomSong(metadata: {
    title: string;
    artist: string;
    duration: number;
    bpm: number;
    buffer: AudioBuffer;
  }): SongMetadata {
    const id = `custom-${Date.now()}`;
    const newSong: SongMetadata = {
      id,
      title: metadata.title,
      artist: metadata.artist || 'Artista Desconhecido',
      duration: metadata.duration,
      bpm: metadata.bpm,
      style: '🎵 MP3 Importado',
      type: 'audio-file',
      audioBuffer: metadata.buffer,
      isAvailable: true,
      records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
    };
    this.songs.push(newSong);
    return newSong;
  }

  /**
   * Save record (score, stars, combo, last/best stats)
   */
  saveSongRecord(songId: string, difficulty: Difficulty, record: SongRecord): void {
    const song = this.getSongById(songId);
    if (!song) return;

    song.records[difficulty] = record;
    try {
      localStorage.setItem(`rb_record_${songId}_${difficulty}`, JSON.stringify(record));
    } catch {
      // Ignore
    }
  }

  private loadRecordsFromStorage(): void {
    const difficulties: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
    this.songs.forEach((song) => {
      difficulties.forEach((diff) => {
        try {
          const item = localStorage.getItem(`rb_record_${song.id}_${diff}`);
          if (item) {
            song.records[diff] = JSON.parse(item);
          }
        } catch {
          // Ignore
        }
      });
    });
  }
}
