# RockBrazil V13.8 — relatório de implementação e entrega

Data: 28/10/2026. Repositório: `Daviidalmeida/RockBrazil`.

A implementação está na branch `codex/v13.8`, disponível para revisão e teste. **Não há comprovação de reprodução real do YouTube neste ambiente, nem validação em celulares físicos.** Não declarar a versão 100% funcional antes dessas verificações.

## 1. Git, histórico e publicação

- Base inspecionada: `0ad679519d711b5fe87e3439e708781a58e3de63`, último commit da main na conferência de entrega, V13.7.
- Histórico consultado: V13.7, V13.6.1, importação internacional V13.6 e correções anteriores de interface/áudio.
- Commit de implementação: `36170ed` — reprodução real, resultados e feedback.
- Commit de testes/CI: `19831a0` — regressões, lockfile e automação de navegador.
- Relatório e evidências são incluídos em commit de documentação posterior; o hash desse commit pode ser consultado em `git log -1 -- RELATORIO_V13.8.md`.
- Pull Request: https://github.com/Daviidalmeida/RockBrazil/pull/1
- PR aberto como **draft**, pois streaming, sincronização com a gravação e dispositivos físicos ainda precisam de validação.
- Branch enviada ao GitHub. Nenhum merge automático foi realizado.
- **GitHub Pages não foi atualizado por esta entrega.** O workflow de publicação existente continua associado à main. O novo workflow de revisão testa a branch/PR sem etapa de deploy.

## 2. Implementações e causas dos problemas

### YouTube — prioridade principal

A inspeção do código encontrou caminhos que podiam iniciar o jogo sem vídeo real: timeout da API ativava um simulador de tempo; ausência/falha do player também podia simular reprodução; `waitForPlaying` retornava sucesso no timeout. Eventos PLAYING e timestamps não nulos podiam confirmar uma retomada sem demonstrar novo avanço.

Correções:

- Removida a simulação de reprodução do controlador usado pelo jogo.
- Carregamento compartilhado da API, promessa de inicialização resolvida somente em `onReady`, timeout com erro e possibilidade de tentar novamente.
- Confirmação por amostras de tempo que realmente avançam, incluindo retomada em timestamp não nulo.
- Watchdog para congelar julgamentos quando os timestamps deixam de avançar; interpolação limitada entre atualizações.
- Tratamento de buffering, pause, resume, cancelamento e callbacks de instâncias antigas.
- `waitForPlaying` retorna falso quando não confirma reprodução.
- `playVideo` no gesto de desbloqueio antes de qualquer espera assíncrona; controles nativos permanecem acessíveis se o navegador exigir toque no iframe.
- `playsinline`, origem, permissões do iframe, política de referrer e área mínima de 200×200 CSS pixels para o player.
- Mensagens para erros 2, 5, 100, 101, 150, 153 e falha da API. Partidas com falha voltam ao catálogo sem registrar resultado ou cobrar moedas.
- Preparação cancelada ou inválida não inicia a contagem posteriormente.
- Proteção de duração: o vídeo precisa informar duração positiva e cobrir o fim do chart considerando o offset da música, com tolerância estrutural de 1 segundo.

A proteção de duração **não comprova que o vídeo usa a gravação correta**, nem mede sincronização auditiva. Não foram trocados IDs de vídeos sem evidência, alterados charts ou contornadas restrições de incorporação. Nenhum áudio/vídeo do YouTube foi baixado, extraído ou redistribuído.

### SHOW FINALIZADO

O layout anterior sobrepunha elementos absolutos por porcentagens a um pôster com molduras pré-desenhadas. As posições não acompanhavam corretamente dimensões, textos e proporções móveis.

A tela passou a usar fluxo vertical e grades responsivas, preservando a arte original no cabeçalho e as cores/metais da identidade RockBrazil. Título visível, card com capa real e fallback, estrelas centralizadas, pontuação destacada, RockCoins, estatísticas e julgamentos separados. Full Combo não reserva espaço quando ausente. Os três botões têm molduras próprias, texto interno, foco visível e altura mínima de 48 pixels. Safe areas, viewport dinâmico e rolagem de segurança são respeitados.

