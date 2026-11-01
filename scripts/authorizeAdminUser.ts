/**
 * ROCKBRAZIL — ATRIBUIÇÃO SEGURA DE PRIVILÉGIOS ADMINISTRATIVOS
 * 
 * Este script localiza o usuário existente 'startstk2@gmail.com' no Firebase Authentication
 * e atribui a Custom Claim { admin: true, role: 'SUPER_ADMIN' } usando o Firebase Admin SDK.
 * 
 * REGRAS DE SEGURANÇA:
 * 1. Não cria usuários adicionais.
 * 2. Preserva quaisquer Custom Claims preexistentes.
 * 3. Não expõe chaves ou senhas no código frontend ou no repositório.
 * 4. Valida a aplicação das claims após a gravação.
 * 
 * COMO EXECUTAR:
 *   npx tsx scripts/authorizeAdminUser.ts [caminho_para_chave_servico.json]
 * 
 * Exemplo:
 *   npx tsx scripts/authorizeAdminUser.ts ./serviceAccountKey.json
 */

import * as fs from 'fs';
import * as path from 'path';
import admin from 'firebase-admin';

const TARGET_EMAIL = 'startstk2@gmail.com';
const PROJECT_ID = 'rockbrazil-f6a99';

function initializeAdminSDK(): admin.app.App {
  if (admin.apps.length > 0 && admin.apps[0]) {
    return admin.apps[0];
  }

  // 1. Caminho passado por argumento CLI
  const cliPath = process.argv[2];
  if (cliPath && fs.existsSync(cliPath)) {
    console.log(`🔑 Usando chave de conta de serviço informada via CLI: ${cliPath}`);
    const serviceAccount = JSON.parse(fs.readFileSync(cliPath, 'utf-8'));
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: PROJECT_ID
    });
  }

  // 2. Variável de ambiente GOOGLE_APPLICATION_CREDENTIALS
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    console.log(`🔑 Usando credenciais de GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
    const serviceAccount = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf-8'));
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: PROJECT_ID
    });
  }

  // 3. Arquivo local serviceAccountKey.json na raiz do projeto (ignorado pelo git)
  const defaultLocalKey = path.resolve(process.cwd(), 'serviceAccountKey.json');
  if (fs.existsSync(defaultLocalKey)) {
    console.log(`🔑 Usando arquivo local padrão: serviceAccountKey.json`);
    const serviceAccount = JSON.parse(fs.readFileSync(defaultLocalKey, 'utf-8'));
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: PROJECT_ID
    });
  }

  // 4. Tentativa via Application Default Credentials (gcloud ADC)
  try {
    console.log('⏳ Tentando inicializar via Application Default Credentials (ADC)...');
    return admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: PROJECT_ID
    });
  } catch (err: any) {
    console.error('\n❌ ERRO: Nenhuma credencial administrativa encontrada!');
    console.log('------------------------------------------------------------------------');
    console.log('Para autorizar com segurança a sua conta Google:');
    console.log('1. Acesse o Console do Firebase:');
    console.log(`   https://console.firebase.google.com/project/${PROJECT_ID}/settings/serviceaccounts/adminsdk`);
    console.log('2. Clique em "Gerar nova chave privada" e salve o arquivo como:');
    console.log('   serviceAccountKey.json (na pasta raiz deste projeto).');
    console.log('   (O arquivo já está protegido no .gitignore e nunca será enviado ao GitHub).');
    console.log('3. Em seguida, execute este comando no terminal:');
    console.log('   npx tsx scripts/authorizeAdminUser.ts ./serviceAccountKey.json\n');
    process.exit(1);
  }
}

