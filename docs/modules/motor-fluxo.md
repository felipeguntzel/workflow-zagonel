# Motor de fluxo

Configurável via formulários (CRUD), sem editor visual nesta fase.

## Regras

- Um **FluxoTemplate** é uma sequência de **Etapas**.
- Cada Etapa pertence a um **Setor** responsável e tem um **tipo**:
  - `aprovacao`: tem botões Aprovar / Reprovar.
  - `tarefa`: só acompanha status até "finalizado", sem aprovar/reprovar.
- Etapa marcada `eh_inicial` é a que abre o chamado mãe (ex: "Solicitação").

## Ao reprovar (etapas de tipo aprovação)
- Exige justificativa → vira um Comentário com `eh_justificativa = true`.
- Finaliza este chamado **e** toda a cadeia acima (pai, mãe) automaticamente.

## Ao aprovar (etapas de tipo aprovação)
- Dispara a(s) próxima(s) Etapa(s) configurada(s), OU libera a lista de
  **Ações** da etapa (checkboxes sim/não).
- Cada Ação marcada "sim" gera uma tarefa (novo Chamado) no
  `setor_destino_id` da ação.
- Cada Ação/Etapa gerada define seu **vínculo** (`mae` ou `pai`) — a quem o
  novo chamado fica atrelado na árvore. Isso é configurável por Ação/Etapa,
  não fixo.
- Uma Ação pode ter `prerequisito_acao_id`: a tarefa gerada por ela só sai do
  status "previsto" quando a ação/etapa pré-requisito estiver "finalizado".

## Exemplo aplicado: Produto Derivado
1. Etapa "Solicitação" (inicial, sem aprovação) — setor Comercial (ou
   qualquer solicitante).
2. Etapa "Avaliação Projetos" (aprovação, setor Projetos), vinculada ao pai
   (a própria solicitação/mãe).
   - Reprovado → finaliza tudo, com justificativa.
   - Aprovado → cria Etapa "Desenvolvimento de Produto".
3. Etapa "Desenvolvimento de Produto" (aprovação, setor Desenvolvimento),
   vinculada à **mãe** (não à etapa de Projetos).
   - Reprovado → finaliza Desenvolvimento, Projetos e a mãe, com
     justificativa.
   - Aprovado → libera Ações:
     - "Criar ficha técnica nova" (sim/não) → Engenharia de Produto,
       vínculo mãe.
     - "Criar material gráfico novo" (sim/não) → Engenharia de Produto,
       vínculo mãe.
     - "Criar embalagem nova (caixa/blister)" (sim/não) → Marketing,
       vínculo mãe.
   - As 3 ações rodam em paralelo, cada uma linkada diretamente à mãe.
