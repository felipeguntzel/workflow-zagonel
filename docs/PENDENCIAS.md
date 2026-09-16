# Pendências / possibilidades futuras

Itens discutidos mas propositalmente fora da Fase 1 (núcleo do motor de
chamados). Ordem não implica prioridade.

- **Editor visual de fluxo**: tela tipo diagrama, arrastar/soltar etapas e
  desenhar conexões/gatilhos entre elas, em vez dos formulários estruturados
  atuais.
- **Relatórios/consultas agregadas**:
  - Quantas tarefas mãe existem, quantas por setor.
  - Tempo médio que cada setor demora para finalizar.
  - Dashboard visual de gargalos (setores mais lentos).
- **Reajuste de prazo mais sofisticado**: hoje empurra pelos mesmos dias de
  atraso; no futuro talvez precise de regras diferentes por tipo de
  dependência (ex.: recalcular considerando dias úteis/feriados).
- **Outros fluxos além de "Produto Derivado"**: quando surgir o 2º tipo de
  fluxo real, validar se o motor genérico atual aguenta ou precisa de
  ajustes.
- **Integração com sistemas existentes da empresa**: quando o TI assumir a
  implementação definitiva, avaliar reaproveitamento de cadastros já
  existentes (usuários, setores, centro de custo) em vez de recadastrar.

## Fora de escopo da leva de autenticação (login/senha)

Ver `docs/superpowers/specs/2026-09-14-autenticacao-login-senha-design.md`.

- **Política de senha mais forte**: sem regra de complexidade além do
  padrão fixo.
- **Limite de tentativas de login (rate limiting)**: sem proteção contra
  força bruta no `POST /api/login`.
- **PWA**: manifest + service worker, instalável, funcionamento offline.
  Pedido pelo usuário junto com a autenticação, tratado como Fase 2 do
  projeto de layout/design system — a Fase 1 (sidebar/topbar responsivos,
  temas, tipografia, componentes) já foi implementada, ver
  `docs/superpowers/specs/2026-09-15-layout-interno-e-temas-design.md` e a
  seção própria abaixo.

## Achados da revisão final de branch (Fase 1) não corrigidos agora

Itens que a revisão final identificou mas que ficaram deliberadamente de fora
do escopo desta fase (prototipo). Cada um é pequeno e isolado, sem risco de
segurança real dado que é um ambiente interno de usuários confiáveis — mas
documentado aqui para não serem esquecidos numa reimplementação futura.

- ~~**Editar Etapas/Ações não tem UI**~~ — **RESOLVIDO**: `fluxo.js` agora
  tem botão "Editar" em cada etapa e ação, reaproveitando os formulários
  "Nova etapa"/"Nova ação" existentes (preenche os campos e troca o `POST`
  pelo `PUT /api/etapas/:id` ou `PUT /api/acoes/:id` já existentes).
- **Etapa tipo "tarefa" com "Próxima etapa" configurada**: `docs/modules/motor-fluxo.md`
  descreve que finalizar uma etapa tarefa (inicial ou não) deveria avançar o
  fluxo, mas o código só faz isso para a etapa inicial no momento da criação
  do chamado mãe. Uma etapa tarefa não-inicial com `etapa_proxima_id`
  configurado ficaria "presa" ao ser finalizada manualmente. Mitigado por
  ora escondendo o campo "Próxima etapa" na tela de cadastro quando
  `tipo = tarefa` e "É a etapa inicial?" não está marcado. Se precisar desse
  caso no futuro, implementar `avancarFluxo` também no `PUT` de status.
  - ~~**Gap residual conhecido nessa mitigação**~~ — **RESOLVIDO**:
    `atualizarCamposProximaEtapa()` agora limpa os selects (`etapa_proxima_id`
    e `etapa_proxima_vinculo`) ao escondê-los, então o valor antigo não é
    mais reenviado silenciosamente no `POST`/`PUT`.
- ~~**Botão "Excluir chamado" (`chamado.js`) ainda não trata erro de rede/API**~~
  — **RESOLVIDO**: envolvido em try/catch com `mostrarErro()`, igual ao
  resto do arquivo.
- ~~**Regra de "vencido" não exclui status "suspenso"**~~ — **RESOLVIDO**:
  `situacaoPrazo`/`chamadoComDetalhes` (backend) e `situacaoBadge` em
  `chamados.js` (frontend, tinha uma reimplementação duplicada da mesma
  regra) agora tratam `suspenso` igual a `finalizado` para efeito de
  vencido/alerta.
- ~~**`data_finalizacao` nunca é limpo**~~ — **RESOLVIDO**: `PUT /api/chamados/:id`
  agora limpa `data_finalizacao` (`= NULL`) sempre que o `status_id` muda
  para algo diferente de "finalizado".
