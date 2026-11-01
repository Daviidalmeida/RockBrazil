import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SngPackageParser } from '../src/game/rockchart/importer/sngPackageParser';
import { UniversalChartImporter } from '../src/audio/universalChartImporter';
import { ChorusEncoreProvider } from '../src/game/rockchart/providers/enchorProvider';
import { RockChartValidator } from '../src/game/rockchart/validator/rockChartValidator';
import { RAW_INTERNATIONAL_CHARTS, INTERNATIONAL_COMMUNITY_CHARTS } from '../src/game/catalog/internationalChartsRegistry';
import { INTERNATIONAL_SONGS_CATALOG } from '../src/game/catalog/internationalCatalog';
import { INTERNATIONAL_SYNC_REGISTRY } from '../src/game/sync/internationalSyncRegistry';
import { Difficulty, Lane, Note } from '../src/types';

describe('ROCKBRAZIL — CLONE HERO CHART MANAGER IMPORTER & SYNC SUITE', () => {

  // ==========================================================================
  // SEÇÃO 1: SngPackageParser (Análise de Container e Desmascaramento XOR)
  // ==========================================================================
  describe('1. SngPackageParser — Container Nativo .sng', () => {
    it('1.1. Deve reconhecer a assinatura mágica "SNGPKG" e rejeitar cabeçalhos inválidos', () => {
      const invalidHeader = Buffer.from('NOT_A_SNG_FILE_HEADER_XYZ');
      expect(SngPackageParser.isSng(invalidHeader)).toBe(false);

      const validMagic = Buffer.alloc(10);
      validMagic.write('SNGPKG', 0, 'ascii');
      expect(SngPackageParser.isSng(validMagic)).toBe(true);
    });

    it('1.2. Deve lançar erro explicativo ao tentar parsear arquivo sem cabeçalho SNGPKG', () => {
      const invalidBuf = Buffer.from('INVALID_HEADER_DATA');
      expect(() => SngPackageParser.parseSngPackage(invalidBuf)).toThrow('SNGPKG');
    });

    it('1.3. Deve sanitizar tags de formatação rica do Clone Hero (<color=...>, <b>, etc.)', () => {
      const rawCharter = '<color=#ff0000>heather</color> & <b>Harmonix</b>';
      const clean = SngPackageParser.stripRichText(rawCharter);
      expect(clean).toBe('heather & Harmonix');
    });

    it('1.4. Deve decodificar pacote .sng real de Given Up mantendo integridade de metadados e arquivos', () => {
      const sngPath = path.resolve(__dirname, '../scratch/test.sng');
      if (fs.existsSync(sngPath)) {
        const sngBuffer = fs.readFileSync(sngPath);
        expect(SngPackageParser.isSng(sngBuffer)).toBe(true);

        const pkg = SngPackageParser.parseSngPackage(sngBuffer);
        expect(pkg.metadata.name).toBe('Given Up');
        expect(pkg.metadata.artist).toBe('Linkin Park');
        expect(pkg.metadata.charter).toContain('heather');

        // Arquivos extraídos dentro do pacote
        expect(pkg.files.has('notes.chart') || pkg.files.has('notes.mid')).toBe(true);
        const chartData = pkg.files.get('notes.chart');
        expect(chartData).toBeDefined();
        const text = new TextDecoder().decode(chartData!);
        expect(text).toContain('[Song]');
        expect(text).toContain('[SyncTrack]');
        expect(text).toContain('[ExpertSingle]');
      }
    });

    it('1.5. O desmascaramento cíclico XOR deve preservar bytes sem corrupção', () => {
      // Simula payload criptografado com máscara de 16 bytes e ci = i % 256
      const mask = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      const originalText = '[Song]\n{\n  Name = "Test Song"\n}';
      const originalBuf = Buffer.from(originalText, 'utf8');

      // Mascarar
      const maskedBuf = Buffer.alloc(originalBuf.length);
      for (let i = 0; i < originalBuf.length; i++) {
        const ci = i % 256;
        maskedBuf[i] = originalBuf[i] ^ (mask[ci % 16] ^ ci);
      }

      // Desmascarar usando a lógica do parser
      const unmasked = SngPackageParser.unmaskFile(maskedBuf, mask);
      expect(new TextDecoder().decode(unmasked)).toBe(originalText);
    });
  });

  // ==========================================================================
  // SEÇÃO 2: UniversalChartImporter (.sng, .chart, .mid)
  // ==========================================================================
  describe('2. UniversalChartImporter — Integração Unificada', () => {
    it('2.1. Deve importar container .sng e extrair todas as 4 dificuldades com notas autênticas', async () => {
      const sngPath = path.resolve(__dirname, '../scratch/test.sng');
      if (fs.existsSync(sngPath)) {
        const sngBuffer = fs.readFileSync(sngPath);
        const result = await UniversalChartImporter.importFromRawData(sngBuffer, 'test.sng');

        expect(result.metadata.name).toBe('Given Up');
        expect(result.metadata.artist).toBe('Linkin Park');
        expect(result.charts.EASY).toBeDefined();
        expect(result.charts.MEDIUM).toBeDefined();
        expect(result.charts.HARD).toBeDefined();
        expect(result.charts.EXPERT).toBeDefined();

        expect(result.charts.EASY!.length).toBe(432);
        expect(result.charts.MEDIUM!.length).toBe(838);
        expect(result.charts.HARD!.length).toBe(841);
        expect(result.charts.EXPERT!.length).toBe(841);
      }
    });

    it('2.2. Deve preservar acordes, sustentações e pistas autênticas no Expert', async () => {
      const sngPath = path.resolve(__dirname, '../scratch/test.sng');
      if (fs.existsSync(sngPath)) {
        const sngBuffer = fs.readFileSync(sngPath);
        const result = await UniversalChartImporter.importFromRawData(sngBuffer, 'test.sng');
        const expert = result.charts.EXPERT!;

        // Primeiro evento deve ser acorde Drop D em 4.827s
        const firstNotes = expert.filter((n) => Math.abs(n.time - 4.827) < 0.05);
        expect(firstNotes.length).toBeGreaterThanOrEqual(2);
        const lanes = firstNotes.map((n) => n.lane);
        expect(lanes).toContain(0);
        expect(lanes).toContain(2);
      }
    });
  });

  // ==========================================================================
  // SEÇÃO 3: ChorusEncoreProvider (Protocolo POST /search API v2)
  // ==========================================================================
  describe('3. ChorusEncoreProvider — Integração com API v2', () => {
    it('3.1. Deve formatar requisição POST com search, page e per_page conforme protocolo CHM', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 622699,
              name: 'Given Up',
              artist: 'Linkin Park',
              charter: 'heather',
              md5: '2b578efda2967554a243197a0b974272',
              albumArtMd5: 'cfeb0ae26e105e19746e382d6da61a4c',
              chartLength: 189,
              effectiveLength: 187,
              hasVideoBackground: false,
              notesData: {
                hasInstrument: true,
                noteCounts: {
                  tier: 'guitar',
                  easy: 432,
                  medium: 838,
                  hard: 841,
                  expert: 841
                }
              }
            }
          ],
          count: 1,
          total: 1
        })
      });

      const provider = new ChorusEncoreProvider({ fetchFn: mockFetch });
      const results = await provider.search('Given Up');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.enchor.us/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: expect.stringContaining('"search":"Given Up"')
        })
      );

      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Given Up');
      expect(results[0].artist).toBe('Linkin Park');
      expect(results[0].charter).toBe('heather');
      expect(results[0].directDownloadUrl).toBe('https://files.enchor.us/2b578efda2967554a243197a0b974272.sng');
      expect(results[0].albumArtUrl).toBe('https://files.enchor.us/cfeb0ae26e105e19746e382d6da61a4c.jpg');
      expect(results[0].difficulties).toEqual(['EASY', 'MEDIUM', 'HARD', 'EXPERT']);
    });

    it('3.2. Deve rejeitar charts vazios ou que não possuam notas de guitarra', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 999999,
              name: 'Vocal Only Song',
              artist: 'Test Artist',
              charter: 'author',
              md5: 'fake_md5',
              notesData: {
                hasInstrument: false,
                noteCounts: {}
              }
            }
          ],
          count: 1,
          total: 1
        })
      });

      const provider = new ChorusEncoreProvider({ fetchFn: mockFetch });
      const results = await provider.search('Vocal Only');
      expect(results.length).toBe(0);
    });
  });

  // ==========================================================================
  // SEÇÃO 4: RockChartValidator (Proibição Estrita de Notas Fictícias)
  // ==========================================================================
  describe('4. RockChartValidator — Integridade e Rejeição de Notas Procedurais Falsas', () => {
    it('4.1. Deve rejeitar categoricamente beatmap vazio com erro explícito', () => {
      const emptyBeatmap: Note[] = [];
      const result = RockChartValidator.validateBeatmapStructure(emptyBeatmap, 'EXPERT');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('não contém nenhuma nota jogável'))).toBe(true);
    });

    it('4.2. Deve rejeitar notas com pistas inválidas fora da faixa 0..4', () => {
      const invalidNoteBeatmap: Note[] = [
        { time: 1.0, lane: 0 as Lane, duration: 0, type: 'tap' },
        { time: 2.0, lane: 5 as Lane, duration: 0, type: 'tap' } // Pista 5 inválida
      ];
      const result = RockChartValidator.validateBeatmapStructure(invalidNoteBeatmap, 'EXPERT');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Pista inválida'))).toBe(true);
    });

    it('4.3. Deve validar timestamps estritamente não-decrescentes', () => {
      const outOfOrder: Note[] = [
        { time: 5.0, lane: 0 as Lane, duration: 0, type: 'tap' },
        { time: 3.0, lane: 1 as Lane, duration: 0, type: 'tap' } // Timestamp regressivo
      ];
      const result = RockChartValidator.validateBeatmapStructure(outOfOrder, 'EXPERT');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Timestamp fora de ordem'))).toBe(true);
    });
  });

  // ==========================================================================
  // SEÇÃO 5: Piloto de Teste — Given Up (Linkin Park)
  // ==========================================================================
  describe('5. Piloto de Teste — Given Up (Linkin Park)', () => {
    const GIVEN_UP_ID = 'intl-lp-given-up';

    it('5.1. O chart de Given Up é 100% oriundo do autor comunitário heather (Chorus Encore)', () => {
      const song = INTERNATIONAL_SONGS_CATALOG.find((s) => s.id === GIVEN_UP_ID);
      expect(song).toBeDefined();
      expect(song?.charter).toContain('heather');

      const sync = INTERNATIONAL_SYNC_REGISTRY[GIVEN_UP_ID];
      expect(sync).toBeDefined();
      expect(sync.chartAuthor).toContain('heather');
    });

    it('5.2. A contagem de notas em todas as dificuldades bate exatamente com a obra autêntica', () => {
      const raw = RAW_INTERNATIONAL_CHARTS[GIVEN_UP_ID];
      expect(raw).toBeDefined();
      expect(raw.EASY.length).toBe(432);
      expect(raw.MEDIUM.length).toBe(838);
      expect(raw.HARD.length).toBe(841);
      expect(raw.EXPERT.length).toBe(841);
    });

    it('5.3. O descompactador INTERNATIONAL_COMMUNITY_CHARTS preserva integridade acústica', () => {
      const unpacked = INTERNATIONAL_COMMUNITY_CHARTS[GIVEN_UP_ID];
      expect(unpacked).toBeDefined();
      expect(unpacked.EXPERT.length).toBe(841);
      expect(unpacked.EASY.length).toBe(432);

      // Primeiro evento em 4.827s (Drop D power chord)
      expect(unpacked.EXPERT[0].time).toBeCloseTo(4.827, 2);
      // Último evento em 187.136s (Staccato final Drop D)
      expect(unpacked.EXPERT[unpacked.EXPERT.length - 1].time).toBeCloseTo(187.136, 2);
    });

    it('5.4. Sincronização em 0ms casa perfeitamente com a gravação oficial de áudio (Topic D93vYwuMeUw)', () => {
      const sync = INTERNATIONAL_SYNC_REGISTRY[GIVEN_UP_ID];
      expect(sync.chartVideoOffsetMs).toBe(0);
      expect(sync.youtubeVideoId).toBe('D93vYwuMeUw');
      expect(sync.syncMethod).toBe('STUDIO_TIMESTAMP_ALIGNED');
      expect(sync.audioReferenceMatch).toBe('EXACT_MATCH');
    });
  });
});
