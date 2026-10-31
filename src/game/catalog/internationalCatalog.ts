import { SongMetadata } from '../../types';

export interface InternationalSongConfig {
  recordingVersion: string;
  defaultOffsetMs: number;
  charter: string;
  year: number;
  status: 'PRONTA PARA TESTE' | 'CHART EM PREPARAÇÃO' | 'VÍDEO NÃO CONFIGURADO' | 'VÍDEO INDISPONÍVEL';
  availableDifficulties: ('EASY' | 'MEDIUM' | 'HARD' | 'EXPERT')[];
}

export const INTERNATIONAL_METADATA_CONFIG: Record<string, InternationalSongConfig> = {
  "intl-acdc-highway-to-hell": {
    "recordingVersion": "Ao Vivo no River Plate (Buenos Aires, Dez/2009)",
    "defaultOffsetMs": -2000,
    "charter": "metalli3212",
    "year": 2009,
    "status": "PRONTA PARA TESTE",
    "availableDifficulties": [
      "EASY",
      "MEDIUM",
      "HARD",
      "EXPERT"
    ]
  },
  "intl-gnr-paradise-city": {
    "recordingVersion": "Clipe Oficial / Gravação de Estúdio (Appetite for Destruction)",
    "defaultOffsetMs": 0,
    "charter": "Zantor",
    "year": 1987,
    "status": "PRONTA PARA TESTE",
    "availableDifficulties": [
      "EASY",
      "MEDIUM",
      "HARD",
      "EXPERT"
    ]
  },
  "intl-gnr-sweet-child-o-mine": {
    "recordingVersion": "Clipe Oficial em HD (Appetite for Destruction)",
    "defaultOffsetMs": 0,
    "charter": "Comunidade",
    "year": 1987,
    "status": "PRONTA PARA TESTE",
    "availableDifficulties": [
      "EASY",
      "MEDIUM",
      "HARD",
      "EXPERT"
    ]
  },
  "intl-gnr-welcome-to-the-jungle": {
    "recordingVersion": "Clipe Oficial (Appetite for Destruction)",
    "defaultOffsetMs": 0,
    "charter": "Comunidade",
    "year": 1987,
    "status": "PRONTA PARA TESTE",
    "availableDifficulties": [
      "EASY",
      "MEDIUM",
      "HARD",
      "EXPERT"
    ]
  },
  "intl-lp-numb": {
    "recordingVersion": "Clipe Oficial 4K Upgrade (Meteora)",
    "defaultOffsetMs": 0,
    "charter": "Harmonix",
    "year": 2003,
    "status": "PRONTA PARA TESTE",
    "availableDifficulties": [
      "EASY",
      "MEDIUM",
      "HARD",
      "EXPERT"
    ]
  },
  "tnt-acdc": {
    "recordingVersion": "Clipe Oficial / Gravação de Estúdio (T.N.T. / High Voltage)",
    "defaultOffsetMs": 0,
    "charter": "Rock AI AutoChart Pro",
    "year": 1975,
    "status": "PRONTA PARA TESTE",
    "availableDifficulties": [
      "EASY",
      "MEDIUM",
      "HARD",
      "EXPERT"
    ]
  }
};

