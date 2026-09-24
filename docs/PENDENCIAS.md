# Pendencias e Possibilidades Futuras

Este documento lista as pendencias, melhorias mapeadas e o roadmap de evolucao do sistema Workflow Zagonel. Os itens resolvidos anteriormente foram consolidados e removidos para manter o documento limpo e focado no ciclo atual.

## 1. Etapa Atual: Motor de Fluxo e Regras de Negocio (Concluído)

- [x] **Relatorios e consultas agregadas (Dashboard de Métricas)**:
  - Contagem de chamados e tarefas mãe por setor.
  - Tempo médio gasto por cada setor para finalizar chamados (dias).
  - Dashboard visual para identificação de gargalos operacionais (`dashboards.html` e `/api/relatorios`).
  - Exportação gerencial em CSV compatível com Excel.
- [x] **Reajuste de prazo sofisticado**: cálculo de prazos considerando dias úteis (segunda a sexta), calendário completo de feriados nacionais brasileiros (fixos e móveis) e recálculo inteligente em cascata.
- [x] **Editor visual de fluxo**: interface gráfica interativa com alternador `[ 📋 Tabela ]` e `[ 🔀 Diagrama Visual ]` renderizando nós/etapas com setores, prazos, conexões direcionais, campos dinâmicos e ações conectadas.
- [x] **Novos modelos de fluxo**: gerenciamento direto pelo aplicativo pelo usuário, suportado pela arquitetura genérica de templates, etapas e ações.

## 2. Melhorias Mapeadas na Auditoria Geral de Telas e Usabilidade (Concluído)

- [x] **Paginação no servidor (Server-Side)**: implementada paginação com `limite` e `offset` no backend D1 e interface com botões anterior/próxima e contadores para Auditoria do Sistema e Listagem de Chamados.
- [x] **Debounce em filtros de busca**: utilitário `debounce(fn, ms)` com 300ms aplicado nas caixas de busca de auditoria, chamados e em todos os cadastros baseados em CRUD (usuários, setores, empresas, status).
- [x] **Exportação de dados**: exportação em CSV com UTF-8 BOM (`\uFEFF`) e delimitador `;` compatível nativamente com Microsoft Excel para Auditoria do Sistema e Listagem de Chamados.
- [x] **Notificações em tempo real**: polling periódico otimizado a cada 60s no layout global exibindo badge de chamados pendentes e aviso visual discreto na barra superior.
- [x] **Upload avançado com pré-visualização**: área interativa de drag-and-drop no detalhe do chamado com suporte a teclado (`Enter`/`Espaço`), pré-visualização com miniaturas para imagens e ícones contextuais para documentos (PDF, planilhas), validação de limite de 2MB e remoção pré-envio.
- [x] **Atalhos de teclado globais**: paleta universal via `Ctrl + K` (ou `Cmd + K`) com navegação de telas e salto direto para chamado (#ID), submissão com `Ctrl + Enter` em formulários/comentários e fechamento de modais com tecla `Escape`.
- [x] **Acessibilidade aprimorada (a11y)**: região viva `anunciarA11y` (`aria-live="polite"`), feedback de leitor de tela, rótulos semânticos e navegação por teclado nos modais e paleta.

## 3. Backlog e Itens Futuros (Outro Momento)

- [x] **PWA (Progressive Web App)**: suporte a Service Worker, Web App Manifest, instalação no desktop/mobile e funcionamento com cache offline.
- [x] **Cor por status**: seleção de cor padronizada por status com validação no backend e frontend para impedir repetições de cores entre diferentes status, além de visualização colorida de badges nos chamados.
- **Integracao com sistemas existentes da empresa**: integração com sistemas legados ou ERP da Zagonel para reaproveitar cadastros já existentes (usuários, setores, centros de custo). Conforme alinhado, este item permanece postergado para quando a TI corporativa assumir a homologação definitiva.
