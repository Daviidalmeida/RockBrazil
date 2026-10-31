# ROCKBRAZIL — PLANO ARQUITETURAL PARA APLICATIVO ANDROID
**Versão:** V13.8.4  
**Data:** Outubro de 2026  
**Status:** Planejamento e Preparação Arquitetural (Sem geração prematura de APK)  
**Autor:** Antigravity / DeepMind Pair Programming  
**Repositório:** Daviidalmeida/RockBrazil  

---

## 1. VISÃO GERAL E ESCOLHA DE RUNTIME HÍBRIDO

O **RockBrazil** foi concebido e estabilizado como uma aplicação web moderna (SPA em TypeScript, Vite e Canvas 2D de alta taxa de quadros). Para a transição ao ecossistema Android nativo sem reescrever a base de código aprovada nem fragmentar a lógica de gameplay, a arquitetura escolhida é o **Capacitor 6+ da Ionic**, envelopando o frontend em um **Android System WebView** com ponte nativa (*native bridge*).

### Por que Capacitor sobre React Native ou Flutter:
1. **Reaproveitamento de 100% da Engine de Gameplay:** O pipeline de renderização em Canvas 2D (`renderer.ts`), a timeline de alta precisão (`musicTimeline.ts`), o mapeador de cinco pistas e os analisadores de áudio/sincronização funcionam integralmente sem refatoração.
2. **Desempenho Comprovado em Canvas 2D:** O Android WebView moderno (baseado em Chromium 88+) executa operações de Canvas 2D com aceleração total de GPU por meio de skia/Vulkan.
3. **Ponte Nativa Leve:** O Capacitor introduz sobrecarga mínima de memória (< 15 MB) e não impõe abstrações de bridge assíncrona pesada como versões antigas do Cordova.
4. **Requisitos Mínimos de Sistema:**
   - **Android Mínimo (minSdkVersion):** Android 7.0 (API 24, Nougat) — cobre > 96% dos dispositivos ativos.
   - **Target SDK (targetSdkVersion):** Android 14 (API 34) — em total conformidade com as diretrizes da Google Play Store para 2026.
   - **Chromium WebView Version:** >= 88.0.

---

## 2. ACELERAÇÃO POR HARDWARE E CONFIGURAÇÃO DA WEBVIEW

Para assegurar 60 FPS estáveis mesmo em aparelhos de entrada e 90Hz/120Hz em smartphones modernos, a camada nativa Android deve configurar explicitamente:

### Configurações no `AndroidManifest.xml`:
```xml
<application
    android:hardwareAccelerated="true"
    android:largeHeap="true"
    android:icon="@mipmap/ic_launcher"
    android:label="RockBrazil"
    android:roundIcon="@mipmap/ic_launcher_round"
    android:theme="@style/AppTheme.NoActionBar">
    
    <activity
        android:name=".MainActivity"
        android:screenOrientation="portrait"
        android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
        android:windowSoftInputMode="adjustResize"
        android:exported="true">
        <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent-filter>
    </activity>
</application>
```

### Otimizações na `MainActivity.java` / `MainActivity.kt`:
```kotlin
val webSettings = bridge.webView.settings
webSettings.javaScriptEnabled = true
webSettings.domStorageEnabled = true
webSettings.databaseEnabled = true
webSettings.setRenderPriority(WebSettings.RenderPriority.HIGH)
webSettings.setEnableSmoothTransition(true)
webSettings.mediaPlaybackRequiresUserGesture = false

// Habilitação de aceleração de camada
bridge.webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
```

---

## 3. ARQUITETURA DE ÁUDIO DE BAIXA LATÊNCIA

A precisão rítmica do RockBrazil exige que o atraso de áudio (*audio latency*) entre o toque do usuário e a resposta sonora seja inferior a 25 milissegundos.

### 1. Web Audio API no Android
- No Android WebView moderno, o `AudioContext` opera nativamente sobre a pilha de baixa latência **AAudio** / **OpenSL ES**.
- Parâmetro obrigatório na inicialização do contexto:
  ```typescript
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
    latencyHint: 'interactive',
    sampleRate: 44100
  });
  ```
- **Retomada de Áudio (Audio Unlock):** Garantir que o primeiro toque do usuário na tela de início invoque `audioCtx.resume()`.

### 2. Gestão de Foco de Áudio (`AudioManager.OnAudioFocusChangeListener`)
- Em dispositivos móveis, chamadas telefônicas, alarmes ou notificações podem solicitar o foco de áudio nativo.
- Plugin Capacitor de ciclo de vida (`@capacitor/app`):
  ```typescript
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      gameEngine.pauseGame();
      audioManager.suspendAudio();
    } else {
      audioManager.resumeAudio();
    }
  });
  ```

