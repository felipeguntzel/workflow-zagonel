# Boas Práticas e Métodos Adotados - WorkFlow Zagonel

Este documento consolida os padrões de engenharia, arquitetura, segurança e interface adotados no desenvolvimento do **WorkFlow Zagonel**.

---

## 1. Arquitetura e Estrutura de Código

### Frontend Leve e Modular (Vanilla JS)
- **Sem frameworks pesados de frontend**: Não utilizamos React, Vue ou etapas de build pesadas. O frontend é composto por HTML5, CSS3 e JavaScript ES Modules nativos servidos de forma estática via `public/`.
- **Separação por responsabilidades**:
  - `public/api.js`: Camada cliente de comunicação HTTP/REST com tratamento uniforme de token e erros.
  - `public/auth.js`: Gerenciamento do estado da sessão do usuário, token no `localStorage` e permissões de tela.
  - `public/ui.js`: Utilitários visuais compartilhados (tooltips informativos `info()`, sanitização `escaparHtml()`, mensagens, botões de ação e gerador de link para WhatsApp).
  - `public/crud-ui.js`: Motor genérico para telas de listagem, cadastro e edição tabular/modal.
  - `public/layout.js`: Gestão da barra lateral (sidebar), navegação de topo, temas (claro, escuro, alto-contraste) e busca rápida (F1/Ctrl+F).
  - Módulos de telas dedicadas (`chamados.js`, `chamado.js`, `novo-chamado.js`, `fluxo.js`, `usuarios.js`, etc.).

### Backend Serverless (Cloudflare Pages Functions)
- Rotas organizadas na pasta `functions/api/`, mapeadas automaticamente para `/api/*`.
- Lógica de negócio reutilizável isolada na pasta privada `functions/_lib/`:
  - `auth.js` e `sessao.js`: Hashing e assinatura criptográfica de sessão.
  - `permissoes.js`: Middleware e checagem de controle de acesso (RBAC).
  - `db.js`: Helpers de execução e binding para SQLite Cloudflare D1 (`all`, `first`, `run`).
  - `recuperacao.js`: Ciclo de vida de tokens e recuperação de senha.
  - `fluxo.js`: Motor de regras de etapas, ações e dependências.

---

## 2. Segurança e Controle de Acesso

### Autenticação e Armazenamento de Senhas
- **PBKDF2 com Salt**: As senhas são protegidas com PBKDF2 (100.000 iterações, algoritmo SHA-256) com salt criptográfico aleatório de 16 bytes por usuário.
- **Formato auto-descritivo**: Armazenadas no padrão `pbkdf2$iteracoes$salt$hash`.
- **Troca obrigatória**: Usuários recém-criados possuem flag para exigir redefinição de senha no primeiro acesso.
- **Tokens de Sessão**: Assinados com chave HMAC (`SESSAO_SEGREDO`) utilizando a Web Crypto API nativa.
- **Recuperação de Senha**: Tokens aleatórios de 48 caracteres hexadecimais, uso único e expiração rígida de 30 minutos.

### Autorização e Grupos (RBAC)
- Todas as rotas de backend (exceto `/api/login` e `/api/recuperar-senha`) exigem token válido.
- Acesso controlado por grupos com permissões granulares por tela:
  - `visualizar`, `inserir`, `editar`, `excluir`.
- Usuários marcados como `admin = 1` possuem bypass automático de permissões para manutenção irrestrita.

### Prevenção contra Vulnerabilidades
- **Sanitização XSS**: Todo texto inserido por usuários renderizado no DOM passa obrigatoriamente pela função `escaparHtml()` de `ui.js`.
- **SQL Injection**: Uso estrito de prepared statements (`db.prepare().bind(...)`). Consultas nunca concatenam strings brutas de usuários.
- **Integridade de Chaves**: Verificação de dependências antes de exclusões para impedir que registros órfãos ou quebras de integridade ocorram.

---

## 3. Banco de Dados e Migrações (Cloudflare D1)

- **Controle de Versão por Migrações**: Toda alteração no schema do SQLite é versionada em arquivos sequenciais dentro de `migrations/` (exemplo: `0011_usuarios_telefone.sql`, `0012_recuperacao_senha.sql`).
- **Integridade e Constraints**:
  - Uso de chaves estrangeiras com regras de deleção apropriadas (`ON DELETE CASCADE` ou bloqueio via validação de dependências).
  - Tabelas críticas contam com `CHECK constraints` para garantir integridade estrutural (ex.: um chamado aponta obrigatoriamente ou para uma etapa ou para uma ação de origem, nunca ambos nem nenhum).
- **Auto-criação de contingência**: Funções críticas do backend possuem verificações com `CREATE TABLE IF NOT EXISTS` para garantir funcionamento contínuo mesmo antes de aplicar migrações manuais em novos ambientes.

---

## 4. Testes e Qualidade de Código

- **Suíte de Testes Automatizados**: Implementada com o executor nativo do Node.js (`node:test`) e módulo de asserção estrita (`node:assert/strict`).
- **Execução**: Comando `npm test`.
- **Cobertura**:
  - Cálculos de prazos, alertas e atrasos de chamados.
  - Regras do motor de fluxo, precedência de etapas e bloqueio por pré-requisitos.
  - Hashing de senhas, validação e verificação de tokens HMAC de sessão.
  - Geração e expiração de tokens de recuperação de senha.
  - Helpers HTTP e formatação/escape de HTML.

---

## 5. Padrões de Interface e Experiência do Usuário (UI/UX)

### Didática e Transparência
- **Ícone informativo "i"**: Cada campo de formulário, botão crítico ou cabeçalho possui um ícone circular de informação com tooltip claro explicando o objetivo daquele dado e exemplos.
- **Dicas formatadas**: Textos de ajuda nos formulários estruturados com quebras de linha limpas, separando explicação e exemplo prático.

### Comunicação Direta e WhatsApp
- **WhatsApp Click-to-Chat**: Integração nos chamados com o telefone do solicitante e responsável, abrindo conversa direta no navegador via `https://wa.me/` com mensagem pré-formatada referenciando o número e título do chamado.

### Navegação e Acessibilidade
- **Identificador Numérico de Telas (01 a 09)**: Todas as telas possuem código fixo visível no menu.
- **Busca Rápida por Teclado**: Atalhos `F1` ou `Ctrl + F` abrem janela de comando rápida para filtrar e navegar instantaneamente para qualquer tela.
- **Temas**: Suporte nativo a Tema Claro, Tema Escuro e Tema Alto Contraste, persistidos nas preferências do usuário via variáveis CSS (`--cor-fundo`, `--cor-texto`, `--cor-primaria`, etc.).
- **Estados Vazios**: Mensagens amigáveis e claras quando uma lista ou tabela não possui registros cadastrados ainda.
- **Regra de Estilo Textual**: Proibido o uso do caractere travessão ("—") em qualquer texto de interface, código ou documentação, priorizando vírgulas, dois-pontos ou parênteses.
