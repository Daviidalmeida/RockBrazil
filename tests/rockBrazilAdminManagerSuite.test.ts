import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { RockChartStudio } from '../src/game/rockchart/studio/rockChartStudio';
import { PersistentCatalogService, ManagedSong } from '../src/game/catalog/persistentCatalogService';
import { SongLibrary } from '../src/game/songLibrary';
import { BeatmapManager } from '../src/game/beatmapManager';
import { UniversalChartImporter } from '../src/audio/universalChartImporter';
import { INTERNATIONAL_SYNC_REGISTRY } from '../src/game/sync/internationalSyncRegistry';
import { RockSyncProfileRepository } from '../src/game/rockchart/sync/rockSyncProfileRepository';
import { Difficulty, Note } from '../src/types';

describe('ROCKBRAZIL — PAINEL ADMINISTRATIVO & GESTÃO MUSICAL COMPLETA', () => {
  let studio: RockChartStudio;
  let catalogService: PersistentCatalogService;
  let songLibrary: SongLibrary;
  let beatmapManager: BeatmapManager;

  beforeEach(() => {
    // Limpa storage mockado em memória para isolar os testes
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
    PersistentCatalogService.resetInstance();
    RockChartStudio.resetInstance();

    catalogService = PersistentCatalogService.getInstance();
    studio = RockChartStudio.getInstance();
    songLibrary = new SongLibrary();
    beatmapManager = new BeatmapManager();
  });

  // ==========================================================================
  // SEÇÃO 1: AUTENTICAÇÃO E CONTROLE DE ACESSO ADMINISTRATIVO
  // ==========================================================================
  describe('1. Autenticação Administrativa e Segurança de Sessão', () => {
    it('1.1. Deve rejeitar credenciais vazias ou indefinidas', async () => {
      const ok = await studio.authenticateAdmin({});
      expect(ok).toBe(false);
      expect(studio.isAdminAuthenticated()).toBe(false);
    });

    it('1.2. Deve autenticar via Google Auth com Custom Claims (admin: true)', async () => {
      const fakeUser = {
        uid: 'google-super-admin-uid-123',
        email: 'admin-curador@gmail.com',
        displayName: 'Davi Curador',
        getIdTokenResult: async () => ({
          claims: { admin: true, role: 'SUPER_ADMIN' }
        })
      } as any;
      const ok = await studio.authenticateAdmin(fakeUser);
      expect(ok).toBe(true);
      expect(studio.isAdminAuthenticated()).toBe(true);
      expect(studio.getAdminUser()?.role).toBe('SUPER_ADMIN');
      expect(studio.getAdminUser()?.sessionExpiry).toBeGreaterThan(Date.now());
    });

    it('1.3. Deve rejeitar token fixo inseguro ou token arbitrário (sem bypass de token)', async () => {
      const ok = await studio.authenticateAdmin({ token: 'RB_ADMIN_2026_SECURE' });
      expect(ok).toBe(false);
      expect(studio.isAdminAuthenticated()).toBe(false);
    });

    it('1.4. Deve autenticar via Google Auth para domínio institucional ou email de admin', async () => {
      const ok1 = await studio.authenticateAdmin({ email: 'curador@rockbrazil.com.br' });
      expect(ok1).toBe(true);

      const ok2 = await studio.authenticateAdmin({ email: 'admin@rockbrazil.com' });
      expect(ok2).toBe(true);

      const ok3 = await studio.authenticateAdmin({ email: 'jogador_comum@gmail.com' });
      expect(ok3).toBe(false);
    });

    it('1.5. Deve mapear nome de usuário "Admin" para a identidade canônica e aplicar rate-limiting', async () => {
      const { AdminAuthService } = await import('../src/firebase/adminAuthService');
      
      // Mapeamento canônico
      expect(AdminAuthService.resolveUsernameToEmail('Admin')).toBe('admin@rockbrazil.com.br');
      expect(AdminAuthService.resolveUsernameToEmail('admin')).toBe('admin@rockbrazil.com.br');
      expect(AdminAuthService.resolveUsernameToEmail('ADMIN')).toBe('admin@rockbrazil.com.br');
      expect(AdminAuthService.resolveUsernameToEmail('outro@email.com')).toBe('outro@email.com');

      // Rate limiting: zera antes de testar
      AdminAuthService.resetRateLimit();
      expect(AdminAuthService.checkRateLimit().isLocked).toBe(false);

      // Simula tentativas consecutivas com credenciais incorretas
      for (let i = 0; i < 5; i++) {
        await AdminAuthService.signInWithCredentials('Admin', 'senha_errada_' + i);
      }

      // Após 5 falhas, o rate limit bloqueia tentativas
      const rateLimitCheck = AdminAuthService.checkRateLimit();
      expect(rateLimitCheck.isLocked).toBe(true);
      expect(rateLimitCheck.remainingSeconds).toBeGreaterThan(0);

      // Reseta para não afetar outros testes
      AdminAuthService.resetRateLimit();
      expect(AdminAuthService.checkRateLimit().isLocked).toBe(false);
    });

    it('1.6. Deve desautenticar corretamente com logoutAdmin()', async () => {
      await studio.authenticateAdmin({ email: 'curador@rockbrazil.com.br' });
      expect(studio.isAdminAuthenticated()).toBe(true);

      studio.logoutAdmin();
      expect(studio.isAdminAuthenticated()).toBe(false);
      expect(studio.getAdminUser()).toBeNull();
    });
  });

  // ==========================================================================
  // SEÇÃO 2: VALIDAÇÃO DE ARQUIVOS, UPLOAD E SEGURANÇA
  // ==========================================================================
  describe('2. Validação de Arquivos e Proteção Contra Ataques', () => {
    beforeEach(async () => {
      await studio.authenticateAdmin({ email: 'admin@rockbrazil.com.br' });
    });

    it('2.1. Deve rejeitar arquivos acima de 50MB (proteção contra DoS / memória)', async () => {
      const fakeHugeBuffer = new ArrayBuffer(52 * 1024 * 1024); // 52MB
      await expect(
        studio.importFile(fakeHugeBuffer, 'huge_song.sng', 'CHORUS_ENCORE')
      ).rejects.toThrow('50MB');
    });

    it('2.2. Deve bloquear tentativa de Path Traversal no nome de arquivo (.zip ou .chart com ../)', async () => {
      const fakeBuffer = new ArrayBuffer(1024);
      await expect(
        studio.importFile(fakeBuffer, '../../../etc/passwd.zip', 'MANUAL_UPLOAD')
      ).rejects.toThrow('caminho inválido');
    });

    it('2.3. Deve rejeitar extensões não suportadas no motor de charts', async () => {
      const fakeBuffer = new ArrayBuffer(1024);
      await expect(
        studio.importFile(fakeBuffer, 'malicious_payload.exe', 'MANUAL_UPLOAD')
      ).rejects.toThrow('não reconhecido ou incompatível');
    });
  });

  // ==========================================================================
  // SEÇÃO 3: IMPORTAÇÃO E PARSER DE PACOTE .SNG COM CHORDS E SUSTAINS
  // ==========================================================================
  describe('3. Importação de Charts Reais e Análise Estrutural', () => {
    beforeEach(async () => {
      await studio.authenticateAdmin({ email: 'admin@rockbrazil.com.br' });
    });

    it('3.1. Deve importar pacote real .sng (Given Up - Linkin Park) e identificar as 4 dificuldades', async () => {
      const sngPath = path.resolve(__dirname, '../scratch/test.sng');
      if (!fs.existsSync(sngPath)) {
        console.warn('Arquivo scratch/test.sng não encontrado. Pulando leitura física.');
        return;
      }

      const sngBuf = fs.readFileSync(sngPath);
      const imported = await studio.importFile(sngBuf, 'Given Up.sng', 'CHORUS_ENCORE');

      expect(imported.songId).toContain('given-up');
      expect(imported.title).toBe('Given Up');
      expect(imported.artist).toBe('Linkin Park');
      expect(imported.difficultiesPresent).toEqual(['EASY', 'MEDIUM', 'HARD', 'EXPERT']);
      expect(imported.derivedCharts.EASY.length).toBe(432);
      expect(imported.derivedCharts.MEDIUM.length).toBe(838);
      expect(imported.derivedCharts.HARD.length).toBe(841);
      expect(imported.derivedCharts.EXPERT.length).toBe(841);

      // Verificação de ausência de dificuldades
      const missing = studio.getMissingDifficulties(imported);
      expect(missing).toEqual([]);
    });

    it('3.2. Deve alertar dificuldades ausentes sem inventar notas procedurais falsas', () => {
      const partialChart = {
        songId: 'incomplete-song',
        title: 'Incomplete',
        artist: 'Test Band',
        bpm: 120,
        durationSec: 180,
        originalRawData: { fileFormat: '.chart' as const },
        derivedCharts: {
          EASY: [],
          MEDIUM: [],
          HARD: [{ id: 'n1', time: 1.0, lane: 0, duration: 0.1 }],
          EXPERT: [{ id: 'n2', time: 1.0, lane: 0, duration: 0.1 }]
        },
        difficultiesPresent: ['HARD', 'EXPERT'] as Difficulty[],
        hasChords: false,
        hasSustains: false,
        totalNotesPerDifficulty: { EASY: 0, MEDIUM: 0, HARD: 1, EXPERT: 1 },
        sourceProvider: 'CHORUS_ENCORE' as const,
        importTimestamp: new Date().toISOString()
      };

      const missing = studio.getMissingDifficulties(partialChart);
      expect(missing).toContain('EASY');
      expect(missing).toContain('MEDIUM');
      expect(missing).not.toContain('HARD');
      expect(missing).not.toContain('EXPERT');
    });

    it('3.3. Deve gerar dados de visualização para a esteira mini-highway de 5 pistas', () => {
      const notes: Note[] = [
        { id: '1', time: 1.5, lane: 0, duration: 0 },
        { id: '2', time: 2.0, lane: 2, duration: 0.5 },
        { id: '3', time: 2.5, lane: 4, duration: 0 }
      ];

      const previewData = studio.generateHighwayPreviewData(notes, 1.0, 3.0);
      expect(previewData.length).toBe(3);
      expect(previewData[0].lane).toBe(0); // Verde
      expect(previewData[1].lane).toBe(2); // Amarelo
      expect(previewData[1].duration).toBe(0.5); // Sustain
      expect(previewData[2].lane).toBe(4); // Laranja
    });
  });

  // ==========================================================================
  // SEÇÃO 4: CONFIGURAÇÃO DE ÁUDIO DO YOUTUBE E DETECÇÃO DE DESSINCRONIZAÇÃO
  // ==========================================================================
  describe('4. Sincronização, YouTube Embed e Diagnóstico Estrutural de Áudio', () => {
    beforeEach(async () => {
      await studio.authenticateAdmin({ email: 'admin@rockbrazil.com.br' });
    });

    it('4.1. Deve extrair corretamente o Video ID de diversas variações de URL do YouTube', () => {
      expect(studio.extractYouTubeVideoId('https://www.youtube.com/watch?v=0BW95UAH7b8')).toBe('0BW95UAH7b8');
      expect(studio.extractYouTubeVideoId('https://youtu.be/0BW95UAH7b8')).toBe('0BW95UAH7b8');
      expect(studio.extractYouTubeVideoId('https://www.youtube.com/embed/0BW95UAH7b8')).toBe('0BW95UAH7b8');
      expect(studio.extractYouTubeVideoId('https://www.youtube.com/shorts/0BW95UAH7b8')).toBe('0BW95UAH7b8');
      expect(studio.extractYouTubeVideoId('0BW95UAH7b8')).toBe('0BW95UAH7b8');
    });

    it('4.2. Deve diagnosticar conformidade de duração entre o chart e o vídeo (<= 6.0s)', () => {
      const analysis = studio.configureYouTubeAudio('0BW95UAH7b8', 190, 192);
      expect(analysis.isMismatchSuspected).toBe(false);
      expect(analysis.status).toBe('DURATION_MATCH_CONFIRMED');
      expect(analysis.differenceSec).toBe(2);
    });

    it('4.3. Deve detectar STRUCTURAL_MISMATCH_SUSPECTED quando a diferença de duração exceder 6.0s', () => {
      // Exemplo: Chart de versão de estúdio (180s) vs Videoclipe com introdução cinematográfica (210s)
      const analysis = studio.configureYouTubeAudio('0BW95UAH7b8', 180, 210);
      expect(analysis.isMismatchSuspected).toBe(true);
      expect(analysis.status).toBe('STRUCTURAL_MISMATCH_SUSPECTED');
      expect(analysis.differenceSec).toBe(30);
      expect(analysis.message).toContain('Divergência estrutural');
    });

    it('4.4. Deve permitir ajuste fino de offset em tempo real', () => {
      studio.setManualOffset(50);
      expect(studio.getSessionState().configuredOffsetMs).toBe(50);

      studio.adjustOffset(25);
      expect(studio.getSessionState().configuredOffsetMs).toBe(75);

      studio.adjustOffset(-100);
      expect(studio.getSessionState().configuredOffsetMs).toBe(-25);
    });
  });

  // ==========================================================================
  // SEÇÃO 5: FLUXO DE PERSISTÊNCIA (RASCUNHO -> APROVAÇÃO -> PUBLICAÇÃO -> JOGO)
  // ==========================================================================
  describe('5. Ciclo de Vida: Rascunho, Publicação Dinâmica e Reflexão no Jogo', () => {
    beforeEach(async () => {
      await studio.authenticateAdmin({ email: 'admin@rockbrazil.com.br' });
    });

    it('5.1. Deve salvar chart como RASCUNHO (DRAFT) sem liberar para os jogadores comuns', async () => {
      const sngPath = path.resolve(__dirname, '../scratch/test.sng');
      if (!fs.existsSync(sngPath)) return;

      const sngBuf = fs.readFileSync(sngPath);
      await studio.importFile(sngBuf, 'Given Up.sng', 'CHORUS_ENCORE');
      studio.configureYouTubeAudio('0BW95UAH7b8', 190, 190);
      studio.setManualOffset(-120);

      const draft = studio.saveCurrentAsDraft({
        title: 'Given Up (Rascunho de Teste)',
        artist: 'Linkin Park'
      });

      expect(draft.status).toBe('DRAFT');
      expect(draft.metadata.title).toBe('Given Up (Rascunho de Teste)');
      expect(draft.offsetMs).toBe(-120);

      // O jogador comum NÃO deve ver o rascunho na lista pública de músicas
      const publicSongs = songLibrary.getActiveSongs('international');
      const foundInPublic = publicSongs.find(s => s.id === draft.songId);
      expect(foundInPublic).toBeUndefined();
    });

    it('5.2. Deve PUBLICAR a música no catálogo e torná-la imediatamente jogável sem rebuild', async () => {
      const sngPath = path.resolve(__dirname, '../scratch/test.sng');
      if (!fs.existsSync(sngPath)) return;

      const sngBuf = fs.readFileSync(sngPath);
      await studio.importFile(sngBuf, 'Given Up.sng', 'CHORUS_ENCORE');
      studio.configureYouTubeAudio('0BW95UAH7b8', 190, 190);
      studio.setManualOffset(-120);

      const published = studio.publishToCatalog();
      expect(published.status).toBe('PUBLISHED');
      expect(published.publishedAt).toBeDefined();
      const songId = published.songId;

      // 1. SongLibrary deve incluir a música publicada imediatamente
      const allSongs = songLibrary.getAllSongs();
      const inSongLibrary = allSongs.find(s => s.id === songId);
      expect(inSongLibrary).toBeDefined();
      expect(inSongLibrary?.isAvailable).toBe(true);
      expect(inSongLibrary?.title).toBe('Given Up');
      expect(inSongLibrary?.artist).toBe('Linkin Park');

      // 2. BeatmapManager deve carregar as notas instantaneamente
      expect(beatmapManager.getBeatmap(songId, 'EASY').length).toBe(432);
      expect(beatmapManager.getBeatmap(songId, 'HARD').length).toBe(841);
      expect(beatmapManager.getBeatmap(songId, 'EXPERT').length).toBe(841);

      // 3. Registro de Sincronia deve estar configurado com -120ms
      const syncEntry = INTERNATIONAL_SYNC_REGISTRY[songId];
      expect(syncEntry).toBeDefined();
      expect(syncEntry.chartVideoOffsetMs).toBe(-120);
      expect(syncEntry.youtubeVideoId).toBe('0BW95UAH7b8');
    });

    it('5.3. Deve DESPUBLICAR (UNPUBLISHED) uma música, ocultando-a da lista jogável', async () => {
      const sngPath = path.resolve(__dirname, '../scratch/test.sng');
      if (!fs.existsSync(sngPath)) return;

      const sngBuf = fs.readFileSync(sngPath);
      await studio.importFile(sngBuf, 'Given Up.sng', 'CHORUS_ENCORE');
      studio.configureYouTubeAudio('0BW95UAH7b8', 190, 190);
      const published = studio.publishToCatalog();
      const songId = published.songId;

      // Confirma que estava publicada
      expect(songLibrary.getActiveSongs('international').some(s => s.id === songId)).toBe(true);

      // Despublica
      const unpublished = studio.unpublishSong(songId);
      expect(unpublished.status).toBe('UNPUBLISHED');

      // Confirma que agora não está mais ativa para os jogadores
      const activeList = songLibrary.getActiveSongs('international');
      expect(activeList.some(s => s.id === songId)).toBe(false);
    });

    it('5.4. Deve EXCLUIR uma música e purgar do BeatmapManager e SongLibrary', async () => {
      const sngPath = path.resolve(__dirname, '../scratch/test.sng');
      if (!fs.existsSync(sngPath)) return;

      const sngBuf = fs.readFileSync(sngPath);
      await studio.importFile(sngBuf, 'Given Up.sng', 'CHORUS_ENCORE');
      studio.configureYouTubeAudio('0BW95UAH7b8', 190, 190);
      const published = studio.publishToCatalog();
      const songId = published.songId;

      // Exclui
      const deleted = studio.deleteSong(songId);
      expect(deleted).toBe(true);

      expect(catalogService.getManagedSong(songId)).toBeUndefined();
      expect(songLibrary.getSongById(songId)).toBeUndefined();
      expect(studio.getManagedBeatmap(songId)).toBeNull();
    });
  });

  // ==========================================================================
  // SEÇÃO 6: EXPORTAÇÃO, BACKUP E IMPORTAÇÃO DE PACOTE JSON DO CATÁLOGO
  // ==========================================================================
  describe('6. Exportação e Importação de Pacote do Catálogo (rockbrazil-catalog.json)', () => {
    beforeEach(async () => {
      await studio.authenticateAdmin({ email: 'admin@rockbrazil.com.br' });
    });

    it('6.1. Deve exportar o catálogo gerenciado em formato JSON padronizado e auditável', async () => {
      const sngPath = path.resolve(__dirname, '../scratch/test.sng');
      if (!fs.existsSync(sngPath)) return;

      const sngBuf = fs.readFileSync(sngPath);
      await studio.importFile(sngBuf, 'Given Up.sng', 'CHORUS_ENCORE');
      studio.configureYouTubeAudio('0BW95UAH7b8', 190, 190);
      const published = studio.publishToCatalog();
      const songId = published.songId;

      const jsonStr = studio.exportCatalogBundle();
      expect(jsonStr).toBeDefined();

      const parsed = JSON.parse(jsonStr);
      expect(parsed.schemaVersion).toBe('1.0');
      expect(parsed.app).toBe('RockBrazil');
      expect(Array.isArray(parsed.songs)).toBe(true);
      expect(parsed.songs.length).toBeGreaterThanOrEqual(1);

      const songEntry = parsed.songs.find((s: any) => s.songId === songId);
      expect(songEntry).toBeDefined();
      expect(songEntry.metadata.title).toBe('Given Up');
      expect(songEntry.compactCharts).toBeDefined();
    });

    it('6.2. Deve restaurar catálogo a partir de bundle JSON com validação de esquema', () => {
      const mockBundle = {
        schemaVersion: '1.0',
        app: 'RockBrazil',
        exportDate: new Date().toISOString(),
        songs: [
          {
            songId: 'imported-test-song',
            metadata: {
              id: 'imported-test-song',
              title: 'Song From Backup',
              artist: 'Backup Artist',
              duration: 200,
              bpm: 130,
              style: 'Rock',
              type: 'youtube',
              youtubeVideoId: 'ABC123XYZ00',
              isAvailable: true,
              isInternational: true,
              records: { EASY: null, MEDIUM: null, HARD: null, EXPERT: null }
            },
            status: 'PUBLISHED',
            charter: 'Backup Charter',
            sourceProvider: 'CHORUS_ENCORE',
            compactCharts: {
              EASY: [],
              MEDIUM: [],
              HARD: [],
              EXPERT: [[1.0, 0, 0]]
            },
            noteCounts: { EASY: 0, MEDIUM: 0, HARD: 0, EXPERT: 1 },
            bpm: 130,
            durationSec: 200,
            offsetMs: 50,
            youtubeVideoId: 'ABC123XYZ00',
            createdAt: new Date().toISOString(),
            publishedAt: new Date().toISOString()
          }
        ]
      };

      const result = catalogService.importCatalogJson(JSON.stringify(mockBundle));
      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1);

      const restoredSong = catalogService.getManagedSong('imported-test-song');
      expect(restoredSong).toBeDefined();
      expect(restoredSong?.metadata.title).toBe('Song From Backup');
      expect(restoredSong?.status).toBe('PUBLISHED');

      // Verifica se o BeatmapManager e Studio refletiram a restauração
      const restoredBeatmap = studio.getManagedBeatmap('imported-test-song');
      expect(restoredBeatmap).toBeDefined();
      expect(restoredBeatmap?.EXPERT.length).toBe(1);
    });

    it('6.3. Deve registrar entradas no histórico de auditoria administrativa', () => {
      catalogService.addHistoryEntry({
        action: 'PUBLISH',
        songId: 'test-audit-song',
        songTitle: 'Audit Track',
        artist: 'Audit Artist',
        charter: 'Curator 1',
        source: 'CHORUS_ENCORE',
        details: 'Publicada após validação de Quality Gate.',
        user: 'admin@rockbrazil.com'
      });

      const history = studio.getImportHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
      const entry = history.find(h => h.songId === 'test-audit-song');
      expect(entry).toBeDefined();
      expect(entry?.action).toBe('PUBLISH');
      expect(entry?.user).toBe('admin@rockbrazil.com');
    });
  });
});
