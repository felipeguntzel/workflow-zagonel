# Arquitetura técnica

## Decisão
Sem framework de frontend (nada de React/Vue/build step). Justificativa:
volume de telas é pequeno (6), e o objetivo agora é protótipo funcional
rápido de construir e fácil de entregar via Cloudflare Pages estático. Se o
TI decidir reescrever depois, a API em Workers/D1 é reaproveitável
independente do frontend escolhido.

## Frontend
- HTML + CSS + JS puro, servido como estático a partir da pasta `public/` pelo Cloudflare Pages.
- Organização em módulos JS por responsabilidade: `api.js` (chamadas fetch), `auth.js` (sessão e token), `chamados.js`, `chamado.js`, `crud-ui.js`, `layout.js`, `ui.js` (helpers de render, tooltips do ícone "i", sanitização e WhatsApp).

## Backend
- Cloudflare Pages Functions (Workers) no mesmo projeto, expondo API REST em `functions/api/` e bibliotecas compartilhadas em `functions/_lib/`.

## Banco de dados
- Cloudflare D1 (SQLite gerenciado), schema relacional com migrações em `migrations/`.
- Autenticação real: senhas com hash PBKDF2 e salt individual, sessão via token HMAC, controle de acesso por grupos de permissão (RBAC) e recuperação de senha por e-mail/token.

## Deploy
- Projeto Cloudflare Pages `workflow-zagonel`, já conectado ao repositório
  GitHub `felipeguntzel/workflow-zagonel`, branch `master` — deploy
  automático a cada push.
