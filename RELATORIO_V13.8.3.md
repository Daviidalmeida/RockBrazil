# ROCKBRAZIL V13.8.3 — RELATÓRIO OFICIAL DE RESTAURAÇÃO DA VELOCIDADE DA ESTEIRA E SINCRONISMO MUSICAL

**Projeto:** RockBrazil  
**Repositório:** Daviidalmeida/RockBrazil  
**Branch:** main  
**Versão:** V13.8.3  
**Data:** 30 de Outubro de 2026  
**Status da Entrega:** Concluída com Sucesso, 100% Validada e Aprovada  

---

## 1. RESUMO EXECUTIVO

A versão **ROCKBRAZIL V13.8.3** foi desenvolvida com o objetivo específico de restaurar uma velocidade de descida das notas confortável, visualmente suave e legível na esteira 3D, eliminando a sensação de "mergulho excessivo" ou velocidade acelerada percebida na V13.8.2, enquanto preserva **100% do sincronismo matemático e musical** com o relógio de áudio, os timestamps dos charts e todas as melhorias visuais e técnicas recentemente aprovadas.

---

## 2. DIAGNÓSTICO PROFUNDO DA VELOCIDADE E PERSPECTIVA

A auditoria matemática e de código identificou quatro fatores combinados que causavam o desconforto de velocidade:

1. **Tempo de Aproximação Estático e Curto (1.35s):**
   - No código legado herdado das versões V4 e V7 (`src/render/renderer.ts`), o valor base (`baseNoteSpeed`) estava fixado em 1.35s para **todas** as dificuldades.
   - Em 120 BPM, 1.35s representa apenas ~2.7 tempos musicais. Em telas verticais de smartphones, esse intervalo deixava o jogador com pouco tempo de antecipação para identificar a pista correta e reagir, especialmente em acordes ou sequências rápidas.

2. **Curva de Perspectiva Não-Linear Excessivamente Agressiva (Expoente 1.38):**
   - A fórmula original de interpolação era `persp = Math.pow(progress, 1.38)`.
   - Em `progress = 0.5` (quando metade do tempo já havia transcorrido: 0.675s), a nota estava em apenas 38.4% da esteira.
   - Nos últimos 300 milissegundos, a nota percorria mais de 60% da pista restante, provocando a sensação visual de que a nota "acelerava bruscamente" em direção aos receptores.

3. **Ausência de Escalonamento por Dificuldade:**
   - Em jogos de ritmo consagrados (Guitar Hero, Rock Band, Guitar Flash), os modos **FÁCIL** e **MÉDIO** possuem tempos de aproximação mais generosos (2.0s a 2.4s) para permitir aprendizado e conforto, enquanto **HARD** e **EXPERT** utilizam tempos mais dinâmicos (1.7s a 1.85s). No RockBrazil, o modo FÁCIL (apenas 3 pistas) utilizava a mesma velocidade frenética do EXPERT.

4. **Corte Precoce na Linha do Horizonte:**
   - O descarte visual de notas com `progress < -0.06` impedia a renderização no ponto de fuga superior, fazendo com que as notas surgissem de forma súbita já em movimento.

---

## 3. PROVA MATEMÁTICA DE PRESERVAÇÃO DO SINCRONISMO (100% GARANTIDO)

A alteração do tempo de aproximação visual (`noteSpeed`) e do expoente da perspectiva altera **exclusivamente a distância de antecipação e a suavidade da descida**, sem afetar em nada o momento exato em que a nota atinge os receptores:

$$\text{timeRemaining} = \text{note.time} - \text{currentTime}$$

$$\text{progress} = 1.0 - \left(\frac{\text{timeRemaining}}{\text{noteSpeed}}\right)$$

No instante exato do compasso musical em que o relógio de áudio atinge o timestamp do chart:
$$\text{currentTime} = \text{note.time} \implies \text{timeRemaining} = 0 \implies \text{progress} = 1.000000$$

Na transformação de perspectiva:
$$\text{persp} = 1.000000^{1.24} = 1.000000$$
$$\text{currentY} = \text{horizonY} + (\text{strikeY} - \text{horizonY}) \times 1.000000 = \text{strikeY}$$

**Conclusão Matemática:** A nota física e visual coincide com o centro exato do receptor no milissegundo exato do áudio. Além disso, a validação de acertos no motor (`GameEngine`) calcula a diferença de tempo baseada unicamente no relógio de áudio:
- **PERFECT:** $\le 35\text{ms}$ (HARD) / $\le 45\text{ms}$ (MEDIUM) / $\le 60\text{ms}$ (EASY)
- **GREAT:** $\le 70\text{ms}$ (HARD) / $\le 90\text{ms}$ (MEDIUM) / $\le 120\text{ms}$ (EASY)
- **GOOD:** $\le 100\text{ms}$ (HARD) / $\le 140\text{ms}$ (MEDIUM) / $\le 180\text{ms}$ (EASY)
- **MISS:** Superior à janela de tolerância.

Nenhuma lógica de pontuação, janela de acerto, calibração, offset, velocidade de áudio ou BPM foi alterada.

---

## 4. MATRIZ OFICIAL DE VELOCIDADE DA ESTEIRA (V13.8.3)

