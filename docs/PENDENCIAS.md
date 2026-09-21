# Pendências e Possibilidades Futuras

Este documento lista as pendências e o roadmap de evolução do sistema. Os itens resolvidos anteriormente foram removidos para manter o documento limpo e focado no desenvolvimento atual.

# Pendências e Possibilidades Futuras

Este documento lista as pendências e o roadmap de evolução do sistema. Os itens resolvidos anteriormente foram removidos para manter o documento limpo e focado no desenvolvimento atual.

## 1. Etapa Atual: Motor de Fluxo e Regras de Negócio

- **Editor visual de fluxo**: interface gráfica interativa (estilo diagrama ou nós) para arrastar, soltar e conectar etapas, ações e gatilhos, substituindo a configuração puramente via formulários.
- **Relatórios e consultas agregadas**:
  - Contagem de chamados e tarefas mãe por setor.
  - Tempo médio gasto por cada setor para finalizar chamados.
  - Dashboard visual para identificação de gargalos operacionais.
- **Reajuste de prazo sofisticado**: recálculo de prazos considerando dependências entre etapas, dias úteis e calendário de feriados.
- **Novos modelos de fluxo**: expansão do motor para suportar outros tipos de fluxo além de "Produto Derivado", validando a flexibilidade do motor genérico.

## 2. Backlog e Itens Futuros (Outro Momento)

- **Integração com sistemas existentes da empresa**: integração com sistemas legados ou ERP da Zagonel para reaproveitar cadastros já existentes (usuários, setores, centros de custo). Conforme alinhado, este item foi postergado para um momento posterior quando a TI corporativa assumir a homologação definitiva.
- **PWA (Progressive Web App)**: suporte a Service Worker, Web App Manifest, instalação no desktop/mobile e funcionamento com cache offline.
- **Cor por status**: seleção de cor padronizada por status com validação para impedir repetições de cores entre diferentes status.

