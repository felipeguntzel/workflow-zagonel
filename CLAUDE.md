# WorkFlow Zagonel

Protótipo funcional e robusto de um sistema de gestão de chamados de alteração e criação de produto da Zagonel. O sistema roda no Cloudflare (Pages + Functions + D1) com CRUD completo em todas as entidades e ambiente de testes reais.

## Regras de colaboração com o Felipe

- **Idioma**: responda sempre em português do Brasil ao Felipe no chat, em qualquer sessão ou tarefa neste repositório.
- **Sem narração não pedida**: não gerar texto de status entre as etapas de uma tarefa (como "agora vou fazer X", "buscando Y"). Vá direto ao resultado; a resposta final deve informar de forma clara e concisa o que foi feito.
- **Testar e avaliar antes de agir**: antes de efetivamente começar a implementar uma alteração, testar e avaliar a abordagem primeiro.
- **Nunca deduzir sem certeza**: se houver qualquer dúvida sobre requisito, comportamento esperado ou decisão de UX/arquitetura, pergunte ao Felipe antes de agir em vez de assumir.
- **Proibido usar travessão ("—")**: nunca use o caractere de travessão em nenhum texto (código, copy da UI, documentação, mensagens ou commits). Use vírgula, dois-pontos, parênteses ou ponto e vírgula.

## Comandos do projeto

```bash
npm test         # executa a suíte de testes automatizados (node:test)
npm run dev      # inicia o servidor local via wrangler pages dev public
npm run deploy   # publica a pasta public no Cloudflare Pages
```

Deploy contínuo: push na branch `master` dispara o build e deploy automático no Cloudflare Pages (`felipeguntzel/workflow-zagonel`).

## Arquitetura e Estado Atual

### Frontend (`public/`)
- Vanilla JS (ES Modules nativos), HTML5 e CSS3 sem frameworks pesados ou etapas de compilação.
- Todos os arquivos estáticos acessíveis pelo usuário ficam isolados em `public/`. As pastas `functions/`, `docs/` e `migrations/` ficam fora do escopo público.
- Barra lateral com 9 telas numeradas (01 a 09) organizadas em seções lógicas (Cadastros, Chamados, Dashboards).
- Atalhos globais de teclado: `F1` e `Ctrl + F` abrem modal de busca rápida para filtrar por número ou nome e navegar com Enter.
- Temas suportados via variáveis CSS: Claro, Escuro e Alto Contraste, persistidos nas preferências do usuário.
- Tooltips didáticos com ícone "i" em cada campo e botão de formulário.
- Integração WhatsApp Click-to-Chat (`https://wa.me/`) no detalhe dos chamados com texto pré-formatado para contato ágil com solicitante e responsável.

### Backend (`functions/`)
- Cloudflare Pages Functions em `functions/api/*` para endpoints REST.
- Módulos compartilhados em `functions/_lib/` (banco de dados, autenticação, permissões, motor de fluxo, recuperação de senha).

### Autenticação e Permissões (RBAC)
- Senhas protegidas com PBKDF2 (100.000 iterações, SHA-256) e salt individual aleatório de 16 bytes.
- Sessão controlada por tokens criptográficos HMAC gerados via Web Crypto API nativa (`SESSAO_SEGREDO`).
- Recuperação de senha por e-mail via tokens seguros de uso único com expiração de 30 minutos (`recuperacao_senha`).
- Controle de acesso granular por grupos com permissões por tela (visualizar, inserir, editar, excluir) e bypass para administradores (`admin = 1`).

### Banco de Dados (Cloudflare D1)
- SQLite gerenciado com migrações versionadas em `migrations/`.
- Integridade referencial com foreign keys e CHECK constraints.

## Onde encontrar cada especificação e regra

- Boas práticas e métodos adotados: `docs/modules/boas-praticas.md`
- Stack técnica e arquitetura: `docs/modules/arquitetura-tech.md`
- Entidades e modelo relacional: `docs/modules/modelo-dados.md`
- Motor de fluxo (etapas, aprovações, ações, pré-requisitos): `docs/modules/motor-fluxo.md`
- Visão do setor, geral, permissões e comentários: `docs/modules/chamados-visoes-comentarios.md`
- Prazos, cálculo de vencimento, cascata e apontamento de horas: `docs/modules/prazos-horas.md`
- Especificações e planos de design anteriores: `docs/superpowers/specs/` e `docs/superpowers/plans/`
- Pendências e possibilidades futuras: `docs/PENDENCIAS.md`