### 3. Compensação de Latência Específica do Android
- Smartphones Android possuem diferentes latências de hardware (alto-falantes integrados: ~15-30ms; fones cabeados: ~10ms; fones Bluetooth SBC/AAC: ~120-250ms).
- A tela de **Calibração de Áudio** existente no RockBrazil (`calibrationManager.ts`) já permite ao jogador calibrar o deslocamento manual (offset de -300ms a +300ms).
- Para a versão Android, o valor padrão inicial de offset será calibrado para **-20ms** para compensar o atraso médio de buffer do pipeline AAudio.

---

## 4. INTEGRAÇÃO COMPATÍVEL COM YOUTUBE IFRAME NO ANDROID

A aba de Músicas Internacionais do RockBrazil utiliza a API oficial do YouTube IFrame Player para streaming de áudio/vídeo. No Android WebView, devem ser seguidas as regras estritas da Google:

### 1. Requisitos de Origem e Domínio
- O YouTube IFrame API bloqueia requisições originadas de schemas customizados inválidos (`file://`).
- No Capacitor, o app roda sob o domínio seguro:
  ```json
  // capacitor.config.json
  {
    "appId": "com.rockbrazil.game",
    "appName": "RockBrazil",
    "webDir": "dist",
    "server": {
      "androidScheme": "https",
      "hostname": "localhost"
    }
  }
  ```
- O parâmetro `origin=https://localhost` satisfaz plenamente as verificações de CORS e IFrame do YouTube.

### 2. Dimensões Mínimas e Transparência
- Mantida a regra estabelecida na V13.8.4: dimensões estritas de **200x200 pixels CSS** (`.yt-miniplayer-box`), permitindo visualização discreta do vídeo oficial sem infringir as diretrizes de incorporação do YouTube (que proíbem ocultar totalmente o player ou reduzir abaixo de 200x200).
- Fundo semitransparente discreto (`rgba(0, 0, 0, 0.8)`) e borda sutil de 1px.

### 3. Permissões de Reprodução em Background
- Vídeos do YouTube só reproduzirão enquanto o app estiver no primeiro plano com a tela ativa (em total conformidade com os Termos de Serviço da API do YouTube).

---

## 5. FIREBASE AUTHENTICATION & FIRESTORE NO ANDROID

### 1. Autenticação Google e Anônima
- **Login Anônimo:** Funciona diretamente via SDK Web JS já embutido no projeto (`firebase/auth`), sem necessidade de configuração adicional.
- **Google Sign-In Nativo:**
  Para evitar problemas de *User-Agent* restrito do Google em WebViews convencionais (bloqueio 403 `disallowed_useragent`), a versão Android utilizará o plugin oficial:
  - `@capacitor-firebase/authentication` ou `@capacitor-community/google-sign-in`.
  - O fluxo nativo utiliza as APIs do Google Play Services (`CredentialManager` / `GoogleSignInClient`), obtém o `idToken` e o entrega para `signInWithCredential(auth, GoogleAuthProvider.credential(idToken))`.

### 2. Registro de Certificados SHA-1 e SHA-256 no Firebase Console
- Para habilitar o login nativo do Google, a keystore de desenvolvimento (`debug.keystore`) e a keystore oficial de produção (Release Keystore) devem ter suas impressões digitais SHA-1 e SHA-256 cadastradas no projeto Firebase `rockbrazil-official`.
- Download e inserção do `google-services.json` no diretório `android/app/`.

---

## 6. PERSISTÊNCIA LOCAL, SINCRONIZAÇÃO EM NUVEM E CACHE OFFLINE

### 1. Camada Dupla de Armazenamento
- **Primária:** `IndexedDB` e `localStorage` já implementados com fallback automático.
- **Nativa (Android):** `@capacitor/preferences` como fallback resiliente contra limpeza de cache do sistema operacional.
- O indicador de sincronização em nuvem da V13.8.2 (`sync-status-indicator`) opera identicamente no Android, exibindo ícone verde de nuvem com check quando os scores e RockCoins forem persistidos no Firestore.

### 2. Funcionamento Offline
- As 12 músicas nacionais com charts JSON embutidos (`dist/assets/*.json`) e áudios locais funcionam **100% offline**, permitindo gameplay no metrô, viagens ou sem conexão celular.
- A aba de músicas internacionais detectará ausência de internet (`@capacitor/network`) e exibirá badge amigável "Requer Conexão à Internet".

---

## 7. ORIENTAÇÃO DE TELA, MODO IMERSIVO E SAFE AREAS

### 1. Bloqueio em Modo Retrato (Portrait Lock)
- O gameplay do RockBrazil de 5 pistas verticais é estritamente otimizado para a pegada vertical com os dois polegares.
- Configuração estrita: `android:screenOrientation="portrait"` no manifesto e travamento via `@capacitor/screen-orientation`.

