# Arquitetura técnica

## Decisão
Sem framework de frontend (nada de React/Vue/build step). Justificativa:
volume de telas é pequeno (6), e o objetivo agora é protótipo funcional
rápido de construir e fácil de entregar via Cloudflare Pages estático. Se o
TI decidir reescrever depois, a API em Workers/D1 é reaproveitável
independente do frontend escolhido.

## Frontend
- HTML + CSS + JS puro, servido como estático pelo Cloudflare Pages.
- Organização em módulos JS por responsabilidade (arquivos separados, não um
  script único): `api.js` (chamadas fetch), `chamados.js`, `cadastros.js`,
  `ui.js` (helpers de render, tooltips do ícone "i").

## Backend
- Cloudflare Pages Functions (Workers) no mesmo projeto, expondo API REST
  (ex: `/api/chamados`, `/api/setores`, `/api/fluxos`, etc.).

## Banco de dados
- Cloudflare D1 (SQLite gerenciado), schema relacional espelhando
  `docs/modules/modelo-dados.md`.
- Sem autenticação real nesta fase — o "login" é só selecionar um usuário
  cadastrado, sem senha.

## Deploy
- Projeto Cloudflare Pages `workflow-zagonel`, já conectado ao repositório
  GitHub `felipeguntzel/workflow-zagonel`, branch `master` — deploy
  automático a cada push.
