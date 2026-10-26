import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ProfileManager, OFFICIAL_AVATARS, getAvatarUrl, PlayerProfile } from '../src/game/profileManager';
import { SettingsManager } from '../src/game/settingsManager';
import { RankingService } from '../src/firebase/rankingService';
import { renderAvatarHtml } from '../src/ui/uiManager';
import { GameStats } from '../src/types';

// Polyfill localStorage in test environment if needed
if (typeof localStorage === 'undefined' || !(globalThis as any).localStorage?.getItem) {
  let store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

describe('ROCKBRAZIL V13.3.1 — 15 Avatares Oficiais, Silenciar ao Errar e Ranking Global', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // =========================================================================
  // FASE 2 & 3: OS 15 AVATARES OFICIAIS GRATUITOS
  // =========================================================================
  describe('Fase 2 & 3: Os 15 Avatares Oficiais Recortados e Gratuitos', () => {
    it('1. existem exatamente 15 arquivos de avatares WebP na pasta public/images/avatars/', () => {
      const avatarsDir = path.resolve(__dirname, '../public/images/avatars');
      expect(fs.existsSync(avatarsDir)).toBe(true);

      for (let i = 1; i <= 15; i++) {
        const num = String(i).padStart(2, '0');
        const file = path.join(avatarsDir, `avatar-${num}.webp`);
        expect(fs.existsSync(file), `Arquivo avatar-${num}.webp deve existir`).toBe(true);
        const stats = fs.statSync(file);
        expect(stats.size).toBeGreaterThan(5000); // Arquivo válido não vazio

        // Valida cabeçalho RIFF...WEBP
        const buffer = fs.readFileSync(file);
        const riff = buffer.toString('ascii', 0, 4);
        const webp = buffer.toString('ascii', 8, 12);
        expect(riff).toBe('RIFF');
        expect(webp).toBe('WEBP');
      }
    });

    it('2. existe o arquivo de validação preview.html gerado', () => {
      const previewFile = path.resolve(__dirname, '../public/images/avatars/preview.html');
      expect(fs.existsSync(previewFile)).toBe(true);
      const html = fs.readFileSync(previewFile, 'utf-8');
      expect(html).toContain('RockBrazil V13.3.1');
      expect(html).toContain('avatar-01.webp');
      expect(html).toContain('avatar-15.webp');
    });

    it('3. OFFICIAL_AVATARS contém exatamente 15 avatares registrados com IDs padronizados', () => {
      expect(OFFICIAL_AVATARS).toHaveLength(15);
      for (let i = 0; i < 15; i++) {
        const num = String(i + 1).padStart(2, '0');
        expect(OFFICIAL_AVATARS[i].id).toBe(`rockbrazil-avatar-${num}`);
        expect(OFFICIAL_AVATARS[i].file).toBe(`avatar-${num}.webp`);
        expect(OFFICIAL_AVATARS[i].url).toBe(`images/avatars/avatar-${num}.webp`);
      }
    });

    it('4. getAvatarUrl mapeia corretamente identificadores estáveis para caminhos de arquivo', () => {
      expect(getAvatarUrl('rockbrazil-avatar-01')).toBe('images/avatars/avatar-01.webp');
      expect(getAvatarUrl('rockbrazil-avatar-15')).toBe('images/avatars/avatar-15.webp');
      expect(getAvatarUrl('avatar-07.webp')).toBe('images/avatars/avatar-07.webp');
      expect(getAvatarUrl('https://lh3.googleusercontent.com/photo.jpg')).toBe('https://lh3.googleusercontent.com/photo.jpg');
      expect(getAvatarUrl(undefined)).toBe('images/avatars/avatar-01.webp');
    });

    it('5. renderAvatarHtml gera tags <img> seguras para avatares oficiais e preserva emojis legados', () => {
      const htmlOfficial = renderAvatarHtml('rockbrazil-avatar-03', 'test-class');
      expect(htmlOfficial).toContain('<img src="images/avatars/avatar-03.webp"');
      expect(htmlOfficial).toContain('class="test-class"');

      const htmlEmoji = renderAvatarHtml('🎸', 'test-class');
      expect(htmlEmoji).toContain('<span class="test-class-emoji">🎸</span>');

      const htmlGoogle = renderAvatarHtml('https://lh3.google.com/avatar.jpg', 'test-class');
      expect(htmlGoogle).toContain('<img src="https://lh3.google.com/avatar.jpg"');
    });

    it('6. a troca de avatar é totalmente gratuita e não altera o saldo de RockCoins', async () => {
      const pm = new ProfileManager();
      const profile = await pm.createProfile('Leo Rocker', 'rockbrazil-avatar-01');
      profile.rockCoins = 15;

      const updated = await pm.updateActiveAvatar('rockbrazil-avatar-08');
      expect(updated?.avatar).toBe('rockbrazil-avatar-08');
      expect(updated?.rockCoins).toBe(15); // Saldo estritamente intacto
      expect(pm.getActiveProfile().avatar).toBe('rockbrazil-avatar-08');
    });
  });

  // =========================================================================
  // FASE 6 & 7: SILENCIAR AO ERRAR ATIVADO POR PADRÃO
  // =========================================================================
  describe('Fase 6 & 7: Silenciar ao Errar Ativado por Padrão com Preservação de Escolhas', () => {
    it('7. SettingsManager inicializa muteOnMiss como TRUE por padrão para novos jogadores', () => {
      const sm = new SettingsManager();
      const settings = sm.getSettings();
      expect(settings.muteOnMiss).toBe(true);
    });

    it('8. SettingsManager define muteOnMiss como TRUE quando a preferência está ausente no localStorage', () => {
      // Salva configurações antigas que não possuíam a chave muteOnMiss
      localStorage.setItem('rockbrazil_settings', JSON.stringify({
        musicVolume: 0.9,
        sfxVolume: 0.8
      }));

      const sm = new SettingsManager();
      expect(sm.getSettings().muteOnMiss).toBe(true);
      expect(sm.getSettings().musicVolume).toBe(0.9);
    });

    it('9. SettingsManager respeita estritamente a escolha de quem desativou manualmente (muteOnMiss: false)', () => {
      localStorage.setItem('rockbrazil_settings', JSON.stringify({
        musicVolume: 0.85,
        muteOnMiss: false // Escolha deliberada do usuário
      }));

      const sm = new SettingsManager();
      expect(sm.getSettings().muteOnMiss).toBe(false); // NUNCA deve ser sobrescrito para true
    });

    it('10. SettingsManager respeita estritamente a escolha de quem ativou manualmente (muteOnMiss: true)', () => {
      localStorage.setItem('rockbrazil_settings', JSON.stringify({
        musicVolume: 0.85,
        muteOnMiss: true
      }));

      const sm = new SettingsManager();
      expect(sm.getSettings().muteOnMiss).toBe(true);
    });

    it('11. ProfileManager.GUEST_PROFILE e novos perfis iniciam com muteOnMiss = true', async () => {
      expect(ProfileManager.GUEST_PROFILE.settings.muteOnMiss).toBe(true);

      const pm = new ProfileManager();
      const newP = await pm.createProfile('Novo Rocker', 'rockbrazil-avatar-02');
      expect(newP.settings.muteOnMiss).toBe(true);
    });

    it('12. migração de perfis preserva muteOnMiss: false e aplica true apenas para preferências ausentes', () => {
      const pm = new ProfileManager();

      // Perfil legado sem settings.muteOnMiss
      const legacyWithoutMute: PlayerProfile = {
        id: 'legacy-1',
        name: 'Veterano 1',
        avatar: '🎸',
        createdAt: 1000,
        lastPlayedAt: 1000,
        settings: {
          musicVolume: 0.8,
          sfxVolume: 0.8,
          audioOffsetMs: 0,
          noteSpeedMultiplier: 1.0,
          visualEffectsEnabled: true
          // muteOnMiss ausente
        } as any,
        records: {},
        history: []
      };

      const mig1 = pm.migrateProfile(legacyWithoutMute, ['mam-1406']);
      expect(mig1.settings.muteOnMiss).toBe(true);

      // Perfil legado com muteOnMiss: false explícito
      const legacyWithFalse: PlayerProfile = {
        id: 'legacy-2',
        name: 'Veterano 2',
        avatar: '🎸',
        createdAt: 1000,
        lastPlayedAt: 1000,
        settings: {
          musicVolume: 0.8,
          sfxVolume: 0.8,
          audioOffsetMs: 0,
          noteSpeedMultiplier: 1.0,
          visualEffectsEnabled: true,
          muteOnMiss: false
        },
        records: {},
        history: []
      };

      const mig2 = pm.migrateProfile(legacyWithFalse, ['mam-1406']);
      expect(mig2.settings.muteOnMiss).toBe(false); // Preservado
    });
  });

  // =========================================================================
  // FASE 7 A 12: RANKING GLOBAL EXCLUSIVO PARA CONTAS GOOGLE
  // =========================================================================
  describe('Fase 7 a 12: Ranking Global Online Exclusivo para Contas Google', () => {
    it('13. RankingService.isEligibleForRanking rejeita convidados e contas não autenticadas com Google', () => {
      const guestProfile = { ...ProfileManager.GUEST_PROFILE };
      expect(RankingService.isEligibleForRanking(guestProfile)).toBe(false);

      const localGuestProfile: PlayerProfile = {
        id: 'profile_guest_123',
        name: 'Jogador Local',
        avatar: 'rockbrazil-avatar-01',
        createdAt: Date.now(),
        lastPlayedAt: Date.now(),
        settings: {
          musicVolume: 1, sfxVolume: 1, audioOffsetMs: 0,
          noteSpeedMultiplier: 1, visualEffectsEnabled: true, muteOnMiss: true
        },
        records: {},
        history: [],
        accountType: 'guest'
      };
      expect(RankingService.isEligibleForRanking(localGuestProfile)).toBe(false);
      expect(RankingService.isEligibleForRanking(null)).toBe(false);
    });

    it('14. submitRecordIfEligible recusa envio se o jogador for convidado', async () => {
      const guestProfile = { ...ProfileManager.GUEST_PROFILE };
      const stats: GameStats = {
        score: 50000, combo: 100, maxCombo: 100,
        perfectCount: 80, greatCount: 20, goodCount: 0, missCount: 0, accuracy: 100
      };

      const result = await RankingService.submitRecordIfEligible(
        guestProfile,
        'mam-1406',
        '1406',
        'Mamonas Assassinas',
        'HARD',
        stats,
        {
          isNewRecord: true,
          previousBestScore: 0,
          newScore: 50000,
          record: { score: 50000, stars: 5, accuracy: 100, maxCombo: 100, date: Date.now() }
        }
      );

      expect(result).toBe(false);
    });

    it('15. regras de segurança do Firestore contêm regras estritas para contas Google', () => {
      const rulesPath = path.resolve(__dirname, '../firestore.rules');
      expect(fs.existsSync(rulesPath)).toBe(true);
      const rules = fs.readFileSync(rulesPath, 'utf-8');

      // Verifica exigência de autenticação do Google
      expect(rules).toContain("request.auth.token.firebase.sign_in_provider == 'google.com'");
      expect(rules).toContain("match /rankings_summary/{userId}");
      expect(rules).toContain("match /rankings_song/{recordId}");
      expect(rules).toContain("request.auth.uid == userId");
      expect(rules).toContain("!('email' in request.resource.data)");
    });
  });

  // =========================================================================
  // FASE 13: ATUALIZAÇÃO DO TUTORIAL
  // =========================================================================
  describe('Fase 13: Atualização do Tutorial (Caderno)', () => {
    it('16. o título do tutorial é estritamente TUTORIAL (sem + AJUDA ou & AJUDA)', () => {
      const indexPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(indexPath, 'utf-8');

      expect(html).toContain('<h2 class="notebook-dialog-title">TUTORIAL</h2>');
      expect(html).not.toContain('<h2 class="notebook-dialog-title">TUTORIAL & AJUDA</h2>');
      expect(html).not.toContain('<h2 class="notebook-dialog-title">TUTORIAL + AJUDA</h2>');
    });

    it('17. o tutorial explica detalhadamente RockCoins, regras de ganho e exemplo prático', () => {
      const indexPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(indexPath, 'utf-8');

      expect(html).toContain('O que são RockCoins?');
      expect(html).toContain('Como Ganhar RockCoins?');
      expect(html).toContain('+1 RockCoin');
      expect(html).toContain('+2 RockCoins');
      expect(html).toContain('+3 RockCoins');
      expect(html).toContain('5 no total');
      expect(html).toContain('5 RockCoins');
      expect(html).toContain('Você completou uma música no Expert com Full Combo e ganhou 5 RockCoins. Agora já pode desbloquear uma nova música!');
    });

    it('18. o tutorial explica o sistema de 1 a 5 estrelas com base na precisão ponderada', () => {
      const indexPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(indexPath, 'utf-8');

      expect(html).toContain('Como Funcionam as Estrelas?');
      expect(html).toContain('95% ou mais');
      expect(html).toContain('85% a 94%');
      expect(html).toContain('70% a 84%');
      expect(html).toContain('55% a 69%');
    });

    it('19. o tutorial inclui as seções de Silenciar ao Errar, Perfis com 15 Avatares e Ranking Google', () => {
      const indexPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(indexPath, 'utf-8');

      expect(html).toContain('Silenciar ao Errar:');
      expect(html).toContain('ativada por padrão');
      expect(html).toContain('Perfis de Jogadores & 15 Avatares Oficiais:');
      expect(html).toContain('100% gratuitos');
      expect(html).toContain('Ranking Global (Exclusivo Google):');
      expect(html).not.toContain('PRATICAR');
    });

    it('20. os modais de seleção de avatares e ranking global estão presentes no DOM', () => {
      const indexPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(indexPath, 'utf-8');

      expect(html).toContain('id="modal-select-avatar"');
      expect(html).toContain('ESCOLHA SEU AVATAR');
      expect(html).toContain('id="btn-confirm-avatar"');
      expect(html).toContain('id="btn-cancel-avatar"');
      expect(html).toContain('id="modal-global-ranking"');
      expect(html).toContain('RANKING GLOBAL');
      expect(html).toContain('EXCLUSIVO GOOGLE');
    });
  });
});
