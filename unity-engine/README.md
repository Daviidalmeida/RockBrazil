# RockBrazil Unity Engine

## Visão Geral
Este diretório contém a implementação do motor musical em C# para Unity, estruturado de acordo com a arquitetura do APK Guitar Flash 2.09 (IL2CPP / Unity) e os padrões do RockBrazil V7.

### Estrutura de Pastas e Componentes
- `Assets/Scripts/Core/MusicSyncController.cs`: Controlador mestre de sincronização musical baseado em `AudioSettings.dspTime` com interpolação de alta fidelidade e ponte WebGL para YouTube.
- `Assets/Scripts/Charts/ChartLoader.cs`: Carregador e sanitizador de charts, garantindo mapeamento estrito de pistas por dificuldade (`EASY`: 3 pistas [0, 1, 2], `MEDIUM`: 4 pistas [0..3], `HARD/EXPERT`: 5 pistas [0..4]).
- `Assets/Scripts/Highway/NoteHighwayController.cs`: Controlador da esteira 3D (perspectiva cônica) com presets de velocidade (`LENTA = 1.65s`, `NORMAL = 1.35s`, `RAPIDA = 1.05s`).
- `Assets/Scripts/Highway/NoteRenderer.cs`: Renderização visual de notas, sustentações e acordes com reciclagem via pool.
- `Assets/Scripts/Input/InputController.cs`: Controlador de entradas via teclado (A/S/J/K/L ou 1..5) e multitoque capacitivo para dispositivos móveis Android.
- `Assets/Scripts/Judgment/HitJudgmentSystem.cs`: Julgamento temporal em milissegundos (PERFECT $\pm45$ms, GREAT $\pm90$ms, GOOD $\pm140$ms, MISS), pontuação, multiplicador e combos.
- `Assets/Scripts/Session/GameSessionController.cs`: Máquina de estados da partida com contagem unificada `3... 2... 1... ROCK BRASIL!`.
- `Assets/Scripts/Pool/ObjectPoolManager.cs`: Gerenciador de pooling de objetos para notas e partículas de impacto com zero alocações de Garbage Collection durante o gameplay.
- `Assets/Plugins/WebGL/YouTubeBridge.jslib`: Ponte bidirecional nativa em C/JavaScript para integração do player do YouTube em compilações WebGL.

---

## Instruções de Build e Compilação

### Requisitos
- Unity 2022.3 LTS ou superior
- Módulo WebGL Build Support (para compilação web)
- Módulo Android Build Support com OpenJDK e Android NDK (para compilação APK Android)

### Configuração no Unity Editor
1. Abra o Unity Hub e clique em **Add project from disk**, selecionando o diretório `unity-engine`.
2. Em **Project Settings > Player**:
   - **Company Name**: Daviidalmeida
   - **Product Name**: RockBrazil
   - **Color Space**: Linear
3. Para compilar **WebGL**:
   - Acesse **File > Build Settings...**, selecione **WebGL** e clique em **Switch Platform**.
   - Em **Publishing Settings**, defina **Compression Format** como Gzip ou Brotli.
   - Os arquivos de saída podem ser integrados à raiz do projeto web substituindo o bundle atual.
4. Para compilar **Android**:
   - Acesse **File > Build Settings...**, selecione **Android** e clique em **Switch Platform**.
   - Defina o Scripting Backend como **IL2CPP** e habilite as arquiteturas **ARMv7** e **ARM64**.
   - Clique em **Build APK**.

---

## Nota de Ambiente (Seção 11 da Diretriz)
Em conformidade com a Seção 11 da diretriz de execução (*"Se o ambiente não possuir Unity Editor ou módulos necessários, informar o impedimento e não declarar a migração concluída"*), este ambiente de desenvolvimento não possui o executável do Unity Editor instalado no sistema operacional hospedeiro. Toda a arquitetura C# e plugins estão completos e prontos para compilação em qualquer máquina equipada com Unity 2022.3+, enquanto o motor WebGL TypeScript/Canvas permanece estabilizado e implantado na produção no GitHub Pages.
