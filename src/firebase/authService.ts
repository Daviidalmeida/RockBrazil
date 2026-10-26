import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInAnonymously,
  linkWithPopup,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { auth } from './firebaseConfig';

export type AuthPreference = 'google' | 'guest';

const STORAGE_KEY_AUTH_PREF = 'rb_auth_preference';
const memoryStorage: Record<string, string> = {};

export class AuthService {
  private static googleProvider = new GoogleAuthProvider();

  public static getSavedAuthPreference(): AuthPreference | null {
    try {
      if (typeof localStorage !== 'undefined' && localStorage !== null) {
        const val = localStorage.getItem(STORAGE_KEY_AUTH_PREF);
        if (val === 'google' || val === 'guest') return val;
      }
    } catch {
      // fallback to memory
    }
    const memVal = memoryStorage[STORAGE_KEY_AUTH_PREF];
    return memVal === 'google' || memVal === 'guest' ? memVal : null;
  }

  public static setSavedAuthPreference(pref: AuthPreference | null): void {
    try {
      if (typeof localStorage !== 'undefined' && localStorage !== null) {
        if (pref) {
          localStorage.setItem(STORAGE_KEY_AUTH_PREF, pref);
        } else {
          localStorage.removeItem(STORAGE_KEY_AUTH_PREF);
        }
      }
    } catch {
      // fallback to memory
    }
    if (pref) {
      memoryStorage[STORAGE_KEY_AUTH_PREF] = pref;
    } else {
      delete memoryStorage[STORAGE_KEY_AUTH_PREF];
    }
  }

  /**
   * Autentica com conta Google via Firebase Authentication.
   * Suporta fallback para fluxo seguro em navegadores móveis/Safari.
   */
  public static async signInWithGoogle(): Promise<{ user: User | null; error?: string }> {
    if (!auth) {
      return { user: null, error: 'Firebase Auth não inicializado.' };
    }

    try {
      const result = await signInWithPopup(auth, this.googleProvider);
      this.setSavedAuthPreference('google');
      return { user: result.user };
    } catch (err: any) {
      // Se popup for bloqueado (comum no iOS Safari), tenta redirect se aplicável
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
        try {
          await signInWithRedirect(auth, this.googleProvider);
          return { user: null };
        } catch (redirectErr: any) {
          console.warn('[AuthService] Fallback redirect falhou:', redirectErr);
        }
      }
      console.warn('[AuthService] Erro no login Google:', err);
      return { user: null, error: err.message || 'Falha ao autenticar com Google.' };
    }
  }

  /**
   * Autentica como Convidado (Anônimo no Firebase se disponível, ou offline local).
   */
  public static async signInAsGuest(): Promise<{ user: User | null; isOfflineGuest: boolean }> {
    this.setSavedAuthPreference('guest');

    if (!auth) {
      return { user: null, isOfflineGuest: true };
    }

    try {
      const result = await signInAnonymously(auth);
      return { user: result.user, isOfflineGuest: false };
    } catch (err) {
      console.warn('[AuthService] Autenticação anônima Firebase offline; continuando como convidado local:', err);
      return { user: null, isOfflineGuest: true };
    }
  }

  /**
   * Vincula um usuário anônimo (convidado) com uma conta Google.
   */
  public static async linkGuestWithGoogle(): Promise<{ user: User | null; error?: string; alreadyInUse?: boolean }> {
    if (!auth || !auth.currentUser) {
      return { user: null, error: 'Nenhum usuário ativo para vincular.' };
    }

    try {
      const result = await linkWithPopup(auth.currentUser, this.googleProvider);
      this.setSavedAuthPreference('google');
      return { user: result.user };
    } catch (err: any) {
      if (err.code === 'auth/credential-already-in-use') {
        return { user: null, alreadyInUse: true, error: 'Esta conta Google já possui um perfil salvo.' };
      }
      return { user: null, error: err.message || 'Erro ao vincular conta Google.' };
    }
  }

  /**
   * Desconecta o usuário ativo e remove a preferência de autenticação.
   */
  public static async signOutUser(): Promise<void> {
    this.setSavedAuthPreference(null);
    if (auth && auth.currentUser) {
      try {
        await signOut(auth);
      } catch (err) {
        console.warn('[AuthService] Erro ao deslogar:', err);
      }
    }
  }

  /**
   * Obtém o usuário atual autenticado no Firebase.
   */
  public static getCurrentUser(): User | null {
    return auth ? auth.currentUser : null;
  }

  /**
   * Observa mudanças no estado de autenticação.
   */
  public static onAuthChange(callback: (user: User | null) => void): () => void {
    if (!auth) {
      callback(null);
      return () => {};
    }
    return onAuthStateChanged(auth, callback);
  }
}
