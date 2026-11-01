/**
 * ROCKBRAZIL V13.8.4 — INTERNATIONAL SYNC REGISTRY
 * Centralized, verifiable registry for international charts and YouTube synchronization.
 */

export interface InternationalSyncEntry {
  songId: string;
  title: string;
  artist: string;
  youtubeVideoId: string;
  youtubeChannel: string;
  recordingVersion: string;
  chartAuthor: string;
  year: number;
  chartVideoOffsetMs: number;
  verified: boolean;
  syncMethod: 'OFFICIAL_VIDEO_ALIGNMENT' | 'STUDIO_TIMESTAMP_ALIGNED' | 'PENDING_ACOUSTIC_CONFIRMATION';
  audioReferenceMatch: 'EXACT_MATCH' | 'LIVE_RECORDING_ALIGNED' | 'SLIGHT_TEMPO_DRIFT_POSSIBLE';
  notes: string;
}

export const INTERNATIONAL_SYNC_REGISTRY: Record<string, InternationalSyncEntry> = {
  'intl-acdc-highway-to-hell': {
    songId: 'intl-acdc-highway-to-hell',
    title: 'Highway to Hell (Live at River Plate)',
    artist: 'AC/DC',
    youtubeVideoId: 'gEPmA3USJdI',
    youtubeChannel: 'acdcVEVO',
    recordingVersion: 'Ao Vivo no River Plate (Buenos Aires, Dez/2009)',
    chartAuthor: 'metalli3212',
    year: 2009,
    chartVideoOffsetMs: -2000,
    verified: true,
    syncMethod: 'OFFICIAL_VIDEO_ALIGNMENT',
    audioReferenceMatch: 'LIVE_RECORDING_ALIGNED',
    notes: 'Offset oficial de -2000ms derivado do song.ini original da comunidade para compensar o rugido de abertura da plateia argentina antes dos acordes de Angus Young.'
  },
  'intl-gnr-paradise-city': {
    songId: 'intl-gnr-paradise-city',
    title: 'Paradise City',
    artist: "Guns N' Roses",
    youtubeVideoId: 'WJUInYShJYo',
    youtubeChannel: "Guns N' Roses - Topic",
    recordingVersion: 'Áudio Oficial / Topic (Appetite for Destruction, 1987)',
    chartAuthor: 'Zantor',
    year: 1987,
    chartVideoOffsetMs: 0,
    verified: true,
    syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
    audioReferenceMatch: 'EXACT_MATCH',
    notes: 'Áudio oficial do canal Topic / YouTube Music (Universal Music Group). Alinhamento de estúdio em 0ms.'
  },
  'intl-gnr-sweet-child-o-mine': {
    songId: 'intl-gnr-sweet-child-o-mine',
    title: "Sweet Child o' Mine",
    artist: "Guns N' Roses",
    youtubeVideoId: 'MNrgf3GNNXw',
    youtubeChannel: "Guns N' Roses - Topic",
    recordingVersion: 'Áudio Oficial / Topic (Appetite for Destruction, 1987)',
    chartAuthor: 'Comunidade',
    year: 1987,
    chartVideoOffsetMs: 0,
    verified: true,
    syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
    audioReferenceMatch: 'EXACT_MATCH',
    notes: 'Áudio oficial do canal Topic / YouTube Music (Universal Music Group). Riff clássico em Ré com introdução em 0ms.'
  },
  'intl-gnr-welcome-to-the-jungle': {
    songId: 'intl-gnr-welcome-to-the-jungle',
    title: 'Welcome to the Jungle',
    artist: "Guns N' Roses",
    youtubeVideoId: 'FN7ECSHb5xs',
    youtubeChannel: "Guns N' Roses - Topic",
    recordingVersion: 'Áudio Oficial / Topic (Appetite for Destruction, 1987)',
    chartAuthor: 'Comunidade',
    year: 1987,
    chartVideoOffsetMs: 0,
    verified: true,
    syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
    audioReferenceMatch: 'EXACT_MATCH',
    notes: 'Áudio oficial Topic / YouTube Music (sem narrativa do ônibus). Riff de delay entra no tempo 0.0s e 1º acorde acentuado aos 3.269s, coincidindo com a 1ª nota do chart em 0ms.'
  },
  'intl-lp-numb': {
    songId: 'intl-lp-numb',
    title: 'Numb',
    artist: 'Linkin Park',
    youtubeVideoId: 'u-IcadiJCrE',
    youtubeChannel: 'Linkin Park - Topic',
    recordingVersion: 'Áudio Oficial / Topic (Meteora, 2003)',
    chartAuthor: 'Harmonix',
    year: 2003,
    chartVideoOffsetMs: 0,
    verified: true,
    syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
    audioReferenceMatch: 'EXACT_MATCH',
    notes: 'Áudio oficial Topic / YouTube Music (Warner Records). Chart oficial Harmonix Rock Band alinhado em 0ms.'
  },
  'intl-lp-given-up': {
    songId: 'intl-lp-given-up',
    title: 'Given Up',
    artist: 'Linkin Park',
    youtubeVideoId: 'D93vYwuMeUw',
    youtubeChannel: 'Linkin Park - Topic',
    recordingVersion: 'Áudio Oficial / Topic (Minutes to Midnight, 2007)',
    chartAuthor: 'heather (Chorus Encore)',
    year: 2007,
    chartVideoOffsetMs: 0,
    verified: true,
    syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
    audioReferenceMatch: 'EXACT_MATCH',
    notes: 'Áudio oficial Topic / YouTube Music (Warner Records). Chart autêntico importado do Chorus Encore por heather (200.1 BPM). 0-1.7s chaves, 1.7-4.8s palmas, 4.827s primeiro acorde de guitarra com 0ms de offset.'
  }
};

// Aliases for short song IDs
INTERNATIONAL_SYNC_REGISTRY['acdc-highway-to-hell'] = INTERNATIONAL_SYNC_REGISTRY['intl-acdc-highway-to-hell'];
INTERNATIONAL_SYNC_REGISTRY['gnr-paradise-city'] = INTERNATIONAL_SYNC_REGISTRY['intl-gnr-paradise-city'];
INTERNATIONAL_SYNC_REGISTRY['gnr-sweet-child-o-mine'] = INTERNATIONAL_SYNC_REGISTRY['intl-gnr-sweet-child-o-mine'];
INTERNATIONAL_SYNC_REGISTRY['gnr-welcome-to-the-jungle'] = INTERNATIONAL_SYNC_REGISTRY['intl-gnr-welcome-to-the-jungle'];
INTERNATIONAL_SYNC_REGISTRY['linkin-park-numb'] = INTERNATIONAL_SYNC_REGISTRY['intl-lp-numb'];
INTERNATIONAL_SYNC_REGISTRY['intl-linkin-park-numb'] = INTERNATIONAL_SYNC_REGISTRY['intl-lp-numb'];
INTERNATIONAL_SYNC_REGISTRY['lp-given-up'] = INTERNATIONAL_SYNC_REGISTRY['intl-lp-given-up'];
INTERNATIONAL_SYNC_REGISTRY['intl-linkin-park-given-up'] = INTERNATIONAL_SYNC_REGISTRY['intl-lp-given-up'];
INTERNATIONAL_SYNC_REGISTRY['linkin-park-given-up'] = INTERNATIONAL_SYNC_REGISTRY['intl-lp-given-up'];

/**
 * Helper to retrieve official verified offset for any international song.
 */
export function getInternationalDefaultOffsetMs(songId: string): number {
  return INTERNATIONAL_SYNC_REGISTRY[songId]?.chartVideoOffsetMs ?? 0;
}
