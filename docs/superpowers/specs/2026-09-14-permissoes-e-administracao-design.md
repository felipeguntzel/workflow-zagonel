# Permissões, sessão e administração de usuários — Design

Data: 2026-09-14
Status: aprovado para virar plano de implementação

## Objetivo

Evoluir a autenticação (login/senha) já existente para um controle de acesso
de verdade: sessão real (o servidor passa a saber quem está chamando cada
endpoint), grupos de permissão configuráveis por tela (visualizar/inserir/
editar/excluir), um papel de administrador que ignora tudo, senha definida
na criação do usuário com troca obrigatória no primeiro acesso, e um reset
dos dados de teste em produção para começar o uso real do zero.

## A) Sessão de login

Hoje `POST /api/login` só confere a senha e devolve os dados do usuário —
nada prova ao servidor, nas chamadas seguintes, quem está autenticado. Isso
muda:

- No login bem-sucedido, o servidor gera um **token assinado** (HMAC-SHA256,
  via `crypto.subtle`, sem biblioteca nova): `payload = "<usuario_id>.<expira_em>"`
  (validade de 8 horas), `token = payload + "." + assinatura_hex`. Não precisa
  de tabela de sessão — o próprio token carrega o que é necessário e a
  assinatura garante que não foi forjado.
- A chave de assinatura (`SESSAO_SEGREDO`) fica em um **secret** do
  Cloudflare (`wrangler pages secret put`), nunca no repositório. Localmente,
  um `.dev.vars` (gitignorado) fornece o mesmo valor para `wrangler pages dev`.
- `functions/_lib/sessao.js`: `gerarToken(usuarioId, segredo)`,
  `verificarToken(token, segredo) -> {usuarioId} | null` (checa assinatura e
  validade).
- O login devolve `{id, nome, setor_id, admin, deve_trocar_senha, token,
  permissoes}` (permissões explicadas na seção B). O front-end guarda tudo
  isso via `setUsuarioLogado` (mesma função de hoje, objeto maior).
- Todas as chamadas de API seguintes enviam `Authorization: Bearer <token>`
  — `api.js` faz isso automaticamente, lendo o token salvo.

## B) Grupos de permissão

Novas tabelas:

- `grupos_permissao`: `id`, `nome`.
- `permissoes`: `id`, `grupo_id`, `tela` (`empresas | setores | usuarios |
  status | fluxos | chamados`), `visualizar`, `inserir`, `editar`,
  `excluir` (0/1 cada), e `ver_todos_setores` (0/1, só relevante quando
  `tela = 'chamados'` — ver abaixo). Um grupo tem no máximo uma linha por
  tela (`UNIQUE(grupo_id, tela)`).
- `usuario_grupos`: `usuario_id`, `grupo_id` — cada usuário pode pertencer a
  1 ou mais grupos; a permissão efetiva numa tela/ação é "algum grupo do
  usuário libera isso" (OU lógico entre os grupos).
- `usuarios` ganha `admin` (0/1) — quando `true`, ignora grupos
  completamente e libera tudo, em toda tela e ação.
- `ver_todos_setores` é uma permissão específica da tela `chamados`,
  independente de `admin`: um usuário pode ter essa permissão (via grupo)
  sem ser administrador, e um administrador já enxerga tudo de qualquer
  forma.

**Lembrete de escopo, já vigente e mantido:** qualquer usuário autenticado
— independente de grupo, permissão ou admin — pode ver a árvore completa do
chamado mãe ("chamado geral") e seus comentários, sempre como
visualizador. Isso não passa pelo sistema de grupos; é a mesma regra que já
existe hoje (`GET /api/chamados/:id/arvore` e `GET /api/chamados/:id/comentarios`
continuam abertos a qualquer sessão válida).

## C) Onde cada ação é verificada

| Tela | Endpoints | Ação exigida |
|---|---|---|
| `empresas` | `GET/POST /api/empresas`, `GET/PUT/DELETE /api/empresas/:id` | visualizar / inserir / editar / excluir |
| `setores` | idem, `/api/setores` | idem |
| `status` | idem, `/api/status` | idem |
| `usuarios` | idem, `/api/usuarios` (rotas já customizadas da leva de login/senha) | idem |
| `fluxos` | `/api/fluxos`, `/api/fluxos/:id/etapas`, `/api/etapas/:id`, `/api/etapas/:id/acoes`, `/api/acoes/:id` | idem (cobre FluxoTemplates, Etapas e Ações como uma tela só) |
| `chamados` | `GET /api/chamados` (agora sem `?setor_id=` — ver abaixo), `POST /api/chamados`, `GET/PUT/DELETE /api/chamados/:id`, `POST /api/chamados/:id/decisao` | visualizar / inserir / editar (decisão conta como editar) / excluir |
| `chamados` (horas) | `GET/POST /api/chamados/:id/horas` | visualizar / inserir |
| — (sempre livre p/ qualquer sessão válida) | `GET /api/chamados/:id/arvore`, `GET/POST /api/chamados/:id/comentarios` | nenhuma — só exige token válido |