export const INTERNATIONAL_SONGS_CATALOG: (SongMetadata & {
  isInternational: true;
  internationalStatus: 'PRONTA PARA TESTE' | 'CHART EM PREPARAÇÃO' | 'VÍDEO NÃO CONFIGURADO' | 'VÍDEO INDISPONÍVEL';
  recordingVersion: string;
  charter: string;
  year: number;
})[] = [
  {
    "id": "intl-acdc-highway-to-hell",
    "title": "Highway to Hell (Live at River Plate)",
    "artist": "AC/DC",
    "duration": 282,
    "bpm": 120,
    "style": "🎸 Internacional • Live at River Plate",
    "type": "youtube",
    "youtubeVideoId": "gEPmA3USJdI",
    "youtubeUrl": "https://www.youtube.com/watch?v=gEPmA3USJdI",
    "youtubeChannel": "acdcVEVO",
    "youtubeDuration": "4:42",
    "matchConfidence": 100,
    "embeddingStatus": "ELIGIBLE_OFFICIAL",
    "reviewStatus": "VERIFIED",
    "licenseStatus": "EMBED_ALLOWED",
    "chartStatus": "CUSTOM",
    "isAvailable": true,
    "coverUrl": "images/intl-covers/intl-acdc-highway-to-hell.jpg",
    "records": {
      "EASY": null,
      "MEDIUM": null,
      "HARD": null,
      "EXPERT": null
    },
    "isInternational": true,
    "internationalStatus": "PRONTA PARA TESTE",
    "recordingVersion": "Ao Vivo no River Plate (Buenos Aires, Dez/2009)",
    "charter": "metalli3212",
    "year": 2009
  },
  {
    "id": "intl-gnr-paradise-city",
    "title": "Paradise City",
    "artist": "Guns N' Roses",
    "duration": 405,
    "bpm": 120,
    "style": "🎸 Internacional • Appetite for Destruction",
    "type": "youtube",
    "youtubeVideoId": "Rbm6GXllBiw",
    "youtubeUrl": "https://www.youtube.com/watch?v=Rbm6GXllBiw",
    "youtubeChannel": "GunsNRosesVEVO",
    "youtubeDuration": "6:45",
    "matchConfidence": 100,
    "embeddingStatus": "ELIGIBLE_OFFICIAL",
    "reviewStatus": "VERIFIED",
    "licenseStatus": "EMBED_ALLOWED",
    "chartStatus": "CUSTOM",
    "isAvailable": true,
    "coverUrl": "images/intl-covers/intl-gnr-paradise-city.jpg",
    "records": {
      "EASY": null,
      "MEDIUM": null,
      "HARD": null,
      "EXPERT": null
    },
    "isInternational": true,
    "internationalStatus": "PRONTA PARA TESTE",
    "recordingVersion": "Clipe Oficial / Gravação de Estúdio (Appetite for Destruction)",
    "charter": "Zantor",
    "year": 1987
  },
  {
    "id": "intl-gnr-sweet-child-o-mine",
    "title": "Sweet Child o' Mine",
    "artist": "Guns N' Roses",
    "duration": 355,
    "bpm": 128,
    "style": "🎸 Internacional • Appetite for Destruction",
    "type": "youtube",
    "youtubeVideoId": "1w7OgIMMRc4",
    "youtubeUrl": "https://www.youtube.com/watch?v=1w7OgIMMRc4",
    "youtubeChannel": "GunsNRosesVEVO",
    "youtubeDuration": "5:55",
    "matchConfidence": 100,
    "embeddingStatus": "ELIGIBLE_OFFICIAL",
    "reviewStatus": "VERIFIED",
    "licenseStatus": "EMBED_ALLOWED",
    "chartStatus": "CUSTOM",
    "isAvailable": true,
    "coverUrl": "images/intl-covers/intl-gnr-sweet-child-o-mine.jpg",
    "records": {
      "EASY": null,
      "MEDIUM": null,
      "HARD": null,
      "EXPERT": null
    },
    "isInternational": true,
    "internationalStatus": "PRONTA PARA TESTE",
    "recordingVersion": "Clipe Oficial em HD (Appetite for Destruction)",
    "charter": "Comunidade",
    "year": 1987
  },
  {
    "id": "intl-gnr-welcome-to-the-jungle",
    "title": "Welcome to the Jungle",
    "artist": "Guns N' Roses",
    "duration": 271,
    "bpm": 100,
    "style": "🎸 Internacional • Appetite for Destruction",
    "type": "youtube",
    "youtubeVideoId": "o1tj2zJ2Wvg",
    "youtubeUrl": "https://www.youtube.com/watch?v=o1tj2zJ2Wvg",
    "youtubeChannel": "GunsNRosesVEVO",
    "youtubeDuration": "4:31",
    "matchConfidence": 100,
    "embeddingStatus": "ELIGIBLE_OFFICIAL",
    "reviewStatus": "VERIFIED",
    "licenseStatus": "EMBED_ALLOWED",
    "chartStatus": "CUSTOM",
    "isAvailable": true,
    "coverUrl": "images/intl-covers/intl-gnr-welcome-to-the-jungle.jpg",
    "records": {
      "EASY": null,
      "MEDIUM": null,
      "HARD": null,
      "EXPERT": null
    },
    "isInternational": true,
    "internationalStatus": "PRONTA PARA TESTE",
    "recordingVersion": "Clipe Oficial (Appetite for Destruction)",
    "charter": "Comunidade",
    "year": 1987
  },
  {
    "id": "intl-lp-numb",
    "title": "Numb",
    "artist": "Linkin Park",
    "duration": 177,
    "bpm": 110,
    "style": "🎸 Internacional • Meteora",
    "type": "youtube",
    "youtubeVideoId": "kXYiU_JCYtU",
    "youtubeUrl": "https://www.youtube.com/watch?v=kXYiU_JCYtU",
    "youtubeChannel": "Linkin Park",
    "youtubeDuration": "2:57",
    "matchConfidence": 100,
    "embeddingStatus": "ELIGIBLE_OFFICIAL",
    "reviewStatus": "VERIFIED",
    "licenseStatus": "EMBED_ALLOWED",
    "chartStatus": "CUSTOM",
    "isAvailable": true,
    "coverUrl": "images/intl-covers/intl-lp-numb.jpg",
    "records": {
      "EASY": null,
      "MEDIUM": null,
      "HARD": null,
      "EXPERT": null
    },
    "isInternational": true,
    "internationalStatus": "PRONTA PARA TESTE",
    "recordingVersion": "Clipe Oficial 4K Upgrade (Meteora)",
    "charter": "Harmonix",
    "year": 2003
  },
  {
    "id": "tnt-acdc",
    "title": "T.N.T.",
    "artist": "AC/DC",
    "duration": 229,
    "bpm": 130,
    "style": "🎸 Internacional • Classic Hard Rock",
    "type": "youtube",
    "youtubeVideoId": "fGDQ9IukMOc",
    "youtubeUrl": "https://www.youtube.com/watch?v=fGDQ9IukMOc",
    "youtubeChannel": "AC/DC",
    "youtubeDuration": "3:50",
    "matchConfidence": 100,
    "embeddingStatus": "ELIGIBLE_OFFICIAL",
    "reviewStatus": "VERIFIED",
    "licenseStatus": "EMBED_ALLOWED",
    "chartStatus": "CUSTOM",
    "isAvailable": true,
    "coverUrl": "images/intl-covers/intl-acdc-highway-to-hell.jpg",
    "records": {
      "EASY": null,
      "MEDIUM": null,
      "HARD": null,
      "EXPERT": null
    },
    "isInternational": true,
    "internationalStatus": "PRONTA PARA TESTE",
    "recordingVersion": "Clipe Oficial / Gravação de Estúdio (T.N.T. / High Voltage)",
    "charter": "Rock AI AutoChart Pro",
    "year": 1975
  }
];
