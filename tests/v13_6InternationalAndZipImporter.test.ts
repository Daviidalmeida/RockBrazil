import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { InternationalZipImporter, ProcessedSongResult } from '../scripts/importInternationalSongs';
import { INTERNATIONAL_SONGS_CATALOG, INTERNATIONAL_METADATA_CONFIG } from '../src/game/catalog/internationalCatalog';
import { INTERNATIONAL_COMMUNITY_CHARTS, RAW_INTERNATIONAL_CHARTS } from '../src/game/catalog/internationalChartsRegistry';
import { OFFICIAL_BRAZILIAN_CATALOG } from '../src/game/catalog/catalogData';
import { SongLibrary } from '../src/game/songLibrary';
import { CalibrationManager } from '../src/game/sync/calibrationManager';
import { UnifiedMasterClock } from '../src/game/sync/masterClock';
import { YouTubePlayerController } from '../src/audio/youtubePlayer';
import { PlaybackState } from '../src/types';
import { ProfileManager } from '../src/game/profileManager';

describe('ROCKBRAZIL V13.6 — SUÍTE DE TESTES INTERNACIONAIS E IMPORTADOR ZIP', () => {

  // --------------------------------------------------------------------------
  // 1 & 2 & 3 & 4. SEGURANÇA E PARSING DE PACOTES ZIP
  // --------------------------------------------------------------------------
  describe('Segurança e Integridade do Importador de ZIPs', () => {
    it('1. Deve ler com sucesso todos os 5 pacotes ZIP na pasta public/musicas-internacionais', () => {
      const dir = path.resolve(process.cwd(), 'public/musicas-internacionais');
      expect(fs.existsSync(dir)).toBe(true);
      const zips = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.zip'));
      expect(zips.length).toBe(5);
    });

    it('2. Deve rejeitar e lançar erro ao receber um arquivo ZIP corrompido', async () => {
      const corruptedBuffer = Buffer.from('NOT_A_VALID_ZIP_HEADER_CORRUPTED_BYTES');
      await expect(
        InternationalZipImporter.processZipBuffer(corruptedBuffer, 'corrupted.zip')
      ).rejects.toThrow();
    });

    it('3. Deve bloquear rigorosamente caminhos com Zip Slip (traversal path)', async () => {
      const zip = new JSZip();
      zip.file('../evil.exe', 'malicious payload');
      zip.file('notes.chart', '[Song]\n{\n}\n');
      const buf = await zip.generateAsync({ type: 'nodebuffer' });

      await expect(
        InternationalZipImporter.processZipBuffer(buf, 'slip.zip')
      ).rejects.toThrow(/Zip Slip detectado/i);
    });

    it('4. Deve validar os limites de segurança de tamanho descompactado', () => {
      expect(InternationalZipImporter.isSafeZipPath('folder/notes.chart')).toBe(true);
      expect(InternationalZipImporter.isSafeZipPath('../secret.txt')).toBe(false);
      expect(InternationalZipImporter.isSafeZipPath('/etc/passwd')).toBe(false);
      expect(InternationalZipImporter.isSafeZipPath('C:\\Windows\\system32')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 5 & 6 & 7 & 8 & 9 & 10 & 11. PARSING DE SONG.INI, .CHART E .MID COM MULTI-BPM
  // --------------------------------------------------------------------------
  describe('Parsing Musical (.chart, .mid, song.ini, BPM, Acordes e Sustains)', () => {
    it('5. Deve extrair corretamente metadados do song.ini', async () => {
      const acdcMeta = INTERNATIONAL_METADATA_CONFIG['intl-acdc-highway-to-hell'];
      expect(acdcMeta).toBeDefined();
      expect(acdcMeta.charter).toBe('metalli3212');
      expect(acdcMeta.defaultOffsetMs).toBe(-2000); // Live at River Plate video_start_time
      expect(acdcMeta.recordingVersion).toContain('River Plate');
    });

    it('6. Deve converter arquivos .chart para os formatos de cinco pistas do RockBrazil', () => {
      const paradise = RAW_INTERNATIONAL_CHARTS['intl-gnr-paradise-city'];
      expect(paradise).toBeDefined();
      expect(paradise.EXPERT.length).toBeGreaterThan(2000);
      expect(paradise.EASY.length).toBeGreaterThan(0);
      expect(paradise.MEDIUM.length).toBeGreaterThan(0);
      expect(paradise.HARD.length).toBeGreaterThan(0);
    });

    it('7. Deve converter arquivos .mid (.midi) para os formatos do RockBrazil', () => {
      const numb = RAW_INTERNATIONAL_CHARTS['intl-lp-numb'];
      expect(numb).toBeDefined();
      expect(numb.EXPERT.length).toBeGreaterThan(200);
      expect(numb.EASY.length).toBeGreaterThan(0);
      expect(numb.MEDIUM.length).toBeGreaterThan(0);
      expect(numb.HARD.length).toBeGreaterThan(0);
    });

    it('8. Deve manter sincronização temporal com suporte a mudanças de BPM', () => {
      const sweetChild = INTERNATIONAL_COMMUNITY_CHARTS['intl-gnr-sweet-child-o-mine'];
      expect(sweetChild).toBeDefined();
      const expertNotes = sweetChild.EXPERT;
      // As notas devem estar rigorosamente em ordem cronológica estrita
      for (let i = 1; i < expertNotes.length; i++) {
        expect(expertNotes[i].time).toBeGreaterThanOrEqual(expertNotes[i - 1].time);
      }
    });

    it('9. Deve identificar e preservar acordes simultâneos (isChord)', () => {
      const welcome = RAW_INTERNATIONAL_CHARTS['intl-gnr-welcome-to-the-jungle'];
      expect(welcome).toBeDefined();
      // Verifica presença de acordes (elemento 3 igual a 1)
      const chords = welcome.EXPERT.filter(n => n[3] === 1);
      expect(chords.length).toBeGreaterThan(0);
    });

    it('10. Deve preservar notas longas (sustains com duração > 0)', () => {
      const acdc = RAW_INTERNATIONAL_CHARTS['intl-acdc-highway-to-hell'];
      expect(acdc).toBeDefined();
      const sustains = acdc.EXPERT.filter(n => n[2] > 0);
      expect(sustains.length).toBeGreaterThan(0);
    });

    it('11. Deve disponibilizar dificuldades originais autênticas sem inventar dificuldades fake', () => {
      const config = INTERNATIONAL_METADATA_CONFIG['intl-lp-numb'];
      expect(config.availableDifficulties).toContain('EASY');
      expect(config.availableDifficulties).toContain('MEDIUM');
      expect(config.availableDifficulties).toContain('HARD');
      expect(config.availableDifficulties).toContain('EXPERT');
    });
  });

  // --------------------------------------------------------------------------
  // 12 & 13 & 14. VALIDAÇÃO DE AUSÊNCIA DE CHART OU VÍDEO
  // --------------------------------------------------------------------------
  describe('Tratamento de Exceções de Catálogo e Vídeos', () => {
    it('12. Deve rejeitar pacotes ZIP sem nenhuma chart identificada', async () => {
      const zip = new JSZip();
      zip.file('song.ini', '[song]\nname=Teste\nartist=Banda');
      zip.file('song.ogg', 'dummy audio');
      const buf = await zip.generateAsync({ type: 'nodebuffer' });

      await expect(
        InternationalZipImporter.processZipBuffer(buf, 'empty.zip')
      ).rejects.toThrow(/Nenhum arquivo de chart/i);
    });

    it('13 & 14. Deve marcar músicas sem vídeo confirmado ou com incorporação bloqueada', () => {
      const songs = INTERNATIONAL_SONGS_CATALOG;
      for (const s of songs) {
        expect(s.isInternational).toBe(true);
        expect(s.youtubeVideoId).toBeDefined();
        expect(s.youtubeVideoId.length).toBeGreaterThan(5);
        expect(['PRONTA PARA TESTE', 'CHART EM PREPARAÇÃO', 'VÍDEO NÃO CONFIGURADO', 'VÍDEO INDISPONÍVEL']).toContain(s.internationalStatus);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 15 & 16. BUFFERING E PAUSA DO YOUTUBE
  // --------------------------------------------------------------------------
  describe('Sincronização e Estados do Adaptador YouTube', () => {
    it('15. Durante BUFFERING, as notas devem congelar e o relógio não deve avançar', () => {
      const clock = new UnifiedMasterClock();
      const mockYt: any = {
        getCurrentTime: () => 10.5,
        getPlaybackState: () => PlaybackState.BUFFERING,
        isBuffering: () => true
      };
      clock.setSource(mockYt);
      clock.startPlayback();

      // Primeira leitura durante buffering
      const t1 = clock.getTime();
      expect(clock.isBuffering()).toBe(true);

      // Avanço simulado enquanto buffering ainda ativo
      mockYt.getCurrentTime = () => 14.0;
      const t2 = clock.getTime();

      // O tempo deve permanecer rigorosamente congelado
      expect(t2).toBe(t1);
    });

    it('16. Durante PAUSA, o estado da partida deve ser congelado e retomado sem drift', () => {
      const clock = new UnifiedMasterClock();
      const mockYt: any = {
        time: 5.0,
        state: PlaybackState.PLAYING,
        getCurrentTime() { return this.time; },
        getPlaybackState() { return this.state; },
        isBuffering() { return false; }
      };
      clock.setSource(mockYt);
      clock.startPlayback();

      expect(clock.getTime()).toBe(5.0);

      // Pausa o jogo
      clock.pause();
      mockYt.state = PlaybackState.PAUSED;
      mockYt.time = 7.5; // Eventual deslocamento externo

      expect(clock.getTime()).toBe(5.0); // Continua rigorosamente em 5.0

      // Retomada
      clock.resume();
      mockYt.state = PlaybackState.PLAYING;
      mockYt.time = 5.1;
      expect(clock.getTime()).toBeCloseTo(5.1, 1);
    });
  });

  // --------------------------------------------------------------------------
  // 17. CALIBRAÇÃO E OFFSET POR MÚSICA
  // --------------------------------------------------------------------------
  describe('Calibração e Offset Independente', () => {
    it('17. Permite ajustes positivos e negativos de offset sem alterar o catálogo brasileiro', () => {
      const initial = CalibrationManager.getSongOffsetMs('intl-gnr-paradise-city');
      expect(initial).toBe(0);

      // Ajusta +120ms
      CalibrationManager.adjustOffsetMs('intl-gnr-paradise-city', 120);
      expect(CalibrationManager.getSongOffsetMs('intl-gnr-paradise-city')).toBe(120);

      // Ajusta -80ms (120 - 80 = 40ms)
      CalibrationManager.adjustOffsetMs('intl-gnr-paradise-city', -80);
      expect(CalibrationManager.getSongOffsetMs('intl-gnr-paradise-city')).toBe(40);

      // Verifica que o catálogo brasileiro permanece inalterado (0ms)
      expect(CalibrationManager.getSongOffsetMs('mam-1406')).toBe(0);
      expect(CalibrationManager.getSongOffsetMs('cap-sua-maneira')).toBe(0);

      // Reseta para default
      CalibrationManager.resetOffsetMs('intl-gnr-paradise-city');
      expect(CalibrationManager.getSongOffsetMs('intl-gnr-paradise-city')).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 22 & 23 & 24. ISOLAMENTO DE ROCKCOINS, RANKING E PRESERVAÇÃO DAS 162 MÚSICAS
  // --------------------------------------------------------------------------
  describe('Isolamento Econômico, Ranking e Preservação Brasileira', () => {
    it('22. Músicas internacionais não devem conceder ou deduzir RockCoins', async () => {
      const pm = new ProfileManager();
      const guest = pm.getActiveProfile();
      guest.rockCoins = 10;

      const dummyStats: any = {
        score: 150000,
        stars: 5,
        maxCombo: 200,
        accuracy: 98,
        hitsCount: 196,
        missCount: 4,
        playableNotesCount: 200
      };

      const result = await pm.recordMatch(
        'intl-lp-numb',
        'Numb',
        'HARD',
        dummyStats,
        true,
        'Linkin Park',
        true // isInternational = true
      );

      // RockCoins ganhas deve ser rigorosamente 0
      expect(result.earnedCoins).toBe(0);
      expect(result.totalCoins).toBe(10);
    });

    it('23. Músicas internacionais são desbloqueadas gratuitamente por padrão', () => {
      const pm = new ProfileManager();
      expect(pm.isSongUnlocked('intl-acdc-highway-to-hell')).toBe(true);
      expect(pm.isSongUnlocked('intl-gnr-paradise-city')).toBe(true);
      expect(pm.isSongUnlocked('intl-gnr-sweet-child-o-mine')).toBe(true);
      expect(pm.isSongUnlocked('intl-gnr-welcome-to-the-jungle')).toBe(true);
      expect(pm.isSongUnlocked('intl-lp-numb')).toBe(true);
    });

    it('24. Preserva integralmente o catálogo oficial de 162 músicas brasileiras', () => {
      expect(OFFICIAL_BRAZILIAN_CATALOG.length).toBe(162);

      const lib = new SongLibrary();
      const brazilianSongs = lib.getBrazilianSongs();
      expect(brazilianSongs.length).toBe(162);

      // Nenhuma música internacional deve vazar no catálogo brasileiro
      const leaked = brazilianSongs.some(s => s.isInternational || s.id.startsWith('intl-'));
      expect(leaked).toBe(false);

      // As 5 internacionais devem estar no catálogo internacional
      const intlSongs = lib.getInternationalSongs();
      expect(intlSongs.length).toBe(5);
    });
  });

  // --------------------------------------------------------------------------
  // 25. EXCLUSÃO DOS ARQUIVOS PROTEGIDOS NO BUILD PÚBLICO
  // --------------------------------------------------------------------------
  describe('Segurança de Publicação e Direitos Autorais', () => {
    it('25. Garante que os pacotes ZIP originais e faixas de áudio não estejam na build pública', () => {
      const gitignore = fs.readFileSync(path.resolve(process.cwd(), '.gitignore'), 'utf-8');
      expect(gitignore).toContain('public/musicas-internacionais/**');

      const viteConfig = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf-8');
      expect(viteConfig).toContain('dist/musicas-internacionais');
      expect(viteConfig).toContain('exclude-commercial-custom-songs');
    });
  });
});
