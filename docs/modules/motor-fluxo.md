# Motor de fluxo

Configurável via formulários (CRUD), sem editor visual nesta fase.

## Regras

- Um **FluxoTemplate** é uma sequência de **Etapas**.
- Cada Etapa pertence a um **Setor** responsável e tem um **tipo**:
  - `aprovacao`: tem botões Aprovar / Reprovar.
  - `tarefa`: só acompanha status até "finalizado", sem aprovar/reprovar.
- Etapa marcada `eh_inicial` é a que abre o chamado mãe (ex: "Solicitação").
  Ao criar o chamado mãe, o sistema já finaliza esse chamado inicial e roda
  imediatamente a lógica de "avançar fluxo" abaixo (não espera nenhuma ação
  manual sobre a etapa inicial).

## Avançar fluxo (lógica única, compartilhada)
Disparada em dois casos:
- uma etapa `aprovacao` é decidida como aprovada;
- uma etapa `tarefa` (inicial ou não) é marcada como finalizada.

Ao disparar:
- Se a etapa tem `etapa_proxima_id`: cria um novo Chamado para essa etapa,
  vinculado conforme `etapa_proxima_vinculo` (mae | pai).
- Se a etapa tem uma lista de **Ações**: cada Ação marcada "sim" gera uma
  tarefa (novo Chamado com `acao_origem_id` preenchido, `etapa_id` nulo,
  setor = `setor_destino_id` da ação, tipo tarefa simples — sem
  aprovação/reprovação própria).
- Se não tem nem etapa_proxima_id nem Ações: não faz nada além de finalizar
  a etapa atual (fim natural daquele ramo do fluxo).

Cada Ação/Etapa gerada define seu **vínculo** (`mae` ou `pai`) — a quem o
novo chamado fica atrelado na árvore (`chamado_pai_id`); `chamado_mae_id`
sempre aponta para a raiz, independente do vínculo. Isso é configurável por
Ação, não fixo.

Uma Ação pode ter `prerequisito_acao_id`: a tarefa gerada por ela nasce
"bloqueada" (calculado em tempo de leitura) até que o chamado-irmão da ação
pré-requisito esteja finalizado.

## Ao reprovar (etapas de tipo aprovação)
- Exige justificativa → vira um Comentário com `eh_justificativa = true`.
- Finaliza este chamado e sobe pela cadeia via `chamado_pai_id` finalizando
  cada ancestral até a raiz (idempotente — ancestrais já finalizados
  permanecem finalizados).

## Exemplo aplicado: Produto Derivado
1. Etapa "Solicitação" (inicial, sem aprovação) — setor Comercial (ou
   qualquer solicitante).
2. Etapa "Avaliação Projetos" (aprovação, setor Projetos).
   - Reprovado → finaliza tudo, com justificativa.
   - Aprovado → cria Etapa "Desenvolvimento de Produto"
     (`etapa_proxima_vinculo = mae`, para já cair vinculada à raiz).
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
