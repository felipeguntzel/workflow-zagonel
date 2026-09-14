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
- **Autenticação real**: login com senha, em vez de só escolher o usuário da
  lista.
- **Reajuste de prazo mais sofisticado**: hoje empurra pelos mesmos dias de
  atraso; no futuro talvez precise de regras diferentes por tipo de
  dependência (ex.: recalcular considerando dias úteis/feriados).
- **Outros fluxos além de "Produto Derivado"**: quando surgir o 2º tipo de
  fluxo real, validar se o motor genérico atual aguenta ou precisa de
  ajustes.
- **Integração com sistemas existentes da empresa**: quando o TI assumir a
  implementação definitiva, avaliar reaproveitamento de cadastros já
  existentes (usuários, setores, centro de custo) em vez de recadastrar.

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
  `tipo = tarefa` (ver commit da correção pós-revisão final). Se precisar
  desse caso no futuro, implementar `avancarFluxo` também no `PUT` de status.
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
- **`pages_build_output_dir = "."` publica todo o repositório** como estático
  no domínio público do Cloudflare Pages — inclui `docs/`, `migrations/*.sql`,
  `CLAUDE.md`. Nenhuma credencial vaza (o `database_id` do D1 não é segredo),
  mas documentação interna e o schema completo ficam públicos. Resolver com
  um `_routes.json`/`.cfignore` restringindo o que é servido.
- **`wrangler.toml`'s `compatibility_date` está fixado em 2026-07-09**
  (abaixo do ideal) só para funcionar com a versão do `wrangler` instalada
  localmente durante a Fase 1. Atualizar o `wrangler` e avançar essa data é
  a correção correta quando alguém for mexer nisso de novo.
