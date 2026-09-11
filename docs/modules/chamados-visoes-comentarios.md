# Chamados: visões, permissões e comunicação

## Visão do meu setor (padrão ao logar)
- Lista só os chamados cujo `etapa.setor_id` == setor do usuário logado.
- Ações disponíveis: aprovar/reprovar (se etapa de aprovação), marcar ações,
  apontar horas, comentar, editar campos do chamado, excluir (ambiente de
  teste — CRUD completo).

## Visão geral (chamado mãe)
- Acessível a partir de qualquer chamado da árvore via botão "Ver chamado
  geral".
- Mostra o chamado mãe e toda a árvore de descendentes (filhos, netos...),
  cada um com: setor, responsável, status, prazo, aprovado/reprovado,
  comentários.
- **Somente leitura** — qualquer usuário do sistema pode ver qualquer árvore,
  mas não tem botões de ação aqui.
- Toggle rápido sempre visível para voltar à "Meus chamados".

## Comunicação
- Toda comunicação entre setores é via **Comentário** anexado ao chamado
  (estilo Redmine — texto + usuário + data, sem campos estruturados extras).
- Justificativa de reprovação é um comentário obrigatório
  (`eh_justificativa = true`), visível tanto no chamado que reprovou quanto
  no chamado do solicitante original e na visão geral.

## Empresa do chamado
- Herdada automaticamente do `setor_id` do solicitante — não é um campo
  selecionável manualmente ao abrir o chamado.
