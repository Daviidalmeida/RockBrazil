import * as fs from 'fs';

const catCode = fs.readFileSync('src/game/catalog/catalogData.ts', 'utf8');
const eq = catCode.indexOf('=');
const catStart = catCode.indexOf('[', eq);
const catEnd = catCode.lastIndexOf(']');
const cleanJson = catCode.substring(catStart, catEnd + 1);
const catalog = JSON.parse(cleanJson);



const regCode = fs.readFileSync('src/game/catalog/realChartsRegistry.ts', 'utf8');
const jsonStart = regCode.indexOf('{"cap-sua-maneira"');
const jsonEnd = regCode.lastIndexOf(';\n\nexport function unpackChart');
const jsonStr = regCode.substring(jsonStart, jsonEnd).trim();
const rawCharts = JSON.parse(jsonStr);

console.log('AUDITORIA COMPLETA DOS 31 ITENS DO CATÁLOGO:');
const rows = [];

for (const song of catalog) {
  const chartData = rawCharts[song.id];
  if (!chartData) {
    rows.push({
      id: song.id,
      title: song.title,
      bpm: song.bpm,
      video: song.youtubeVideoId,
      status: 'PROCEDURAL_OR_SMART'
    });
    continue;
  }

  const easy = chartData.EASY || [];
  const med = chartData.MEDIUM || [];
  const hard = chartData.HARD || [];
  const exp = chartData.EXPERT || [];

  rows.push({
    id: song.id,
    title: song.title,
    bpm: song.bpm,
    video: song.youtubeVideoId,
    easyCount: easy.length,
    medCount: med.length,
    hardCount: hard.length,
    expCount: exp.length,
    firstNoteSec: (exp[0] ? exp[0][0] : med[0] ? med[0][0] : -1),
    lastNoteSec: (exp[exp.length - 1] ? exp[exp.length - 1][0] : -1)
  });
}

console.table(rows);

