# Autenticação com login/senha — Design

Data: 2026-09-14
Status: aprovado para virar plano de implementação

## Objetivo

Substituir o login atual (escolher usuário de uma lista, sem senha) por
autenticação real com login e senha, guardada no banco (D1), e redesenhar a
tela de login em estilo profissional, ocupando a tela toda. Layout padrão
das telas internas e PWA ficam para uma leva separada (ver
`docs/PENDENCIAS.md`).

## Modelo de dados

`usuarios` ganha duas colunas novas:
- `login` (texto, único, obrigatório) — identificador de login, distinto do
  campo `nome` de exibição já existente (que continua livre, com espaços e
  parênteses, ex: "Ana (Comercial)"). Normalizado para minúsculas ao salvar.
- `senha_hash` (texto, obrigatório) — hash SHA-256 hexadecimal da senha,
  calculado via `crypto.subtle.digest("SHA-256", ...)` (nativo do runtime
  Workers, sem dependência nova). A senha em texto puro nunca é armazenada
  nem logada.

Regra de formato do `login`: apenas `[A-Za-z0-9]+` — sem espaço, ponto ou
qualquer caractere especial. Validado no formulário (atributo HTML
`pattern`, feedback imediato) e no servidor (fonte da verdade).

Migração `migrations/0003_auth.sql`:
- `ALTER TABLE usuarios ADD COLUMN login TEXT`
- `ALTER TABLE usuarios ADD COLUMN senha_hash TEXT`
- `UPDATE` para os 5 usuários semeados, atribuindo login e senha padrão:
  `ana`/`1234ana`, `bruno`/`1234bruno`, `carla`/`1234carla`,
  `diego`/`1234diego`, `elisa`/`1234elisa` (senha = hash de `"1234" + login`).
- Um índice único em `login` (`CREATE UNIQUE INDEX`) para impedir duplicidade.

## Autenticação (backend)

- `functions/_lib/auth.js`: `hashSenha(senha) -> Promise<string>` (hash
  SHA-256 hex) e `validarFormatoLogin(login) -> boolean` (regex
  `/^[a-z0-9]+$/`, aplicado ao login já normalizado em minúsculas).
- `POST /api/login` — recebe `{login, senha}`. Normaliza `login` para
  minúsculas, calcula o hash de `senha`, busca
  `SELECT id, nome, setor_id FROM usuarios WHERE login = ? AND senha_hash = ?`.
  Se encontrar, retorna 200 com os dados do usuário. Se não, retorna 401 com
  mensagem genérica `"Login ou senha inválidos"` — nunca revela se o login
  existe ou só a senha está errada.
- Cadastro de usuário (`POST /api/usuarios`, tela Cadastros) passa a exigir
  `login` (validado) além de `nome`/`setor_id`; o `senha_hash` é gerado
  automaticamente pelo servidor como hash de `"1234" + login` — não há campo
  de senha manual no cadastro (troca de senha fica fora de escopo, ver
  Pendências). `GET`/`PUT`/`DELETE` de usuários continuam via o CRUD
  genérico existente, com `login` na lista de campos (mas `senha_hash`
  nunca exposto nem editável por ali).

## Tela de login (frontend)

- `index.html`/`index.js` substituem o dropdown por um formulário real:
  campo "Usuário" (texto, `pattern` de validação) e campo "Senha"
  (`type="password"`), botão "Entrar". Envia `POST /api/login`; em caso de
  sucesso, salva os dados retornados (via `setUsuarioLogado`, como hoje) e
  redireciona para `chamados.html`; em caso de erro, mostra a mensagem
  retornada pelo servidor.
- Layout split-screen ocupando 100% da viewport: metade com painel de
  destaque (cor sólida/gradiente, nome "WorkFlow Zagonel" + subtítulo),
  metade com o formulário. Em telas estreitas (mobile), o painel de destaque
  vira um cabeçalho compacto acima do formulário (empilha verticalmente) em
  vez de dividir a tela ao meio.

## Fora de escopo (ver `docs/PENDENCIAS.md`)

- Troca de senha pelo próprio usuário.
- Política de senha mais forte que o padrão fixo `"1234" + login`.
- Limite de tentativas de login / rate limiting.
- Obrigar troca de senha no primeiro acesso.
- Padronização de layout das telas internas (nav/sidebar consistente,
  responsivo) e PWA (manifest, service worker, instalável) — tratados como
  projeto separado, a ser desenhado depois desta leva.