Estrelas são reveladas sequencialmente com intervalo de 130 ms e brilho discreto. Os botões ficam disponíveis durante a animação. Movimento reduzido elimina a revelação animada e a contagem progressiva do placar. A celebração intermediária foi encurtada e é pulada em movimento reduzido.

### Aplausos originais

Adicionada síntese procedural estéreo de palmas e reação de plateia, sem gravações ou samples de terceiros. Código original em `src/audio/crowdReaction.ts`; nenhuma cópia de efeitos do Guitar Hero.

Há reações distintas para conclusão normal, cinco estrelas e Full Combo, com fades, limitação de amplitude, ganho moderado, encaminhamento pelo volume SFX e proteção de duplicação. A reação começa com os resultados de uma conclusão bem-sucedida e não é chamada na derrota. Fontes são interrompidas ao sair/reiniciar. Qualidade percebida e equilíbrio em alto-falantes/fones continuam sujeitos à escuta em aparelhos reais.

### Notas e pistas

As notas/receptores usavam a largura inferior na linha de julgamento (82% da altura), enquanto as divisórias atingiam essa mesma largura somente a 99% da altura. Isso produzia divergência geométrica entre as notas e as linhas da pista.

A projeção da pista foi alinhada à projeção existente das notas e receptores, extrapolando a superfície até a borda inferior. Acordes compartilham a mesma altura para o mesmo timestamp. Feixes agora conectam somente notas com timestamp igual, sem agrupar notas diferentes por arredondamento de 20 ms.

Formato elíptico, dimensões calculadas das notas, timestamps, charts e áreas de toque foram preservados. Cores mais vivas e contorno neon discreto foram adicionados sem blur por nota. A estrutura original de dificuldades foi mantida: EASY com três pistas ativas, MEDIUM com quatro e HARD/EXPERT com cinco; esta entrega não muda essa regra preexistente.

### Julgamentos, precisão e efeitos

- PERFECT dourado, GREAT ciano, GOOD verde e MISS vermelho, imediatamente abaixo do multiplicador do HUD esquerdo.
- Apenas o julgamento mais recente é mostrado, por aproximadamente 500 ms, sem deslocamento sobre a pista e sem fila de timers por acerto.
- Resultados exibem Perfect, Great, Good, Miss, acertos, erros totais e toques extras separados.
- Preferência persistente `effectsMode: NORMAL | REDUCED`, compatível com configurações antigas. REDUCED ou preferência de movimento reduzido do sistema reduz animações e desativa novas partículas, sem alterar relógios ou gameplay.
- Corrigido offset global aplicado novamente ao relógio ao alterar configurações: o GameEngine continua responsável por aplicar esse offset uma única vez.
- Corrigido Rock Meter que podia chegar a zero somente por toques extras sem disparar derrota.

## 3. Auditoria das regras preservadas

Motor utilizado pela entrada principal: `GameEngine`. Janelas em milissegundos:

| Dificuldade | Perfect | Great | Good |
| --- | ---: | ---: | ---: |
| EASY | 60 | 120 | 180 |
| MEDIUM | 45 | 90 | 140 |
| HARD | 35 | 70 | 100 |
| EXPERT | 25 | 50 | 75 |

Foi mantida a tolerância preexistente das primeiras notas. Não foi substituído o outro sistema de julgamento existente na arquitetura, nem feita migração arbitrária de regras.

Precisão pública V13.7 preservada:

`round(100 × acertos / (acertos + notas perdidas + toques extras))`

Com 868 acertos e 12 notas perdidas, sem toques extras, o resultado arredondado é 99%. Com mais 74 toques extras, `868 / 954 × 100 = 90,985...%`, arredondado para 91%. Isso explica matematicamente um resultado possível; **não comprova que aquela partida histórica teve 74 toques extras**, pois seus dados não foram fornecidos. O defeito comprovado era não apresentar claramente os extras incluídos no denominador.

