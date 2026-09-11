# Modelo de dados

## Empresa
- id, nome (ex: "Zagonel S.A", "Zagonel Iluminação")

## Setor
- id, nome, empresa_id (FK), centro_custo, prazo_padrao_dias

## Usuário
- id, nome, setor_id (FK) — sem senha; login = selecionar da lista

## Status
- id, nome (previsto, em desenvolvimento, finalizado, suspenso, aguardando
  terceiros) — cadastrável, mas começa com esses 5

## FluxoTemplate
- id, nome (ex: "Produto Derivado")

## Etapa
- id, fluxo_template_id (FK), nome, setor_id (FK), tipo (aprovacao | tarefa),
  eh_inicial (bool)

## Ação
- id, etapa_id (FK, a etapa de aprovação que a contém), rotulo,
  setor_destino_id (FK), vinculo (mae | pai), prerequisito_acao_id (FK,
  opcional, nullable)

## Chamado
- id, fluxo_template_id (FK), etapa_id (FK, etapa atual), chamado_mae_id (FK,
  nullable — null se este é o próprio mãe), chamado_pai_id (FK, nullable),
  empresa_id (FK, herdada do setor do solicitante), status_id (FK),
  solicitante_id (FK usuário), responsavel_id (FK usuário, nullable),
  data_abertura, prazo, data_finalizacao (nullable)

## Comentário
- id, chamado_id (FK), usuario_id (FK), data, texto, eh_justificativa (bool)

## ApontamentoHoras
- id, chamado_id (FK), usuario_id (FK), data, horas, observacao
