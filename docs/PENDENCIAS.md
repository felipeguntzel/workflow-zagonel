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

- **Troca de senha pelo próprio usuário**: hoje a senha só é definida
  automaticamente na criação (`1234` + login), sem tela para o usuário
  trocar depois.
- **Política de senha mais forte**: sem regra de complexidade além do
  padrão fixo.
- **Limite de tentativas de login (rate limiting)**: sem proteção contra
  força bruta no `POST /api/login`.
- **Obrigar troca de senha no primeiro acesso**.
- **Layout padrão para as telas internas (operacionais) + PWA**: nav/sidebar
  consistente entre chamados/cadastros/fluxo/detalhe/geral, responsivo,
  ocupando a tela toda, manifest + service worker para instalar como app.
  Pedido pelo usuário junto com a autenticação, mas tratado como projeto
  separado (desenho próprio depois desta leva).

## Achados da revisão final de branch (Fase 1) não corrigidos agora

Itens que a revisão final identificou mas que ficaram deliberadamente de fora
do escopo desta fase (prototipo). Cada um é pequeno e isolado, sem risco de
segurança real dado que é um ambiente interno de usuários confiáveis — mas
documentado aqui para não serem esquecidos numa reimplementação futura.

- **Editar Etapas/Ações não tem UI**: `PUT /api/etapas/:id` e `PUT /api/acoes/:id`
  existem e funcionam (Task 5), mas a tela de Fluxos (`fluxo.js`) só tem
  botões de Adicionar/Excluir, sem "Editar". Endpoint acessível só via API
  direta hoje.
- **Etapa tipo "tarefa" com "Próxima etapa" configurada**: `docs/modules/motor-fluxo.md`
  descreve que finalizar uma etapa tarefa (inicial ou não) deveria avançar o
  fluxo, mas o código só faz isso para a etapa inicial no momento da criação
  do chamado mãe. Uma etapa tarefa não-inicial com `etapa_proxima_id`
  configurado ficaria "presa" ao ser finalizada manualmente. Mitigado por
  ora escondendo o campo "Próxima etapa" na tela de cadastro quando
  `tipo = tarefa` e "É a etapa inicial?" não está marcado (ver commit da
  correção pós-revisão final). Se precisar desse caso no futuro, implementar
  `avancarFluxo` também no `PUT` de status.
  - **Gap residual conhecido nessa mitigação**: esconder os campos não limpa
    o valor selecionado neles antes de esconder — se alguém escolher uma
    "Próxima etapa" com tipo=aprovação e DEPOIS trocar para tipo=tarefa (sem
    marcar inicial), o valor antigo continua selecionado (só invisível) e
    ainda é enviado no `POST`, recriando o problema original de forma mais
    silenciosa. Baixa probabilidade (exige reordenar os campos fora do fluxo
    natural do formulário), mas vale corrigir limpando os selects ao
    escondê-los, ou ignorando o valor no envio quando o campo estiver oculto.
- **Botão "Excluir chamado" (`chamado.js`) ainda não trata erro de rede/API**:
  a correção pós-revisão final cobriu 9 pontos de mutação do frontend, mas
  esse botão específico não estava na lista original e ficou de fora — se o
  `DELETE` falhar (ex.: chamado com filhos e algum erro inesperado), a tela
  não mostra nada. Mesma classe do item de exibição de erro já corrigido em
  outros lugares; só falta replicar o padrão `mostrarErro()` aqui também.
- **Regra de "vencido" não exclui status "suspenso"**: `docs/modules/prazos-horas.md`
  diz que um chamado suspenso não deveria aparecer como vencido, mas
  `situacaoPrazo`/`chamadoComDetalhes` não checam esse status hoje.
- **`data_finalizacao` nunca é limpo**: ao mover um chamado de volta de
  "finalizado" para outro status via `PUT`, a coluna `data_finalizacao`
  permanece preenchida, podendo destravar incorretamente uma ação dependente
  (`estaBloqueado` verifica só `data_finalizacao == null`). Não é alcançável
  pela UI atual (o seletor de status some quando finalizado), só via API
  direta.
- **`PUT` genérico do CRUD não repete a validação de campos obrigatórios do
  `POST`**: dá pra mandar um `PUT` com `nome: ""` num cadastro e zerar um
  campo obrigatório.
- **`DELETE` do CRUD genérico retorna 200 mesmo se o id não existir**,
  inconsistente com `GET`/`PUT` do mesmo arquivo que retornam 404.
- **Sem CHECK constraint** garantindo que cada chamado tenha exatamente um
  de `etapa_id`/`acao_origem_id` preenchido (hoje é só uma convenção do
  código).
- **`responsavel_id` nunca é definido nem exibido** em nenhuma tela, apesar
  de a coluna e a regra de negócio existirem.
- **`pages_build_output_dir = "."` publicava todo o repositório** como estático
  no domínio público do Cloudflare Pages — incluindo `docs/`, `migrations/*.sql`
  e `CLAUDE.md`. A partir da migração `0003_auth.sql` (login/senha), isso
  passou a incluir hashes de senha reais, não só documentação — corrigido com
  um `.assetsignore` na raiz do projeto excluindo `migrations/`, `docs/`,
  `.claude/` e `*.md` dos arquivos estáticos publicados.
- **`wrangler.toml`'s `compatibility_date` está fixado em 2026-07-09**
  (abaixo do ideal) só para funcionar com a versão do `wrangler` instalada
  localmente durante a Fase 1. Atualizar o `wrangler` e avançar essa data é
  a correção correta quando alguém for mexer nisso de novo.
- **Pequenos detalhes de UX**: o seletor de fluxo na tela de Fluxos não
  atualiza sozinho depois de cadastrar um novo FluxoTemplate na tabela acima
  (precisa recarregar a página); abrir `chamado.html` sem `?id=` ou com um id
  inválido mostra página em branco sem mensagem de erro.

## Achados da revisão final de branch (Autenticação login/senha) não corrigidos agora

Ver `docs/superpowers/plans/2026-09-14-autenticacao-login-senha.md`.

- **Autenticação sem autorização real**: este projeto tem uma tela de login,
  mas nenhuma rota da API verifica sessão/token — qualquer chamada direta
  (`curl`, etc.) continua funcionando sem passar pelo login, e o objeto do
  usuário salvo no navegador (`localStorage`, incluindo `setor_id`) pode ser
  editado pelo próprio usuário. Combinado com `GET /api/usuarios` (público,
  lista todos os logins) e a senha padrão previsível (`1234` + login, sem
  tela de troca), o sistema hoje autentica visualmente mas não protege de
  verdade. Isso é esperado para um protótipo interno, mas precisa ser dito
  explicitamente na apresentação/handoff para o TI: "tem autenticação" não
  significa "está protegido". Uma implementação real precisaria de sessões
  ou tokens server-side e autorização por rota, além de um KDF com salt
  (bcrypt/scrypt/PBKDF2) em vez do SHA-256 sem salt usado aqui.
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