- ~~**`PUT` genérico do CRUD não repete a validação de campos obrigatórios do
  `POST`**~~ — **RESOLVIDO**: `crudItemHandlers` agora rejeita `PUT` que
  envie um campo `required` vazio/nulo, mesma regra do `POST`.
- ~~**`DELETE` do CRUD genérico retorna 200 mesmo se o id não existir**~~ —
  **RESOLVIDO**: agora checa `resultado.meta.changes` e retorna 404,
  consistente com `GET`/`PUT`.
- **Sem CHECK constraint** garantindo que cada chamado tenha exatamente um
  de `etapa_id`/`acao_origem_id` preenchido (hoje é só uma convenção do
  código). Avaliado nesta rodada e deixado de fora deliberadamente: SQLite
  não suporta `ALTER TABLE ADD CONSTRAINT`, então corrigir de verdade exige
  recriar a tabela `chamados` inteira (que hoje já tem dados reais em
  produção, com FKs próprias — `chamado_mae_id`/`chamado_pai_id` — e duas
  tabelas filhas). Risco de uma migração dessas em produção real não parece
  compensar, dado que não é alcançável pela UI atual, só via API direta.
- ~~**`responsavel_id` nunca é definido nem exibido**~~ — **RESOLVIDO**:
  `chamado.js` agora mostra o responsável atual e um botão "Assumir"/"Liberar"
  (auto-atribuição — qualquer usuário com permissão de editar o chamado pode
  assumir ou se liberar; não há uma tela de "atribuir a outra pessoa").
- **`pages_build_output_dir = "."` publica todo o repositório** como estático
  no domínio público do Cloudflare Pages — incluindo `docs/`, `migrations/*.sql`
  e `CLAUDE.md`. A partir da migração `0003_auth.sql` (login/senha), isso
  passou a incluir hashes de senha reais, não só documentação. Tentamos
  corrigir com um `.assetsignore` na raiz (`migrations/`, `docs/`, `.claude/`,
  `*.md`), mas **verificado em deploy real que o Cloudflare Pages/wrangler
  4.107.1 não respeita esse arquivo** — os caminhos continuaram públicos.
  Corrigido de verdade com Pages Functions "catch-all" que interceptam essas
  rotas antes de chegar aos arquivos estáticos e retornam 404
  (`functions/migrations/[[path]].js`, `functions/docs/[[path]].js`,
  `functions/.claude/[[path]].js`, `functions/CLAUDE.md.js`) — confirmado
  funcionando via deploy de teste real (`curl` retornando 404 nesses
  caminhos, API e páginas continuando 200 normalmente). Solução robusta mas
  não elegante: qualquer nova pasta/arquivo sensível na raiz do repo precisa
  de uma função equivalente, já que não existe hoje um mecanismo real de
  exclusão de assets estáticos nesse setup. Se o TI reimplementar isso,
  vale mover os arquivos do frontend para uma subpasta dedicada (ex:
  `public/`) e apontar `pages_build_output_dir` só para ela, em vez de
  depender de rotas catch-all.
- **`wrangler.toml`'s `compatibility_date` está fixado em 2026-07-09**
  (abaixo do ideal) só para funcionar com a versão do `wrangler` instalada
  localmente durante a Fase 1. Atualizar o `wrangler` e avançar essa data é
  a correção correta quando alguém for mexer nisso de novo.
- ~~**Pequenos detalhes de UX**~~ — **RESOLVIDO**: `renderCrud` ganhou um
  callback opcional `aoSalvar`, usado por `fluxo.js` para recarregar o
  seletor de fluxo sozinho depois de cadastrar um novo FluxoTemplate; abrir
  `chamado.html` sem `?id=` agora mostra "Chamado não informado." e esconde
  o resto da página (um id inválido mas presente já mostrava erro via
  `carregarTudo().catch()`, isso não mudou).

## Achados da revisão final de branch (Autenticação login/senha) não corrigidos agora

Ver `docs/superpowers/plans/2026-09-14-autenticacao-login-senha.md`.

