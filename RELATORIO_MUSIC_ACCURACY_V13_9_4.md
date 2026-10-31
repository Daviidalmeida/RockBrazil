# RELATÓRIO OFICIAL DE ACURÁCIA MUSICAL — ROCKBRAZIL V13.9.4
## AI QUALITY ASSURANCE ENGINE & GROUND-TRUTH ACCURACY BENCHMARK
### (Atualizado com Retificação de Proveniência — Hotfix V13.9.4.1)

- **Projeto:** RockBrazil
- **Módulo:** AI Quality Assurance Engine (`MusicAccuracyValidator`)
- **Faixa Piloto Oficial:** AC/DC — *T.N.T.* (`tnt-acdc`)
- **Vídeo Oficial YouTube:** `fGDQ9IukMOc`
- **Duração Nominal:** 229s (03:49) | **BPM:** 130
- **Data de Avaliação Inicial:** 31 de Outubro de 2026
- **Data de Retificação (Hotfix V13.9.4.1):** 31 de Outubro de 2026
- **Ambiente de Testes:** Vitest 1.6.1 / Node.js 20 / GitHub Pages

---

### 1. RETIFICAÇÃO HISTÓRICA E ELIMINAÇÃO DE VALIDAÇÃO CIRCULAR

> [!WARNING]
> **AUDITORIA DE PROVENIÊNCIA — HOTFIX V13.9.4.1:**
> Na versão inicial V13.9.4, a função `getGroundTruthReference('tnt-acdc')` buscava eventos diretamente em `RAW_INTERNATIONAL_CHARTS['tnt-acdc']`. Como o `BeatmapManager` também carrega os charts a partir desse mesmo registro, o validador estava realizando uma **validação circular**, comparando o chart com ele mesmo.
>
> Por essa razão, os índices de 100% de Precision, 100% de Recall e 0.0ms de erro mediano representavam identidade estrutural interna, e **não uma comprovação matemática de acurácia contra uma referência musical externa independente**.
>
> No Hotfix V13.9.4.1, a validação circular foi bloqueada na raiz através do `IndependentGroundTruthRepository` e do detector de circularidade (`detectCircularValidation`).
>
> **Status Oficial Retificado de T.N.T.:**
> Como ainda não foi registrado um dataset externo independente com proveniência comprovada para T.N.T., o status oficial da música piloto é auditado com rigor e honestidade técnica como **`INSUFFICIENT_EVIDENCE`**, em estrita conformidade com as diretrizes do projeto RockBrazil.

---

### 2. OBJETIVO DO AI QUALITY ASSURANCE ENGINE

O **AI Quality Assurance Engine** foi desenvolvido para transformar o controle de qualidade do RockBrazil em um processo puramente matemático, reprodutível e livre de aprovações manuais subjetivas. 

O objetivo do sistema é auditar a sincronização e precisão temporal de cada nota musical do chart em relação a uma referência acústica real (Ground Truth) obtida a partir da transcrição de stems e ataques reais de instrumentos autorizados.

**Meta Estabelecida para Certificação `VERIFIED_90_PLUS`:**
$$\text{Precision} \ge 90.0\%, \quad \text{Recall} \ge 90.0\%, \quad \text{F1-Score} \ge 90.0\%$$
$$\text{Erro Mediano} \le 30.0\text{ms}, \quad \text{Erro Percentil 95 (P95)} \le 50.0\text{ms}$$
$$\text{Proveniência Independente Comprovada} = \text{Verdadeiro}$$

---

### 3. METODOLOGIA DE AVALIAÇÃO DE FIDELIDADE TEMPORAL

A avaliação é executada pela classe `MusicAccuracyValidator` localizada em `src/game/intelligence/musicAccuracyValidator.ts`.

#### 3.1 Janela de Aceitação Rítmica Estrita
A janela temporal máxima de pareamento foi fixada em:
$$\Delta t_{\text{aceitacao}} = 50\text{ms} \quad (0.050\text{s})$$
Esta janela corresponde exatamente a uma subdivisão de fusa/semifusa (1/32 de nota a 130 BPM), garantindo que apenas notas tocadas no instante musical legítimo sejam consideradas acertos.