As estrelas continuam usando a precisão ponderada interna: Perfect 1, Great 0,75 e Good 0,5; cinco estrelas a partir de 95%, quatro a partir de 85%, três a partir de 70% e duas a partir de 55%. Pontos-base 100/75/50 e multiplicadores 1×/2×/3×/4× por combo foram preservados. Full Combo exige conclusão, notas válidas, zero notas perdidas e zero extras. Não houve reset de rankings, perfis, conquistas ou moedas.

## 4. Testes executados e resultados

| Verificação | Resultado |
| --- | --- |
| `npm ci --cache /tmp/rockbrazil-npm --no-audit --no-fund` | Aprovado; 258 pacotes instalados |
| `npx tsc --noEmit` | Aprovado, saída 0 |
| `npm test` | **501 testes aprovados, 39 arquivos, zero falhas** |
| `npm run build` | Aprovado; gerou produção e fallback 404 |
| `git diff --check` | Aprovado |
| Chromium sobre build de produção | **16 screenshots de fixtures**, zero erros JavaScript reportados |
| Tentativas reais da API/YouTube | Cinco tentativas; **nenhuma reprodução confirmada** |

O lockfile foi corrigido porque a instalação limpa inicialmente falhava por entradas ausentes de dependências opcionais. Não foram atualizadas arbitrariamente versões do package.json.

A suíte inclui regressões existentes de catálogo, perfis, moedas, rankings/regras, charts, dificuldades, toque, sincronização e publicação. Novos testes simulam estados do player, progressão, travamento, buffering, origem/permissões, timeout, cancelamento e mensagens; verificam precisão, acordes, derrota por extras, movimento reduzido e síntese de aplausos. Testes de áudio verificam também fades, volume zero, derrota e ausência de duplicação. **Mocks não demonstram streaming real ou experiência auditiva.** Alguns testes antigos foram ajustados porque exigiam ausência de julgamentos nos resultados ou consideravam timestamp constante suficiente para reprodução.

O Vite mantém aviso de bundle grande: JavaScript principal com cerca de 8.944,83 kB antes de gzip (1.636,93 kB gzip), incluindo os charts preexistentes. Não foi feita divisão ampla do catálogo nesta entrega.

## 5. Evidências visuais e desempenho

Arquivos em [reports/v13.8](reports/v13.8/). `ui-browser-report.json` contém medidas das caixas, botões, preferência persistente, geometria e benchmark. `validation/` contém logs e resumo de resultados.

Foram capturados e inspecionados resultados normais e Full Combo em **320×568, 360×640, 375×667, 390×844, 412×915, 430×932**, além de **1440×900**. Foram verificados carregamento efetivo da capa, ausência de sobreposição/corte nos componentes medidos, texto interno dos botões, alvos mínimos e alcance por hit testing. Há captura adicional com movimento reduzido e outra do HUD com notas simultâneas e julgamento.

As estatísticas são injetadas pela automação para exercitar a UI. As imagens vêm do navegador real, mas **não representam partidas completas**. Os cliques dos três botões verificam encaminhamento a callbacks de teste; não comprovam sessão autenticada do ranking.

Benchmark final: 180 renderizações com 2.000 notas no cenário; mediana aproximada de 0,7 ms e percentil 95 de 1,4 ms, em Chromium headless de desktop. Não é medição de FPS ou autonomia térmica de celular físico.

## 6. Estado real do YouTube

As cinco músicas — Highway to Hell, Paradise City, Sweet Child o' Mine, Welcome to the Jungle e Numb — foram tentadas no navegador, sem mock do serviço e sem flag que contorne autoplay. Todas registraram falha de acesso à `https://www.youtube.com/iframe_api` pelo proxy (`net::ERR_TUNNEL_CONNECTION_FAILED`). Na investigação anterior, o túnel também respondeu HTTP 403.

