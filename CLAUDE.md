# WorkFlow Zagonel

Protótipo funcional (não descartável) de um sistema de gestão de chamados de
alteração/criação de produto, para apresentar à direção e depois ser
reimplementado/integrado pelo TI. Roda em produção no Cloudflare (Pages +
Functions + D1) desde o início — CRUD completo (criar, editar, excluir) em
todas as entidades, é um ambiente de testes reais.

## Regras gerais

- Sem framework de frontend: HTML + CSS + JS puro, em módulos separados por
  responsabilidade.
- Backend: Cloudflare Pages Functions + D1. Sem login com senha — usuário se
  identifica escolhendo da lista.
- Todo campo/botão relevante da UI tem um ícone "i" com tooltip explicando a
  regra de negócio esperada.
- Comunicação entre setores é sempre via comentários (estilo Redmine), nunca
  campos estruturados paralelos.
- Empresa do chamado é sempre herdada do setor do solicitante, nunca um campo
  manual.
- Deploy: push em `master` → Cloudflare Pages publica automaticamente
  (`felipeguntzel/workflow-zagonel`).

## Onde encontrar cada regra (leia sob demanda)

- Entidades e campos → `docs/modules/modelo-dados.md`
- Como o motor de fluxo funciona (etapas, aprovação/reprovação, ações,
  pré-requisitos, vínculo mãe/pai) → `docs/modules/motor-fluxo.md`
- Visão do setor vs. visão geral, permissões, comentários →
  `docs/modules/chamados-visoes-comentarios.md`
- Prazos, destaque de vencido, cascata de atraso, apontamento de horas →
  `docs/modules/prazos-horas.md`
- Stack técnica e organização de arquivos → `docs/modules/arquitetura-tech.md`

## Specs e pendências

- Specs de design aprovadas: `docs/superpowers/specs/`
- Ideias futuras / fora de escopo desta fase: `docs/PENDENCIAS.md`