#### 3.2 Pareamento Temporal 1-para-1 Guloso (Greedy Matching)
1. Tanto o conjunto de notas do chart quanto o conjunto de referência são ordenados cronologicamente:
   $$N = \{n_1, n_2, \dots, n_k\}, \quad R = \{r_1, r_2, \dots, r_m\}$$
2. O sistema executa o detector de circularidade:
   - Se os arrays compartilharem a mesma instância de memória ou proveniência do chart, a avaliação é imediatamente interrompida com status `CIRCULAR_VALIDATION_REJECTED`.
3. Para cada nota $n_i$, busca-se a referência não pareada $r_j$ mais próxima no tempo:
   $$r_j = \arg\min_{r \in R_{\text{unmatched}}} |n_i.\text{time} - r.\text{time}|$$
4. Se $|n_i.\text{time} - r_j.\text{time}| \le 0.050\text{s}$:
   - Registra-se um **Verdadeiro Positivo (TP)**;
   - Registra-se o erro absoluto: $e_k = |n_i.\text{time} - r_j.\text{time}| \times 1000\text{ ms}$;
   - $r_j$ é marcado como consumido, impedindo que uma única referência mascare múltiplas notas falsas.
5. Notas do chart sem referência correspondente tornam-se **Falsos Positivos (FP)** (notas extras/fantasmas).
6. Eventos da referência acústica sem nota no chart tornam-se **Falsos Negativos (FN)** (notas ausentes).

#### 3.3 Fórmulas Matemáticas das Métricas de Fidelidade

$$\text{Precision} = \frac{\text{TP}}{\text{TP} + \text{FP}}$$

$$\text{Recall} = \frac{\text{TP}}{\text{TP} + \text{FN}}$$

$$\text{F1-Score} = 2 \times \frac{\text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}}$$

---

### 4. QUADRO COMPARATIVO E STATUS DE CERTIFICAÇÃO (V13.9.4 vs V13.9.4.1)

| Dificuldade | Notas Chart | Status V13.9.4 (Circular) | Status Retificado V13.9.4.1 | Motivo da Retificação | Próximo Passo |
|---|---|---|---|---|---|
| **FÁCIL (EASY)** | 703 | `VERIFIED_90_PLUS` (100%) | `INSUFFICIENT_EVIDENCE` | Validação circular com dados internos eliminada | Ingestão de dataset externo certificado |
| **MÉDIO (MEDIUM)** | 1.125 | `VERIFIED_90_PLUS` (100%) | `INSUFFICIENT_EVIDENCE` | Validação circular com dados internos eliminada | Ingestão de dataset externo certificado |
| **DIFÍCIL (HARD)** | 1.518 | `VERIFIED_90_PLUS` (100%) | `INSUFFICIENT_EVIDENCE` | Validação circular com dados internos eliminada | Ingestão de dataset externo certificado |
| **EXPERT** | 1.639 | `VERIFIED_90_PLUS` (100%) | `INSUFFICIENT_EVIDENCE` | Validação circular com dados internos eliminada | Ingestão de dataset externo certificado |

---

### 5. AUDITORIA DE INTEGRIDADE ESTRUTURAL DOS MAPAS (`ChartIntegrityValidator`)

Os charts de T.N.T. permanecem 100% íntegros e preservados em `BeatmapManager`:
1. **Monotonicidade Temporal Estrita:** $t_{i+1} \ge t_i$ para todas as notas.
2. **Preservação de Acordes:** Acordes legítimos de guitarra são preservados com precisão.
3. **Limites Rígidos de Pistas por Dificuldade:**
   - **Fácil:** Pistas estritamente em $\{0, 1, 2\}$ (0% acordes).
   - **Médio:** Pistas estritamente em $\{0, 1, 2, 3\}$.
   - **Difícil / Expert:** 5 pistas completas.

---

### 6. CERTIFICAÇÃO DO SISTEMA

O AI Quality Assurance Engine opera agora sob rigorosa exigência de proveniência externa, garantindo que qualquer futura certificação `VERIFIED_90_PLUS` represente fidelidade musical matematicamente incontestável.
