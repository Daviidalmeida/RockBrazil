# 🎸 RockBrazil V4 — Jogo de Ritmo de Guitarra (Preparação Android)

O **RockBrazil** é um jogo de ritmo de guitarra vertical desenvolvido para navegadores móveis e preparado para empacotamento nativo em Android (via Capacitor). Inspirado nas mecânicas clássicas de *Guitar Flash* e *Guitar Hero*, traz identidade visual própria de rock moderno, pipeline DSP de análise automática de guitarra para arquivos MP3, 4 níveis de dificuldade, medidor vertical de desempenho, perfis de jogadores persistentes e suporte a multitoque.

---

## ⚡ Como Instalar e Iniciar o Projeto

### Requisitos
- **Node.js** (v18 ou v20 LTS recomendado)
- **Git**

### Passo a Passo
1. Abra o terminal na pasta do projeto:
   ```bash
   npm install
   ```
2. Inicie o servidor de desenvolvimento na rede local:
   ```bash
   npm run dev
   ```
3. O servidor estará disponível para acesso no computador e em dispositivos na mesma rede Wi-Fi.

---

## 📱 Como Testar no Celular (Mesmo Wi-Fi)

1. Conecte o celular à mesma rede Wi-Fi do seu computador.
2. Abra o navegador do celular (Chrome ou Safari) e acesse o endereço IP local informado no terminal:
   - Exemplo: `http://192.168.11.121:5173/`
3. O jogo é otimizado para orientação vertical (retrato) com `touch-action: none` (sem rolagem, zoom ou seleção acidental de texto).
4. **No PC:** Você também pode testar usando as teclas <kbd>A</kbd> <kbd>S</kbd> <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd> ou <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> <kbd>5</kbd>, e <kbd>Espaço</kbd>/<kbd>Esc</kbd> para pausar.

---

## 🎵 Biblioteca de Músicas e Importação de MP3

O jogo já vem com **5 faixas instrumentais originais de demonstração** sintetizadas em tempo real via Web Audio API (sem problemas de direitos autorais):
1. **Fúria Tropical** (132 BPM, Hard Rock)
2. **Trovão da Meia-Noite** (148 BPM, Heavy Metal Veloz)
3. **Garagem 90** (116 BPM, Grunge / Alt Rock)
4. **Estrada de Ferro** (126 BPM, Blues Rock Boogie)
5. **Sobrecarga** (160 BPM, Speed Punk Rock)

### Como Importar Suas Músicas (MP3)
- Na tela **MINHAS MÚSICAS** ou **BIBLIOTECA**, toque em **📁 IMPORTAR MP3**.
- Selecione qualquer arquivo `.mp3`, `.wav`, `.ogg` ou `.m4a` do seu aparelho.
- O pipeline automático do RockBrazil analisa a faixa e gera na hora os mapas para as 4 dificuldades (**Fácil, Médio, Difícil e Expert**).

### Música T.N.T. — AC/DC
- A entrada para **T.N.T. — AC/DC** está preparada na biblioteca.
- Quando o arquivo `TNT.mp3` for selecionado via botão **VINCULAR TNT.mp3** (ou colocado na pasta `public/custom-songs/TNT.mp3`), o jogo associa o áudio automaticamente e ativa os 4 mapas de dificuldade sincronizados!
- O arquivo de áudio comercial não é versionado no repositório público (protegido via `.gitignore`).

---

## 🧠 Como Funciona a Análise Automática de Guitarra

Diferente de jogos que utilizam apenas o BPM ou batidas de bateria, o RockBrazil V4 implementa um pipeline DSP focado nas frequências da guitarra elétrica:

1. **AudioImporter:** Validação de formato e cálculo de hash SHA-256 para evitar análises duplicadas.
2. **AudioAnalyzer:** Decomposição espectral em tempo real nas faixas de corpo/distorção da guitarra (300Hz–3200Hz) e ataque de palheta/presença (3200Hz–6500Hz), filtrando batidas sub-graves isoladas.
3. **GuitarDetector:** Detecção de picos de novidade espectral (*spectral flux*) com limiar adaptativo; classificação entre **acordes/power chords**, **riffs**, **solos** e cálculo de sustentação ressonante para **notas longas**.
4. **DifficultyGenerator:**
   - **FÁCIL:** Padrões espaçados (~1-2 notas/s), acordes raros, janela de acerto tolerante (±180ms), baixa perda de vida (-4%).
   - **MÉDIO:** Sequências melódicas, acordes simples de 2 pistas, janela equilibrada (±140ms), perda moderada (-7%).
   - **DIFÍCIL:** Riffs em colcheias, acordes frequentes, notas longas, janela estrita (±100ms), perda severa (-10%).
   - **EXPERT:** Máxima fidelidade aos ataques detectados, sequências em semicolcheias, acordes triplos, solos e janela rigorosa (±75ms), perda crítica (-15%).
5. **ChartCache:** Armazena os mapas gerados em `IndexedDB` localmente para carregamento instantâneo nas próximas partidas.

---

## 👤 Sistema de Perfis e Recordes

- **Primeira Execução:** Solicita nome do jogador e avatar (🎸, ⚡, 🔥, 💀, 👑, 🤘).
- **Persistência Dupla:** `IndexedDB` para perfis, recordes, estrelas (1 a 5 ⭐) e histórico de partidas; `localStorage` para preferências rápidas de áudio e vídeo.
- **Exportação/Importação:** Botão para exportar seus dados em arquivo JSON e importar em outro navegador ou dispositivo.

---

## 🛠️ Arquitetura Técnica

- **Motor de Áudio (`src/audio/audioManager.ts`):** Relógio mestre referenciado no `AudioContext.currentTime` de alta precisão. Compensação de latência, controle independente de volumes e pausa limpa com tratamento de `visibilitychange` (pausa automática se o jogador alternar de app ou receber ligação).
- **Sem Sons Artificiais nos Botões:** Conforme regra de design de jogos de ritmo, o som principal é a própria música do palco.
- **Pista e Botões Circulares (`src/style.css`):** 5 pistas com perspectiva 3D sobre o palco de show (`public/images/stage-bg.png`) com botões circulares iluminados estilo guitarra clássica.
- **HUD Lateral:** Pontuação, multiplicador (1x a 4x com chamas) e combo à esquerda; Medidor Vertical de Desempenho com ponteiro analógico e LED de perigo à direita.

---

## 🚀 Preparação para Android (Capacitor)

O projeto já contém `capacitor.config.json` configurado. Para empacotar como APK nativo futuramente:
```bash
# 1. Gerar build web de produção
npm run build

# 2. Adicionar o Capacitor e plataforma Android
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android

# 3. Sincronizar os arquivos compilados e abrir no Android Studio
npx cap sync
npx cap open android
```

---

## 🧪 Testes Automatizados

Para executar a suíte completa de testes unitários:
```bash
npm test
```
Verifica sincronização de relógio, janelas de julgamento, integridade do medidor de vida, detecção de guitarra e persistência de perfis.
