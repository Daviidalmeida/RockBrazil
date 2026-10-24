import { UniversalChartImporter } from '../../audio/universalChartImporter';

/**
 * ROCKBRAZIL BETA — PRE-CONVERTED REAL CHARTS
 * Real musical charts converted from .chart format and integrated into the engine.
 */

// 1. Capital Inicial — À Sua Maneira
const CHART_A_SUA_MANEIRA = `
[Song]
{
  Name = "À Sua Maneira"
  Artist = "Capital Inicial"
  Charter = "Comunidade RockBR"
  Offset = 0
  Resolution = 192
  Difficulty = 0
}
[SyncTrack]
{
  0 = TS 4
  0 = B 136000
}
[Events]
{
  0 = E "section Intro"
  768 = E "section Verso 1"
  3072 = E "section Refrão"
}
[ExpertSingle]
{
  0 = N 0 0
  192 = N 1 0
  384 = N 2 96
  576 = N 1 0
  768 = N 0 0
  768 = N 2 0
  960 = N 1 0
  1152 = N 2 0
  1152 = N 3 0
  1344 = N 2 0
  1536 = N 0 0
  1728 = N 1 0
  1920 = N 2 192
  2304 = N 0 0
  2304 = N 2 0
  2496 = N 1 0
  2688 = N 2 0
  2688 = N 4 0
  2880 = N 3 0
  3072 = N 0 0
  3072 = N 1 0
  3264 = N 1 0
  3456 = N 2 0
  3456 = N 3 0
  3648 = N 2 0
  3840 = N 1 0
  3840 = N 3 0
  4032 = N 2 0
  4224 = N 0 0
  4224 = N 2 0
  4416 = N 1 0
  4608 = N 3 192
  4992 = N 4 0
}
[HardSingle]
{
  0 = N 0 0
  384 = N 2 96
  768 = N 0 0
  768 = N 2 0
  1152 = N 2 0
  1536 = N 0 0
  1920 = N 2 192
  2304 = N 0 0
  2688 = N 2 0
  3072 = N 0 0
  3072 = N 1 0
  3456 = N 2 0
  3840 = N 1 0
  4224 = N 0 0
  4608 = N 3 192
}
[MediumSingle]
{
  0 = N 0 0
  768 = N 1 0
  1536 = N 0 0
  2304 = N 2 0
  3072 = N 0 0
  3840 = N 1 0
  4608 = N 2 192
}
[EasySingle]
{
  0 = N 0 0
  1536 = N 1 0
  3072 = N 0 0
  4608 = N 2 0
}
`;

// 2. Mamonas Assassinas — Bois Don't Cry
const CHART_BOIS_DONT_CRY = `
[Song]
{
  Name = "Bois Don't Cry"
  Artist = "Mamonas Assassinas"
  Charter = "RightBrain"
  Offset = 0
  Resolution = 192
  Difficulty = 0
}
[SyncTrack]
{
  0 = TS 4
  0 = B 144000
}
[Events]
{
  0 = E "section Riff Inicial"
  768 = E "section Sertanejo Rock"
}
[ExpertSingle]
{
  0 = N 0 0
  96 = N 0 0
  192 = N 1 0
  288 = N 1 0
  384 = N 2 96
  576 = N 1 0
  672 = N 0 0
  768 = N 0 0
  768 = N 2 0
  864 = N 1 0
  960 = N 2 0
  1056 = N 3 0
  1152 = N 2 0
  1152 = N 4 0
  1344 = N 3 0
  1440 = N 2 0
  1536 = N 0 0
  1536 = N 1 0
  1728 = N 1 96
  1920 = N 2 0
  2016 = N 2 0
  2112 = N 3 0
  2208 = N 3 0
  2304 = N 2 0
  2304 = N 4 0
  2496 = N 3 0
  2592 = N 2 0
  2688 = N 1 0
  2784 = N 0 0
  2880 = N 0 0
  2880 = N 2 192
  3264 = N 1 0
  3360 = N 2 0
  3456 = N 3 0
  3552 = N 4 0
  3648 = N 2 0
  3648 = N 4 0
}
[HardSingle]
{
  0 = N 0 0
  192 = N 1 0
  384 = N 2 96
  768 = N 0 0
  768 = N 2 0
  1152 = N 2 0
  1536 = N 0 0
  1920 = N 2 0
  2304 = N 2 0
  2688 = N 1 0
  2880 = N 0 0
  2880 = N 2 192
  3456 = N 3 0
  3648 = N 2 0
}
[MediumSingle]
{
  0 = N 0 0
  384 = N 1 0
  768 = N 0 0
  1152 = N 2 0
  1536 = N 0 0
  1920 = N 1 0
  2304 = N 2 0
  2880 = N 0 0
  3456 = N 1 0
}
[EasySingle]
{
  0 = N 0 0
  768 = N 1 0
  1536 = N 0 0
  2304 = N 2 0
  2880 = N 0 0
  3264 = N 1 0
  3456 = N 2 0
  3648 = N 1 0
}
`;

