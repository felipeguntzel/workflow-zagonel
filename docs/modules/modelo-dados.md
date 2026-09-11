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
  eh_inicial (bool), etapa_proxima_id (FK Etapa, opcional, nullable — próxima
  etapa a criar automaticamente quando esta for aprovada/finalizada, usado
  quando a etapa não tem lista de Ações), etapa_proxima_vinculo (mae | pai —
  a quem o chamado da próxima etapa fica atrelado; só relevante quando
  etapa_proxima_id está preenchido)

## Ação
- id, etapa_id (FK, a etapa de aprovação que a contém), rotulo,
  setor_destino_id (FK), vinculo (mae | pai), prerequisito_acao_id (FK para
  outra Ação da mesma etapa, opcional, nullable — a tarefa gerada por esta
  ação só é liberada quando o chamado da ação pré-requisito estiver
  finalizado)

## Chamado
- id, fluxo_template_id (FK), etapa_id (FK, nullable), acao_origem_id (FK
  Ação, nullable) — exatamente um dos dois é preenchido: etapa_id quando o
  chamado representa uma Etapa do fluxo, acao_origem_id quando representa uma
  tarefa gerada por uma Ação (tarefa simples, sem aprovação, setor = setor
  destino da ação)
- chamado_mae_id (FK, nullable — null apenas no próprio chamado mãe/raiz),
  chamado_pai_id (FK, nullable — null apenas no próprio chamado mãe/raiz;
  aponta para o chamado imediatamente acima na árvore, conforme o `vinculo`
  configurado: se `vinculo = mae`, aponta direto para a raiz; se
  `vinculo = pai`, aponta para o chamado que disparou a criação)
- empresa_id (FK, herdada do setor do solicitante), status_id (FK),
  resultado (aprovado | reprovado | nulo — preenchido quando uma etapa de
  aprovação é decidida), solicitante_id (FK usuário), responsavel_id (FK
  usuário, nullable), data_abertura, prazo, data_finalizacao (nullable)

Setor efetivo de um chamado = `etapa.setor_id` (se etapa_id preenchido) ou
`acao.setor_destino_id` (se acao_origem_id preenchido).

"Bloqueado" (aguardando pré-requisito) é calculado em tempo de leitura, não
armazenado: um chamado gerado por uma Ação com `prerequisito_acao_id` fica
bloqueado enquanto o chamado-irmão daquela ação pré-requisito (mesmo
chamado_mae_id) não estiver finalizado.

## Comentário
- id, chamado_id (FK), usuario_id (FK), data, texto, eh_justificativa (bool)

## ApontamentoHoras
- id, chamado_id (FK), usuario_id (FK), data, horas, observacao