`GET /api/chamados` muda de contrato: hoje recebe `?setor_id=` do cliente
(o que permitiria a um usuário mal-intencionado pedir o setor de outra
pessoa). Com sessão de verdade, o servidor descobre o setor pelo próprio
token: se o usuário é admin ou tem `ver_todos_setores`, devolve todos os
chamados; senão, filtra pelo `setor_id` do próprio usuário autenticado — o
parâmetro de query deixa de existir.

**Reaproveitamento de código:** `functions/_lib/crud.js` (a fábrica genérica
de CRUD) passa a aceitar uma `tela` e verificar a permissão internamente —
isso cobre `empresas`, `setores`, `status` e `fluxos` (FluxoTemplates) sem
tocar nos arquivos de rota de cada um. Os arquivos que já são
personalizados (`usuarios/*`, `etapas/*`, `acoes/*`, `chamados/*`) recebem a
checagem manualmente, no mesmo padrão.

## D) Senha definida na criação + troca obrigatória no 1º login

- `usuarios` ganha `deve_trocar_senha` (0/1).
- Cadastro de usuário (`POST /api/usuarios`) passa a exigir um campo
  `senha` (o admin digita a senha inicial) em vez de gerar
  `"1234" + login` automaticamente. `deve_trocar_senha` começa `true`.
- Editar um usuário (`PUT /api/usuarios/:id`) pode opcionalmente incluir uma
  nova `senha` (reset de senha pelo admin) — se enviada, também marca
  `deve_trocar_senha = true` de novo.
- No login, se `deve_trocar_senha` for `true`, a tela `trocar-senha.html`
  aparece antes de qualquer outra coisa — formulário com nova senha +
  confirmação, enviando para um novo endpoint `POST /api/trocar-senha`
  (autenticado pelo token da sessão recém-criada) que define a nova
  `senha_hash` e zera a flag. Só depois disso o app libera o resto das
  telas.

## E) Filtro Empresa → Setor no cadastro de usuário

- Campo "Empresa" no formulário de Usuários: ao escolher, o dropdown de
  "Setor" é repopulado só com os setores daquela empresa (feito no
  cliente, sem endpoint novo — busca `/setores` uma vez e filtra).
- Isso exige uma pequena extensão no `crud-ui.js` genérico: um campo pode
  declarar que depende do valor de outro campo para filtrar suas opções.

## F) Reset de dados em produção

- Apaga todos os chamados existentes (e comentários/apontamentos
  associados — hoje só existem 2 chamados de teste, então isso não perde
  nada relevante) e os 5 usuários semeados (`ana`, `bruno`, `carla`,
  `diego`, `elisa`).
- Cria o usuário `felipe`, login `felipe`, senha inicial `1234felipe`
  (troca obrigatória no 1º login), `admin = true`, vinculado ao setor
  "Comercial" (`setor_id = 1` — irrelevante na prática já que admin ignora
  o filtro por setor, mas o campo é obrigatório no banco).
- Os demais usuários serão cadastrados manualmente pela tela de Cadastros
  depois que isso estiver no ar — não fazem parte desta migração.

## Telas novas

- **Grupos de Permissão** (`grupos.html`/`grupos.js`): lista de grupos
  (criar/renomear/excluir); ao selecionar um grupo, uma matriz de
  telas × ações (visualizar/inserir/editar/excluir, + "ver todos os
  setores" só na linha de Chamados) com checkboxes, salva por tela.
- **Trocar Senha** (`trocar-senha.html`/`trocar-senha.js`): nova senha +
  confirmação, exibida obrigatoriamente quando `deve_trocar_senha` é
  verdadeiro.
- **Cadastro de Usuário** ganha: campo "Empresa" (filtro), campo "Senha"
  (na criação; opcional na edição, para reset), checkbox "Administrador",
  e um seletor múltiplo de "Grupos de permissão".

## Aplicação na interface

Além do servidor bloquear, a interface também esconde o que o usuário não
pode usar: `montarNav` esconde "Cadastros"/"Fluxos" se o usuário não tem
`visualizar` em nenhuma das telas relevantes; dentro de cada seção de
Cadastros e da tela de Fluxos, os formulários de criar/editar e os botões
de Editar/Excluir só aparecem conforme `inserir`/`editar`/`excluir` daquela
tela; em `chamado.html`, os botões de aprovar/reprovar/mudar status exigem
`editar` em `chamados`, lançar horas exige `inserir`, e comentar continua
livre para qualquer sessão válida.

## Fora de escopo (ver `docs/PENDENCIAS.md`)

- Revogação de sessão antes da expiração (ex.: "sair de todos os
  dispositivos") — o token simplesmente expira em 8h.
- Auditoria de quem alterou o quê (log de ações).
- Múltiplos níveis hierárquicos de grupo (herança entre grupos) — grupos
  são todos do mesmo nível, permissão efetiva é só a soma deles.