O último relatório confirma retorno ao catálogo, relógio em zero e nenhum miss nas cinco tentativas. Mensagens e amostras constam de `youtube-browser-report.json` e `validation/youtube.log`. As screenshots do diagnóstico mostram o catálogo após dispensar a mensagem, não um vídeo reproduzindo.

Não há evidência suficiente para afirmar que os cinco IDs permitem incorporação em todas as regiões, que a gravação de cada vídeo corresponde ao chart ou que o áudio está sincronizado. Metadados antigos do catálogo com rótulos de verificação não foram tratados como comprovação de funcionamento.

## 7. Pendências e limitações de aceitação

1. Em Android e iPhone físicos, testar as cinco músicas com acesso normal ao YouTube; conferir gravação, início, meio/fim, offset, volume, bloqueio por gesto, Pause/Resume, buffering e retorno do segundo plano.
2. Se o vídeo não cobrir o chart ou tiver incorporação bloqueada, manter a recusa. Selecionar outra gravação somente após revisão de compatibilidade e permissões; nunca baixar/extrair mídia para contornar a restrição.
3. Ouvir os três níveis de reação em fones e alto-falantes, inclusive SFX zero, replay e derrota.
4. Validar Firebase/Google, sincronização de perfil, envio/leitura real de rankings e desbloqueios em sessão autenticada. Os testes automatizados não substituem isso.
5. Conferir safe areas e barras do navegador nos aparelhos reais. As resoluções foram exercitadas em Chromium desktop, não em Safari/iOS físico.
6. Verificar o resultado do GitHub Actions no PR. Os resultados locais acima não significam que a execução remota já terminou.

## 8. Testar a branch e publicar após aprovação

Para teste local, faça checkout de `codex/v13.8`, execute `npm ci`, `npm test` e `npm run build`. Use `npm run dev` ou `npm run preview` e abra `/RockBrazil/`. Para capturas, instale Chromium com `npx playwright install chromium` e execute `node scripts/verify-v13.8-ui.mjs` com o servidor ativo. A variável `ROCKBRAZIL_URL` permite usar a URL do preview de produção.

O push desta branch **não muda o endereço público do GitHub Pages**. Após os testes físicos e revisão: retirar o draft, aprovar e fazer merge manual do PR na main. Acompanhar o workflow `Deploy RockBrazil to GitHub Pages`; somente sua execução bem-sucedida publicará a nova versão. Não disparar publicação antecipadamente a partir desta branch.

## 9. Arquivos modificados

- `.github/workflows/review-v13.8.yml`
- `index.html`
- `package-lock.json`
- `scripts/verify-v13.8-ui.mjs`
- `scripts/verify-v13.8-youtube.mjs`
- `src/audio/audioManager.ts`
- `src/audio/crowdReaction.ts`
- `src/audio/youtubePlayer.ts`
- `src/game/engine.ts`
- `src/game/settingsManager.ts`
- `src/game/sync/prestartSystem.ts`
- `src/game/sync/videoChartCompatibility.ts`
- `src/game/visualEffects.ts`
- `src/main.ts`
- `src/render/renderer.ts`
- `src/style.css`
- `src/types.ts`
- `src/ui/uiManager.ts`
- `tests/audioSyncMaster.test.ts`
- `tests/regressionV12AudioVisual.test.ts`
- `tests/regressionV54.test.ts`
- `tests/v13_8PlaybackAndFeedback.test.ts`
- `RELATORIO_V13.8.md` — este relatório.
- `reports/v13.8/` — 21 screenshots finais, relatórios JSON, logs e resumo de validação; sem mídia extraída do YouTube.

## 10. Conferência do CI remoto

As execuções [40692390415](https://github.com/Daviidalmeida/RockBrazil/actions/runs/40692390415) e [40692584062](https://github.com/Daviidalmeida/RockBrazil/actions/runs/40692584062), referentes ao código/testes enviados, terminaram com `success`. O envio posterior de documentação dispara novas execuções; seu estado atualizado permanece disponível no PR. Sucesso do CI não valida streaming do YouTube nem aparelhos físicos.
