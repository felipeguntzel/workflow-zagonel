# Pendencias e Possibilidades Futuras

Este documento lista as pendencias, melhorias mapeadas e o roadmap de evolucao do sistema Workflow Zagonel. Os itens resolvidos anteriormente foram consolidados e removidos para manter o documento limpo e focado no ciclo atual.

## 1. Etapa Atual: Motor de Fluxo e Regras de Negocio

- **Editor visual de fluxo**: interface grafica interativa (estilo diagrama ou nos) para arrastar, soltar e conectar etapas, acoes e gatilhos, substituindo a configuracao puramente via formularios.
- **Relatorios e consultas agregadas**:
  - Contagem de chamados e tarefas mae por setor.
  - Tempo medio gasto por cada setor para finalizar chamados.
  - Dashboard visual para identificacao de gargalos operacionais.
- **Reajuste de prazo sofisticado**: recalculou de prazos considerando dependencias entre etapas, dias uteis e calendario corporativo de feriados.
- **Novos modelos de fluxo**: expansao do motor para suportar outros tipos de fluxo alem de "Produto Derivado", validando a flexibilidade da arquitetura generica.

## 2. Melhorias Mapeadas na Auditoria Geral de Telas e Usabilidade

- **Paginacao no servidor (Server-Side)**: implementar paginacao com cursor ou offset no backend D1 para tabelas de alto volume (Auditoria do Sistema, Historico de Chamados e Listagem Geral), otimizando o consumo de banda e memoria.
- **Debounce em filtros de busca**: aplicar debounce de 300ms nas caixas de busca e filtros textuais (auditoria, usuarios, setores) para evitar requisicoes redundantes durante a digitacao rapida.
- **Exportacao de dados**: permitir exportacao dos registros de auditoria e relatorios de chamados em formatos CSV e Excel para analises gerenciais externas.
- **Notificacoes em tempo real**: integracao de notificacoes (Server-Sent Events ou polling periodico otimizado) para alertar usuarios quando um chamado for atribuido ao seu setor ou receber novo comentario.
- **Upload avancado com pre-visualizacao**: inclusao de area de drag-and-drop e pre-visualizacao de anexos (imagens, PDFs) antes do envio definitivo no detalhe do chamado.
- **Atalhos de teclado globais**: implementacao de atalhos ageis como `Ctrl + K` para busca rapida de chamados e telas, alem de confirmacao com `Ctrl + Enter` em caixas de texto e modais.
- **Acessibilidade aprimorada (a11y)**: inclusao de `aria-live` para mensagens dinamicas de feedback e navegacao completa por foco de teclado em modais sobrepostos.

## 3. Backlog e Itens Futuros (Outro Momento)

- **Integracao com sistemas existentes da empresa**: integracao com sistemas legados ou ERP da Zagonel para reaproveitar cadastros ja existentes (usuarios, setores, centros de custo). Conforme alinhado, este item permanece postergado para quando a TI corporativa assumir a homologacao definitiva.
- **PWA (Progressive Web App)**: suporte a Service Worker, Web App Manifest, instalacao no desktop/mobile e funcionamento com cache offline.
- **Cor por status**: selecao de cor padronizada por status com validacao para impedir repeticoes de cores entre diferentes status.
