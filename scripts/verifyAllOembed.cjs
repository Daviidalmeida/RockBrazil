const https = require('https');

const catalog = [
  // Group 1
  { id: 'mam-1406', artist: 'Mamonas Assassinas', title: '1406', group: 1, encore: false, bpm: 138, yt: 'hxYVQK5NB2o', duration: 248 },
  { id: 'cap-sua-maneira', artist: 'Capital Inicial', title: 'À Sua Maneira', group: 1, encore: false, bpm: 130, yt: 'nXLyy2ALJE4', duration: 258 },
  { id: 'pit-chip-novo', artist: 'Pitty', title: 'Admirável Chip Novo', group: 1, encore: false, bpm: 140, yt: 'aXJ_Ub1xbhw', duration: 191 },
  { id: 'los-anna-julia', artist: 'Los Hermanos', title: 'Anna Júlia', group: 1, encore: false, bpm: 132, yt: 'umMIcZODm2k', duration: 213 },
  { id: 'mam-bois-dont-cry', artist: 'Mamonas Assassinas', title: "Bois Don't Cry", group: 1, encore: true, bpm: 145, yt: 'AOXQhBtpCqQ', duration: 182 },

  // Group 2
  { id: 'mam-cabeca-bagre', artist: 'Mamonas Assassinas', title: 'Cabeça de Bagre', group: 2, encore: false, bpm: 142, yt: 'BX2nvZ6aMkk', duration: 141 },
  { id: 'kua-de-borest', artist: 'Kuase Nada', title: 'De Borest', group: 2, encore: false, bpm: 128, yt: 'CveouQkdSCs', duration: 195 },
  { id: 'mam-debil-metal', artist: 'Mamonas Assassinas', title: 'Débil Metal', group: 2, encore: false, bpm: 180, yt: 'Nu-FRq1ade8', duration: 185 },
  { id: 'pit-deja-vu', artist: 'Pitty', title: 'Déjà Vu', group: 2, encore: false, bpm: 136, yt: 'His5BZcgxj8', duration: 250 },
  { id: 'mam-chopis-centis', artist: 'Mamonas Assassinas', title: 'Chopis Centis', group: 2, encore: true, bpm: 132, yt: '4HvrAmfsPng', duration: 167 },

  // Group 3
  { id: 'df-destruir-tudo', artist: 'Dead Fish', title: 'Destruir Tudo de Novo', group: 3, encore: false, bpm: 185, yt: 'wyHPHbS2F88', duration: 190 },
  { id: 'sup-garota-berlim', artist: 'Supla', title: 'Garota de Berlim', group: 3, encore: false, bpm: 144, yt: 'RcYqLBsm4Pc', duration: 215 },
  { id: 'cbjr-hoje-acordei', artist: 'Charlie Brown Jr.', title: 'Hoje Eu Acordei Feliz', group: 3, encore: false, bpm: 125, yt: 'NqDhSxzua3w', duration: 139 },
  { id: 'cpm-irreversivel', artist: 'CPM 22', title: 'Irreversível', group: 3, encore: false, bpm: 150, yt: 'VtfW-Kb15sI', duration: 195 },
  { id: 'mam-jumento-celestino', artist: 'Mamonas Assassinas', title: 'Jumento Celestino', group: 3, encore: true, bpm: 130, yt: 'cIrROoxD6Iw', duration: 158 },

  // Group 4
  { id: 'lan-lata-velha', artist: 'Landau', title: 'Lata Velha', group: 4, encore: false, bpm: 120, yt: 'fH1HdNHnf_s', duration: 184 },
  { id: 'cbjr-longe-de-voce', artist: 'Charlie Brown Jr.', title: 'Longe de Você', group: 4, encore: false, bpm: 95, yt: 'PeloX9xnOlQ', duration: 202 },
  { id: 'cbjr-nao-e-serio', artist: 'Charlie Brown Jr.', title: 'Não É Sério', group: 4, encore: false, bpm: 100, yt: 'B_B8br4eNC0', duration: 290 },
  { id: 'eng-era-um-garoto', artist: 'Engenheiros do Hawaii', title: 'Era Um Garoto Que Como Eu Amava os Beatles e os Rolling Stones', group: 4, encore: false, bpm: 124, yt: 'tFsou8Szb3M', duration: 265 },
  { id: 'mam-la-vem-alemao', artist: 'Mamonas Assassinas', title: 'Lá Vem o Alemão', group: 4, encore: true, bpm: 136, yt: 'oNrWWBHibY4', duration: 203 },

  // Group 5
  { id: 'gab-ate-quando', artist: 'Gabriel o Pensador', title: 'Até Quando?', group: 5, encore: false, bpm: 96, yt: 'FdXQ0fFMJkw', duration: 264 },
  { id: 'cbjr-champagne', artist: 'Charlie Brown Jr.', title: 'Champagne e Água Benta', group: 5, encore: false, bpm: 104, yt: 'REjiAWwASFs', duration: 211 },
  { id: 'pit-equalize', artist: 'Pitty', title: 'Equalize', group: 5, encore: false, bpm: 116, yt: '2GKR4N8xZr0', duration: 232 },
  { id: 'vel-dizia-raul', artist: 'Velhas Virgens', title: 'Já Dizia o Raul', group: 5, encore: false, bpm: 130, yt: 'geHGE5gou0E', duration: 185 },
  { id: 'mam-arlinda-mulher', artist: 'Mamonas Assassinas', title: 'Uma Arlinda Mulher', group: 5, encore: true, bpm: 120, yt: 'GB_HAfaDNfE', duration: 199 },

  // Group 6
  { id: 'mam-vira-vira', artist: 'Mamonas Assassinas', title: 'Vira-Vira', group: 6, encore: false, bpm: 146, yt: '1WjI3DLOk4c', duration: 143 },
  { id: 'tih-tropa-elite', artist: 'Tihuana', title: 'Tropa de Elite', group: 6, encore: false, bpm: 120, yt: 'fEAbR5sLwWE', duration: 192 },
  { id: 'mam-sabao-cra-cra', artist: 'Mamonas Assassinas', title: 'Sabão Crá-Crá', group: 6, encore: false, bpm: 140, yt: 'RAuzMwWVryg', duration: 100 },
  { id: 'cbjr-so-por-uma-noite', artist: 'Charlie Brown Jr.', title: 'Só por uma Noite', group: 6, encore: false, bpm: 110, yt: 'oXBWG4owmvE', duration: 203 },
  { id: 'mam-sabado-de-sol', artist: 'Mamonas Assassinas', title: 'Sábado de Sol', group: 6, encore: true, bpm: 160, yt: 'xc3mvxLdcYI', duration: 62 },

  // Group 7
  { id: 'mat-ela-roubou-caminhao', artist: 'Matanza', title: 'Ela Roubou Meu Caminhão', group: 7, encore: false, bpm: 154, yt: '8BJtgM0jDWM', duration: 215 },
  { id: 'mas-evil-papagali', artist: 'Massacration', title: 'Evil Papagali', group: 7, encore: false, bpm: 160, yt: 'nYc09Xqy3hE', duration: 290 },
  { id: 'det-nao-reclame-mais', artist: 'Detonautas', title: 'Não Reclame Mais', group: 7, encore: false, bpm: 138, yt: 'mvA1-Xfv6KU', duration: 228 },
  { id: 'cbjr-papo-reto', artist: 'Charlie Brown Jr.', title: 'Papo Reto', group: 7, encore: false, bpm: 112, yt: 'HM5AQ07Fl0Y', duration: 210 },
  { id: 'mam-mundo-animal', artist: 'Mamonas Assassinas', title: 'Mundo Animal', group: 7, encore: true, bpm: 130, yt: 'C-JAifv0Ny8', duration: 236 },

  // Group 8
  { id: 'mas-metal-is-the-law', artist: 'Massacration', title: 'Metal Is The Law', group: 8, encore: false, bpm: 140, yt: 'MXeYufgZR3k', duration: 225 },
  { id: 'mas-metal-milkshake', artist: 'Massacration', title: 'Metal Milkshake', group: 8, encore: false, bpm: 150, yt: 'TMgMVrnOYEw', duration: 180 },
  { id: 'cue-quem-matou-bozo', artist: 'Cueio Limão', title: 'Quem Matou o Bozo', group: 8, encore: false, bpm: 175, yt: 'WQEV3y_NalY', duration: 135 },
  { id: 'har-dormi-na-praca', artist: 'Hardneja Sertacore', title: 'Dormi na Praça', group: 8, encore: false, bpm: 160, yt: 'AnWc2xwU78g', duration: 160 },

  // Bonus Songs
  { id: 'pit-mascara', artist: 'Pitty', title: 'Máscara', group: 'bonus', encore: false, bpm: 128, yt: 'ehREM38xTBw', duration: 290 },
  { id: 'cue-minha-juventude', artist: 'Cueio Limão', title: 'Minha Juventude', group: 'bonus', encore: false, bpm: 170, yt: 't68NfD5wSHM', duration: 145 },
  { id: 'pit-na-sua-estante', artist: 'Pitty', title: 'Na Sua Estante', group: 'bonus', encore: false, bpm: 120, yt: 'DP3j6hgS4VY', duration: 234 },
  { id: 'str-paraiso-proibido', artist: 'Strike', title: 'Paraíso Proibido', group: 'bonus', encore: false, bpm: 152, yt: 'JitGoK4d91A', duration: 200 }
];

function checkOembed(item) {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${item.yt}&format=json`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            resolve({ ok: true, title: json.title, author: json.author_name });
          } catch {
            resolve({ ok: false, error: 'JSON parse error' });
          }
        } else {
          resolve({ ok: false, status: res.statusCode });
        }
      });
    }).on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

async function verifyAll() {
  console.log(`Verifying oEmbed for ${catalog.length} items...`);
  let validCount = 0;
  for (let i = 0; i < catalog.length; i++) {
    const item = catalog[i];
    const res = await checkOembed(item);
    if (res.ok) {
      validCount++;
      console.log(`✅ [${i+1}/${catalog.length}] ${item.artist} - ${item.title}: "${res.title}" (${res.author})`);
    } else {
      console.warn(`❌ [${i+1}/${catalog.length}] ${item.artist} - ${item.title} (yt: ${item.yt}): status ${res.status || res.error}`);
    }
    await new Promise(r => setTimeout(r, 80));
  }
  console.log(`\n🎉 Final Result: ${validCount}/${catalog.length} validated OK with YouTube oEmbed!`);
}

verifyAll();
