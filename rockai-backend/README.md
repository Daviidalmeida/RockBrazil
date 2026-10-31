# ROCKBRAZIL V13.9.1 — ROCK AI PRO LOCAL BACKEND
## SERVIÇO LOCAL DE SEPARAÇÃO E TRANSCRIÇÃO NEURAL

Este backend executa modelos reais de aprendizado profundo (Deep Learning) no computador local do desenvolvedor/usuário, fornecendo a inteligência para o **RockBrazil AutoChart Pro**:

1. **Separação de Guitarra por IA:**
   - Modelo: `htdemucs_6s` (Meta Research Demucs v4)
   - Extrai especificamente o canal individual de **guitarra** (além de bateria, baixo, vocais, piano e outros).
2. **Transcrição Musical Neural:**
   - Modelo: `basic-pitch` (Spotify Basic Pitch ICASSP 2022)
   - Transcreve notas polifônicas, tempo inicial, tempo final, pitch MIDI e confiança.

---

### Instalação Rápida

1. Certifique-se de ter o Python 3.9+ instalado:
   ```bash
   python --version
   ```

2. Instale as dependências:
   ```bash
   pip install -r requirements.txt
   ```

3. Se você tiver uma placa de vídeo NVIDIA (CUDA), instale o PyTorch compatível:
   ```bash
   pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
   ```

---

### Inicialização do Servidor API

Execute o comando ou dê duplo clique em `run.bat` (Windows) / `run.sh` (Linux/Mac):
```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Abra a documentação interativa no navegador para testar os endpoints:
`http://127.0.0.1:8000/docs`

---

### Uso Offline via Terminal (CLI)

Se preferir processar um áudio e gerar um arquivo de chart JSON diretamente no terminal:
```bash
python cli.py --audio "caminho/para/audio.mp3" --output "meu_chart.json" --title "Under the Bridge" --artist "Red Hot Chili Peppers" --youtube-id "44XYEeD1A1U"
```

Em seguida, basta abrir o RockBrazil no navegador e ir em:
**CONFIGURAÇÕES > ⚡ ROCK AI > CATÁLOGO & CHARTS > 📥 IMPORTAR CHART / MIDI PROCESSADO POR IA**.
O chart completo para as 4 dificuldades (Fácil, Médio, Difícil e Expert) será carregado instantaneamente!
