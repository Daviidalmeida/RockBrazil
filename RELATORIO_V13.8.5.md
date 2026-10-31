# ROCKBRAZIL V13.8.5 — RELATÓRIO OFICIAL DE AUDITORIA, CALIBRAÇÃO E PUBLICAÇÃO
**Data:** 31 de Outubro de 2026  
**Repositório:** Daviidalmeida/RockBrazil  
**Branch:** main  
**Commit Base:** `5c2d62d` (V13.8.4)  
**Tag de Recuperação:** `v13.8.4-recovery`  
**Site Oficial:** https://daviidalmeida.github.io/RockBrazil/  
**Status dos Testes:** 44 arquivos de teste, 583 testes aprovados (100% de sucesso)  
**Build:** Vite v5.4.21 / TypeScript tsc sem erros  

---

## 1. RESUMO EXECUTIVO DA ATUALIZAÇÃO CORRETIVA CRÍTICA

A versão V13.8.5 foi desenvolvida para atender rigorosamente às correções de jogabilidade real apontadas pelo usuário após testes em dispositivo físico:
1. **Player YouTube Redesenhado em Formato Widescreen 16:9:** Removida a caixa forçada de 200x200px. Retomada a proporção natural de vídeo widescreen 16:9 (`aspect-ratio: 16 / 9`) com largura adaptativa `clamp(140px, 36vw, 175px)`, reduzindo a área de ocupação visual na tela em mais de **72%** (de 40.000 px² para ~11.086 px² no mobile padrão 390x844), liberando completamente o campo de visão da esteira e das notas verticais.
2. **Transparência Real nos Elementos Próprios e Conformidade com Diretrizes do YouTube:** Aplicação de transparência real de 80% (`rgba(0, 0, 0, 0.2)`) no contêiner, molduras e superfícies próprias do RockBrazil. Esclarecimento técnico e conformidade com a Seção III.A.2 dos *YouTube API Developer Terms* (que veta expressamente a opacificação ou obscurecimento direto de controles e marcas d'água dentro do iframe).
3. **Calibração de Velocidade da Esteira por Dificuldade:**
   - **FÁCIL (EASY):** 1.90s de tempo de aproximação (anteriormente 2.20s). Elimina a lentidão excessiva de rastilho, tornando a descida das notas dinâmica, ágil e prazerosa.
   - **MÉDIO (MEDIUM):** 2.20s de tempo de aproximação (anteriormente 2.00s). Desacelera a descida para proporcionar leitura confortável em 4 pistas e preparação para acordes.
   - **DIFÍCIL (HARD):** 1.85s (preservado).
   - **EXPERT:** 1.65s (preservado).
4. **Eliminação do Bug de Multiplicadores Empilhados (Double-Stacking):**
   - Identificada a causa-raiz no manipulador de configurações de `src/main.ts`, onde mover a barra de velocidade alterava simultaneamente `noteSpeedMultiplier` e alternava `speedPreset` entre `LENTA` e `RÁPIDA`, aplicando duas reduções ou duas acelerações simultâneas em `renderer.ts`.
   - Criado o módulo isolado de verdade única `src/game/speed/approachTimeCalculator.ts`, desacoplando completamente sliders contínuos de presets discretos.
5. **Classificação Honesta e Transparente de Sincronismo das 5 Músicas Internacionais:**
   - Todos os 5 charts e áudios internacionais foram auditados detalhadamente.
   - Classificação atribuída com integridade: **PENDING** (Pendente de validação sensorial humana em partida real de ponta a ponta). Nenhuma falsa alegação de "100% verificado" baseada em suposições ou mockings de testes automatizados.

---

## 2. COMPARAÇÃO DETALHADA ENTRE VERSÕES (V13.8.4 vs V13.8.5)

| Componente / Recurso | Versão V13.8.4 (Anterior) | Versão V13.8.5 (Atual Calibrada) | Impacto no Usuário Real |
| :--- | :--- | :--- | :--- |
| **Formato do Miniplayer YouTube** | Caixa quadrada rígida de 200x200px (40.000 px²) | Widescreen 16:9 (`clamp(140px, 36vw, 175px)`, ~11.086 px²) | **Redução de 72,3% na área.** O vídeo não obstrui a descida das notas. |
| **Letterbox do Vídeo** | Barras pretas de 44px acima e abaixo do clipe | Sem letterboxing; proporção 16:9 natural do clipe | Vídeo reproduz em tela cheia na mini-janela sem deformações. |
| **Transparência do Player** | `rgba(0, 0, 0, 0.8)` no wrapper (80% opacidade, não transparência) | `rgba(0, 0, 0, 0.2)` nos elementos próprios (80% transparência real) | Moldura e contêiner integrados de forma sutil e translúcida à partida. |
| **Velocidade da Esteira FÁCIL** | 2.20s (tempo de aproximação lento demais) | **1.90s** (tempo calibrado ágil) | Notas descem com dinamismo sem parecer que estão "travando". |
| **Velocidade da Esteira MÉDIO** | 2.00s (tempo rápido demais para 4 pistas) | **2.20s** (tempo calibrado confortável) | Conforto de leitura visual para 4 pistas e acordes duplos. |
| **Cálculo de Velocidade** | Multiplicador de slider empilhado com presets em `main.ts` | Fonte única em `src/game/speed/approachTimeCalculator.ts` | Velocidade previsível, sem saltos repentinos ao ajustar configs. |
| **Posicionamento do HUD Esquerdo** | Fixo abaixo do bloco de 200px | Dinamicamente calculado abaixo do 16:9 (`calc(top + 16/9 + 8px)`) | Zero sobreposição com multiplicador, combo ou score. |
| **Sincronismo Internacional** | Declarado "verificado" por testes unitários | Classificado como **PENDING** (aguardando validação humana em jogo) | Transparência técnica e honestidade absoluta com o usuário. |

---

## 3. AUDITORIA GEOMÉTRICA DO PLAYER YOUTUBE NO MOBILE

As medições físicas reais coletadas pelo script de visualização Playwright (`scratch/capture_v13_8_5_evidence.mjs`) em ambiente de teste confirmam:

### Viewport Mobile Padrão (390 x 844 px):
- **Largura Efetiva:** 140,39 px
- **Altura Efetiva:** 78,97 px
- **Proporção:** 16:9 (140,39 / 78,97 = 1,778)
- **Área Ocupada:** 11.086 px²
- **Área da Versão Anterior (200x200):** 40.000 px²
- **Percentual de Redução de Área:** **-72,28%**
- **Posição:** `top: 8px; left: 8px;`
- **Distância até a Linha Central da Esteira (Pista 0):** > 45px de folga lateral total.

### Viewport Mobile Compacto (iPhone SE / 375 x 667 px):
- **Largura Efetiva:** 140,00 px (piso do clamp)
- **Altura Efetiva:** 78,75 px
- **Proporção:** 16:9
- **Área Ocupada:** 11.025 px²
- **Percentual de Redução de Área:** **-72,44%**

---

## 4. AUDITORIA E CLASSIFICAÇÃO DAS 5 MÚSICAS INTERNACIONAIS

| ID da Música | Título / Artista | Vídeo YouTube | Offset (ms) | Notas (E/M/H/X) | Duração | Status V13.8.5 | Justificativa Técnica |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `intl-acdc-highway-to-hell` | Highway to Hell (Live)<br>AC/DC | `gEPmA3USJdI` | -2000 | 334 / 911 / 972 / 1257 | 282.3s | **PENDING** | Chart convertido com sucesso. O offset de -2000ms compensa o áudio de abertura da plateia no River Plate, mas requer playtest humano completo no dispositivo móvel para atestar sensação rítmica precisa. |
| `intl-gnr-paradise-city` | Paradise City<br>Guns N' Roses | `Rbm6GXllBiw` | 0 | 521 / 1093 / 1940 / 2411 | 404.8s | **PENDING** | Chart de alta densidade (2411 notas em Expert). Clipe de estúdio alinhado no timestamp 0ms; necessita de validação humana para checar se a introdução de bateria bate no frame exato. |
| `intl-gnr-sweet-child-o-mine` | Sweet Child o' Mine<br>Guns N' Roses | `1w7OgIMMRc4` | 0 | 581 / 711 / 968 / 1095 | 354.8s | **PENDING** | Riff clássico na pista 2 em Ré; notas verificadas estruturalmente. Pendente de validação táctil de swing em dispositivo móvel. |
| `intl-gnr-welcome-to-the-jungle` | Welcome to the Jungle<br>Guns N' Roses | `o1tj2zJ2Wvg` | 0 | 437 / 631 / 855 / 1248 | 261.2s | **PENDING** | Clipe oficial com narrativa inicial. Requer validação humana do momento de entrada da guitarra com delay de Slash. |
| `intl-lp-numb` | Numb<br>Linkin Park | `kXYiU_JCYtU` | 0 | 93 / 165 / 189 / 211 | 174.5s | **PENDING** | Chart oficial Harmonix; 211 notas. Pendente de partida completa pelo usuário para atestar o sincronismo nos sintetizadores e bateria de Chester Bennington. |

---

## 5. TABELA DE CALIBRAÇÃO DOS TEMPOS DE APROXIMAÇÃO (APPROACH TIME)

| Dificuldade | Tempo Base V13.8.4 | Tempo Base V13.8.5 | Preset LENTA (+0.35s) | Preset NORMAL (1.0x) | Preset RÁPIDA (-0.30s) | Experiência de Leitura |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FÁCIL (EASY)** | 2.20s | **1.90s** | 2.25s | **1.90s** | 1.60s | Dinâmica e fluida. As notas não se arrastam na tela. |
| **MÉDIO (MEDIUM)** | 2.00s | **2.20s** | 2.55s | **2.20s** | 1.90s | Leitura calma e espaçada para transição de 4 pistas e acordes. |
| **DIFÍCIL (HARD)** | 1.85s | **1.85s** | 2.20s | **1.85s** | 1.55s | Ritmo moderado padrão clássico de Guitar Hero / Rock Band. |
| **EXPERT** | 1.65s | **1.65s** | 2.00s | **1.65s** | 1.35s | Alta intensidade para jogadores avançados. |

---

## 6. PROVA MATEMÁTICA DE SINCRONISMO NA LINHA DE ACERTO

A equação fundamental de renderização vertical utilizada pelo motor de jogo é:

$$\text{progress}(t) = 1.0 - \frac{\text{note.time} - \text{clockTime}}{T_{\text{approach}}}$$

No exato momento do impacto musical ($\text{clockTime} = \text{note.time}$):

$$\text{progress} = 1.0 - \frac{0}{T_{\text{approach}}} = 1.0$$

**Conclusão Matemática:** O valor de $\text{progress}$ é estritamente $1.0$ (posição exata dos receptors na linha de acerto) para **qualquer** valor de $T_{\text{approach}}$. Alterar a velocidade da esteira altera unicamente o horizonte de antecipação visual (quando a nota surge no alto da tela), sem causar **nenhum milissegundo de atraso ou adiantamento** no momento do acerto.

---

## 7. RESULTADOS DOS TESTES AUTOMATIZADOS (583/583 PASSANDO)

A suíte completa de testes do projeto foi executada com sucesso total:
- **Total de Suítes Executadas:** 44 arquivos de teste
- **Total de Testes Aprovados:** 583 testes (0 falhas, 0 testes ignorados)
- **Destaques de Validação:**
  - `tests/v13_8_5GameplayAndPlayer.test.ts`: 16 testes aprovados (calibração, proporção 16:9, redução de área >70%, transparência).
  - `tests/v13_8_3HighwaySpeed.test.ts`: 14 testes aprovados (tempo de aproximação, presets, ausência de double multiplier).
  - `tests/v13_8_4ResultsAndHud.test.ts`: 13 testes aprovados (SHOW FINALIZADO com 0 sobreposições, HUD dinâmico).
  - `tests/v13_8_2CloudSync.test.ts`: 21 testes aprovados (sincronização em nuvem e miniplayer).
  - `tests/regressionV5Performance.test.ts`: 5 testes aprovados.
  - `tests/audioSyncMaster.test.ts`: 20 cenários de controle de playback e áudio aprovados.

---

## 8. PRESERVAÇÃO INTEGRAL DO ECOSSISTEMA OFICIAL

1. **31 Músicas Nacionais:** Todas as 31 faixas canônicas do catálogo brasileiro permanecem intactas em seus arquivos de áudio originais e metadados.
2. **Economia de RockCoins:** Preservadas as regras de concessão (moedas por estrelas, bônus por recorde pessoal, desbloqueio na loja).
3. **Tela SHOW FINALIZADO:** Preservadas as 9 seções na ordem oficial aprovada, sem sobreposição vertical em nenhuma resolução (testado de 320x568 a 1280x720).
4. **Arquitetura Android:** Documento `PLANO_ANDROID_ROCKBRAZIL.md` atualizado com as diretrizes do player widescreen 16:9 e tempos de aproximação da V13.8.5. Nenhum APK prematuro gerado.
