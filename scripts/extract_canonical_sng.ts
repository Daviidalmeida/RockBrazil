import fs from 'fs';
import path from 'path';

console.log('=== EXTRAÇÃO DOS ÁUDIOS E CAPAS ORIGINAIS (.SNG) ===');

const SNG_MAP: Record<string, string> = {
  'mam-1406': 'Mamonas Assassinas - 1406 (Naonemeu).sng',
  'cap-sua-maneira': 'Capital Inicial - A Sua Maneira.sng',
  'pit-chip-novo': 'Pitty - Admirável Chip Novo.sng',
  'los-anna-julia': 'Los Hermanos - Anna Júlia.sng',
  'kua-de-borest': 'Kuase Nada - De Borest.sng',
  'mam-debil-metal': 'Mamonas Assassinas - Debil Metal.sng',
  'mam-chopis-centis': 'Mamonas Assassinas - Chopis Centis.sng',
  'df-destruir-tudo': 'Dead Fish - Destruir Tudo De Novo.sng',
  'sup-garota-berlim': 'Supla - Garota De Berlim.sng',
  'cbjr-hoje-acordei': 'Charlie Brown Jr - Hoje Eu Acordei Feliz (Live) (Naonemeu).sng',
  'cpm-irreversivel': 'CPM 22 - Irreversível.sng',
  'mam-jumento-celestino': 'Mamonas Assassinas - Jumento Celestino.sng',
  'lan-lata-velha': 'Landau - Lata Velha.sng',
  'cbjr-nao-e-serio': 'Charlie Brown Jr - Não é Sério (feat. Negra Li).sng',
  'eng-era-um-garoto': 'Engenheiros do Hawaii - Era Um Garoto....sng',
  'cbjr-champagne': 'Charlie Brown Jr - Champagne e Água Benta.sng',
  'pit-equalize': 'Pitty - Equalize.sng',
  'tih-tropa-elite': 'Tihuana - Tropa de Elite.sng',
  'mam-sabao-cra-cra': 'Mamonas Assassinas - Sabão Cracrá.sng',
  'cbjr-so-por-uma-noite': 'Charlie Brown Jr - Só Por Uma Noite.sng',
  'mat-ela-roubou-caminhao': 'Matanza - Ela Roubou Meu Caminhão (Naonemeu).sng',
  'mas-evil-papagali': 'Massacration - Evil Papagali (Naonemeu).sng',
  'det-nao-reclame-mais': 'Detonautas - Não Reclame Mais (Naonemeu).sng',
  'cbjr-papo-reto': 'Charlie Brown Jr - Papo Reto (Prazer é sexo o resto é negócio).sng',
  'mam-mundo-animal': 'Mamonas Assassinas - Mundo Animal (Sygenysis + Nunchuck).sng',
  'mas-metal-is-the-law': 'Massacration - Metal Is The Law (Naonemeu).sng',
  'mas-metal-milkshake': 'Massacration - Metal Milkshake (pH4nToM,Naonemeu).sng',
  'har-dormi-na-praca': 'Hardneja Sertacore - Dormi Na Praça (Naonemeu).sng',
  'pit-mascara': 'Pitty - Máscara (Naonemeu).sng'
};

const SNG_DIR = path.resolve('charts-import/extracted/charts');
const TARGET_DIR = path.resolve('public/songs');

function extractSng(sngPath: string): Record<string, Buffer> {
  const buf = fs.readFileSync(sngPath);
  const xorMask = buf.subarray(10, 26);
  const metaPairCount = Number(buf.readBigUInt64LE(34));
  let pos = 42;
  for (let i = 0; i < metaPairCount; i++) {
    const kLen = buf.readUInt32LE(pos);
    pos += 4;
    pos += kLen;
    const vLen = buf.readUInt32LE(pos);
    pos += 4;
    pos += vLen;
  }
  const fileMetaBytesLen = Number(buf.readBigUInt64LE(pos));
  pos += 8;
  const fileCount = Number(buf.readBigUInt64LE(pos));
  pos += 8;

  const files: Record<string, Buffer> = {};
  for (let i = 0; i < fileCount; i++) {
    const nameLen = buf.readUInt8(pos);
    pos += 1;
    const name = buf.subarray(pos, pos + nameLen).toString('utf8');
    pos += nameLen;
    const fSize = Number(buf.readBigUInt64LE(pos));
    pos += 8;
    const fOff = Number(buf.readBigUInt64LE(pos));
    pos += 8;

    const raw = buf.subarray(fOff, fOff + fSize);
    const unmasked = Buffer.alloc(fSize);
    for (let j = 0; j < fSize; j++) {
      const k = xorMask[j % 16] ^ (j & 0xff);
      unmasked[j] = raw[j] ^ k;
    }
    files[name] = unmasked;
  }
  return files;
}

let extractedCount = 0;
for (const [songId, sngFileName] of Object.entries(SNG_MAP)) {
  const sngPath = path.join(SNG_DIR, sngFileName);
  if (!fs.existsSync(sngPath)) {
    console.error(`ERRO: Arquivo não encontrado: ${sngPath}`);
    continue;
  }

  const outSongDir = path.join(TARGET_DIR, songId);
  if (!fs.existsSync(outSongDir)) {
    fs.mkdirSync(outSongDir, { recursive: true });
  }

  const files = extractSng(sngPath);
  const audioBuf = files['song.opus'] || files['song.ogg'] || files['guitar.opus'] || files['guitar.ogg'];
  const coverBuf = files['album.jpg'] || files['album.png'] || files['album_og.jpg'];

  if (audioBuf) {
    fs.writeFileSync(path.join(outSongDir, 'song.ogg'), audioBuf);
  } else {
    console.warn(`AVISO: Nenhum áudio encontrado em ${sngFileName}`);
  }

  if (coverBuf) {
    fs.writeFileSync(path.join(outSongDir, 'cover.png'), coverBuf);
  }

  extractedCount++;
  console.log(`✓ [${songId}] Extraído de ${sngFileName} -> ${audioBuf ? audioBuf.length + ' bytes' : 'SEM ÁUDIO'}`);
}

console.log(`=== SUCESSO: ${extractedCount} músicas canônicas extraídas para public/songs ===`);
