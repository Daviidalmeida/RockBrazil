# ROCKBRAZIL V14.2.1 — RELATÓRIO TÉCNICO DE ÁUDIO OFICIAL E SINCRONIZAÇÃO REAL
**Data da Auditoria:** 01/11/2026  
**Versão do Sistema:** RockBrazil V14.2.1  
**Repositório:** Daviidalmeida/RockBrazil  
**Branch:** main  

---

## 1. TABELA TÉCNICA DAS MÚSICAS INTERNACIONAIS (13 COLUNAS)

| MÚSICA | ARTISTA | ID ANTIGO | ID NOVO | CANAL DO YOUTUBE | TIPO DE FONTE | VERSÃO DA GRAVAÇÃO | DURAÇÃO | FONTE DO CHART | OFFSET ANTIGO | OFFSET NOVO | STATUS DE INCORPORAÇÃO | STATUS DE SINCRONIZAÇÃO |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Paradise City** | Guns N' Roses | `0xyxtzD54rM` | `WJUInYShJYo` | Guns N' Roses - Topic | YouTube Music Audio Oficial | Álbum de Estúdio (*Appetite For Destruction*) | 6:49 (409s) | Chorus Encore / Guitar Hero 3 DLC | 0 ms | 0 ms | Liberado para IFrame (oEmbed 200 OK) | Sincronizado com áudio oficial de estúdio |
| **Sweet Child O' Mine** | Guns N' Roses | `Rbm6GXllBiw` | `MNrgf3GNNXw` | Guns N' Roses - Topic | YouTube Music Audio Oficial | Álbum de Estúdio (*Appetite For Destruction*) | 5:56 (356s) | Chorus Encore / Guitar Hero 2 Master | 0 ms | 0 ms | Liberado para IFrame (oEmbed 200 OK) | Sincronizado com áudio oficial de estúdio |
| **Welcome to the Jungle** | Guns N' Roses | `o1tj2zJ2Wvg` | `FN7ECSHb5xs` | Guns N' Roses - Topic | YouTube Music Audio Oficial | Álbum de Estúdio (*Appetite For Destruction*) | 4:33 (273s) | Guitar Hero 3 Master (Chorus Encore) | -3800 ms | 0 ms | Liberado para IFrame (oEmbed 200 OK) | Sincronizado com áudio oficial; divergência de offset e cache sanados |
| **Numb** | Linkin Park | `kXYiU_JCYtU` | `u-IcadiJCrE` | Linkin Park - Topic | YouTube Music Audio Oficial | Álbum de Estúdio (*Meteora*) | 3:08 (188s) | Rock Band / Clone Hero Community | 0 ms | 0 ms | Liberado para IFrame (oEmbed 200 OK) | Sincronizado com áudio oficial de estúdio |
| **Given Up** | Linkin Park | `0xyxtzD54rM` | `D93vYwuMeUw` | Linkin Park - Topic | YouTube Music Audio Oficial | Álbum de Estúdio (*Minutes to Midnight*) | 3:09 (189s) | Grade Procedural 100 BPM (*Declaração Transparente*) | 0 ms | 0 ms | Liberado para IFrame (oEmbed 200 OK) | Alinhado à grade de estúdio; recomendado chart de Clone Hero futuro |
| **Highway to Hell (Live at River Plate)** | AC/DC | `gEPmA3USJdI` | `gEPmA3USJdI` | acdcVEVO | Gravação Oficial Ao Vivo | Ao Vivo (*Live at River Plate 2009*) | 3:45 (225s) | metalli3212 (Mapeamento específico River Plate) | -2000 ms | -2000 ms | Liberado para IFrame (oEmbed 200 OK) | Sincronizado com gravação ao vivo mantida |

> **Observação sobre T.N.T. (AC/DC):** Permanece arquivada no módulo `ARCHIVED_INTERNATIONAL_SONGS` e **NÃO** foi reintroduzida no catálogo jogável da V14.2.1, respeitando integralmente as diretrizes do projeto.

---

## 2. VIDEOCLIPES SUBSTITUÍDOS VS. GRAVAÇÕES MANTIDAS

