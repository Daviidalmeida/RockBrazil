import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AdminAuthService } from '../src/firebase/adminAuthService';
import { RockChartStudio } from '../src/game/rockchart/studio/rockChartStudio';
import { firebaseConfig } from '../src/firebase/firebaseConfig';
import { User } from 'firebase/auth';

// Mock DOM elements para ambiente Node / Headless
const mockElements: Record<string, any> = {};

const setupMockElement = (id: string, initialClasses: string[] = [], initialStyle: Record<string, string> = {}) => {
  const classes = new Set<string>(initialClasses);
  const element = {
    id,
    style: { ...initialStyle },
    classList: {
      add: (cls: string) => classes.add(cls),
      remove: (cls: string) => classes.delete(cls),
      toggle: (cls: string, force?: boolean) => {
        if (force === true) classes.add(cls);
        else if (force === false) classes.delete(cls);
        else if (classes.has(cls)) classes.delete(cls);
        else classes.add(cls);
        return classes.has(cls);
      },
      contains: (cls: string) => classes.has(cls)
    }
  };
  mockElements[id] = element;
  return element;
};

if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    getElementById: (id: string) => mockElements[id] || null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

describe('ROCKBRAZIL — VISIBILIDADE DO BOTÃO ADMINISTRATIVO E VALIDAÇÃO DE CUSTOM CLAIMS', () => {
  beforeEach(() => {
    RockChartStudio.resetInstance();
    AdminAuthService.setActiveAdminUserForTest(null);
  });

  // =========================================================================
  // 1. CONEXÃO COM O PROJETO FIREBASE CORRETO (TAREFA 4)
  // =========================================================================
  describe('1. Verificação do Projeto Firebase', () => {
    it('1.1. Deve estar configurado exatamente para o projeto rockbrazil-f6a99', () => {
      expect(firebaseConfig.projectId).toBe('rockbrazil-f6a99');
      expect(firebaseConfig.authDomain).toBe('rockbrazil-f6a99.firebaseapp.com');
      expect(firebaseConfig.storageBucket).toBe('rockbrazil-f6a99.firebasestorage.app');
    });
  });

  // =========================================================================
  // 2. VALIDAÇÃO DE CUSTOM CLAIMS & getIdTokenResult(true) (TAREFAS 2, 3, 6, 7)
  // =========================================================================
  describe('2. Validação de Custom Claims e Atualização de Token', () => {
    it('2.1. Deve chamar getIdTokenResult(true) para forçar leitura de claims atualizadas no servidor', async () => {
      let forceRefreshArgPassed: boolean | undefined = undefined;

      const mockAdminUser = {
        uid: 'user_startstk2_uid',
        email: 'startstk2@gmail.com',
        displayName: 'Administrador RockBrazil',
        getIdTokenResult: vi.fn(async (forceRefresh?: boolean) => {
          forceRefreshArgPassed = forceRefresh;
          return {
            claims: {
              admin: true,
              role: 'SUPER_ADMIN'
            }
          };
        })
      } as unknown as User;

      const verification = await AdminAuthService.verifyAdminStatus(mockAdminUser, true);

      expect(mockAdminUser.getIdTokenResult).toHaveBeenCalled();
      expect(forceRefreshArgPassed).toBe(true);
      expect(verification.isAdmin).toBe(true);
      expect(verification.role).toBe('SUPER_ADMIN');
      expect(verification.method).toBe('CUSTOM_CLAIM');
    });

    it('2.2. Deve reconhecer admin: true e conceder papel SUPER_ADMIN', async () => {
      const mockAdminUser = {
        uid: 'uid_admin_custom_claim',
        email: 'startstk2@gmail.com',
        getIdTokenResult: vi.fn(async () => ({
          claims: { admin: true }
        }))
      } as unknown as User;

      const verification = await AdminAuthService.verifyAdminStatus(mockAdminUser, true);
      expect(verification.isAdmin).toBe(true);
      expect(verification.role).toBe('SUPER_ADMIN');
    });

    it('2.3. Deve reconhecer role: SUPER_ADMIN nas claims', async () => {
      const mockAdminUser = {
        uid: 'uid_admin_super_role',
        email: 'startstk2@gmail.com',
        getIdTokenResult: vi.fn(async () => ({
          claims: { role: 'SUPER_ADMIN' }
        }))
      } as unknown as User;

      const verification = await AdminAuthService.verifyAdminStatus(mockAdminUser, true);
      expect(verification.isAdmin).toBe(true);
      expect(verification.role).toBe('SUPER_ADMIN');
    });

    it('2.4. NÃO deve autorizar usuário comum apenas por ter formato de e-mail semelhante (Tarefa 7)', async () => {
      const mockCommonUser = {
        uid: 'uid_common_player',
        email: 'jogador_rock@gmail.com',
        getIdTokenResult: vi.fn(async () => ({
          claims: {} // Sem claims administrativas
        }))
      } as unknown as User;

      const verification = await AdminAuthService.verifyAdminStatus(mockCommonUser, true);
      expect(verification.isAdmin).toBe(false);
      expect(verification.error).toContain('não possui privilégios');
    });

    it('2.5. NÃO deve autorizar atacante que tenta falsificar e-mail contendo "admin" sem claims (Tarefa 7)', async () => {
      const mockAttacker = {
        uid: 'uid_fake_admin',
        email: 'admin.hacker@gmail.com',
        getIdTokenResult: vi.fn(async () => ({
          claims: {}
        }))
      } as unknown as User;

      const verification = await AdminAuthService.verifyAdminStatus(mockAttacker, true);
      expect(verification.isAdmin).toBe(false);
    });
  });

  // =========================================================================
  // 3. SINCRONIZAÇÃO EM MEMÓRIA & OBSERVAÇÃO (TAREFAS 1, 2, 8)
  // =========================================================================
  describe('3. Sincronização em Memória e Notificação de Listeners', () => {
    it('3.1. syncWithFirebaseUser deve atualizar o usuário ativo em memória e notificar listeners', async () => {
      const mockAdminUser = {
        uid: 'startstk2_uid_real',
        email: 'startstk2@gmail.com',
        displayName: 'Davi Admin',
        getIdTokenResult: vi.fn(async () => ({
          claims: { admin: true, role: 'SUPER_ADMIN' }
        }))
      } as unknown as User;

      let listenerNotified = false;
      let notifiedUserEmail = '';

      const unsubscribe = AdminAuthService.onAuthStateChanged((admin) => {
        listenerNotified = true;
        notifiedUserEmail = admin?.email || '';
      });

      const result = await AdminAuthService.syncWithFirebaseUser(mockAdminUser, true);

      expect(result).not.toBeNull();
      expect(result?.email).toBe('startstk2@gmail.com');
      expect(result?.role).toBe('SUPER_ADMIN');
      expect(AdminAuthService.getActiveAdminUser()?.email).toBe('startstk2@gmail.com');
      expect(listenerNotified).toBe(true);
      expect(notifiedUserEmail).toBe('startstk2@gmail.com');

      unsubscribe();
    });

    it('3.2. Sincronizar usuário comum deve zerar credenciais ativas e notificar null', async () => {
      // Primeiro define um admin
      AdminAuthService.setActiveAdminUserForTest({
        uid: 'temp_admin',
        email: 'startstk2@gmail.com',
        authProvider: 'password',
        role: 'SUPER_ADMIN'
      });

      let notifiedWithNull = false;
      const unsubscribe = AdminAuthService.onAuthStateChanged((admin) => {
        if (admin === null) notifiedWithNull = true;
      });

      const commonUser = {
        uid: 'common_uid',
        email: 'player@gmail.com',
        getIdTokenResult: vi.fn(async () => ({ claims: {} }))
      } as unknown as User;

      const result = await AdminAuthService.syncWithFirebaseUser(commonUser, true);

      expect(result).toBeNull();
      expect(AdminAuthService.getActiveAdminUser()).toBeNull();
      expect(notifiedWithNull).toBe(true);

      unsubscribe();
    });

    it('3.3. RockChartStudio sincroniza automaticamente com AdminAuthService', async () => {
      const studio = RockChartStudio.getInstance();
      expect(studio.isAdminAuthenticated()).toBe(false);

      const mockAdminUser = {
        uid: 'studio_sync_uid',
        email: 'startstk2@gmail.com',
        getIdTokenResult: vi.fn(async () => ({
          claims: { admin: true, role: 'SUPER_ADMIN' }
        }))
      } as unknown as User;

      await AdminAuthService.syncWithFirebaseUser(mockAdminUser, true);

      expect(studio.isAdminAuthenticated()).toBe(true);
      expect(studio.getAdminUser()?.email).toBe('startstk2@gmail.com');
    });
  });

  // =========================================================================
  // 4. VISIBILIDADE DO BOTÃO ROCKCHART STUDIO (TAREFAS 5, 6)
  // =========================================================================
  describe('4. Visibilidade dos Botões no DOM (Menu Principal e Configurações)', () => {
    let mockBtnSettings: any;
    let mockBtnMenu: any;

    beforeEach(() => {
      mockBtnSettings = setupMockElement('btn-open-rockchart-studio', [], { display: 'none' });
      mockBtnMenu = setupMockElement('btn-menu-rockchart-studio', ['admin-header-pill', 'hidden'], { display: 'none' });
    });

    const updateVisibility = () => {
      const isAdmin = !!AdminAuthService.getActiveAdminUser();
      const btnSettings = document.getElementById('btn-open-rockchart-studio');
      if (btnSettings) {
        btnSettings.style.display = isAdmin ? 'block' : 'none';
      }
      const btnMenu = document.getElementById('btn-menu-rockchart-studio');
      if (btnMenu) {
        btnMenu.classList.toggle('hidden', !isAdmin);
        btnMenu.style.display = isAdmin ? 'flex' : 'none';
      }
    };

    it('4.1. Para visitante ou usuário comum, botões permanecem estritamente ocultos', () => {
      AdminAuthService.setActiveAdminUserForTest(null);
      updateVisibility();

      expect(mockBtnSettings.style.display).toBe('none');
      expect(mockBtnMenu.classList.contains('hidden')).toBe(true);
      expect(mockBtnMenu.style.display).toBe('none');
    });

    it('4.2. Para administrador autorizado (startstk2@gmail.com), botões tornam-se visíveis automaticamente', () => {
      AdminAuthService.setActiveAdminUserForTest({
        uid: 'user_startstk2_uid',
        email: 'startstk2@gmail.com',
        authProvider: 'password',
        role: 'SUPER_ADMIN',
        sessionExpiry: Date.now() + 3600000
      });

      updateVisibility();

      expect(mockBtnSettings.style.display).toBe('block');
      expect(mockBtnMenu.classList.contains('hidden')).toBe(false);
      expect(mockBtnMenu.style.display).toBe('flex');
    });

    it('4.3. Ao deslogar (signOutAdmin), os botões voltam a ficar imediatamente ocultos', async () => {
      AdminAuthService.setActiveAdminUserForTest({
        uid: 'user_startstk2_uid',
        email: 'startstk2@gmail.com',
        authProvider: 'password',
        role: 'SUPER_ADMIN'
      });
      updateVisibility();
      expect(mockBtnSettings.style.display).toBe('block');

      await AdminAuthService.signOutAdmin();
      updateVisibility();

      expect(mockBtnSettings.style.display).toBe('none');
      expect(mockBtnMenu.classList.contains('hidden')).toBe(true);
    });
  });

  // =========================================================================
  // 5. AUDITORIA DE ESTRUTURA DOS ARQUIVOS (HTML & CSS)
  // =========================================================================
  describe('5. Auditoria de Arquivos HTML e CSS', () => {
    it('5.1. index.html contém tanto btn-open-rockchart-studio quanto btn-menu-rockchart-studio', () => {
      const htmlPath = path.resolve(__dirname, '../index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');

      expect(html).toContain('id="btn-open-rockchart-studio"');
      expect(html).toContain('id="btn-menu-rockchart-studio"');
      expect(html).toContain('class="admin-header-pill hidden"');
    });

    it('5.2. style.css define as regras de estilo para .admin-header-pill', () => {
      const cssPath = path.resolve(__dirname, '../src/style.css');
      const css = fs.readFileSync(cssPath, 'utf-8');

      expect(css).toContain('.admin-header-pill');
      expect(css).toContain('.admin-header-pill.hidden');
      expect(css).toContain('background: linear-gradient(135deg, rgba(255, 107, 0');
    });
  });
});