async function main() {
  console.log('🎸 ========================================================');
  console.log('   ROCKBRAZIL — AUTORIZAÇÃO DE CONTA ADMINISTRATIVA');
  console.log(`   Projeto: ${PROJECT_ID}`);
  console.log(`   Conta Alvo: ${TARGET_EMAIL}`);
  console.log('========================================================\n');

  const app = initializeAdminSDK();
  const auth = admin.auth(app);
  const db = admin.firestore(app);

  // 1. Localizar o usuário exclusivamente pelo e-mail
  console.log(`🔍 1. Buscando usuário existente pelo e-mail: ${TARGET_EMAIL}...`);
  let userRecord: admin.auth.UserRecord;

  try {
    userRecord = await auth.getUserByEmail(TARGET_EMAIL);
    console.log('✅ Usuário encontrado com sucesso no Firebase Authentication!');
    console.log(`   - UID: ${userRecord.uid}`);
    console.log(`   - E-mail: ${userRecord.email}`);
    console.log(`   - Nome: ${userRecord.displayName || '(Não definido)'}`);
    console.log(`   - E-mail Verificado: ${userRecord.emailVerified ? 'SIM' : 'NÃO'}`);
    console.log(`   - Criado em: ${userRecord.metadata.creationTime}`);
    console.log(`   - Último Login: ${userRecord.metadata.lastSignInTime}`);
  } catch (findErr: any) {
    if (findErr.message?.includes('Could not load the default credentials')) {
      console.error('\n❌ ERRO: O Firebase Admin SDK não encontrou credenciais autenticadas.');
      console.log('------------------------------------------------------------------------');
      console.log('COMO AUTORIZAR COM SEGURANÇA EM MENOS DE 1 MINUTO:');
      console.log('1. Acesse o Console do Firebase na página de Contas de Serviço:');
      console.log(`   https://console.firebase.google.com/project/${PROJECT_ID}/settings/serviceaccounts/adminsdk`);
      console.log('2. Clique no botão "Gerar nova chave privada" e salve o arquivo como:');
      console.log('   serviceAccountKey.json (na pasta do projeto c:\\Users\\David\\Downloads\\RockBrazil\\)');
      console.log('   (O arquivo serviceAccountKey.json já está protegido no .gitignore e não é versionado).');
      console.log('3. Em seguida, execute o script no terminal:');
      console.log('   npx tsx scripts/authorizeAdminUser.ts ./serviceAccountKey.json\n');
      process.exit(1);
    }

    if (findErr.code === 'auth/user-not-found') {
      console.error(`\n❌ ERRO: A conta "${TARGET_EMAIL}" não foi encontrada no projeto "${PROJECT_ID}".`);
      console.log('Por exigência de segurança ("Não crie outro usuário"), nenhuma conta foi criada.');
      console.log(`Certifique-se de fazer login ao menos uma vez no RockBrazil com essa conta Google para registrar o usuário.\n`);
      process.exit(2);
    }
    console.error('❌ Erro ao consultar usuário:', findErr.message);
    process.exit(1);
  }

  // 2. Preservar Custom Claims existentes e atribuir admin: true
  console.log('\n🔒 2. Inspecionando Custom Claims existentes...');
  const currentClaims = userRecord.customClaims || {};
  console.log('   Claims atuais:', JSON.stringify(currentClaims));

  const updatedClaims = {
    ...currentClaims,
    admin: true,
    role: currentClaims.role || 'SUPER_ADMIN'
  };

  console.log('⏳ Atribuindo Custom Claim { admin: true, role: "SUPER_ADMIN" }...');
  await auth.setCustomUserClaims(userRecord.uid, updatedClaims);
  console.log('✅ Custom Claims gravadas com sucesso no Firebase Auth!');

  // 3. Sincronizar registro correspondente em admin_users/{uid} no Firestore
  try {
    console.log('\n📄 3. Sincronizando documento em admin_users/' + userRecord.uid + ' no Firestore...');
    await db.collection('admin_users').doc(userRecord.uid).set({
      email: TARGET_EMAIL,
      role: 'SUPER_ADMIN',
      active: true,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log('✅ Documento admin_users sincronizado com sucesso no Firestore!');
  } catch (dbErr: any) {
    console.warn('⚠️ Alerta ao atualizar Firestore admin_users (o token Auth já é suficiente):', dbErr.message);
  }

  // 4. Confirmação e auditoria pós-execução
  console.log('\n🔍 4. Auditando confirmação final do usuário no Firebase Auth...');
  const refreshedUser = await auth.getUser(userRecord.uid);
  const verifiedClaims = refreshedUser.customClaims || {};
  console.log('   Claims confirmadas:', JSON.stringify(verifiedClaims));

  const isAdminConfirmed = verifiedClaims.admin === true;
  if (isAdminConfirmed) {
    console.log('\n🎉 ========================================================');
    console.log('   AUTORIZAÇÃO ADMINISTRATIVA CONFIRMADA COM SUCESSO!');
    console.log(`   Usuário: ${TARGET_EMAIL}`);
    console.log(`   UID:     ${userRecord.uid}`);
    console.log(`   Admin:   ${verifiedClaims.admin}`);
    console.log(`   Role:    ${verifiedClaims.role}`);
    console.log('========================================================\n');
    console.log('👉 Na próxima vez que fizer login com essa conta Google no RockBrazil,');
    console.log('   o botão do RockChart AI Studio aparecerá e o acesso estará liberado!\n');
    process.exit(0);
  } else {
    console.error('❌ Falha na confirmação: a claim "admin" não está presente.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Falha geral na execução do script:', err);
  process.exit(1);
});
