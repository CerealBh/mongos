# Binder App (v0.2)

Um aplicativo web interativo de gerenciamento de fichários (binders) focada em cards e TCG, com ferramentas avançadas UI/UX.
Acesse o app online: https://cerealbh.github.io/mongos/

## Mudanças e Funcionalidades (v0.2 Beta)
- **Painel de Exibição de Fichário Centralizado**: Sistema de display "Book Mode" com `flex` alinhados e animações baseadas no aspecto original das cartas, evitando distorções.
- **HUD Modularizado**: Interfaces (Menus, Controles de Páginas, Busca e Zoom) desatrelados do sistema de coordenadas do Fichário, atuando fixas sobrepostas diretamente na tela (Glassmorphism design).
- **Magnifier Integrado**: Inspecione as cartas no fichário e na busca pausando o cursor do mouse sem precisar arrastá-las (Magnifier de Alta Resolução via tela cheia), evitando gargalos anti-aliasing via rendering de GPU.
- **Scroll Infinito & Pan na Gaveta**: "Hand / Dropzone" visualmente estofada com design translúcido. A área interage permitindo o scroll de cartas ilimitadas (gaveta elástica no eixo x), enquanto garante arrastos entre componentes e lixeira na direita da tela.
- **Zoom Dinâmico Nativo**: Zoom que não altera a renderização transformando pixels e borrando telas; em vez disso, atualiza reativamente os parâmetros `max-width` do `.binder-sheet`, promovendo Native Hard Rendering da browser engine sem distorcer o cursor e sem gerar scroll global de tela (Central Clamp).
