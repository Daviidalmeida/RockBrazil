# GUIA TÉCNICO — SEPARAÇÃO DE GUITARRA POR IA
## DEMUCS HTDEMUCS 6-STEM (`htdemucs_6s`)

---

### 1. SELEÇÃO DO MODELO DE SEPARAÇÃO
A separação de fontes musicais (*source separation*) é essencial para isolar a linha de guitarra de uma mixagem completa antes da transcrição de pitch.

#### Por que `htdemucs_6s`?
- A maioria dos modelos padrão (como Demucs `htdemucs` padrão ou Spleeter 4-stems) separa apenas:
  1. Vocais
  2. Bateria
  3. Contrabaixo
  4. Outros (onde piano, teclados, cordas e **guitarra** ficam misturados em um canal residual).
- O modelo **HTDemucs 6-Stem (`htdemucs_6s`)** da Meta Research foi treinado especificamente com 6 canais dedicados:
  1. Bateria (*drums*)
  2. Contrabaixo (*bass*)
  3. **Guitarra (*guitar*)** 🎸
  4. Piano (*piano*)
  5. Vocais (*vocals*)
  6. Outros (*other*)
- **Licença:** MIT (Permissiva).
- **Repositório:** `https://github.com/facebookresearch/demucs`

---

### 2. EXECUÇÃO DA INFERÊNCIA
No backend local (`rockai-backend/`):
```bash
python -m demucs.separate -n htdemucs_6s -d cpu --two-stems guitar "caminho/do/audio.mp3"
```
A flag `--two-stems guitar` instrui o Demucs a salvar especificamente o canal de guitarra isolado e o canal residual do resto da banda, economizando tempo de gravação em disco e memória.

---

### 3. COMPARAÇÃO COM O FALLBACK DSP
Se o ambiente de processamento não dispuser do modelo Demucs ou estiver executando em modo offline no navegador:
- **`RealGuitarStemAdapter`:** Executa o modelo neural `htdemucs_6s`. Gera metadados com `isRealAI: true` e `separationModel: 'HTDEMUCS_6S'`.
- **`GuitarStemSeparator`:** Executa filtro harmônico passa-faixa (180 Hz a 4500 Hz). Gera metadados com `isRealAI: false` e `separationModel: 'DSP_BANDPASS_FALLBACK'`.

O jogo exibe claramente na interface qual método foi empregado para cada chart, garantindo honestidade técnica total com o jogador.