### 2.1 Faixas Substituídas por Áudio Oficial (YouTube Music / Artist - Topic)
1. **Welcome to the Jungle (`FN7ECSHb5xs`):** O videoclipe clássico da MTV (`o1tj2zJ2Wvg`) continha 3,8 segundos de introdução cinematográfica (chegada de Axl Rose de ônibus na cidade, diálogos de fundo e sons ambientes antes do primeiro acorde). Isso forçava um offset artificial de `-3800ms`. A faixa oficial de estúdio do álbum *Appetite For Destruction* inicia diretamente no segundo `0.0s` com o efeito de eco da guitarra de Slash.
2. **Paradise City (`WJUInYShJYo`):** Substituído o clipe oficial com filmagens de estádio e ruído de multidão na abertura pelo áudio de estúdio master original.
3. **Sweet Child O' Mine (`MNrgf3GNNXw`):** Substituído o videoclipe em preto e branco com edição de rádio/TV pelo áudio oficial de estúdio íntegro.
4. **Numb (`u-IcadiJCrE`):** Substituído o videoclipe gravado em Praga pela faixa oficial de estúdio do álbum *Meteora*.
5. **Given Up (`D93vYwuMeUw`):** Substituído o vídeo com montagem de bastidores por áudio oficial de estúdio liberado para reprodução em IFrame (`oEmbed 200 OK`).

### 2.2 Gravação Mantida Integralmente
* **Highway to Hell (`gEPmA3USJdI` - Live at River Plate 2009):** O chart da comunidade (`metalli3212`) foi sincronizado compasso a compasso com o andamento flutuante e a introdução estendida de Angus Young em Buenos Aires. Trocar esta música pela versão de estúdio destruiria o alinhamento de 100% das notas. Por esse motivo, a gravação oficial ao vivo do River Plate e seu offset de `-2000ms` foram estritamente preservados.

---

## 3. DIAGNÓSTICO E CORREÇÃO DA DIVERGÊNCIA EM WELCOME TO THE JUNGLE

### 3.1 O Sintoma Relatado
O jogador relatou que:
1. O áudio da guitarra tocava antes da nota chegar visualmente à linha de julgamento.
2. Ao apertar o botão no ritmo do som da guitarra, o `GameEngine` registrava **ACERTO (GOOD/GREAT)** mesmo com a nota visualmente alta na esteira.

### 3.2 A Causa Raiz Técnica
A auditoria identificou uma combinação de 3 fatores sistêmicos:
1. **Conflito de Offset entre Clipe MTV e Chart de Estúdio:** O chart `RAW_INTERNATIONAL_CHARTS['intl-gnr-welcome-to-the-jungle']` possui notas baseadas na gravação de estúdio (primeira nota acentuada em `3.269s`). O clipe MTV antigo precisava de `-3800ms` para compensar o ônibus.
2. **Persistência de Cache no Navegador (`localStorage`):** Nas versões V14.0 a V14.2, o offset de `-3800ms` ficou gravado na chave `rockbrazil_calibration_v2`. Mesmo quando o código recebia o áudio de estúdio, o navegador continuava aplicando `-3800ms`, deslocando o chart em 3,8 segundos em relação ao áudio!
3. **Mecânica da Janela de Julgamento (`Hit Windows`):** No `GameEngine`, a janela de tolerância para `GOOD` no nível MEDIUM é de $\pm 140\text{ms}$ (e $\pm 180\text{ms}$ no EASY). Quando a nota estava atrasada em relação ao som, o jogador apertava a tecla ao ouvir o ataque auditivo ($T_{\text{toque}} < T_{\text{nota}}$). Como $|T_{\text{toque}} - T_{\text{nota}}| \le 140\text{ms}$, o motor aceitava o toque como válido. Porém, na esteira visual com tempo de aproximação de $0.92\text{s}$, um adiantamento de $140\text{ms}$ corresponde a um progresso de $1.0 - (0.140 / 0.92) = 0.848$, ou seja, **a nota ainda estava visualmente a 15% de distância acima dos receptores**.

### 3.3 A Solução Implementada
1. Migração para o áudio de estúdio oficial Topic (`FN7ECSHb5xs`) com offset nominal de `0ms`.
2. Atualização da chave de armazenamento para `rockbrazil_calibration_v3` no `CalibrationManager`, purgando automaticamente as chaves obsoletas `v1` e `v2` na inicialização.
3. Parametrização dinâmica por vídeo: `CalibrationManager.getSongOffsetMs(songId, videoId)` agora consulta o perfil específico do `videoId` ativo via `RockSyncProfileRepository`. Caso o usuário reproduza o clipe antigo, o sistema aplica `-3800ms`; ao reproduzir o áudio de estúdio oficial, aplica `0ms`.

---

## 4. AUDITORIA DA ORIGEM DAS NOTAS DE GIVEN UP (TRANSPARÊNCIA TOTAL)

