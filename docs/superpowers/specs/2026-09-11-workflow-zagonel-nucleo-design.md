# WorkFlow Zagonel — Fase 1: Núcleo do motor de chamados

Data: 2026-09-11
Status: aprovado para virar plano de implementação

## Objetivo

Protótipo funcional (não só visual) de um sistema de gestão de chamados de
alteração/criação de produto, para apresentar à direção e validar viabilidade.
Se aprovado, o TI reimplementa/integra com os sistemas já existentes da
empresa — este protótipo não é descartável: deve poder ser usado para testes
reais (dados criados, editados e excluídos de verdade), rodando em produção
no Cloudflare (Pages + Functions + D1).

Caso de uso guia desta fase: fluxo de **produto derivado** (chamado mãe
"Solicitação" → "Projetos" → "Desenvolvimento de Produto" → ações que geram
tarefas em Engenharia de Produto / Marketing).

## Fora de escopo nesta fase (ver `docs/PENDENCIAS.md`)

- Editor visual de fluxo (arrastar/soltar caixas e conexões)
- Relatórios agregados (tempo médio por setor, contagens gerais, dashboard de
  gargalos)
- Login com senha / autenticação real

## Modelo de dados

Ver `docs/modules/modelo-dados.md` para o detalhamento de entidades e campos.

Resumo das entidades: Empresa, Setor, Usuário, Status, FluxoTemplate, Etapa,
Ação, Chamado, Comentário, ApontamentoHoras.

## Motor de fluxo (configurável via formulários)

Ver `docs/modules/motor-fluxo.md`.

Um FluxoTemplate é uma sequência de Etapas. Cada Etapa pertence a um Setor e é
do tipo Aprovação (tem botões aprovar/reprovar) ou Tarefa (só acompanha status
até finalizado). Etapas de Aprovação, ao serem aprovadas, disparam a(s)
próxima(s) etapa(s) ou uma lista de Ações (checkboxes sim/não, cada uma
gerando uma tarefa em um setor destino se marcada). Ao reprovar, exige
justificativa (vira comentário) e finaliza toda a cadeia acima (pai, mãe).

Cada Etapa/Ação define se o chamado que ela gera fica vinculado ao chamado
**mãe** ou ao chamado **pai imediato** — configurável, não fixo. Ações também
podem ter um pré-requisito (outra ação/etapa que precisa estar finalizada
antes de liberar).

## Chamados, visões e comunicação

Ver `docs/modules/chamados-visoes-comentarios.md`.

- **Visão do meu setor** (padrão ao logar): só os chamados direcionados ao
  setor do usuário. Tem ação: aprovar/reprovar, marcar ações, apontar horas,
  comentar, editar, excluir (é ambiente de teste).
- **Visão geral (chamado mãe)**: árvore completa mãe + todos os filhos,
  somente leitura, acessível por qualquer usuário a partir de qualquer
  chamado da árvore, com toggle rápido para voltar à visão do setor.
- Toda comunicação é via comentários (estilo Redmine) anexados ao chamado.
  Justificativa de reprovação é um comentário obrigatório.
- Empresa do chamado é herdada do setor do solicitante (não é campo manual).

## Prazos, cascata e horas

Ver `docs/modules/prazos-horas.md`.

- Prazo sugerido = data de abertura + prazo padrão (dias) do setor da etapa;
  editável manualmente.
- Chamado vencido (hoje > prazo, status não finalizado) = destaque visual
  vermelho; a ≤2 dias do prazo = destaque amarelo.
- Ao finalizar um chamado com atraso, todo chamado dependente ainda não
  iniciado tem o prazo empurrado pelos mesmos dias de atraso, com um
  comentário de sistema registrando o ajuste.
- Apontamento de horas: data, horas, observação, por usuário, por chamado;
  soma total visível no card do chamado.

## CRUD e testabilidade

Todas as entidades (Empresas, Setores, Usuários, Status, FluxoTemplates,
Etapas, Ações, Chamados, Comentários, Apontamentos) devem ser criáveis,
editáveis e excluíveis pela interface desde o início — este é um ambiente de
testes, não só de leitura. Exclusão de um chamado com filhos exclui a árvore
em cascata (com confirmação).

## Telas

1. Login simples (escolher usuário da lista, sem senha)
2. Meus chamados (home) — lista filtrada pelo setor do usuário
3. Detalhe do chamado (ação) — aprovar/reprovar, ações, horas, comentários
4. Chamado geral (somente leitura) — árvore do chamado mãe
5. Abrir novo chamado (a partir de uma etapa inicial de um FluxoTemplate)
6. Cadastros (CRUD): Empresas, Setores, Usuários, Status, FluxoTemplates
   (com Etapas/Ações/pré-requisitos)

Requisito transversal de UI: todo campo/botão relevante tem um ícone "i" com
tooltip explicando a regra de negócio esperada (ex.: botão "Aprovar" →
"Aprova a solicitação e libera a próxima etapa do fluxo automaticamente").

## Arquitetura técnica

Ver `docs/modules/arquitetura-tech.md`.

- Frontend: HTML + CSS + JS puro (sem framework), módulos separados por
  responsabilidade (api.js, chamados.js, cadastros.js, ui.js).
- Backend: Cloudflare Pages Functions (Workers) servindo API REST.
- Banco: Cloudflare D1 (SQLite gerenciado), schema relacional espelhando o
  modelo de dados acima.
- Deploy: mesmo projeto Cloudflare Pages já conectado ao GitHub
  (`felipeguntzel/workflow-zagonel`), deploy automático a cada push.