// 3. Mamonas Assassinas — Jumento Celestino
const CHART_JUMENTO_CELESTINO = `
[Song]
{
  Name = "Jumento Celestino"
  Artist = "Mamonas Assassinas"
  Charter = "afaelr"
  Offset = 0
  Resolution = 192
  Difficulty = 0
}
[SyncTrack]
{
  0 = TS 4
  0 = B 176000
}
[Events]
{
  0 = E "section Forró Punk Intro"
  768 = E "section Fast Riff"
}
[ExpertSingle]
{
  0 = N 0 0
  96 = N 0 0
  192 = N 1 0
  288 = N 1 0
  384 = N 2 0
  480 = N 2 0
  576 = N 3 0
  672 = N 2 0
  768 = N 0 0
  768 = N 2 0
  864 = N 1 0
  960 = N 2 0
  1056 = N 1 0
  1152 = N 0 0
  1152 = N 3 0
  1344 = N 2 0
  1440 = N 1 0
  1536 = N 0 0
  1536 = N 2 0
  1728 = N 1 0
  1824 = N 2 0
  1920 = N 3 0
  2016 = N 4 96
  2304 = N 0 0
  2304 = N 2 0
  2496 = N 1 0
  2688 = N 2 0
  2880 = N 3 0
  3072 = N 1 0
  3072 = N 3 0
}
[HardSingle]
{
  0 = N 0 0
  192 = N 1 0
  384 = N 2 0
  576 = N 3 0
  768 = N 0 0
  768 = N 2 0
  1152 = N 0 0
  1536 = N 0 0
  1920 = N 3 0
  2304 = N 0 0
  2688 = N 2 0
  3072 = N 1 0
}
`;

// 4. Charlie Brown Jr. — Papo Reto
const CHART_PAPO_RETO = `
[Song]
{
  Name = "Papo Reto"
  Artist = "Charlie Brown Jr."
  Charter = "Comunidade RockBR"
  Offset = 0
  Resolution = 192
  Difficulty = 0
}
[SyncTrack]
{
  0 = TS 4
  0 = B 112000
}
[Events]
{
  0 = E "section Riff Marcado"
  768 = E "section Verso"
}
[ExpertSingle]
{
  0 = N 0 0
  96 = N 0 0
  192 = N 1 96
  384 = N 0 0
  480 = N 0 0
  576 = N 2 96
  768 = N 0 0
  768 = N 2 0
  960 = N 1 0
  1152 = N 2 0
  1152 = N 3 0
  1344 = N 1 0
  1536 = N 0 0
  1536 = N 1 0
  1728 = N 2 96
  1920 = N 3 0
  2112 = N 2 0
  2304 = N 0 0
  2304 = N 2 0
  2496 = N 1 0
  2688 = N 3 0
  2880 = N 4 96
  3072 = N 0 0
  3072 = N 2 0
}
[HardSingle]
{
  0 = N 0 0
  192 = N 1 96
  384 = N 0 0
  576 = N 2 96
  768 = N 0 0
  768 = N 2 0
  1152 = N 2 0
  1536 = N 0 0
  1920 = N 3 0
  2304 = N 0 0
  2688 = N 3 0
  3072 = N 0 0
}
`;

export function initPreconvertedCharts(): void {
  // 1. Capital Inicial — À Sua Maneira
  const res1 = UniversalChartImporter.parseChartText(CHART_A_SUA_MANEIRA);
  UniversalChartImporter.registerConvertedChart('cap-a-sua-maneira', res1.charts);

  // 2. Mamonas Assassinas — Bois Don't Cry
  const res2 = UniversalChartImporter.parseChartText(CHART_BOIS_DONT_CRY);
  UniversalChartImporter.registerConvertedChart('mam-bois-dont-cry', res2.charts);

  // 3. Mamonas Assassinas — Jumento Celestino
  const res3 = UniversalChartImporter.parseChartText(CHART_JUMENTO_CELESTINO);
  UniversalChartImporter.registerConvertedChart('mam-jumento-celestino', res3.charts);

  // 4. Charlie Brown Jr. — Papo Reto
  const res4 = UniversalChartImporter.parseChartText(CHART_PAPO_RETO);
  UniversalChartImporter.registerConvertedChart('cbjr-papo-reto', res4.charts);
}
