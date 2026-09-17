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

- ~~**Recuperação de senha por e-mail**~~: **RESOLVIDO**: tabela `recuperacao_senha`, rota `/api/recuperar-senha`, painel na tela de login e página dedicada `redefinir-senha.html` com tokens de uso único válidos por 30 minutos e suporte ao envio via Resend.
- ~~**Contato direto via WhatsApp no chamado**~~: **RESOLVIDO**: campo `telefone` cadastrado em usuários e link click-to-chat no detalhe do chamado para contato imediato com o solicitante ou responsável com texto automático.
- **Política de senha mais forte**: sem regra de complexidade além do
  padrão fixo.
- **Limite de tentativas de login (rate limiting)**: sem proteção contra
  força bruta no `POST /api/login`.
- **PWA**: manifest + service worker, instalável, funcionamento offline.
  Pedido pelo usuário junto com a autenticação, tratado como Fase 2 do
  projeto de layout/design system (a Fase 1 com sidebar/topbar responsivos,
  temas, tipografia e componentes já foi implementada).

## Achados da revisão final de branch (Fase 1) não corrigidos agora

Itens que a revisão final identificou mas que ficaram deliberadamente de fora
do escopo desta fase (prototipo). Cada um é pequeno e isolado, sem risco de
segurança real dado que é um ambiente interno de usuários confiáveis — mas
documentado aqui para não serem esquecidos numa reimplementação futura.

- ~~**Editar Etapas/Ações não tem UI**~~ — **RESOLVIDO**: `fluxo.js` agora
  tem botão "Editar" em cada etapa e ação, reaproveitando os formulários
  "Nova etapa"/"Nova ação" existentes (preenche os campos e troca o `POST`
  pelo `PUT /api/etapas/:id` ou `PUT /api/acoes/:id` já existentes).
- ~~**Etapa tipo "tarefa" com "Próxima etapa" configurada**~~ — **RESOLVIDO**:
  `PUT /api/chamados/:id` agora chama `avancarFluxo` também quando finaliza um
  chamado cuja etapa é `tipo = tarefa` (não só na criação da etapa inicial),
  mesma lógica já usada em `decisao.js` para aprovação — guardado por
  `chamadoAtual.status_id === body.status_id` para não duplicar filhos numa
  segunda chamada de `PUT` sobre um chamado já finalizado. O campo "Próxima
  etapa" (antes escondido em `fluxo.js` para tarefas não-iniciais) voltou a
  ficar sempre visível. Coberto pelos testes existentes de
  `resolverProximosChamados`/`estaBloqueado` (`functions/_lib/fluxo.test.js`);
  não há harness de D1 fake para testar a rota `PUT` em si, então a
  integração ponta a ponta não tem teste automatizado — mesma lacuna que já
  existia para as outras rotas de `functions/api/chamados`.
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
- ~~**Sem CHECK constraint**~~ — **RESOLVIDO** (`migrations/0007_check_chamados_etapa_ou_acao.sql`):
  liberado pelo dono do sistema pois ainda não há uso real em produção.
  SQLite não suporta `ALTER TABLE ADD CONSTRAINT`, e o D1 aplica foreign
  keys sempre (`PRAGMA foreign_keys=OFF` não teve efeito, testado
  localmente), então a tabela `chamados` foi recriada com
  `CHECK ((etapa_id IS NOT NULL) != (acao_origem_id IS NOT NULL))`
  renomeando a tabela antiga primeiro (o `RENAME` do SQLite atualiza
  sozinho as FKs de quem aponta pra ela — o auto-relacionamento
  `chamado_mae_id`/`chamado_pai_id` e as FKs de `comentarios`/
  `apontamentos_horas`) e copiando os dados em ordem de `id` antes de
  reapontar essas duas tabelas filhas pra `chamados` nova. Verificado
  localmente: dados existentes preservados (inclusive hierarquia
  mãe/pai), `INSERT` com os dois campos preenchidos ou os dois vazios
  falha com `CHECK constraint failed`, e o fluxo real do app (criar
  chamado mãe, aprovar etapa, gerar chamado via ação) continua
  funcionando normalmente.
- ~~**`responsavel_id` nunca é definido nem exibido**~~ — **RESOLVIDO**:
  `chamado.js` agora mostra o responsável atual e um botão "Assumir"/"Liberar"
  (auto-atribuição — qualquer usuário com permissão de editar o chamado pode
  assumir ou se liberar; não há uma tela de "atribuir a outra pessoa").