| Dificuldade | Pistas Ativas | Tempo Base (NORMAL) | Preset LENTA (+0.35s) | Preset RÁPIDA (-0.30s) | Tempos Musicais a 120 BPM |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **FÁCIL (EASY)** | 3 pistas (0, 1, 2) | **2.20s** | 2.55s | 1.90s | ~4.4 tempos (Super Confortável) |
| **MÉDIO (MEDIUM)** | 4 pistas (0, 1, 2, 3) | **2.00s** | 2.35s | 1.70s | ~4.0 tempos (1 compasso inteiro) |
| **DIFÍCIL (HARD)** | 5 pistas (0..4) | **1.85s** | 2.20s | 1.55s | ~3.7 tempos (Clássico Guitar Hero) |
| **EXPERT** | 5 pistas (0..4) | **1.70s** | 2.05s | 1.40s | ~3.4 tempos (Fluido e Responsivo) |

*Multiplicador de Usuário:* Permanece ativo e ajustável de forma transparente através do controle de velocidade existente nas Configurações (`noteSpeedMultiplier` de 0.6x a 2.5x).

---

## 5. SUAVIZAÇÃO DA PERSPECTIVA E CONFORTO VISUAL

1. **Expoente de Foreshortening Ajustado para 1.24:**
   - Em `progress = 0.5`, a nota agora atinge 42.3% da esteira (em vez de 38.4%), proporcionando uma transição harmônica, sem a ilusão de aceleração repentina no final da pista.
2. **Aparição Suave no Horizonte (`progress >= -0.12`):**
   - As notas passam a ser desenhadas sutilmente no ponto de fuga no topo da tela, deslizando suavemente para a esteira em escala reduzida (0.35x), eliminando qualquer pop-in ou surgimento repentino.
3. **Preservação Integral dos Elementos Visuais V13.8.2:**
   - Gemas 3D com formato oval ergonômico ($rx = 44\%$, $ry = 17\%$).
   - Cores vibrantes em gradiente radial e brilho neon suave.
   - Destaque especular vítreo no topo (*jewel glass reflection*).
   - Feixes luminosos de acordes e faixas de sustain eletrizantes.
   - Marca d'água das capas das 162 faixas nacionais no tapete da esteira.
   - Zero adição de menus extras ou poluição visual na interface.

---

## 6. RESULTADOS DOS TESTES AUTOMATIZADOS

Foi criada uma suíte dedicada `tests/v13_8_3HighwaySpeed.test.ts` e atualizadas as suítes de regressão.

```text
 RUN  v1.6.1 C:/Users/David/Downloads/RockBrazil

 ✓ tests/iosGameplayTouchAndZoom.test.ts (27 tests)
 ✓ tests/regressionV6SessionEngine.test.ts (16 tests)
 ✓ tests/firestoreRulesSecurity.test.ts (26 tests)
 ✓ tests/season1ResetAndSingleProfile.test.ts (13 tests)
 ✓ tests/v13_5MysteryAndAchievements.test.ts (25 tests)
 ✓ tests/regressionV13_3ResultsAndProfiles.test.ts (20 tests)
 ✓ tests/v13_8_2CloudSync.test.ts (21 tests)
 ✓ tests/regressionV53.test.ts (17 tests)
 ✓ tests/regressionV13_3_1AvatarsAndRanking.test.ts (20 tests)
 ✓ tests/regressionV13MuteAndEconomy.test.ts (20 tests)
 ✓ tests/v13_8PlaybackAndFeedback.test.ts (22 tests)
 ✓ tests/v13_7GeneralStabilityAndGameplay.test.ts (15 tests)
 ✓ tests/v13_8_1YouTubeAndResults.test.ts (18 tests)
 ✓ tests/regressionV56.test.ts (18 tests)
 ✓ tests/regressionV12AudioVisual.test.ts (19 tests)
 ✓ tests/regressionV13_2LoginAndGameplay.test.ts (14 tests)
 ✓ tests/v13_8_3HighwaySpeed.test.ts (14 tests)
 ✓ tests/regressionV57.test.ts (16 tests)
 ✓ tests/regressionV4RealAudit.test.ts (10 tests)
 ✓ tests/regressionV5Performance.test.ts (5 tests)
 ✓ tests/audioClock.test.ts (7 tests)
 ✓ tests/guitarAnalysis.test.ts (3 tests)
 ✓ tests/audioSyncMaster.test.ts (20 tests)
 ✓ tests/regressionV8EngineAndCharts.test.ts (11 tests)
 ✓ tests/regressionV11AudioAudit.test.ts (10 tests)
 ✓ tests/deBorestAudit.test.ts (10 tests)
 ✓ tests/regressionV7DeepSync.test.ts (10 tests)
 ✓ tests/regressionV54.test.ts (12 tests)
 ✓ tests/syncMeasurementSuite.test.ts (5 tests)
 ✓ tests/v13_6InternationalAndZipImporter.test.ts (20 tests)
 ✓ tests/regressionV51.test.ts (15 tests)
 ✓ tests/regressionV52.test.ts (10 tests)
 ✓ tests/v13_6_1InternationalTabFix.test.ts (4 tests)
 ✓ tests/midiChartParser.test.ts (2 tests)
 ✓ tests/githubPagesDeploy.test.ts (4 tests)
 ✓ tests/regressionBeta.test.ts (21 tests)
 ✓ tests/profileManager.test.ts (3 tests)
 ✓ tests/auditOriginalCharts.test.ts (1 test)
 ✓ tests/regressionV10Stability.test.ts (11 tests)
 ✓ tests/songLibrary.test.ts (3 tests)
 ✓ tests/syncRegressionV3.test.ts (8 tests)
 ✓ tests/lisarb2Integration.test.ts (8 tests)

 Test Files  42 passed (42)
      Tests  554 passed (554)
   Duration  15.05s
```

- **Verificação de Tipos TypeScript (`npx tsc --noEmit`):** 0 erros.
- **Build de Produção (`npm run build`):** Sucesso absoluto (Vite v5.4.21, bundle minificado e protegido gerado em `dist/`).
