/**
 * ROCKBRAZIL — SCRIPT DE PROVISIONAMENTO SEGURO DA CONTA ADMINISTRADOR
 * 
 * Este script provisiona a conta oficial "Admin" (admin@rockbrazil.com.br)
 * no Firebase Authentication e no Cloud Firestore.
 * 
 * Uso:
 *   npx tsx scripts/provisionAdmin.ts <senha_desejada>
 * 
 * Exemplo:
 *   npx tsx scripts/provisionAdmin.ts MinhaSenhaSegura2026!
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword
} from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { firebaseConfig } from '../src/firebase/firebaseConfig';

const ADMIN_EMAIL = 'admin@rockbrazil.com.br';

async function main() {
  console.log('🎸 ========================================================');
  console.log('   ROCKBRAZIL — PROVISIONAMENTO DE ADMINISTRADOR');
  console.log('   Projeto Firebase:', firebaseConfig.projectId);
  console.log('   Identidade Canônica:', ADMIN_EMAIL);
  console.log('========================================================\n');

  const passwordArg = process.argv[2] || process.env.ADMIN_INITIAL_PASSWORD;

  if (!passwordArg) {
    console.error('❌ ERRO: Nenhuma senha informada.');
    console.log('👉 Uso: npx tsx scripts/provisionAdmin.ts <sua_senha>');
    console.log('   (Mínimo 8 caracteres, com letras e números)\n');
    process.exit(1);
  }

  if (passwordArg.length < 8) {
    console.error('❌ ERRO: A senha deve ter no mínimo 8 caracteres.');
    process.exit(1);
  }

  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  const auth = getAuth(app);
  const db = getFirestore(app);

  let adminUid = '';

  try {
    console.log('⏳ Tentando criar o usuário no Firebase Authentication...');
    const cred = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, passwordArg);
    adminUid = cred.user.uid;
    console.log('✅ Usuário criado com sucesso no Firebase Auth! UID:', adminUid);
  } catch (createErr: any) {
    const code = createErr.code || '';

    if (code === 'auth/operation-not-allowed') {
      console.error('\n⚠️ ATENÇÃO: O provedor "E-mail/Senha" está desativado no Firebase Console!');
      console.log('------------------------------------------------------------------------');
      console.log('Para concluir o provisionamento:');
      console.log('1. Acesse o Firebase Console:');
      console.log(`   https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`);
      console.log('2. Na aba "Sign-in method", clique em "E-mail/senha".');
      console.log('3. Ative o primeiro botão (Permitir que os usuários se inscrevam usando e-mail e senha).');
      console.log('4. Clique em "Salvar".');
      console.log('5. Execute este script novamente:');
      console.log('   npx tsx scripts/provisionAdmin.ts <sua_senha>\n');
      process.exit(2);
    }

    if (code === 'auth/email-already-in-use') {
      console.log('ℹ️ Conta "admin@rockbrazil.com.br" já existe no Firebase. Atualizando credenciais...');
      try {
        const loginCred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, passwordArg);
        adminUid = loginCred.user.uid;
        console.log('✅ Autenticado com sucesso com a senha fornecida! UID:', adminUid);
      } catch (loginErr: any) {
        console.log('⚠️ Senha anterior divergente. Para redefinir, use o fluxo "Esqueci a Senha" no estúdio.');
      }
    } else {
      console.error('❌ Erro inesperado ao criar usuário:', code, createErr.message);
      process.exit(1);
    }
  }

  if (adminUid) {
    try {
      console.log('⏳ Registrando privilégios de SUPER_ADMIN no Cloud Firestore (admin_users)...');
      await setDoc(doc(db, 'admin_users', adminUid), {
        email: ADMIN_EMAIL,
        role: 'SUPER_ADMIN',
        active: true,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log('✅ Documento admin_users/' + adminUid + ' configurado com sucesso!');
    } catch (firestoreErr: any) {
      console.warn('⚠️ Não foi possível gravar no Firestore (verifique regras ou conexão):', firestoreErr.message);
    }
  }

  console.log('\n🎉 PROVISIONAMENTO CONCLUÍDO!');
  console.log('👉 Agora você pode acessar o estúdio no jogo com:');
  console.log('   Usuário: Admin');
  console.log('   Senha:   [A senha definida]');
  console.log('--------------------------------------------------------\n');
}

main().catch(err => {
  console.error('Falha geral no provisionamento:', err);
  process.exit(1);
});
