# GUIA DE PROCESSAMENTO LOCAL — ROCK AI PRO
## EXECUÇÃO DO BACKEND LOCAL E IMPORTAÇÃO NO ROCKBRAZIL

---

### 1. POR QUE UM SERVIÇO LOCAL?
O frontend do RockBrazil é hospedado estaticamente no **GitHub Pages**. Páginas estáticas não podem executar scripts Python persistentes nem modelos pesados de Machine Learning no servidor.
Além disso, executar modelos pesados como Demucs e Basic Pitch no navegador de um smartphone causaria travamentos de memória em dispositivos intermediários.

A solução de nível profissional do RockBrazil adota uma arquitetura em duas camadas:
1. **Frontend Web / Mobile:** Interface rápida, 60 FPS, esteira 3D leve.
2. **Backend Local de IA:** Servidor Python no computador do desenvolvedor/usuário para processar e gerar os charts antes do jogo.

---

### 2. COMO INICIAR O SERVIDOR LOCAL

1. Abra a pasta `rockai-backend/` no terminal.
2. Instale as dependências:
   ```bash
   pip install -r requirements.txt
   ```
3. Inicie o servidor:
   - No Windows: Dê duplo clique em `run.bat` ou digite:
     ```cmd
     uvicorn main:app --host 127.0.0.1 --port 8000 --reload
     ```
   - No Linux/Mac: Execute `./run.sh`

4. Verifique se o servidor está ativo acessando `http://localhost:8000/health`.

---

### 3. COMO USAR VIA CLI (TERMINAL OFFLINE)
Você pode processar qualquer arquivo de áudio autorizado diretamente pelo terminal:

```bash
python cli.py --audio "under_the_bridge.mp3" --output "under_the_bridge_chart.json" --title "Under the Bridge" --artist "Red Hot Chili Peppers" --youtube-id "44XYEeD1A1U"
```

O comando irá:
1. Executar o Demucs para isolar a guitarra.
2. Executar o Spotify Basic Pitch para transcrever as notas.
3. Construir as 4 dificuldades (Fácil, Médio, Difícil, Expert).
4. Gravar o arquivo `under_the_bridge_chart.json`.

---

### 4. IMPORTANDO NO ROCKBRAZIL
Para carregar o chart gerado no jogo publicado no GitHub Pages:
1. Abra o RockBrazil no navegador: `https://daviidalmeida.github.io/RockBrazil/`.
2. Vá em **CONFIGURAÇÕES (⚙️) > ⚡ ROCK AI — AUTOCHART & ADMIN**.
3. Na aba **CATÁLOGO & CHARTS**, toque em:  
   **📥 IMPORTAR CHART / MIDI PROCESSADO POR IA**.
4. Selecione o arquivo `under_the_bridge_chart.json`.
5. O chart será imediatamente registrado no catálogo local com o selo **[IA PRO (DEMUCS + BASIC PITCH)]** e poderá ser jogado ou editado no Editor Visual!
