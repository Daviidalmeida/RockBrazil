import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyDl0h8C0Co3_hpz8NReJ-XTczsZfbeQiBE",
  authDomain: "rockbrazil-f6a99.firebaseapp.com",
  projectId: "rockbrazil-f6a99",
  storageBucket: "rockbrazil-f6a99.firebasestorage.app",
  messagingSenderId: "751707580357",
  appId: "1:751707580357:web:efd97a6e701cbc6c3ccdac"
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

try {
  if (typeof window !== 'undefined') {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (err) {
  console.warn('[Firebase] Inicialização adiada ou operando em modo offline:', err);
}

export { app, auth, db };
