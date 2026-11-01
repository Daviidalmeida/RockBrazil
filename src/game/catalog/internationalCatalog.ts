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
    "recordingVersion": "Áudio Oficial / Topic (Appetite for Destruction)",
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
    "recordingVersion": "Áudio Oficial / Topic (Appetite for Destruction)",
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
    "recordingVersion": "Áudio Oficial / Topic (Appetite for Destruction)",
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
    "recordingVersion": "Áudio Oficial / Topic (Meteora)",
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
  "intl-lp-given-up": {
    "recordingVersion": "Áudio Oficial / Topic (Minutes to Midnight)",
    "defaultOffsetMs": 0,
    "charter": "heather (Chorus Encore)",
    "year": 2007,
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
    "status": "VÍDEO INDISPONÍVEL",
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
    "duration": 406,
    "bpm": 120,
    "style": "🎸 Internacional • Appetite for Destruction",
    "type": "youtube",
    "youtubeVideoId": "WJUInYShJYo",
    "youtubeUrl": "https://www.youtube.com/watch?v=WJUInYShJYo",
    "youtubeChannel": "Guns N' Roses - Topic",
    "youtubeDuration": "6:46",
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
    "recordingVersion": "Áudio Oficial / Topic (Appetite for Destruction)",
    "charter": "Zantor",
    "year": 1987
  },
  {
    "id": "intl-gnr-sweet-child-o-mine",
    "title": "Sweet Child o' Mine",
    "artist": "Guns N' Roses",
    "duration": 356,
    "bpm": 128,
    "style": "🎸 Internacional • Appetite for Destruction",
    "type": "youtube",
    "youtubeVideoId": "MNrgf3GNNXw",
    "youtubeUrl": "https://www.youtube.com/watch?v=MNrgf3GNNXw",
    "youtubeChannel": "Guns N' Roses - Topic",
    "youtubeDuration": "5:56",
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
    "recordingVersion": "Áudio Oficial / Topic (Appetite for Destruction)",
    "charter": "Comunidade",
    "year": 1987
  },
  {
    "id": "intl-gnr-welcome-to-the-jungle",
    "title": "Welcome to the Jungle",
    "artist": "Guns N' Roses",
    "duration": 273,
    "bpm": 100,
    "style": "🎸 Internacional • Appetite for Destruction",
    "type": "youtube",
    "youtubeVideoId": "FN7ECSHb5xs",
    "youtubeUrl": "https://www.youtube.com/watch?v=FN7ECSHb5xs",
    "youtubeChannel": "Guns N' Roses - Topic",
    "youtubeDuration": "4:33",
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
    "recordingVersion": "Áudio Oficial / Topic (Appetite for Destruction)",
    "charter": "Comunidade",
    "year": 1987
  },
  {
    "id": "intl-lp-numb",
    "title": "Numb",
    "artist": "Linkin Park",
    "duration": 187,
    "bpm": 110,
    "style": "🎸 Internacional • Meteora",
    "type": "youtube",
    "youtubeVideoId": "u-IcadiJCrE",
    "youtubeUrl": "https://www.youtube.com/watch?v=u-IcadiJCrE",
    "youtubeChannel": "Linkin Park - Topic",
    "youtubeDuration": "3:07",
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
    "recordingVersion": "Áudio Oficial / Topic (Meteora)",
    "charter": "Harmonix",
    "year": 2003
  },
  {
    "id": "intl-lp-given-up",
    "title": "Given Up",
    "artist": "Linkin Park",
    "duration": 189,
    "bpm": 100,
    "style": "🎸 Internacional • Minutes to Midnight",
    "type": "youtube",
    "youtubeVideoId": "D93vYwuMeUw",
    "youtubeUrl": "https://www.youtube.com/watch?v=D93vYwuMeUw",
    "youtubeChannel": "Linkin Park - Topic",
    "youtubeDuration": "3:09",
    "matchConfidence": 100,
    "embeddingStatus": "ELIGIBLE_OFFICIAL",
    "reviewStatus": "VERIFIED",
    "licenseStatus": "EMBED_ALLOWED",
    "chartStatus": "CUSTOM",
    "isAvailable": true,
    "coverUrl": "images/intl-covers/intl-lp-given-up.jpg",
    "records": {
      "EASY": null,
      "MEDIUM": null,
      "HARD": null,
      "EXPERT": null
    },
    "isInternational": true,
    "internationalStatus": "PRONTA PARA TESTE",
    "recordingVersion": "Áudio Oficial / Topic (Minutes to Midnight)",
    "charter": "heather (Chorus Encore)",
    "year": 2007
  }
];

export const ARCHIVED_INTERNATIONAL_SONGS: typeof INTERNATIONAL_SONGS_CATALOG = [
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
    "isAvailable": false,
    "coverUrl": "images/intl-covers/intl-acdc-highway-to-hell.jpg",
    "records": {
      "EASY": null,
      "MEDIUM": null,
      "HARD": null,
      "EXPERT": null
    },
    "isInternational": true,
    "internationalStatus": "VÍDEO INDISPONÍVEL",
    "recordingVersion": "Clipe Oficial / Gravação de Estúdio (T.N.T. / High Voltage)",
    "charter": "Rock AI AutoChart Pro",
    "year": 1975
  }
];