### 2. Modo Imersivo Completo (Edge-to-Edge)
- No Android 14+ (API 34), a Google exige layout de ponta a ponta (*edge-to-edge*).
- O jogo ocupará a totalidade do display, passando por baixo da barra de status e da barra de navegação por gestos.
- Implementação na `MainActivity`:
  ```kotlin
  WindowCompat.setDecorFitsSystemWindows(window, false)
  val controller = WindowInsetsControllerCompat(window, window.decorView)
  controller.hide(WindowInsetsCompat.Type.systemBars())
  controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
  ```

### 3. Recortes de Câmera (*Notch / Punch Hole*) e Safe Areas
- Diretiva no tema:
  ```xml
  <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>
  ```
- O CSS do RockBrazil já está 100% preparado para safe areas:
  ```css
  padding-top: max(10px, env(safe-area-inset-top));
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  padding-left: max(12px, env(safe-area-inset-left));
  padding-right: max(12px, env(safe-area-inset-right));
  ```
  Isso garante que botões, HUD, pausar e os botões da tela SHOW FINALIZADO fiquem fora de qualquer área obstruída por furos de câmera ou cantos arredondados.

---

## 8. TAXA DE ATUALIZAÇÃO (90HZ / 120HZ) E LATÊNCIA DE TOQUE

### 1. Telas de 90Hz, 120Hz e 144Hz (ProMotion / Fluid Display)
- O loop de jogo do RockBrazil (`engine.ts` e `renderer.ts`) utiliza `requestAnimationFrame` acoplado ao `performance.now()`.
- O cálculo da descida das notas é baseado em tempo contínuo decorrido (`elapsedSec`), não em frames fixos. Isso significa que em telas de 120Hz, o jogo roda automaticamente a 120 FPS com extrema suavidade visual, mantendo rigorosamente a velocidade calibrada na V13.8.3.

### 2. Otimização de Entrada por Toque
- `touch-action: none` aplicado estritamente no `#canvas-container` e `#game-canvas`.
- Prevenção de gestos de pinça, zoom acidental ou arrastar para recarregar (*pull-to-refresh*).
- Suporte a multi-touch com rastreamento por `pointerId` e `changedTouches`, garantindo que acordes de 2 ou 3 notas simultâneas sejam lidos sem perda de frames.

---

## 9. PACOTE DE DISTRIBUIÇÃO E ANDROID APP BUNDLE (AAB)

### 1. Formato de Publicação
- Publicação via **Android App Bundle (.aab)** com assinatura via Play App Signing.
- O Google Play gera automaticamente APKs otimizados para a arquitetura de processador do dispositivo (`arm64-v8a`, `armeabi-v7a`, `x86_64`), reduzindo o tamanho de download para o usuário final em cerca de 40%.

### 2. Estratégia de Ativos (Asset Delivery)
- Assets principais (HTML, JS, CSS, fontes de rock, artes de interface, capas compactas WebP): embutidos diretamente em `android/app/src/main/assets/public/` (~8 MB).
- Músicas nacionais em formato compactado AAC/M4A a 160kbps, oferecendo excelente fidelidade sonora com tamanho reduzido.

---

## 10. CONFORMIDADE COM A GOOGLE PLAY STORE E PERMISSÕES

### 1. Permissões Estritas no `AndroidManifest.xml`
Apenas as permissões mínimas indispensáveis serão solicitadas (sem acesso intrusivo a contatos, localização ou câmera):
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.VIBRATE" />
```
*(A permissão de vibração é opcional e serve exclusivamente para feedback tátil ao acertar notas ou perder multiplicador).*

### 2. Política de Privacidade e Classificação Etária
- Jogo casual de ritmo musical nacional.
- Classificação indicativa recomendada: Livre / ClassInd 10 anos (dependendo do repertório lírico).
- Conformidade integral com LGPD e GDPR (nenhum dado pessoal sensível é coletado; perfis utilizam apenas apelido público ou autenticação anônima por padrão).

---

## CONCLUSÃO E PRÓXIMOS PASSOS QUANDO AUTORIZADO

A base de código atual do RockBrazil (V13.8.4) está totalmente alinhada e pronta para o encapsulamento no Capacitor. Quando o desenvolvimento do APK nativo for formalmente iniciado nas etapas futuras do roadmap, a estrutura de comandos será:

1. `npm install @capacitor/core @capacitor/cli @capacitor/android`
2. `npx cap init RockBrazil com.rockbrazil.game --web-dir dist`
3. `npx cap add android`
4. `npm run build && npx cap copy android`
5. Configuração da keystore de produção e compilação do AAB no Android Studio.

Este documento consolida o guia definitivo de engenharia para a versão Android do RockBrazil.
