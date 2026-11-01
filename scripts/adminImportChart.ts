/**
 * ROCKBRAZIL — FERRAMENTA ADMINISTRATIVA DE BUSCA, IMPORTAÇÃO E VALIDAÇÃO DE CHARTS
 * 
 * Uso:
 *   npx tsx scripts/adminImportChart.ts search "Linkin Park Given Up"
 *   npx tsx scripts/adminImportChart.ts import <caminho-ou-url> [songId]
 */

import fs from 'fs';
import path from 'path';
import { ChorusEncoreProvider } from '../src/game/rockchart/providers/enchorProvider';
import { UniversalChartImporter } from '../src/audio/universalChartImporter';
import { RockChartImporter } from '../src/game/rockchart/importer/rockChartImporter';
import { RockChartValidator } from '../src/game/rockchart/validator/rockChartValidator';
import { SngPackageParser } from '../src/game/rockchart/importer/sngPackageParser';
import { Difficulty, Note } from '../src/types';

async function handleSearch(term: string) {
  console.log(`\n================ BUSCA NO CHORUS ENCORE ================`);
  console.log(`Termo pesquisado: "${term}"\n`);

  const provider = new ChorusEncoreProvider();
  const results = await provider.search({ artist: '', title: term }, 10);

  if (results.length === 0) {
    console.log('Nenhum chart encontrado para a busca.');
    return;
  }

  console.log(`Encontrados ${results.length} charts:\n`);
  results.forEach((r, idx) => {
    console.log(`${idx + 1}. [${r.id}] "${r.title}" - ${r.artist}`);
    console.log(`   Charter: ${r.charter} | Ano: ${r.year || 'N/A'} | Duração: ${r.durationSec}s | Formato: ${r.format}`);
    console.log(`   Dificuldades: ${r.difficulties.join(', ')} | BPM: ${r.bpm}`);
    console.log(`   Página: ${r.sourceUrl}`);
    if (r.directDownloadUrl) {
      console.log(`   Download direto (.sng): ${r.directDownloadUrl}`);
    }
    console.log('');
  });
}

async function handleImport(inputPathOrUrl: string, targetSongId?: string) {
  console.log(`\n================ IMPORTADOR ADMINISTRATIVO ROCKBRAZIL ================`);
  console.log(`Fonte: ${inputPathOrUrl}`);

  let buffer: Buffer;
  let filename: string;

  if (inputPathOrUrl.startsWith('http://') || inputPathOrUrl.startsWith('https://')) {
    console.log('Baixando chart da URL informada...');
    const res = await fetch(inputPathOrUrl, {
      headers: {
        'User-Agent': 'RockBrazil-Admin/14.2'
      }
    });
    if (!res.ok) throw new Error(`Falha no download: HTTP ${res.status} ${res.statusText}`);
    const ab = await res.arrayBuffer();
    buffer = Buffer.from(ab);
    const parsedUrl = new URL(inputPathOrUrl);
    filename = path.basename(parsedUrl.pathname) || 'chart.sng';
  } else {
    console.log('Lendo arquivo do disco local...');
    const resolved = path.resolve(process.cwd(), inputPathOrUrl);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Arquivo não encontrado: ${resolved}`);
    }
    buffer = fs.readFileSync(resolved);
    filename = path.basename(resolved);
  }

  console.log(`Tamanho do arquivo: ${buffer.length} bytes`);
  console.log(`Formato detectado: ${SngPackageParser.isSng(buffer) ? 'SNGPKG (.sng)' : filename}`);

  const importResult = await RockChartImporter.importChartFile(buffer, filename, 'CHORUS_ENCORE');

  console.log('\n--- METADADOS EXTRAÍDOS ---');
  console.log(`Título: "${importResult.title}"`);
  console.log(`Artista: "${importResult.artist}"`);
  console.log(`Charter: "${importResult.originalRawData.charter}"`);
  console.log(`Duração: ${importResult.durationSec}s`);
  console.log(`ID sugerido: ${targetSongId || importResult.songId}`);
  console.log(`Acordes presentes: ${importResult.hasChords ? 'SIM' : 'NÃO'}`);
  console.log(`Notas sustentadas: ${importResult.hasSustains ? 'SIM' : 'NÃO'}`);

  console.log('\n--- CONTAGEM DE NOTAS POR DIFICULDADE ---');
  for (const diff of ['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as Difficulty[]) {
    const count = importResult.totalNotesPerDifficulty[diff] || 0;
    const beatmap = importResult.derivedCharts[diff] || [];
    const firstTime = beatmap.length > 0 ? beatmap[0].time : null;
    const lastTime = beatmap.length > 0 ? beatmap[beatmap.length - 1].time : null;
    console.log(`- ${diff.padEnd(6)}: ${count.toString().padStart(4)} notas | 1ª Nota: ${firstTime !== null ? firstTime + 's' : '-'} | Última: ${lastTime !== null ? lastTime + 's' : '-'}`);
  }

  console.log('\n--- RELATÓRIO DE AUDITORIA E VALIDAÇÃO ---');
  const expertNotes = importResult.derivedCharts.EXPERT || [];
  const val = RockChartValidator.validate(
    targetSongId || importResult.songId,
    'EXPERT',
    expertNotes,
    importResult.durationSec
  );

  console.log(`Status de Validação: ${val.overallStatus}`);
  console.log(`Pronto para Catálogo: ${val.readyForCatalog ? 'SIM (Aprovado)' : 'NÃO (Requer Revisão)'}`);
  if (val.structural.errors.length > 0) {
    console.log('Erros estruturais:');
    val.structural.errors.forEach(e => console.log(`  [X] ${e}`));
  } else {
    console.log('Erros estruturais: 0 (Nenhum)');
  }
  if (val.structural.warnings.length > 0) {
    console.log('Avisos:');
    val.structural.warnings.forEach(w => console.log(`  [!] ${w}`));
  }

  return importResult;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'search') {
    const term = args.slice(1).join(' ');
    if (!term) {
      console.error('Uso: npx tsx scripts/adminImportChart.ts search "<termo>"');
      process.exit(1);
    }
    await handleSearch(term);
  } else if (command === 'import') {
    const target = args[1];
    const songId = args[2];
    if (!target) {
      console.error('Uso: npx tsx scripts/adminImportChart.ts import <caminho-ou-url> [songId]');
      process.exit(1);
    }
    await handleImport(target, songId);
  } else {
    console.log(`
RockBrazil - Ferramenta Administrativa de Charts
Comandos disponíveis:
  search <termo>                      Busca charts no Chorus Encore
  import <caminho-ou-url> [songId]    Importa e valida arquivo .sng, .chart, .mid ou .zip
    `);
  }
}

main().catch(err => {
  console.error('\n[ERRO]:', err.message);
  process.exit(1);
});