- ~~**Autenticação sem autorização real**~~ — **RESOLVIDO** pela leva de
  Permissões e Administração (`docs/superpowers/plans/2026-09-14-permissoes-e-administracao.md`,
  PR #5): toda rota da API hoje passa por `exigirPermissao`/`exigirAdmin`
  ou, no mínimo, `obterUsuarioDaRequisicao` (`functions/_lib/permissoes.js`)
  — verificado nesta revisão em todos os arquivos de `functions/api/**`, e
  confirmado manualmente que `PUT`/`DELETE` sem `Authorization: Bearer`
  retornam 401. `GET /api/usuarios` também exige permissão
  (`usuarios.visualizar`) e não é mais público. Continua verdade, e não
  resolvido: as senhas usam SHA-256 sem salt (`functions/_lib/auth.js`) em
  vez de um KDF como bcrypt/scrypt/PBKDF2 — aceitável para um protótipo
  interno, mas vale dizer explicitamente no handoff para o TI.
- **Condição de corrida na checagem de login único**: `usuarios/index.js` e
  `[id].js` checam duplicidade de `login` com um `SELECT` antes do `INSERT`/
  `UPDATE` (TOCTOU) — em teoria, duas requisições simultâneas criando o
  mesmo login poderiam ambas passar a checagem e uma delas cair no
  `UNIQUE INDEX` do banco, que hoje não é tratado por `functions/_middleware.js`
  (só trata `FOREIGN KEY constraint failed`), resultando num 500 em vez de
  400. Probabilidade muito baixa no uso real (poucos usuários, cadastro
  raro), mas o fix é uma linha a mais no middleware. O mesmo vale para
  `status.nome`, que também é `UNIQUE` e não tem checagem amigável no CRUD
  genérico.
- **`index.js` (tela de login) não reaproveita `mostrarErro()` de `ui.js`**:
  faz `textContent`/`hidden` na mão em vez de chamar o helper compartilhado
  que todo o resto do app usa — funciona igual, só não é consistente.
- **Campo de login sem `title` no atributo `pattern`**: ao digitar um login
  inválido (ex: com ponto ou espaço), o navegador mostra só a mensagem
  genérica de validação, sem explicar a regra. Um atributo `title` no
  `<input>` resolveria.

## Achados da revisão final de branch (Layout interno e sistema de design) não corrigidos agora

Ver `docs/superpowers/plans/2026-09-15-layout-interno-e-temas.md`. A revisão
final encontrou 2 problemas críticos e 3 importantes, todos corrigidos antes
do merge (CSS de erro faltando em login/troca de senha; XSS armazenado num
atributo `title`; menu da topbar reabrindo; tooltip faltando em algumas
tabelas; flash de tema em alto contraste). Os itens abaixo ficaram
deliberadamente de fora por serem menores/isolados:

- ~~**XSS mais amplo e pré-existente**~~ — **RESOLVIDO**: corrigido em
  sessão separada (`escaparHtml()` em `ui.js`, aplicado em `chamado.js`,
  `chamados.js`, `crud-ui.js`, `fluxo.js`, `geral.js`, `grupos.js`,
  `novo-chamado.js`), commit `9bcd35f`, PR #6, mergeado direto em `master`.
  Reconciliado com o layout novo desta fase via merge (`be68623`), mantendo
  também o `escaparAtributo()` já usado nos atributos `title`. Verificado
  em navegador real após o merge: nome de etapa com `<img src=x
  onerror=...>` renderiza como texto, sem executar.
- **Estados vazios da Task 15 não cobriram `chamado.js`**: as listas de
  "Apontamento de horas" e "Comentários" de um chamado recém-aberto mostram
  o título da seção sem nenhum texto abaixo, em vez de uma mensagem como
  "Nenhum lançamento ainda."/"Nenhum comentário ainda." (o padrão foi
  aplicado em `chamados.js`, `crud-ui.js`, `fluxo.js` e `grupos.js`, mas não
  aqui).
- **Mensagem de sucesso em Grupos de Permissão nunca desaparece**:
  `grupos.js` chama `mostrarMensagem(..., "sucesso")` ao salvar nome ou
  permissões, mas nada volta a escondê-la — "Permissões salvas." fica na
  tela indefinidamente até a próxima ação que sobrescreva o elemento.
- **Código morto isolado**: `.card` em `componentes.css` (definida, nunca
  usada); `--cor-primaria-escura` em `style.css` (definida nos dois temas,
  nunca usada — o gradiente do login está com a cor hardcoded); `situacaoClasse`
  em `ui.js` (função exportada sem nenhum import restante no projeto).
- **`novo-chamado.js` não usa o helper `mostrarErro()` compartilhado** —
  única das 7 telas migradas que ainda faz `textContent`/`hidden` na mão.
  Funciona igual, só não se beneficia do reset de `className` que o helper
  faz (mesma classe de inconsistência já registrada para `index.js` na
  leva de autenticação).

## Fora de escopo da leva de permissões e administração

Ver `docs/superpowers/specs/2026-09-14-permissoes-e-administracao-design.md`.

- **Revogação de sessão antes da expiração** (ex.: "sair de todos os
  dispositivos") — o token simplesmente expira em 8h.
- **Auditoria de quem alterou o quê** (log de ações).
- **Múltiplos níveis hierárquicos de grupo** (herança entre grupos) — grupos
  são todos do mesmo nível, permissão efetiva é só a soma deles.
