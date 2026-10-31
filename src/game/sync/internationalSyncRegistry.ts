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
    youtubeVideoId: 'Rbm6GXllBiw',
    youtubeChannel: 'GunsNRosesVEVO',
    recordingVersion: 'Clipe Oficial / Appetite for Destruction (1987)',
    chartAuthor: 'Zantor',
    year: 1987,
    chartVideoOffsetMs: 0,
    verified: true,
    syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
    audioReferenceMatch: 'EXACT_MATCH',
    notes: 'Alinhamento em 0ms confirmado com o videoclipe oficial veiculado pelo canal oficial Geffen Records / GunsNRosesVEVO.'
  },
  'intl-gnr-sweet-child-o-mine': {
    songId: 'intl-gnr-sweet-child-o-mine',
    title: "Sweet Child o' Mine",
    artist: "Guns N' Roses",
    youtubeVideoId: '1w7OgIMMRc4',
    youtubeChannel: 'GunsNRosesVEVO',
    recordingVersion: 'Clipe Oficial em HD / Appetite for Destruction (1987)',
    chartAuthor: 'Comunidade',
    year: 1987,
    chartVideoOffsetMs: 0,
    verified: true,
    syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
    audioReferenceMatch: 'EXACT_MATCH',
    notes: 'Riff clássico em Ré com introdução correspondente ao clipe oficial de estúdio em 0ms.'
  },
  'intl-gnr-welcome-to-the-jungle': {
    songId: 'intl-gnr-welcome-to-the-jungle',
    title: 'Welcome to the Jungle',
    artist: "Guns N' Roses",
    youtubeVideoId: 'o1tj2zJ2Wvg',
    youtubeChannel: 'GunsNRosesVEVO',
    recordingVersion: 'Clipe Oficial / Appetite for Destruction (1987)',
    chartAuthor: 'Comunidade',
    year: 1987,
    chartVideoOffsetMs: 0,
    verified: true,
    syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
    audioReferenceMatch: 'EXACT_MATCH',
    notes: 'Clipe oficial com abertura narrativa de Axl Rose; introdução alinhada com delay inicial em 0ms.'
  },
  'intl-lp-numb': {
    songId: 'intl-lp-numb',
    title: 'Numb',
    artist: 'Linkin Park',
    youtubeVideoId: 'kXYiU_JCYtU',
    youtubeChannel: 'Linkin Park',
    recordingVersion: 'Clipe Oficial 4K Upgrade / Meteora (2003)',
    chartAuthor: 'Harmonix',
    year: 2003,
    chartVideoOffsetMs: 0,
    verified: true,
    syncMethod: 'STUDIO_TIMESTAMP_ALIGNED',
    audioReferenceMatch: 'EXACT_MATCH',
    notes: 'Chart oficial Harmonix Rock Band mapeado com fidelidade ao clipe oficial 4K em 0ms.'
  }
};

// Aliases for short song IDs
INTERNATIONAL_SYNC_REGISTRY['acdc-highway-to-hell'] = INTERNATIONAL_SYNC_REGISTRY['intl-acdc-highway-to-hell'];
INTERNATIONAL_SYNC_REGISTRY['gnr-paradise-city'] = INTERNATIONAL_SYNC_REGISTRY['intl-gnr-paradise-city'];
INTERNATIONAL_SYNC_REGISTRY['gnr-sweet-child-o-mine'] = INTERNATIONAL_SYNC_REGISTRY['intl-gnr-sweet-child-o-mine'];
INTERNATIONAL_SYNC_REGISTRY['gnr-welcome-to-the-jungle'] = INTERNATIONAL_SYNC_REGISTRY['intl-gnr-welcome-to-the-jungle'];
INTERNATIONAL_SYNC_REGISTRY['linkin-park-numb'] = INTERNATIONAL_SYNC_REGISTRY['intl-lp-numb'];
INTERNATIONAL_SYNC_REGISTRY['intl-linkin-park-numb'] = INTERNATIONAL_SYNC_REGISTRY['intl-lp-numb'];

/**
 * Helper to retrieve official verified offset for any international song.
 */
export function getInternationalDefaultOffsetMs(songId: string): number {
  return INTERNATIONAL_SYNC_REGISTRY[songId]?.chartVideoOffsetMs ?? 0;
}