- ~~**`pages_build_output_dir = "."` publica todo o repositório**~~ —
  **RESOLVIDO**: os arquivos estáticos do frontend (html/js/css/favicon)
  foram movidos para `public/`, e `pages_build_output_dir` (`wrangler.toml`)
  agora aponta só para lá — `docs/`, `migrations/`, `.claude/` e `CLAUDE.md`
  ficam fora do diretório publicado, sem depender de lembrar de bloquear
  cada pasta nova. As 4 Pages Functions catch-all que faziam esse bloqueio
  (`functions/migrations/[[path]].js`, `functions/docs/[[path]].js`,
  `functions/.claude/[[path]].js`, `functions/CLAUDE.md.js`) foram removidas
  por ficarem redundantes — `functions/api/**` continua no lugar de sempre,
  já que Pages Functions são sempre resolvidas a partir de `functions/` na
  raiz do projeto, independente do `pages_build_output_dir`. `package.json`
  (`npm run dev`/`npm run deploy`) atualizado para `wrangler pages dev
  public`/`wrangler pages deploy public`.
- ~~**`wrangler.toml`'s `compatibility_date` fixado em 2026-07-09**~~ —
  **RESOLVIDO**: `wrangler` atualizado para 4.132.0 como `devDependency`
  real do projeto (antes nem estava no `package.json`), `compatibility_date`
  avançado para 2026-09-16. Testado localmente com `wrangler pages dev
  public` (login com hash PBKDF2 e com hash legado, `/api/chamados` sem
  `Authorization` continua `401`) e suite de testes 44/44.

  Durante a validação em deploy de preview real, `POST /api/login` passou a
  retornar 500 consistentemente para um usuário real — investigado a fundo
  (achamos inicialmente que era o `compatibility_date`, revertemos,
  continuou quebrado; só aí achamos a causa de verdade instrumentando
  `functions/_middleware.js` temporariamente para logar `err.stack`):
  **`SESSAO_SEGREDO` estava configurada como variável de ambiente vazia no
  ambiente de *Preview* do Cloudflare Pages, só existia de verdade em
  *Production*.** Isso fazia `crypto.subtle.importKey` em `gerarToken`
  (`functions/_lib/sessao.js`) falhar com `DataError: Imported HMAC key
  length (0)...` — chave HMAC de tamanho zero. Não era bug de código (mesmo
  `login.js`/`auth.js`/`sessao.js` de sempre, mesmo banco D1; login normal
  em produção o tempo todo) — era uma lacuna de configuração do painel
  Cloudflare que provavelmente sempre existiu para *qualquer* preview deste
  projeto, só nunca tinha sido testado com credenciais reais antes.
  **RESOLVIDO**: adicionada uma `SESSAO_SEGREDO` própria (não precisa ser
  igual à de produção — cada ambiente assina/verifica os próprios tokens)
  também para o ambiente *Preview* em Cloudflare Pages → workflow-zagonel →
  Settings → Environment variables. Confirmado funcionando em deploy de
  preview real após a mudança.
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
  (`usuarios.visualizar`) e não é mais público. O outro ponto do achado
  (SHA-256 sem salt) também está **RESOLVIDO**: `hashSenha()` passou a
  usar PBKDF2 (100.000 iterações, SHA-256) com salt aleatório de 16
  bytes por usuário, formato auto-descritivo `pbkdf2$iterações$salt$hash`.
  Migração transparente: `POST /api/login` aceita o hash legado (SHA-256
  sem salt) uma última vez e, se a senha bater, re-hasheia com PBKDF2 e
  salva no banco na hora — sem exigir troca de senha nem risco de ninguém
  ficar bloqueado no próximo deploy (que é automático ao dar push em
  `master`, sem gate manual — trocar o algoritmo sem esse caminho de
  migração teria travado o próprio admin no ar). Verificado manualmente:
  login com o hash antigo funciona e migra sozinho; login seguinte já usa
  o hash novo; senha errada continua rejeitada nos dois formatos; usuário
  novo e troca de senha já nascem em PBKDF2 direto.