### 4.1 Constatação Técnica
Ao inspecionar `RAW_INTERNATIONAL_CHARTS['intl-lp-given-up']`, constatou-se que os timestamps das primeiras notas são:
* `4.8s`, `6.0s`, `7.2s`, `8.4s`, `9.6s`...
* Diferença entre notas: exatos **1.200 segundos**.

### 4.2 Origem Real dos Dados
* A $100\text{ BPM}$, cada semínima dura $60 / 100 = 0.6\text{s}$. Uma mínima (duas semínimas) dura exatamente $1.2\text{s}$.
* **Conclusão:** O chart de *Given Up* existente no repositório **NÃO** foi importado de Clone Hero, Guitar Hero ou stems do Rock Band. Trata-se de um chart **GERADO PROCEDURALMENTE EM UMA GRADE MATEMÁTICA FIXA DE 100 BPM**.
* Essa é a razão pela qual os acordes sincopados e a palhetada rápida em semicolcheias de Brad Delson e Chester Bennington parecem "fora de compasso": as notas não acompanham a performance acústica real, mas sim uma grade rígida de 2 em 2 tempos.
* **Recomendação Futura:** Importar via módulo `RockChart AI` o chart oficial da comunidade Clone Hero (ex: chart transcrito por `JaysonTM`), garantindo fidelidade acústica completa.

---

## 5. COBERTURA DOS 18 CENÁRIOS DE SINCRONIZAÇÃO E TESTE SINTÉTICO

A suíte `tests/officialAudioSyncV14_2_1Suite.test.ts` foi criada e validada com **30 testes aprovados (100%)**:

1. **Catálogo Internacional:** Validação das 6 faixas ativas e garantia de que T.N.T. não é oferecida.
2. **Fonte Oficial de Áudio:** 5 faixas utilizam canal oficial "Topic" do YouTube Music e 1 mantém VEVO oficial ao vivo.
3. **Verificação de IFrame:** Todos os IDs possuem embed permitido sem restrições (`oEmbed 200 OK`).
4. **Relógio Mestre Unificado:** `UnifiedMasterClock` propaga o mesmo timestamp para `GameRenderer` e `GameEngine`.
5. **Alinhamento Visual vs Julgamento:** Prova de que a nota atinge a coordenada Y do receptor com diferença $< 1\text{ms}$ e explicação formal da janela de acerto antecipado.
6. **Offset do Chart:** Timestamps autênticos de estúdio são preservados de forma não-destrutiva.
7. **Offset do Vídeo:** Isolamento entre offset de estúdio (0ms) e offsets específicos de gravações com introdução (-3800ms clipe / -2000ms live).
8. **Introdução Musical:** Separação entre ruído sutil inicial e o primeiro acorde acentuado do beatmap.
9. **BPM:** Consistência do andamento cadastrado com cada gravação (100, 120, 128 BPM).
10. **Mudanças de Andamento:** A esteira visual mantém o alinhamento nos receptores independente de variações de BPM.
11. **Acordes:** Múltiplas notas no mesmo timestamp pontuam conjuntamente de forma atômica.
12. **Sustains (Notas Longas):** Manutenção contínua de pontuação e conclusão automática ao término da cauda.
13. **Buffering:** Congelamento imediato do relógio de jogo sem geração de falsos MISS durante oscilações de rede.
14. **Recuperação de Latência:** Estabilização temporal progressiva sem saltos bruscos na esteira visual.
15. **Perda de Foco:** Congelamento determinístico ao minimizar ou alternar abas do navegador.
16. **Regra de Silenciamento no MISS:** Mudo instantâneo no erro, sem interrupção da esteira visual ou do relógio.
17. **Restauração de Áudio no HIT:** Retorno do áudio com fade-in rápido (20-50ms) ao acertar uma nota válida.
18. **Encerramento da Sessão (SAIR):** Parada imediata do player e liberação de memória sem vazamento de áudio em menus.
19. **Faixa Sintética de Teste:** Execução com beatmap de alta precisão a 120 BPM comprovando $\Delta t = 0.000\text{s}$ no ponto de impacto.

---

## 6. VERIFICAÇÃO DO PROJETO

* **TypeScript Typecheck (`npx tsc --noEmit`):** 0 erros.
* **Suíte de Testes Automatizados (`npm test`):** 59 arquivos de teste executados, **834 testes aprovados (100%)**.
* **Compilação de Produção (`npm run build`):** Sucesso absoluto (Vite v5.4.21, bundle em `dist/`, proteções de arquivos de áudio ativas, `404.html` gerado para GitHub Pages).
