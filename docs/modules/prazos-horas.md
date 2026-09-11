# Prazos, cascata de atraso e apontamento de horas

## Prazo
- Sugestão automática ao criar o chamado: `data_abertura + prazo_padrao_dias`
  do setor da etapa. Editável manualmente por quem está com o chamado.

## Destaque visual
- `hoje > prazo` e status não é finalizado/suspenso → vencido, destaque
  vermelho.
- `prazo - hoje <= 2 dias` (e ainda não vencido) → alerta, destaque amarelo.

## Cascata de atraso
- Ao finalizar um chamado com `data_finalizacao > prazo`:
  - `dias_atraso = data_finalizacao - prazo`
  - Todo chamado dependente que ainda não foi iniciado (aguardando
    pré-requisito, ou etapa seguinte ainda não criada/iniciada) tem seu
    `prazo` empurrado em `dias_atraso`.
  - Um Comentário de sistema é criado no chamado ajustado registrando o
    motivo ("Prazo ajustado em N dias devido a atraso no chamado #X").

## Apontamento de horas
- Campos: chamado_id, usuario_id, data, horas, observação.
- Qualquer usuário do setor responsável pelo chamado pode lançar.
- O card/detalhe do chamado mostra a soma total de horas apontadas.