- ~~**Condição de corrida na checagem de login único**~~ — **RESOLVIDO**:
  `functions/_middleware.js` agora também trata `UNIQUE constraint failed`
  (400 "Já existe um registro com esse valor."), cobrindo genericamente
  `usuarios.login`, `status.nome` e qualquer outra coluna `UNIQUE` do CRUD —
  não corrige o TOCTOU em si (ainda dá pra duas requisições simultâneas
  passarem pelo `SELECT` de checagem), mas garante que o resultado final é
  um 400 amigável em vez de 500. Verificado manualmente via `curl`.
- ~~**`index.js` (tela de login) não reaproveita `mostrarErro()` de `ui.js`**~~
  — **RESOLVIDO**.
- ~~**Campo de login sem `title` no atributo `pattern`**~~ — **RESOLVIDO**:
  adicionado `title="Use apenas letras e números, sem espaços, pontos ou
  caracteres especiais"`, mesma mensagem já usada no backend
  (`validarFormatoLogin`).

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
- ~~**Estados vazios da Task 15 não cobriram `chamado.js`**~~ —
  **RESOLVIDO**: `carregarHoras()`/`carregarComentarios()` agora mostram
  "Nenhum lançamento ainda."/"Nenhum comentário ainda." quando a lista vem
  vazia, mesmo padrão já usado em `chamados.js`, `crud-ui.js`, `fluxo.js` e
  `grupos.js`.
- ~~**Mensagem de sucesso em Grupos de Permissão nunca desaparece**~~ —
  **RESOLVIDO**: `mostrarMensagem()` em `ui.js` agora esconde a mensagem
  sozinha depois de 3s (`setTimeout`, reiniciado a cada chamada) — corrige
  para qualquer tela que use o helper, não só Grupos.
- ~~**Código morto isolado**~~ — **RESOLVIDO**: `.card` removida de
  `componentes.css`; `situacaoClasse` removida de `ui.js`; o gradiente do
  login em `style.css` passou a usar `var(--cor-primaria)`/
  `var(--cor-primaria-escura)` em vez das cores hardcoded (visualmente
  idêntico hoje, já que `index.html` nunca seta `data-tema` — mas agora a
  variável é de fato usada, e o login herda o tema se isso mudar no
  futuro).
- ~~**`novo-chamado.js` não usa o helper `mostrarErro()` compartilhado**~~ —
  **RESOLVIDO**.

## Fora de escopo da leva de permissões e administração

Ver `docs/superpowers/specs/2026-09-14-permissoes-e-administracao-design.md`.

- **Revogação de sessão antes da expiração** (ex.: "sair de todos os
  dispositivos") — o token simplesmente expira em 8h.
- **Auditoria de quem alterou o quê** (log de ações).
- **Múltiplos níveis hierárquicos de grupo** (herança entre grupos) — grupos
  são todos do mesmo nível, permissão efetiva é só a soma deles.

## Reorganização de menus

- ~~**Separar "Cadastros" em subtelas dedicadas**~~: **RESOLVIDO**: páginas HTML e scripts dedicados criados para Empresas (`empresas.html`), Setores (`setores.html`), Usuários (`usuarios.html`) e Status (`status.html`), mantendo também Fluxos (`fluxo.html`) e Grupos de Permissão (`grupos.html`) agrupados sob Cadastros.
- ~~**Novo menu "Dashboards"**~~: **RESOLVIDO**: criada a tela inicial `dashboards.html` com métricas agregadas de chamados, distribuição por status e espaço para os relatórios planejados.
- ~~**Reordenar menus principais em ordem alfabética**~~: **RESOLVIDO**: a sidebar agora organiza os grupos em Cadastros, Chamados e Dashboards.
- ~~**Identificador numérico por tela + atalho de navegação (F1 e Ctrl+F)**~~: **RESOLVIDO**: cada tela possui identificador numérico fixo (01 a 09); atalho F1 ou Ctrl+F abre modal de busca rápida para filtrar por número ou nome e navegar com Enter.
- ~~**Mover o botão com o nome do usuário logado para o rodapé do sidebar**~~: **RESOLVIDO**: perfil do usuário com avatar e cargo posicionado no rodapé da barra lateral; ao clicar, abre menu suspenso com "Preferências" e "Sair".

## Cor por status (futuro)

- **Selecionar cor única por status na tela de cadastro de Status**, com
  validação: não pode repetir cor já usada por outro status.
- **Restringir as opções a uma paleta de cores principais/padronizadas**
  (não permitir escolher qualquer cor livremente).
