# RELATÓRIO TÉCNICO DE ENGENHARIA — ROCKSYNC ENGINE
## DESACOPLAMENTO DE RELÓGIO E RESILIÊNCIA A ERROS
**RockBrazil V13.9**

---

### 1. CONTEXTO DO PROBLEMA HISTÓRICO
Em versões anteriores (V13.6 a V13.8.4), observou-se que durante a reprodução de faixas internacionais e vídeos do YouTube, erros cometidos pelo jogador (especialmente sequências de notas perdidas ou acordes errados) provocavam:
- Congelamentos repentinos da esteira 3D (*highway stutter*);
- Atrasos acumulados no deslocamento das notas;
- Sensação de "lag" ou dessincronização progressiva.

---

### 2. AUDITORIA E CAUSA RAIZ IDENTIFICADA
1. **Acoplamento Inadequado de Mudo com postMessage:**
   A cada nota perdida, o motor disparava `onMiss` $\to$ `onMuteRequested(true)` $\to$ `ytPlayer.setMuted(true)`. Cada chamada invocava cross-origin `postMessage` (`mute()` e `setVolume(0)`) para o iframe do YouTube. Em sequências rápidas de erros, dezenas de mensagens competiam na fila do navegador.
2. **Janela de Extrapolação Restrita no Relógio:**
   O método `getCurrentTime()` no controlador do YouTube limitava a interpolação temporal a no máximo $100\text{ ms}$ (`Math.min(0.1, ...)`). Caso as mensagens postMessage atrasassem a atualização de tempo por mais de 100 ms, o relógio mestre retornava um tempo estagnado, parando o renderizador no meio do frame.

---

### 3. ARQUITETURA DA SOLUÇÃO ROCKSYNC
1. **Guarda de Transição de Estado:**
   Implementação do método `evaluateMuteTransition(shouldMute: boolean)` no `RockSyncEngine` e verificação `if (this.isMissMuted === muted) return;` no `youtubePlayer.ts`.
   - Se o áudio já está mutado, novos misses **NÃO** geram chamadas para o player.
   - 50 erros consecutivos geram exatamente **1** transição de mudo na primeira falha e **0** comandos subsequentes.
2. **Buffer de Extrapolação Contínua:**
   A janela de interpolação do player de YouTube foi expandida de 100ms para 750ms durante o estado `PLAYING`:
   ```ts
   const maxInterpolation = 0.75; // 750ms absorvem qualquer atraso de renderização ou fila
   ```
3. **Isolamento de Processamento:**
   O processamento de notas no renderizador e no relógio unificado opera em complexidade temporal constante $O(1)$, totalmente isolado de cálculos de HUD, estatísticas e efeitos visuais.

---

### 4. RESULTADOS DE TESTES AUTOMATIZADOS (`tests/rockSyncEngine.test.ts`)
- **Teste 1:** 50 erros consecutivos executados $\to$ 0 travamentos registrados, tempo do relógio estritamente monótono e progressivo.
- **Teste 2:** 20 erros após o primeiro miss $\to$ exatamente 1 evento de mudo acionado; acerto posterior $\to$ 1 evento de desmudo acionado.
- **Teste 3:** Rajada de 200 eventos ultrarrápidos (acordes + misses) processada em menos de 10 ms (tempo desprezível para manter 60 FPS).
- **Teste 4:** Queda forçada de FPS (gap de 250 ms simulando garbage collection) absorvida com continuidade temporal sem perda de coordenadas.
