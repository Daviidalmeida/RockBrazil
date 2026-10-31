# GUIA DO USUÁRIO & ADMINISTRADOR — ROCK AI
## COMO CRIAR, PROCESSAR E SINCRONIZAR MÚSICAS NO ROCKBRAZIL V13.9

---

### 1. ACESSANDO O PAINEL ROCK AI
1. Na tela inicial do jogo, toque no ícone de engrenagem para abrir **CONFIGURAÇÕES**.
2. Na parte inferior do menu, toque no botão roxo vibrante:  
   **⚡ ROCK AI — AUTOCHART & ADMIN**
3. O painel administrativo será aberto, apresentando quatro abas:
   - **CRIAR MÚSICA:** Cadastro de nova música e seleção de áudio.
   - **PROCESSO IA:** Acompanhamento da barra de progresso em tempo real (0 a 100%).
   - **SINCRONIZAR:** Calibração fina de offset entre o vídeo do YouTube e as notas na esteira.
   - **CATÁLOGO & CHARTS:** Lista de rascunhos salvos, exportação/importação e envio direto para o Editor Visual.

---

### 2. CRIANDO UMA NOVA MÚSICA COM AUTOCHART
1. **Link Oficial do YouTube:**
   - Cole o link completo da música (ex: `https://www.youtube.com/watch?v=44XYEeD1A1U` ou `https://youtu.be/...`).
   - O sistema detecta e valida automaticamente o ID do vídeo com feedback verde (`✓ ID Detectado`).
2. **Metadados:**
   - Preencha o **Nome da Música**, **Artista / Banda** e **Gênero**.
   - Para a música piloto *"Under the Bridge"*, o preenchimento automático é acionado ao inserir o link.
3. **Arquivo de Áudio Autorizado:**
   - Selecione o arquivo de áudio da faixa em seu dispositivo (suporta **WAV, MP3, FLAC, OGG, M4A**).
   - O validador confirma o tamanho e formato do arquivo.
4. **Análise com IA:**
   - Toque em **⚡ ANALISAR MÚSICA COM IA**.
   - A aba mudará automaticamente para **PROCESSO IA**, exibindo cada etapa:
     1. Decodificação PCM e picos de onda.
     2. Separação espectral da faixa de guitarra.
     3. Análise de andamento e estimativa de BPM.
     4. Detecção de ataques de palheta e sustentação.
     5. Transcrição de pitch e acordes.
     6. Construção das 4 dificuldades (Fácil, Médio, Difícil, Expert).
     7. Verificação das 14 regras de validação.

---

### 3. CALIBRANDO A SINCRONIZAÇÃO (VÍDEO ↔ CHART)
Na aba **SINCRONIZAR**:
- O offset inicial é de `0 ms` (status `NÃO CALIBRADO`).
- Utilize os botões de ajuste rápido:
  - **-100 ms** ou **-25 ms:** Retarda o momento em que as notas cruzam a linha de recepção.
  - **+25 ms** ou **+100 ms:** Antecipa a descida das notas.
- Ao efetuar qualquer alteração, o status transita para **EM TESTE**.
- Ao encontrar a sincronização perfeita, toque em **✓ CONFIRMAR: VALIDADO PELO USUÁRIO**.

---

### 4. REFINANDO CHARTS NO EDITOR VISUAL
- Na aba **CATÁLOGO & CHARTS**, localize a música gerada e toque em **✏️ ABRIR NO EDITOR**.
- O chart completo será carregado diretamente na timeline interativa do **VisualEditor** do RockBrazil, permitindo adicionar, mover, estender notas de sustentação ou alterar acordes antes de jogar!
