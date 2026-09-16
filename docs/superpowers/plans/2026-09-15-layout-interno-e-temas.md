# Layout interno, sistema de design e temas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o menu horizontal e o layout centralizado (com largura máxima) por uma sidebar fixa colapsável com tema claro/alto-contraste, tipografia escolhível, uma biblioteca de componentes CSS reutilizável (botões, modal de confirmação, mensagens, cards) e nomenclatura/texto padronizados, aplicados às 7 telas internas do sistema.

**Architecture:** Toda tela interna já segue o mesmo esqueleto HTML (`<div id="nav"></div>` seguido de `<main>...</main>`) — em vez de editar as 7 telas, uma única função `aplicarLayout(usuario)` (novo `layout.js`) faz a montagem em tempo de execução: constrói a sidebar e a topbar, e MOVE o `<main>` existente (com todo o conteúdo que cada tela já constrói) para dentro da nova estrutura. Cada tela troca uma única linha (`document.getElementById("nav").replaceWith(montarNav(usuario))` → `aplicarLayout(usuario)`). Tema/fonte/tamanho são atributos (`data-tema`, `data-fonte`, `data-tamanho`) no `<html>`, lidos de 3 colunas novas em `usuarios` e cacheados no objeto do usuário logado (mesmo padrão já usado para `admin`/`deve_trocar_senha`) — todo CSS reage a esses atributos via variáveis customizadas, nunca duplicando regras por seletor.

**Tech Stack:** Cloudflare D1, Cloudflare Pages Functions, HTML/CSS/JS puro (sem framework, sem bundler), `node:test` para lógica pura. Dois arquivos CSS (`style.css` + novo `componentes.css`) carregados via `<link>`, seguindo a mesma separação por responsabilidade já usada no JS.

## Global Constraints

- Sem framework de frontend, sem dependência nova, sem bundler — HTML/CSS/JS puro, como já é o padrão do projeto.
- Nenhuma fonte carregada da internet — só fontes de sistema (Arial, Times New Roman, Verdana, Courier New).
- Todo campo/botão relevante da UI tem um ícone "i" com tooltip explicando a regra de negócio esperada (`info()`, já existe em `ui.js` — continua sendo usado, não muda).
- `window.confirm(...)` nativo do navegador é substituído por um modal customizado (`confirmarAcao`) em todo lugar que hoje o usa (`chamado.js`, `grupos.js`).
- Preferências de fonte/tamanho/tema são por usuário, salvas no banco (3 colunas novas em `usuarios`), não em `localStorage` — seguem o usuário entre dispositivos. O estado de colapsar/expandir a sidebar é só do navegador (`localStorage`), não precisa dessa persistência.
- `index.html` (login) e `trocar-senha.html` ficam FORA do escopo desta leva — mantêm o layout split-card atual, sem sidebar.
- Escopo de 7 telas: `chamados.html`, `novo-chamado.html`, `chamado.html`, `cadastros.html`, `fluxo.html`, `grupos.html`, `geral.html`.
- Git: commit após cada tarefa, terminando com `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## Task 1: D1 migration — colunas de preferências visuais

**Files:**
- Create: `migrations/0006_preferencias_usuario.sql`

**Interfaces:**
- Produces: `usuarios.fonte` (TEXT, default `'arial'`), `usuarios.tamanho_fonte` (TEXT, default `'m'`), `usuarios.tema` (TEXT, default `'claro'`). Valores válidos: `fonte` ∈ `{arial, times, verdana, courier}`; `tamanho_fonte` ∈ `{p, m, g, gg}`; `tema` ∈ `{claro, alto-contraste}` — validados na aplicação (Task 2), não via `CHECK` no banco (mesmo padrão já usado para outras colunas enum deste projeto, ex. `permissoes.tela`, que usa `CHECK`, mas essas 3 ficam mais simples sem — ver justificativa no Task 2).

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE usuarios ADD COLUMN fonte TEXT NOT NULL DEFAULT 'arial';
ALTER TABLE usuarios ADD COLUMN tamanho_fonte TEXT NOT NULL DEFAULT 'm';
ALTER TABLE usuarios ADD COLUMN tema TEXT NOT NULL DEFAULT 'claro';
```

Sem `CHECK` nessas 3 colunas (diferente de `permissoes.tela`): a validação de valor
permitido é feita inteiramente no endpoint (Task 2), que é o único lugar que
escreve nelas — mantém a migração simples e a regra de negócio num lugar só,
em vez de duplicada entre SQL e JS.

- [ ] **Step 2: Apply the migration locally and remotely**

```bash
wrangler d1 execute workflow_zagonel_db --local --file=migrations/0006_preferencias_usuario.sql
wrangler d1 execute workflow_zagonel_db --remote --file=migrations/0006_preferencias_usuario.sql
```
Expected: both succeed with no errors. Confirm the defaults landed correctly:
```bash
wrangler d1 execute workflow_zagonel_db --local --command="SELECT login, fonte, tamanho_fonte, tema FROM usuarios LIMIT 3"
```
Expected: every existing user shows `arial`/`m`/`claro`.

- [ ] **Step 3: Commit**

```bash
git add migrations/0006_preferencias_usuario.sql
git commit -m "Add fonte/tamanho_fonte/tema columns to usuarios"
```

---

## Task 2: Backend — `PUT /api/preferencias` + incluir preferências no login

**Files:**
- Create: `functions/api/preferencias.js`
- Modify: `functions/api/login.js`

**Interfaces:**
- Consumes: `obterUsuarioDaRequisicao` (`functions/_lib/permissoes.js`, já existe) — mesmo padrão de `functions/api/trocar-senha.js`: exige sessão válida, SEM checagem de `tela`/`ação` (preferências não são uma das 6 telas do sistema de permissões, e cada usuário só edita as próprias).
- Produces (HTTP): `PUT /api/preferencias` aceita `{fonte, tamanho_fonte, tema}`, valida contra as listas permitidas, atualiza a própria linha do usuário autenticado, devolve `{fonte, tamanho_fonte, tema}` atualizados. `POST /api/login` passa a incluir `fonte`, `tamanho_fonte`, `tema` na resposta (mesmo padrão de `admin`/`deve_trocar_senha` já incluídos).

- [ ] **Step 1: Write `functions/api/preferencias.js`**

```js
import { run } from "../_lib/db.js";
import { json, error } from "../_lib/http.js";
import { obterUsuarioDaRequisicao } from "../_lib/permissoes.js";

const FONTES = ["arial", "times", "verdana", "courier"];
const TAMANHOS = ["p", "m", "g", "gg"];
const TEMAS = ["claro", "alto-contraste"];

export async function onRequestPut(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);
  const body = await context.request.json();

  if (!FONTES.includes(body.fonte)) {
    return error(`Fonte inválida: use uma de ${FONTES.join(", ")}`);
  }
  if (!TAMANHOS.includes(body.tamanho_fonte)) {
    return error(`Tamanho inválido: use um de ${TAMANHOS.join(", ")}`);
  }
  if (!TEMAS.includes(body.tema)) {
    return error(`Tema inválido: use um de ${TEMAS.join(", ")}`);
  }

  await run(
    context.env.DB,
    "UPDATE usuarios SET fonte = ?, tamanho_fonte = ?, tema = ? WHERE id = ?",
    body.fonte,
    body.tamanho_fonte,
    body.tema,
    usuario.id
  );
  return json({ fonte: body.fonte, tamanho_fonte: body.tamanho_fonte, tema: body.tema });
}
```

Este arquivo fica direto em `functions/api/` (mesmo nível de
`login.js`/`trocar-senha.js`), então `../_lib/...` — igual aos outros
arquivos desse nível.

- [ ] **Step 2: Update `functions/api/login.js`**

```js
import { first } from "../_lib/db.js";
import { json, error } from "../_lib/http.js";
import { hashSenha } from "../_lib/auth.js";
import { gerarToken } from "../_lib/sessao.js";
import { obterPermissoesDoUsuario } from "../_lib/permissoes.js";

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.login || !body.senha) {
    return error("Login e senha são obrigatórios");
  }
  const loginNormalizado = String(body.login).toLowerCase();
  const senhaHash = await hashSenha(body.senha);
  const usuario = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, admin, deve_trocar_senha, fonte, tamanho_fonte, tema FROM usuarios WHERE login = ? AND senha_hash = ?",
    loginNormalizado,
    senhaHash
  );
  if (!usuario) {
    return error("Login ou senha inválidos", 401);
  }
  const token = await gerarToken(usuario.id, context.env.SESSAO_SEGREDO);
  const permissoes = await obterPermissoesDoUsuario(context.env.DB, usuario.id);
  return json({ ...usuario, token, permissoes });
}
```

Única mudança: `fonte, tamanho_fonte, tema` adicionados ao `SELECT`. O resto
do arquivo fica idêntico.

- [ ] **Step 3: Manually verify against the local dev server**

Start `wrangler pages dev .` yourself via Bash from the worktree directory
(don't rely on any browser-preview auto-start tool — it has repeatedly
started from the wrong checkout in this project's history).

```bash
TOKEN=$(curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"1234ana\"}" | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).token))")
curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"1234ana\"}"
```
Expected: response now includes `"fonte":"arial","tamanho_fonte":"m","tema":"claro"`.
```bash
curl -s -X PUT http://localhost:8788/api/preferencias -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"fonte\":\"verdana\",\"tamanho_fonte\":\"g\",\"tema\":\"alto-contraste\"}"
curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"1234ana\"}"
```
Expected: first call `200` with the new values echoed back; second call's
login response now shows the persisted `"fonte":"verdana","tamanho_fonte":"g","tema":"alto-contraste"`.
Confirm invalid values are rejected:
```bash
curl -s -X PUT http://localhost:8788/api/preferencias -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"fonte\":\"comicsans\",\"tamanho_fonte\":\"g\",\"tema\":\"claro\"}" -w "\nHTTP:%{http_code}\n"
```
Expected: `400`. Confirm no token is rejected:
```bash
curl -s -X PUT http://localhost:8788/api/preferencias -H "content-type: application/json" -d "{\"fonte\":\"arial\",\"tamanho_fonte\":\"m\",\"tema\":\"claro\"}" -w "\nHTTP:%{http_code}\n"
```
Expected: `401`. Reset `ana` back to defaults for other tasks' testing:
```bash
curl -s -X PUT http://localhost:8788/api/preferencias -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"fonte\":\"arial\",\"tamanho_fonte\":\"m\",\"tema\":\"claro\"}"
```

- [ ] **Step 4: Commit**

```bash
git add functions/api/preferencias.js functions/api/login.js
git commit -m "Add PUT /api/preferencias, include fonte/tamanho_fonte/tema in login"
```

---

## Task 3: `style.css` — variáveis de tema (claro/alto-contraste) e tipografia

**Files:**
- Modify: `style.css` (replace entirely)

**Interfaces:**
- Produces: variáveis CSS em `:root` (tema claro, padrão) e `:root[data-tema="alto-contraste"]` (override); `--fonte-corpo` redefinida por `:root[data-fonte="times|verdana|courier"]`; `html[data-tamanho="p|g|gg"]` redefine o `font-size` da raiz (tudo em `rem` no resto do CSS escala junto). Consumido por `componentes.css` (Task 4) e `layout.js` (Task 7), que usam essas mesmas variáveis — nenhum dos dois redefine cor própria.

Este arquivo é testável sozinho, sem depender de `layout.js` ainda existir:
os atributos `data-tema`/`data-fonte`/`data-tamanho` podem ser setados à
mão no `<html>` pelo console do navegador numa tela já existente (ex.
`chamados.html`) para confirmar visualmente que os badges de status e o
texto de erro (`.erro`, `.badge-*`, já usados hoje) reagem à mudança.

- [ ] **Step 1: Replace `style.css`**

```css
:root {
  --cor-fundo: #f7f7f5;
  --cor-fundo-elevado: #ffffff;
  --cor-texto: #1f2933;
  --cor-texto-secundario: #6b7280;
  --cor-borda: #d6d9dc;
  --cor-borda-largura: 1px;
  --cor-primaria: #2f6f4f;
  --cor-primaria-escura: #1d4a35;
  --cor-primaria-texto: #ffffff;
  --cor-vencido: #c0392b;
  --cor-alerta: #b8860b;
  --cor-ok: #2f6f4f;
  --cor-status-texto: #ffffff;
  --cor-sidebar-fundo: linear-gradient(180deg, #2f6f4f, #1d4a35);
  --cor-sidebar-texto: #ffffff;
  --cor-sidebar-item-ativo-fundo: rgba(255, 255, 255, 0.15);
  --cor-sidebar-item-ativo-texto: #ffffff;
  --fonte-corpo: Arial, Helvetica, sans-serif;
}

:root[data-tema="alto-contraste"] {
  --cor-fundo: #000000;
  --cor-fundo-elevado: #000000;
  --cor-texto: #ffffff;
  --cor-texto-secundario: #ffffff;
  --cor-borda: #ffffff;
  --cor-borda-largura: 2px;
  --cor-primaria: #ffcc00;
  --cor-primaria-escura: #ffcc00;
  --cor-primaria-texto: #000000;
  --cor-vencido: #ff4d4d;
  --cor-alerta: #ffcc00;
  --cor-ok: #3fdb7f;
  --cor-status-texto: #000000;
  --cor-sidebar-fundo: #000000;
  --cor-sidebar-texto: #ffffff;
  --cor-sidebar-item-ativo-fundo: #ffcc00;
  --cor-sidebar-item-ativo-texto: #000000;
}

:root[data-fonte="times"] { --fonte-corpo: "Times New Roman", Times, serif; }
:root[data-fonte="verdana"] { --fonte-corpo: Verdana, Geneva, sans-serif; }
:root[data-fonte="courier"] { --fonte-corpo: "Courier New", Courier, monospace; }

html { font-size: 16px; }
html[data-tamanho="p"] { font-size: 14px; }
html[data-tamanho="g"] { font-size: 18px; }
html[data-tamanho="gg"] { font-size: 20px; }

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: var(--fonte-corpo);
  background: var(--cor-fundo);
  color: var(--cor-texto);
}

.login-split {
  display: flex;
  min-height: 100vh;
  width: 100%;
}
.login-split__destaque {
  flex: 1 1 50%;
  background: linear-gradient(135deg, #2f6f4f, #1d4a35);
  color: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 2rem;
}
.login-split__logo {
  width: 4.5rem;
  height: 4.5rem;
  margin-bottom: 1.5rem;
  border-radius: 1rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}
.login-split__destaque h1 {
  font-size: 4rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 0;
  max-width: 20ch;
}
.login-split__form {
  flex: 1 1 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}
.login-split__form form {
  width: 100%;
  max-width: 380px;
  background: white;
  border: 1px solid #d6d9dc;
  border-radius: 0.75rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.07);
  padding: 2.5rem 2rem;
  gap: 1.1rem;
}
.login-split__form h2 {
  margin: 0 0 0.25rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: #1f2933;
}
.login-split__form label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #1f2933;
  gap: 0.35rem;
}
.login-split__form input {
  padding: 0.65rem 0.8rem;
  border: 1px solid #d6d9dc;
  border-radius: 0.4rem;
  font-size: 1rem;
  font-family: inherit;
}
.login-split__form input:focus {
  outline: none;
  border-color: #2f6f4f;
  box-shadow: 0 0 0 3px rgba(47, 111, 79, 0.15);
}
.login-split__form button {
  margin-top: 0.4rem;
  padding: 0.75rem;
  background: #2f6f4f;
  color: white;
  border: none;
  border-radius: 0.4rem;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}
.login-split__form button:hover { background: #24593f; }
@media (max-width: 720px) {
  .login-split { flex-direction: column; }
  .login-split__destaque { flex: 0 0 auto; padding: 2rem 1.5rem; }
  .login-split__destaque h1 { font-size: 2.25rem; }
  .login-split__form form { box-shadow: none; border: none; padding: 2rem 0.5rem; }
}

table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
th, td { text-align: left; padding: 0.5rem; border-bottom: var(--cor-borda-largura) solid var(--cor-borda); }
td { max-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  background: var(--cor-borda);
  color: var(--cor-fundo-elevado);
  font-size: 0.7rem;
  font-style: italic;
  margin-left: 0.3rem;
  cursor: help;
}

.badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 1rem;
  color: var(--cor-status-texto);
  border: var(--cor-borda-largura) solid transparent;
  font-size: 0.8rem;
}
.badge-vencido { background: var(--cor-vencido); }
.badge-alerta { background: var(--cor-alerta); }
.badge-ok { background: var(--cor-ok); }
:root[data-tema="alto-contraste"] .badge { border-color: var(--cor-borda); font-weight: 700; }

.erro { color: var(--cor-vencido); }

form.formulario { display: flex; flex-direction: column; gap: 0.5rem; max-width: 480px; }
form.formulario label { display: flex; flex-direction: column; gap: 0.2rem; }
form.formulario[hidden] { display: none; }

.arvore ul { list-style: none; padding-left: 1.25rem; }
.arvore > ul { padding-left: 0; }
```

Removido desta versão (fica para as Tasks 4/7): as regras `.nav`,
`.nav-usuario` e `main { padding; max-width; margin }` — são o layout
antigo, substituído pela sidebar. Elas ficam sem uso a partir daqui, mas
como nenhuma tela foi migrada ainda (Tasks 9-14), remover agora quebraria
visualmente todas as 7 telas até lá — **por isso ficam mantidas por mais
uma tarefa**: veja a nota no início da Task 7, que é quando elas são
finalmente removidas (junto com a introdução da sidebar que as substitui).

Adicione de volta ao final deste arquivo, antes de prosseguir:

```css
.nav {
  display: flex;
  gap: 1rem;
  align-items: center;
  padding: 0.75rem 1.5rem;
  background: white;
  border-bottom: 1px solid var(--cor-borda);
}
.nav a { color: var(--cor-texto); text-decoration: none; }
.nav a:hover { text-decoration: underline; }
.nav-usuario { margin-left: auto; font-weight: bold; }

main { padding: 1.5rem; max-width: 960px; margin: 0 auto; }
```

- [ ] **Step 2: Manually verify against the local dev server**

Start `wrangler pages dev .` via Bash from the worktree directory. Log in
as any user, open `chamados.html`, open the browser devtools console:
```js
document.documentElement.setAttribute("data-tema", "alto-contraste");
```
Expected: background turns black, text white, status badges (if any
chamados are visible) show bold borders. Then:
```js
document.documentElement.setAttribute("data-fonte", "times");
document.documentElement.setAttribute("data-tamanho", "gg");
```
Expected: text visibly switches to a serif font and grows noticeably
larger, page layout doesn't break. Reset:
```js
document.documentElement.removeAttribute("data-tema");
document.documentElement.removeAttribute("data-fonte");
document.documentElement.removeAttribute("data-tamanho");
```
Confirm `npm test` still passes (this task touches no JS, but confirm no
regression):
```bash
npm test
```

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "style.css: add light/high-contrast theme variables and typography scale"
```

---

## Task 4: `componentes.css` — botões, modal, mensagens, cards

**Files:**
- Create: `componentes.css`
- Modify: `style.css` (remove the old one-line `.erro` rule — it moves here, upgraded)

**Interfaces:**
- Produces: classes `.btn`/`.btn-primario`/`.btn-secundario`/`.btn-perigo` (botões), `.modal-fundo`/`.modal`/`.modal__titulo`/`.modal__mensagem`/`.modal__acoes` (estrutura do modal, consumida por `modal.js` na Task 5), `.card` (container), `.erro`/`.mensagem-aviso`/`.mensagem-sucesso` (mensagens inline — `.erro` upgrada de "só texto vermelho" para o mesmo estilo de faixa lateral colorida das outras duas, sem mudar o nome da classe nem `mostrarErro`, então nenhum HTML/JS existente precisa mudar).

- [ ] **Step 1: Remove the old `.erro` rule from `style.css`**

Delete this line (it moves to `componentes.css`, upgraded):
```css
.erro { color: var(--cor-vencido); }
```

- [ ] **Step 2: Write `componentes.css`**

```css
.btn {
  display: inline-block;
  border: none;
  border-radius: 0.35rem;
  padding: 0.6rem 1.1rem;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-primario {
  background: var(--cor-primaria);
  color: var(--cor-primaria-texto);
}
.btn-primario:hover { filter: brightness(0.92); }
.btn-secundario {
  background: var(--cor-fundo-elevado);
  color: var(--cor-primaria);
  border: var(--cor-borda-largura) solid var(--cor-primaria);
}
.btn-secundario:hover { background: var(--cor-fundo); }
.btn-perigo {
  background: var(--cor-vencido);
  color: white;
}
:root[data-tema="alto-contraste"] .btn-perigo { color: #000; }
.btn-perigo:hover { filter: brightness(0.9); }
.btn:disabled {
  background: var(--cor-borda);
  color: var(--cor-texto-secundario);
  cursor: not-allowed;
  filter: none;
}

.card {
  background: var(--cor-fundo-elevado);
  border: var(--cor-borda-largura) solid var(--cor-borda);
  border-radius: 0.5rem;
  padding: 1rem;
}

.modal-fundo {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: var(--cor-fundo-elevado);
  color: var(--cor-texto);
  border: var(--cor-borda-largura) solid var(--cor-borda);
  border-radius: 0.6rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  padding: 1.5rem;
  max-width: 360px;
  width: calc(100% - 2rem);
}
.modal__titulo {
  font-weight: 800;
  font-size: 1.1rem;
  margin: 0 0 0.5rem;
}
.modal__mensagem {
  font-size: 0.9rem;
  color: var(--cor-texto-secundario);
  margin: 0 0 1.25rem;
}
.modal__acoes {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.erro, .mensagem-aviso, .mensagem-sucesso {
  border-left: 4px solid transparent;
  border-radius: 0.3rem;
  padding: 0.65rem 0.9rem;
  font-size: 0.88rem;
}
.erro { background: #fdecea; border-left-color: var(--cor-vencido); color: #7d2b1f; }
.mensagem-aviso { background: #fef6e0; border-left-color: var(--cor-alerta); color: #6b5100; }
.mensagem-sucesso { background: #eaf3ee; border-left-color: var(--cor-ok); color: #1d4a35; }
:root[data-tema="alto-contraste"] .erro,
:root[data-tema="alto-contraste"] .mensagem-aviso,
:root[data-tema="alto-contraste"] .mensagem-sucesso {
  background: var(--cor-fundo);
  color: var(--cor-texto);
  border-left-width: 6px;
  border: var(--cor-borda-largura) solid var(--cor-borda);
  border-left-width: 6px;
}
```

- [ ] **Step 3: Manually verify against the local dev server**

Start `wrangler pages dev .` via Bash from the worktree directory. Log in,
open any internal page, and in the devtools console:
```js
document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="componentes.css">');
document.body.insertAdjacentHTML("beforeend", `
  <div style="padding:1rem;display:flex;gap:0.5rem;">
    <button class="btn btn-primario">Primário</button>
    <button class="btn btn-secundario">Secundário</button>
    <button class="btn btn-perigo">Perigo</button>
    <button class="btn" disabled>Desabilitado</button>
  </div>
  <div class="card" style="margin:1rem;">Card de teste</div>
  <p class="erro">Mensagem de erro de teste</p>
  <p class="mensagem-aviso">Mensagem de aviso de teste</p>
  <p class="mensagem-sucesso">Mensagem de sucesso de teste</p>
`);
```
Expected: 4 botões com os estilos certos, um card com borda, 3 mensagens
com faixa lateral colorida (vermelho/dourado/verde). Toggle
`document.documentElement.setAttribute("data-tema", "alto-contraste")` and
confirm everything stays legible (fundo preto, bordas grossas). Reload the
page afterward to discard the injected test markup — nothing here is
meant to persist.

Confirm `npm test` still passes (no JS touched, but confirm no regression):
```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add componentes.css style.css
git commit -m "Add componentes.css: buttons, modal, messages, cards"
```

---

## Task 5: `modal.js` — modal genérico + `confirmarAcao`

**Files:**
- Create: `modal.js`

**Interfaces:**
- Consumes: classes `.modal-fundo`/`.modal`/`.modal__titulo`/`.modal__mensagem`/`.modal__acoes`/`.btn*` (Task 4, `componentes.css` já precisa estar linkada na página).
- Produces: `abrirModal(conteudoElemento) -> fecharFn` (monta um elemento arbitrário dentro do modal, devolve uma função para fechá-lo — fecha também ao clicar fora); `confirmarAcao(titulo, mensagem) -> Promise<boolean>` (substitui todo `window.confirm(...)` do sistema — resolve `true` se "Confirmar", `false` se "Cancelar" ou clique fora). Consumido por `chamado.js` e `grupos.js` (Tasks 10 e 13, onde os `confirm()` nativos existem hoje) e pela Task 8 (painel de preferências, que reaproveita `abrirModal` para seu próprio conteúdo).

- [ ] **Step 1: Write `modal.js`**

```js
export function abrirModal(conteudoElemento) {
  const fundo = document.createElement("div");
  fundo.className = "modal-fundo";
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.appendChild(conteudoElemento);
  fundo.appendChild(modal);
  document.body.appendChild(fundo);

  function fechar() {
    fundo.remove();
  }
  fundo.addEventListener("click", (ev) => {
    if (ev.target === fundo) fechar();
  });

  return fechar;
}

export function confirmarAcao(titulo, mensagem) {
  return new Promise((resolve) => {
    const conteudo = document.createElement("div");
    conteudo.innerHTML = `
      <div class="modal__titulo">${titulo}</div>
      <div class="modal__mensagem">${mensagem}</div>
      <div class="modal__acoes">
        <button type="button" class="btn btn-secundario" id="modal-cancelar">Cancelar</button>
        <button type="button" class="btn btn-perigo" id="modal-confirmar">Confirmar</button>
      </div>
    `;
    const fechar = abrirModal(conteudo);
    conteudo.querySelector("#modal-cancelar").addEventListener("click", () => {
      fechar();
      resolve(false);
    });
    conteudo.querySelector("#modal-confirmar").addEventListener("click", () => {
      fechar();
      resolve(true);
    });
  });
}
```

`titulo`/`mensagem` são sempre strings fixas escritas no próprio código
(nunca dado vindo do usuário/banco), então interpolar direto em `innerHTML`
é seguro — mesmo padrão já usado em outros lugares deste projeto (ex.
`grupos.js` interpola nome de grupo do mesmo jeito).

- [ ] **Step 2: Manually verify against the local dev server**

Start `wrangler pages dev .` via Bash from the worktree directory. Log in,
open any internal page, devtools console:
```js
document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="componentes.css">');
const { confirmarAcao } = await import("./modal.js");
const resultado = await confirmarAcao("Excluir este item?", "Essa ação não pode ser desfeita.");
console.log(resultado);
```
Expected: modal aparece centralizado com fundo escurecido; clicar
"Cancelar" resolve `false`; rodar de novo e clicar "Confirmar" resolve
`true`; rodar de novo e clicar fora do modal também resolve `false` e
fecha.

- [ ] **Step 3: Commit**

```bash
git add modal.js
git commit -m "Add modal.js: generic modal + confirmarAcao (replaces window.confirm)"
```

---

## Task 6: `ui.js` — adicionar `mostrarMensagem`

**Files:**
- Modify: `ui.js` (replace entirely)

**Interfaces:**
- Produces: `mostrarMensagem(elemento, texto, tipo)` (`tipo` é `"aviso"`
  padrão ou `"sucesso"`) — reaproveita o mesmo elemento que hoje só mostra
  erro (`mostrarErro`/`mostrarMensagem` nunca aparecem ao mesmo tempo,
  então não há conflito em usar o mesmo `<p id="mensagem-erro">` de cada
  tela para os três tipos). `info`, `mostrarErro`, `situacaoClasse`,
  `montarNav` continuam idênticas — `montarNav` só é removida na Task 14
  (última tela migrada para `aplicarLayout`), para nunca deixar nenhuma
  tela quebrada no meio do caminho.

- [ ] **Step 1: Replace `ui.js`**

```js
import { logout, permissaoDaTela } from "./auth.js";

export function info(texto) {
  return `<span class="info" title="${texto.replace(/"/g, "&quot;")}">i</span>`;
}

export function mostrarErro(elemento, erro) {
  elemento.textContent = erro && erro.message ? erro.message : String(erro);
  elemento.className = "erro";
  elemento.hidden = false;
}

export function mostrarMensagem(elemento, texto, tipo = "aviso") {
  elemento.textContent = texto;
  elemento.className = tipo === "sucesso" ? "mensagem-sucesso" : "mensagem-aviso";
  elemento.hidden = false;
}

export function situacaoClasse(situacao) {
  if (situacao === "vencido") return "badge badge-vencido";
  if (situacao === "alerta") return "badge badge-alerta";
  return "badge badge-ok";
}

export function montarNav(usuario) {
  const nav = document.createElement("nav");
  nav.className = "nav";

  const podeVerCadastros = ["empresas", "setores", "usuarios", "status"].some(
    (tela) => permissaoDaTela(tela).visualizar
  );
  const podeVerFluxos = permissaoDaTela("fluxos").visualizar;

  nav.innerHTML = `
    <a href="chamados.html">Meus chamados</a>
    ${podeVerCadastros ? `<a href="cadastros.html">Cadastros</a>` : ""}
    ${podeVerFluxos ? `<a href="fluxo.html">Fluxos</a>` : ""}
    ${usuario?.admin ? `<a href="grupos.html">Grupos de Permissão</a>` : ""}
    <span class="nav-usuario">${usuario ? usuario.nome : ""}</span>
    <a href="#" id="link-sair">Sair</a>
  `;
  nav.querySelector("#link-sair").addEventListener("click", (ev) => {
    ev.preventDefault();
    logout();
    window.location.href = "index.html";
  });
  return nav;
}
```

`montarNav` está byte-a-byte igual ao que já existe hoje — esta task só
adiciona `mostrarMensagem` e ajusta `mostrarErro` para restaurar
`class="erro"` (necessário porque, depois da Task 7, a mesma `<p>` pode ter
mostrado uma mensagem de aviso/sucesso antes e trocado de classe; um erro
seguinte precisa reverter isso). Nenhuma tela precisa mudar por causa desta
task.

- [ ] **Step 2: Commit**

```bash
git add ui.js
git commit -m "ui.js: add mostrarMensagem"
```

---

## Task 7: `layout.js` (sidebar + topbar) — primeira aplicação real em `chamados.html`

Esta é a tarefa central do plano: cria a sidebar/topbar de verdade e prova
que funciona migrando a primeira tela. As outras 6 telas (Tasks 9-14)
repetem exatamente o mesmo padrão de mudança, uma linha por vez.

**Files:**
- Modify: `style.css` (adiciona CSS da sidebar/topbar/responsivo — NÃO
  remove `.nav`/`main{max-width}` ainda, ver nota abaixo)
- Create: `layout.js`
- Modify: `chamados.html`
- Modify: `chamados.js`

**Interfaces:**
- Consumes: `logout`, `permissaoDaTela` (`auth.js`), variáveis CSS (Task 3).
  Importa dinamicamente `abrirPainelPreferencias` de `preferencias.js`
  (Task 8) só quando o usuário clica em "Preferências" — como é `import()`
  dinâmico, não quebra nada nesta task mesmo `preferencias.js` ainda não
  existir (só falharia se alguém clicasse "Preferências" antes da Task 8,
  o que a verificação desta task não faz).
- Produces: `aplicarLayout(usuario)` (monta a sidebar + topbar, MOVE o
  `<main>` já existente na página para dentro da nova estrutura, substitui
  `<div id="nav">`) e `aplicarPreferenciasVisuais(usuario)` (seta
  `data-tema`/`data-fonte`/`data-tamanho` no `<html>` a partir das
  preferências do usuário — chamada de dentro de `aplicarLayout` e também,
  na Task 8, depois de salvar novas preferências). Consumido por todas as
  Tasks 9-14 (uma linha de troca por tela).

**Por que `.nav`/`main{max-width}` continuam em `style.css` por enquanto:**
as outras 6 telas ainda usam esse layout antigo até suas próprias tasks
migrarem elas — remover agora quebraria visualmente todas elas até lá.
Essas regras só são removidas na Task 14 (última tela migrada), junto com
`montarNav` em `ui.js`.

- [ ] **Step 1: Add sidebar/topbar CSS to `style.css`**

Adicione ao final do arquivo:

```css
.app-shell { display: flex; min-height: 100vh; }

.sidebar {
  width: 200px;
  flex-shrink: 0;
  background: var(--cor-sidebar-fundo);
  color: var(--cor-sidebar-texto);
  display: flex;
  flex-direction: column;
  padding: 1rem 0.75rem;
  transition: width 0.15s ease;
}
.sidebar.recolhida { width: 52px; padding: 1rem 0.5rem; }
.sidebar.recolhida .sidebar__logo-texto,
.sidebar.recolhida .sidebar__link-texto { display: none; }

.sidebar__cabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}
.sidebar__logo { display: flex; align-items: center; gap: 0.5rem; font-weight: 800; font-size: 1.05rem; }
.sidebar__logo-img { width: 1.75rem; height: 1.75rem; border-radius: 0.35rem; }
.sidebar__colapsar {
  background: rgba(255, 255, 255, 0.15);
  border: var(--cor-borda-largura) solid transparent;
  color: inherit;
  border-radius: 0.3rem;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  cursor: pointer;
}
:root[data-tema="alto-contraste"] .sidebar__colapsar { border-color: var(--cor-sidebar-texto); }

.sidebar__links { display: flex; flex-direction: column; gap: 0.3rem; }
.sidebar__link {
  color: var(--cor-sidebar-texto);
  text-decoration: none;
  padding: 0.5rem 0.6rem;
  border-radius: 0.4rem;
  font-size: 0.9rem;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
}
.sidebar__link:hover { opacity: 1; background: rgba(255, 255, 255, 0.08); }
.sidebar__link--ativo {
  background: var(--cor-sidebar-item-ativo-fundo);
  color: var(--cor-sidebar-item-ativo-texto);
  opacity: 1;
  font-weight: 700;
}

.app-shell__conteudo { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.app-shell__conteudo main { padding: 1.5rem; max-width: none; margin: 0; }

.topbar {
  background: var(--cor-fundo-elevado);
  border-bottom: var(--cor-borda-largura) solid var(--cor-borda);
  padding: 0.7rem 1.3rem;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  position: relative;
}
.topbar__hamburguer { display: none; background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--cor-texto); margin-right: auto; }
.topbar__usuario { position: relative; font-weight: 700; font-size: 0.9rem; cursor: pointer; user-select: none; color: var(--cor-texto); }
.topbar__menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.4rem;
  background: var(--cor-fundo-elevado);
  border: var(--cor-borda-largura) solid var(--cor-borda);
  border-radius: 0.4rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  min-width: 160px;
  padding: 0.4rem;
  z-index: 10;
}
.topbar__menu a {
  display: block;
  padding: 0.5rem 0.6rem;
  color: var(--cor-texto);
  text-decoration: none;
  border-radius: 0.3rem;
  font-weight: 400;
  font-size: 0.85rem;
}
.topbar__menu a:hover { background: var(--cor-fundo); }

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 50;
    width: 220px;
    transform: translateX(-100%);
    transition: transform 0.15s ease;
  }
  .sidebar.aberta { transform: translateX(0); }
  .sidebar.recolhida { width: 220px; padding: 1rem 0.75rem; }
  .sidebar.recolhida .sidebar__logo-texto,
  .sidebar.recolhida .sidebar__link-texto { display: inline; }
  .sidebar__colapsar { display: none; }
  .topbar__hamburguer { display: block; }
}
```

- [ ] **Step 2: Write `layout.js`**

```js
import { logout, permissaoDaTela } from "./auth.js";

const CHAVE_COLAPSADA = "workflow_zagonel_sidebar_colapsada";

export function aplicarPreferenciasVisuais(usuario) {
  const html = document.documentElement;
  html.setAttribute("data-tema", usuario?.tema ?? "claro");
  html.setAttribute("data-fonte", usuario?.fonte ?? "arial");
  html.setAttribute("data-tamanho", usuario?.tamanho_fonte ?? "m");
}

function construirSidebar(usuario) {
  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  if (localStorage.getItem(CHAVE_COLAPSADA) === "1") {
    sidebar.classList.add("recolhida");
  }

  const podeVerCadastros = ["empresas", "setores", "usuarios", "status"].some(
    (tela) => permissaoDaTela(tela).visualizar
  );
  const podeVerFluxos = permissaoDaTela("fluxos").visualizar;
  const paginaAtual = window.location.pathname.split("/").pop();

  const links = [
    { href: "chamados.html", texto: "Meus chamados", visivel: true },
    { href: "cadastros.html", texto: "Cadastros", visivel: podeVerCadastros },
    { href: "fluxo.html", texto: "Fluxos", visivel: podeVerFluxos },
    { href: "grupos.html", texto: "Grupos de Permissão", visivel: !!usuario?.admin },
  ];

  sidebar.innerHTML = `
    <div class="sidebar__cabecalho">
      <span class="sidebar__logo">
        <img src="favicon.svg" alt="" class="sidebar__logo-img">
        <span class="sidebar__logo-texto">WorkFlow</span>
      </span>
      <button type="button" class="sidebar__colapsar" id="btn-colapsar-sidebar" aria-label="Recolher menu">«</button>
    </div>
    <nav class="sidebar__links">
      ${links
        .filter((l) => l.visivel)
        .map(
          (l) =>
            `<a href="${l.href}" class="sidebar__link${l.href === paginaAtual ? " sidebar__link--ativo" : ""}"><span class="sidebar__link-texto">${l.texto}</span></a>`
        )
        .join("")}
    </nav>
  `;

  const botaoColapsar = sidebar.querySelector("#btn-colapsar-sidebar");
  botaoColapsar.textContent = sidebar.classList.contains("recolhida") ? "»" : "«";
  botaoColapsar.addEventListener("click", () => {
    const recolhida = sidebar.classList.toggle("recolhida");
    localStorage.setItem(CHAVE_COLAPSADA, recolhida ? "1" : "0");
    botaoColapsar.textContent = recolhida ? "»" : "«";
  });

  return sidebar;
}

function construirTopbar(usuario, sidebar) {
  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button type="button" class="topbar__hamburguer" id="btn-abrir-sidebar" aria-label="Abrir menu">☰</button>
    <div class="topbar__usuario" id="topbar-usuario">
      <span>${usuario?.nome ?? ""}</span>
      <div class="topbar__menu" id="topbar-menu" hidden>
        <a href="#" id="link-preferencias">Preferências</a>
        <a href="#" id="link-sair">Sair</a>
      </div>
    </div>
  `;

  topbar.querySelector("#btn-abrir-sidebar").addEventListener("click", () => {
    sidebar.classList.toggle("aberta");
  });

  const usuarioContainer = topbar.querySelector("#topbar-usuario");
  const menu = topbar.querySelector("#topbar-menu");
  usuarioContainer.addEventListener("click", (ev) => {
    ev.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener("click", () => {
    menu.hidden = true;
  });

  topbar.querySelector("#link-sair").addEventListener("click", (ev) => {
    ev.preventDefault();
    logout();
    window.location.href = "index.html";
  });

  topbar.querySelector("#link-preferencias").addEventListener("click", async (ev) => {
    ev.preventDefault();
    menu.hidden = true;
    const { abrirPainelPreferencias } = await import("./preferencias.js");
    abrirPainelPreferencias();
  });

  return topbar;
}

export function aplicarLayout(usuario) {
  aplicarPreferenciasVisuais(usuario);

  const navPlaceholder = document.getElementById("nav");
  const main = document.querySelector("main");

  const shell = document.createElement("div");
  shell.className = "app-shell";

  const sidebar = construirSidebar(usuario);
  const topbar = construirTopbar(usuario, sidebar);

  const conteudo = document.createElement("div");
  conteudo.className = "app-shell__conteudo";
  conteudo.appendChild(topbar);
  conteudo.appendChild(main);

  shell.appendChild(sidebar);
  shell.appendChild(conteudo);

  navPlaceholder.replaceWith(shell);
}
```

`main` é pego via `document.querySelector("main")` e depois
`conteudo.appendChild(main)` — isso MOVE o elemento (com todo o conteúdo
que o script da própria tela já colocou nele) para dentro da nova
estrutura, sem precisar recriar nada. `navPlaceholder.replaceWith(shell)`
troca a antiga `<div id="nav">` pela sidebar+topbar+conteúdo inteiros.

- [ ] **Step 3: Update `chamados.html`**

Adicione o link do novo CSS, sem mudar mais nada (a estrutura
`<div id="nav"></div><main>...</main>` fica exatamente igual):

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel - Meus Chamados</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="componentes.css">
</head>
<body>
<div id="nav"></div>
<main>
  <h1>Meus chamados</h1>
  <p id="mensagem-erro" class="erro" hidden></p>
  <p id="link-novo-chamado"><a href="novo-chamado.html">+ Abrir novo chamado</a></p>
  <table>
    <thead><tr><th>Chamado</th><th>Status</th><th>Prazo</th><th>Situação</th></tr></thead>
    <tbody id="tabela-chamados"></tbody>
  </table>
</main>
<script type="module" src="chamados.js"></script>
</body>
</html>
```

- [ ] **Step 4: Update `chamados.js`**

```js
import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro } from "./ui.js";
import { api } from "./api.js";

const usuario = exigirLogin();
if (usuario) {
  aplicarLayout(usuario);
  if (!permissaoDaTela("chamados").inserir) {
    document.getElementById("link-novo-chamado").hidden = true;
  }
  carregarChamados().catch((e) => mostrarErro(document.getElementById("mensagem-erro"), e));
}

function situacaoBadge(prazo, statusNome) {
  if (statusNome === "finalizado") return "";
  const hoje = new Date().toISOString().slice(0, 10);
  const diff = Math.round((new Date(prazo) - new Date(hoje)) / 86400000);
  if (diff < 0) return `<span class="badge badge-vencido">Vencido</span>`;
  if (diff <= 2) return `<span class="badge badge-alerta">Alerta</span>`;
  return `<span class="badge badge-ok">Ok</span>`;
}

async function carregarChamados() {
  const chamados = await api("/chamados");
  document.getElementById("tabela-chamados").innerHTML = chamados
    .map(
      (c) => `
        <tr>
          <td><a href="chamado.html?id=${c.id}">#${c.id} - ${c.titulo}</a></td>
          <td>${c.status_nome}</td>
          <td>${c.prazo}</td>
          <td>${situacaoBadge(c.prazo, c.status_nome)}</td>
        </tr>`
    )
    .join("");
}
```

A única mudança real: `montarNav`/`document.getElementById("nav").replaceWith(...)`
vira `import { aplicarLayout } from "./layout.js"` + `aplicarLayout(usuario);`.
O resto do arquivo é idêntico.

- [ ] **Step 5: Manually verify against the local dev server**

Start `wrangler pages dev .` via Bash from the worktree directory. Log in
and open `chamados.html`:
1. Confirm the sidebar renders (verde escuro, links corretos pra sua
   permissão), a topbar aparece acima do conteúdo com seu nome, e a
   tabela de chamados carrega normalmente dentro do `<main>` — exatamente
   como antes, só que dentro da nova estrutura.
2. Clique no botão "«" — sidebar recolhe pra ícones; recarregue a página —
   confirme que continua recolhida (persistida em `localStorage`).
3. Clique no seu nome na topbar — menu com "Preferências"/"Sair" abre;
   clique fora — fecha. Clique "Sair" — desloga e volta pro login. Não
   clique em "Preferências" ainda (só existe de verdade na Task 8).
4. Redimensione a janela pra menos de 768px de largura (ou use o modo
   responsivo do devtools) — confirme que a sidebar some e um botão "☰"
   aparece na topbar; clique nele — sidebar desliza por cima do conteúdo;
   clique de novo — fecha.
5. Confirme que as outras 6 telas (`cadastros.html`, `fluxo.html`, etc.)
   continuam funcionando exatamente como antes (ainda com o menu horizontal
   antigo) — elas não devem ter mudado nada visualmente ainda.

```bash
npm test
```
Expected: 30/30 ainda passando (nenhuma lógica de backend mudou).

- [ ] **Step 6: Commit**

```bash
git add style.css layout.js chamados.html chamados.js
git commit -m "Add layout.js (sidebar+topbar); migrate chamados.html as first proof"
```

---

## Task 8: `preferencias.js` — painel de preferências

**Files:**
- Create: `preferencias.js`

**Interfaces:**
- Consumes: `getUsuarioLogado`/`setUsuarioLogado` (`auth.js`), `api` (`api.js`),
  `abrirModal` (`modal.js`, Task 5), `aplicarPreferenciasVisuais` (`layout.js`,
  Task 7), `mostrarErro` (`ui.js`).
- Produces: `abrirPainelPreferencias()` — a função que `layout.js` já importa
  dinamicamente (Task 7) quando o usuário clica "Preferências". Não recebe
  nem devolve nada; lê o usuário atual de `getUsuarioLogado()`, salva via
  `PUT /api/preferencias`, atualiza o cache local e reaplica o tema/fonte/
  tamanho imediatamente, sem precisar recarregar a página.

- [ ] **Step 1: Write `preferencias.js`**

```js
import { getUsuarioLogado, setUsuarioLogado } from "./auth.js";
import { api } from "./api.js";
import { abrirModal } from "./modal.js";
import { aplicarPreferenciasVisuais } from "./layout.js";
import { mostrarErro } from "./ui.js";

const FONTES = [
  { valor: "arial", texto: "Arial" },
  { valor: "times", texto: "Times New Roman" },
  { valor: "verdana", texto: "Verdana" },
  { valor: "courier", texto: "Courier New" },
];
const TAMANHOS = [
  { valor: "p", texto: "P" },
  { valor: "m", texto: "M" },
  { valor: "g", texto: "G" },
  { valor: "gg", texto: "GG" },
];
const TEMAS = [
  { valor: "claro", texto: "Claro" },
  { valor: "alto-contraste", texto: "Alto contraste" },
];

export function abrirPainelPreferencias() {
  const usuarioAtual = getUsuarioLogado();
  let fonteEscolhida = usuarioAtual?.fonte ?? "arial";
  let tamanhoEscolhido = usuarioAtual?.tamanho_fonte ?? "m";
  let temaEscolhido = usuarioAtual?.tema ?? "claro";

  const conteudo = document.createElement("div");
  let fechar;

  function render() {
    conteudo.innerHTML = `
      <div class="modal__titulo">Preferências</div>
      <div style="margin-bottom:1rem;">
        <div style="font-weight:600; font-size:0.85rem; margin-bottom:0.4rem;">Fonte</div>
        <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
          ${FONTES.map(
            (f) =>
              `<button type="button" class="btn ${f.valor === fonteEscolhida ? "btn-primario" : "btn-secundario"}" data-fonte="${f.valor}">${f.texto}</button>`
          ).join("")}
        </div>
      </div>
      <div style="margin-bottom:1rem;">
        <div style="font-weight:600; font-size:0.85rem; margin-bottom:0.4rem;">Tamanho da letra</div>
        <div style="display:flex; gap:0.4rem;">
          ${TAMANHOS.map(
            (t) =>
              `<button type="button" class="btn ${t.valor === tamanhoEscolhido ? "btn-primario" : "btn-secundario"}" data-tamanho="${t.valor}">${t.texto}</button>`
          ).join("")}
        </div>
      </div>
      <div style="margin-bottom:1.25rem;">
        <div style="font-weight:600; font-size:0.85rem; margin-bottom:0.4rem;">Tema</div>
        <div style="display:flex; gap:0.4rem;">
          ${TEMAS.map(
            (t) =>
              `<button type="button" class="btn ${t.valor === temaEscolhido ? "btn-primario" : "btn-secundario"}" data-tema-opcao="${t.valor}">${t.texto}</button>`
          ).join("")}
        </div>
      </div>
      <p id="preferencias-erro" class="erro" hidden></p>
      <div class="modal__acoes">
        <button type="button" class="btn btn-secundario" id="preferencias-cancelar">Cancelar</button>
        <button type="button" class="btn btn-primario" id="preferencias-salvar">Salvar preferências</button>
      </div>
    `;

    conteudo.querySelectorAll("[data-fonte]").forEach((botao) =>
      botao.addEventListener("click", () => {
        fonteEscolhida = botao.dataset.fonte;
        render();
      })
    );
    conteudo.querySelectorAll("[data-tamanho]").forEach((botao) =>
      botao.addEventListener("click", () => {
        tamanhoEscolhido = botao.dataset.tamanho;
        render();
      })
    );
    conteudo.querySelectorAll("[data-tema-opcao]").forEach((botao) =>
      botao.addEventListener("click", () => {
        temaEscolhido = botao.dataset.temaOpcao;
        render();
      })
    );

    conteudo.querySelector("#preferencias-cancelar").addEventListener("click", () => fechar());
    conteudo.querySelector("#preferencias-salvar").addEventListener("click", async () => {
      try {
        await api("/preferencias", {
          method: "PUT",
          body: { fonte: fonteEscolhida, tamanho_fonte: tamanhoEscolhido, tema: temaEscolhido },
        });
        const usuarioAtualizado = {
          ...getUsuarioLogado(),
          fonte: fonteEscolhida,
          tamanho_fonte: tamanhoEscolhido,
          tema: temaEscolhido,
        };
        setUsuarioLogado(usuarioAtualizado);
        aplicarPreferenciasVisuais(usuarioAtualizado);
        fechar();
      } catch (e) {
        mostrarErro(conteudo.querySelector("#preferencias-erro"), e);
      }
    });
  }

  render();
  fechar = abrirModal(conteudo);
}
```

Cada clique em uma opção (fonte/tamanho/tema) chama `render()` de novo,
que reconstrói o HTML já com o novo botão marcado como `btn-primario` —
troca visual imediata dentro do modal, sem precisar salvar ainda; só o
clique em "Salvar preferências" persiste (`PUT /api/preferencias`) e
aplica de verdade (`aplicarPreferenciasVisuais`).

- [ ] **Step 2: Manually verify against the local dev server**

Start `wrangler pages dev .` via Bash from the worktree directory. Log in,
open `chamados.html` (já migrada na Task 7), clique no seu nome na topbar,
clique "Preferências":
1. O painel abre dentro do modal com Fonte/Tamanho/Tema, cada seleção
   atual destacada (`btn-primario`).
2. Clique em "Times New Roman", depois "GG", depois "Alto contraste" —
   cada clique atualiza o destaque do botão correspondente, sem fechar o
   modal.
3. Clique "Salvar preferências" — modal fecha, a página inteira muda
   IMEDIATAMENTE pro tema alto-contraste com a fonte/tamanho escolhidos
   (sem precisar recarregar).
4. Recarregue a página — confirme que o tema/fonte/tamanho persistiram
   (aplicados de novo a partir do que foi salvo no login).
5. Abra "Preferências" de novo, clique "Cancelar" — modal fecha sem mudar
   nada.

Reset de volta pro padrão pra não atrapalhar a verificação de outras
tasks:
```bash
curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"1234ana\"}" | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).token))"
```
(pegue o token acima e troque `<token>` abaixo)
```bash
curl -s -X PUT http://localhost:8788/api/preferencias -H "content-type: application/json" -H "Authorization: Bearer <token>" -d "{\"fonte\":\"arial\",\"tamanho_fonte\":\"m\",\"tema\":\"claro\"}"
```

- [ ] **Step 3: Commit**

```bash
git add preferencias.js
git commit -m "Add preferencias.js: preferences panel (fonte/tamanho/tema)"
```

---

## Task 9: Migrar `novo-chamado.html`/`novo-chamado.js`

Mesmo padrão da Task 7, aplicado a mais uma tela: troca o link de CSS, o
`montarNav` → `aplicarLayout`, e aplica a classe `.btn btn-primario` no
único botão da tela.

**Files:**
- Modify: `novo-chamado.html`
- Modify: `novo-chamado.js`

**Interfaces:**
- Consumes: `aplicarLayout` (`layout.js`, Task 7).

- [ ] **Step 1: Update `novo-chamado.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel - Novo Chamado</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="componentes.css">
</head>
<body>
<div id="nav"></div>
<main>
  <h1>Abrir novo chamado</h1>
  <form class="formulario" id="form-novo-chamado">
    <label>Fluxo
      <select id="select-fluxo" name="fluxo_template_id" required></select>
    </label>
    <label>Etapa inicial
      <select id="select-etapa-inicial" name="etapa_inicial_id" required></select>
    </label>
    <label>Prazo (opcional - se vazio, usa o padrão do setor)
      <input type="date" name="prazo">
    </label>
    <button type="submit" class="btn btn-primario">Abrir chamado</button>
  </form>
  <p id="mensagem-erro" class="erro" hidden></p>
</main>
<script type="module" src="novo-chamado.js"></script>
</body>
</html>
```

- [ ] **Step 2: Update `novo-chamado.js`**

```js
import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { api } from "./api.js";

const usuario = exigirLogin();
if (usuario) {
  aplicarLayout(usuario);
  iniciar().catch((e) => {
    const mensagem = document.getElementById("mensagem-erro");
    mensagem.textContent = e.message;
    mensagem.hidden = false;
  });
}

async function iniciar() {
  const fluxos = await api("/fluxos");
  const selectFluxo = document.getElementById("select-fluxo");
  selectFluxo.innerHTML = fluxos.map((f) => `<option value="${f.id}">${f.nome}</option>`).join("");

  async function carregarEtapasIniciais() {
    const etapas = await api(`/fluxos/${selectFluxo.value}/etapas`);
    const iniciais = etapas.filter((e) => e.eh_inicial);
    document.getElementById("select-etapa-inicial").innerHTML = iniciais
      .map((e) => `<option value="${e.id}">${e.nome}</option>`)
      .join("");
  }

  selectFluxo.addEventListener("change", carregarEtapasIniciais);
  await carregarEtapasIniciais();

  document.getElementById("form-novo-chamado").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    try {
      const resultado = await api("/chamados", {
        method: "POST",
        body: {
          fluxo_template_id: Number(form.elements.fluxo_template_id.value),
          etapa_inicial_id: Number(form.elements.etapa_inicial_id.value),
          prazo: form.elements.prazo.value || null,
        },
      });
      window.location.href = `chamado.html?id=${resultado.chamado.id}`;
    } catch (e) {
      const mensagem = document.getElementById("mensagem-erro");
      mensagem.textContent = e.message;
      mensagem.hidden = false;
    }
  });
}
```

- [ ] **Step 3: Manually verify against the local dev server**

Start `wrangler pages dev .` via Bash. Log in, open `novo-chamado.html`:
confirm the sidebar/topbar render, the form still works end-to-end (pick a
fluxo, an etapa inicial, submit, land on the new chamado's detail page),
and the submit button now has the green primary style.

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add novo-chamado.html novo-chamado.js
git commit -m "Migrate novo-chamado.html to the new layout"
```

---

## Task 10: Migrar `chamado.html`/`chamado.js` (+ `confirmarAcao`)

Além da migração padrão de layout, esta tela tem o único `window.confirm(...)`
que ainda falta trocar por `confirmarAcao` (o outro fica em `grupos.js`,
Task 13).

**Files:**
- Modify: `chamado.html`
- Modify: `chamado.js`

**Interfaces:**
- Consumes: `aplicarLayout` (`layout.js`), `confirmarAcao` (`modal.js`, Task 5).

- [ ] **Step 1: Update `chamado.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel - Chamado</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="componentes.css">
</head>
<body>
<div id="nav"></div>
<main>
  <p><a href="chamados.html">← Meus chamados</a> | <a id="link-geral" href="#">Ver chamado geral</a></p>
  <p id="mensagem-erro" class="erro" hidden></p>
  <div id="detalhe"></div>
  <div id="acao"></div>
  <p><button type="button" id="btn-excluir-chamado" class="btn btn-perigo">Excluir chamado</button></p>
  <section>
    <h2>Apontamento de horas <span id="total-horas"></span></h2>
    <ul id="lista-horas"></ul>
    <form class="formulario" id="form-horas">
      <label>Data <input type="date" name="data" required></label>
      <label>Horas <input type="number" step="0.5" min="0.5" name="horas" required></label>
      <label>Observação <input type="text" name="observacao"></label>
      <button type="submit" class="btn btn-primario">Lançar horas</button>
    </form>
  </section>
  <section>
    <h2>Comentários</h2>
    <ul id="lista-comentarios"></ul>
    <form class="formulario" id="form-comentario">
      <label>Novo comentário <textarea name="texto" required></textarea></label>
      <button type="submit" class="btn btn-primario">Comentar</button>
    </form>
  </section>
</main>
<script type="module" src="chamado.js"></script>
</body>
</html>
```

- [ ] **Step 2: Update `chamado.js`**

```js
import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { info, mostrarErro } from "./ui.js";
import { confirmarAcao } from "./modal.js";
import { api } from "./api.js";

const usuario = exigirLogin();
const id = new URLSearchParams(window.location.search).get("id");
const permissaoChamados = usuario
  ? permissaoDaTela("chamados")
  : { visualizar: false, inserir: false, editar: false, excluir: false };

if (usuario && id) {
  aplicarLayout(usuario);
  iniciar();
}

function iniciar() {
  document.getElementById("link-geral").addEventListener("click", async (ev) => {
    ev.preventDefault();
    try {
      const chamado = await api(`/chamados/${id}`);
      window.location.href = `geral.html?id=${chamado.chamado_mae_id ?? chamado.id}`;
    } catch (e) {
      mostrarErro(document.getElementById("mensagem-erro"), e);
    }
  });

  const botaoExcluir = document.getElementById("btn-excluir-chamado");
  if (permissaoChamados.excluir) {
    botaoExcluir.addEventListener("click", async () => {
      const confirmado = await confirmarAcao(
        "Excluir este chamado?",
        "Toda a subárvore é excluída junto. Isso não pode ser desfeito."
      );
      if (!confirmado) return;
      await api(`/chamados/${id}`, { method: "DELETE" });
      window.location.href = "chamados.html";
    });
  } else {
    botaoExcluir.hidden = true;
  }

  const formHoras = document.getElementById("form-horas");
  if (permissaoChamados.inserir) {
    formHoras.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const form = ev.target;
      try {
        await api(`/chamados/${id}/horas`, {
          method: "POST",
          body: {
            data: form.elements.data.value,
            horas: Number(form.elements.horas.value),
            observacao: form.elements.observacao.value || null,
          },
        });
        form.reset();
        carregarHoras();
      } catch (e) {
        mostrarErro(document.getElementById("mensagem-erro"), e);
      }
    });
  } else {
    formHoras.hidden = true;
  }

  document.getElementById("form-comentario").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    try {
      await api(`/chamados/${id}/comentarios`, {
        method: "POST",
        body: { texto: form.elements.texto.value },
      });
      form.reset();
      carregarComentarios();
    } catch (e) {
      mostrarErro(document.getElementById("mensagem-erro"), e);
    }
  });

  carregarTudo().catch((e) => mostrarErro(document.getElementById("mensagem-erro"), e));
}

async function carregarTudo() {
  await Promise.all([carregarDetalhe(), carregarHoras(), carregarComentarios()]);
}

async function carregarDetalhe() {
  const chamado = await api(`/chamados/${id}`);
  const finalizado = chamado.status_nome === "finalizado";

  document.getElementById("detalhe").innerHTML = `
    <h1>#${chamado.id} - ${chamado.titulo}</h1>
    <p>Setor: ${chamado.setor_nome} ${info("Setor responsável por esta etapa/tarefa.")}</p>
    <p>Status: ${chamado.status_nome} - Prazo: ${chamado.prazo} (${chamado.situacao_prazo})</p>
    ${chamado.resultado ? `<p>Resultado: ${chamado.resultado}</p>` : ""}
    ${
      chamado.bloqueado
        ? `<p class="erro">Bloqueado: aguardando outra ação pré-requisito finalizar.</p>`
        : ""
    }
  `;

  const acaoContainer = document.getElementById("acao");
  if (finalizado || !permissaoChamados.editar) {
    acaoContainer.innerHTML = "";
    return;
  }

  if (chamado.etapa_id && chamado.etapa_tipo === "aprovacao") {
    await renderAprovacao(chamado);
  } else {
    await renderStatusManual(chamado);
  }
}

async function renderAprovacao(chamado) {
  const etapa = await api(`/etapas/${chamado.etapa_id}`);
  const acaoContainer = document.getElementById("acao");

  acaoContainer.innerHTML = `
    <h2>Avaliação ${info(
      "Aprova a solicitação e libera a próxima etapa do fluxo automaticamente, ou reprova e encerra toda a cadeia acima."
    )}</h2>
    ${
      etapa.acoes.length > 0
        ? `<fieldset id="fieldset-acoes">
             <legend>Ações a executar se aprovado</legend>
             ${etapa.acoes
               .map(
                 (a) =>
                   `<label><input type="checkbox" name="acao-${a.id}" value="${a.id}"> ${a.rotulo}</label>`
               )
               .join("")}
           </fieldset>`
        : ""
    }
    <button type="button" id="btn-aprovar" class="btn btn-primario">Aprovar</button>
    <label>Justificativa (obrigatória para reprovar)
      <textarea id="justificativa"></textarea>
    </label>
    <button type="button" id="btn-reprovar" class="btn btn-perigo">Reprovar</button>
    <p id="erro-decisao" class="erro" hidden></p>
  `;

  async function enviarDecisao(corpo) {
    try {
      await api(`/chamados/${chamado.id}/decisao`, {
        method: "POST",
        body: corpo,
      });
      carregarTudo();
    } catch (e) {
      const erro = document.getElementById("erro-decisao");
      erro.textContent = e.message;
      erro.hidden = false;
    }
  }

  document.getElementById("btn-aprovar").addEventListener("click", () => {
    const acoes = {};
    etapa.acoes.forEach((a) => {
      acoes[a.id] = acaoContainer.querySelector(`[name="acao-${a.id}"]`).checked;
    });
    enviarDecisao({ decisao: "aprovado", acoes });
  });

  document.getElementById("btn-reprovar").addEventListener("click", () => {
    const justificativa = document.getElementById("justificativa").value;
    if (!justificativa) {
      const erro = document.getElementById("erro-decisao");
      erro.textContent = "Justificativa é obrigatória para reprovar.";
      erro.hidden = false;
      return;
    }
    enviarDecisao({ decisao: "reprovado", justificativa });
  });
}

async function renderStatusManual(chamado) {
  const statusList = await api("/status");
  const acaoContainer = document.getElementById("acao");

  acaoContainer.innerHTML = `
    <h2>Status ${info(
      "Atualize o status conforme o andamento; marque 'finalizado' quando a tarefa estiver concluída."
    )}</h2>
    <select id="select-status">
      ${statusList
        .map(
          (s) =>
            `<option value="${s.id}" ${s.id === chamado.status_id ? "selected" : ""}>${s.nome}</option>`
        )
        .join("")}
    </select>
    <button type="button" id="btn-salvar-status" class="btn btn-primario">Salvar status</button>
    <p id="erro-status" class="erro" hidden></p>
  `;

  document.getElementById("btn-salvar-status").addEventListener("click", async () => {
    const statusId = Number(document.getElementById("select-status").value);
    const statusEscolhido = statusList.find((s) => s.id === statusId);
    if (chamado.bloqueado && statusEscolhido.nome === "finalizado") {
      const erro = document.getElementById("erro-status");
      erro.textContent = "Não é possível finalizar: chamado bloqueado aguardando pré-requisito.";
      erro.hidden = false;
      return;
    }
    try {
      await api(`/chamados/${chamado.id}`, { method: "PUT", body: { status_id: statusId } });
      carregarTudo();
    } catch (e) {
      mostrarErro(document.getElementById("erro-status"), e);
    }
  });
}

async function carregarHoras() {
  const resumo = await api(`/chamados/${id}/horas`);
  document.getElementById("total-horas").textContent = `(total: ${resumo.total_horas}h)`;
  document.getElementById("lista-horas").innerHTML = resumo.lancamentos
    .map(
      (l) =>
        `<li>${l.data} - ${l.usuario_nome} - ${l.horas}h ${l.observacao ? `(${l.observacao})` : ""}</li>`
    )
    .join("");
}

async function carregarComentarios() {
  const comentarios = await api(`/chamados/${id}/comentarios`);
  document.getElementById("lista-comentarios").innerHTML = comentarios
    .map(
      (c) =>
        `<li><strong>${c.usuario_nome ?? "Sistema"}</strong> (${c.data})${
          c.eh_justificativa ? " - justificativa" : ""
        }: ${c.texto}</li>`
    )
    .join("");
}
```

- [ ] **Step 3: Manually verify against the local dev server**

Start `wrangler pages dev .` via Bash. Log in as an admin, open an
existing chamado's detail page:
1. Confirm the sidebar/topbar render and everything (aprovar/reprovar or
   status, lançar horas, comentar) still works.
2. Click "Excluir chamado" — confirm the CUSTOM modal appears (not the
   native browser `confirm()`), with the chamado-specific message; click
   "Cancelar" — nothing happens; click again, then "Confirmar" — chamado
   is actually deleted and you're redirected to `chamados.html`.

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add chamado.html chamado.js
git commit -m "Migrate chamado.html to the new layout; replace window.confirm with confirmarAcao"
```

---

## Task 11: `crud-ui.js` — botões padrão + confirmação ao excluir; migrar `cadastros.html`/`cadastros.js`

`crud-ui.js` é usado por `cadastros.js` (Task 11) e `fluxo.js` (Task 12) —
atualizar os botões e adicionar confirmação de exclusão aqui de uma vez só
cobre as duas telas.

**Files:**
- Modify: `crud-ui.js` (replace entirely)
- Modify: `cadastros.html`
- Modify: `cadastros.js`

**Interfaces:**
- Consumes: `confirmarAcao` (`modal.js`, Task 5), `aplicarLayout` (`layout.js`, Task 7).
- Produces: `renderCrud` agora pede confirmação (modal customizado, não
  `window.confirm`) antes de excluir uma linha — comportamento novo, a
  versão anterior excluía direto sem perguntar.

- [ ] **Step 1: Replace `crud-ui.js`**

```js
import { api } from "./api.js";
import { info, mostrarErro } from "./ui.js";
import { permissaoDaTela } from "./auth.js";
import { confirmarAcao } from "./modal.js";

function valorExibicao(linha, campo, opcoesFK) {
  if (campo.tipo === "checkbox") {
    return linha[campo.nome] ? "Sim" : "Não";
  }
  if (campo.tipo === "multiselect") {
    const opcoes = opcoesFK[campo.nome] ?? [];
    return (linha[campo.nome] ?? [])
      .map((id) => opcoes.find((o) => o.id === id)?.nome)
      .filter(Boolean)
      .join(", ");
  }
  if (campo.opcoesEndpoint) {
    const opcoes = opcoesFK[campo.nome] ?? [];
    const alvo = opcoes.find((o) => o.id === linha[campo.nome]);
    return alvo ? alvo.nome : linha[campo.nome];
  }
  return linha[campo.nome] ?? "";
}

function campoInputHtml(campo, opcoesFK) {
  const rotulo = campo.dica ? `${campo.label} ${info(campo.dica)}` : campo.label;
  if (campo.tipo === "checkbox") {
    return `
      <label>
        <input type="checkbox" name="${campo.nome}">
        ${rotulo}
      </label>`;
  }
  if (campo.tipo === "multiselect") {
    const opcoes = opcoesFK[campo.nome] ?? [];
    return `
      <label>${rotulo}
        <select name="${campo.nome}" multiple>
          ${opcoes.map((o) => `<option value="${o.id}">${o.nome}</option>`).join("")}
        </select>
      </label>`;
  }
  if (campo.opcoesEndpoint) {
    const opcoes = campo.dependeDe ? [] : opcoesFK[campo.nome] ?? [];
    return `
      <label>${rotulo}
        <select name="${campo.nome}" ${campo.obrigatorio ? "required" : ""}>
          <option value="">Selecione…</option>
          ${opcoes.map((o) => `<option value="${o.id}">${o.nome}</option>`).join("")}
        </select>
      </label>`;
  }
  const tipo = campo.tipo ?? "text";
  return `
    <label>${rotulo}
      <input type="${tipo}" name="${campo.nome}" ${campo.obrigatorio ? "required" : ""}>
    </label>`;
}

export async function renderCrud(container, config) {
  if (!config.tela) throw new Error("renderCrud: config.tela é obrigatório");
  const permissao = permissaoDaTela(config.tela);
  if (!permissao.visualizar) {
    container.innerHTML = `<h2>${config.titulo}</h2><p>Você não tem permissão para visualizar esta tela.</p>`;
    return;
  }

  const opcoesFK = {};
  for (const campo of config.campos) {
    if (campo.opcoesEndpoint) opcoesFK[campo.nome] = await api(campo.opcoesEndpoint).catch(() => []);
  }

  const camposTabela = config.campos.filter((c) => !c.apenasFiltro);
  const podeEscrever = permissao.inserir || permissao.editar;
  let editandoId = null;

  container.innerHTML = `
    <h2>${config.titulo}</h2>
    <table>
      <thead><tr>${camposTabela.map((c) => `<th>${c.label}</th>`).join("")}<th></th></tr></thead>
      <tbody></tbody>
    </table>
    ${
      podeEscrever
        ? `<h3>Novo / Editar</h3>
           <form class="formulario">
             ${config.campos.map((c) => campoInputHtml(c, opcoesFK)).join("")}
             <button type="submit" class="btn btn-primario">Adicionar</button>
           </form>`
        : ""
    }
  `;

  const form = container.querySelector("form");
  const botaoSalvar = form?.querySelector("button[type=submit]");

  if (form) {
    for (const campo of config.campos) {
      if (!campo.dependeDe) continue;
      const selectPai = form.elements[campo.dependeDe];
      const selectFilho = form.elements[campo.nome];
      if (!selectPai || !selectFilho) continue;
      selectPai.addEventListener("change", () => {
        const opcoes = (opcoesFK[campo.nome] ?? []).filter(
          (o) => String(o[campo.filtrarPor]) === selectPai.value
        );
        selectFilho.innerHTML =
          `<option value="">Selecione…</option>` +
          opcoes.map((o) => `<option value="${o.id}">${o.nome}</option>`).join("");
      });
    }
  }

  function preencherFormulario(linha) {
    if (!form) return;
    editandoId = linha.id;

    for (const campo of config.campos) {
      if (!campo.apenasFiltro) continue;
      const dependente = config.campos.find((c) => c.dependeDe === campo.nome);
      if (!dependente) continue;
      const opcoesDependente = opcoesFK[dependente.nome] ?? [];
      const atual = opcoesDependente.find((o) => o.id === linha[dependente.nome]);
      form.elements[campo.nome].value = atual ? atual[dependente.filtrarPor] : "";
      form.elements[campo.nome].dispatchEvent(new Event("change"));
    }

    for (const campo of config.campos) {
      if (campo.apenasFiltro) continue;
      if (campo.tipo === "checkbox") {
        form.elements[campo.nome].checked = !!linha[campo.nome];
        continue;
      }
      if (campo.tipo === "multiselect") {
        const selecionados = linha[campo.nome] ?? [];
        for (const opcao of form.elements[campo.nome].options) {
          opcao.selected = selecionados.includes(Number(opcao.value));
        }
        continue;
      }
      form.elements[campo.nome].value = linha[campo.nome] ?? "";
    }

    botaoSalvar.textContent = "Salvar";
  }

  async function recarregar() {
    const dados = await api(config.endpoint);
    container.querySelector("tbody").innerHTML = dados
      .map(
        (linha) => `
          <tr data-id="${linha.id}">
            ${camposTabela.map((c) => `<td>${valorExibicao(linha, c, opcoesFK)}</td>`).join("")}
            <td>
              ${permissao.editar ? `<button type="button" class="btn btn-secundario btn-editar" data-id="${linha.id}">Editar</button>` : ""}
              ${permissao.excluir ? `<button type="button" class="btn btn-perigo btn-excluir" data-id="${linha.id}">Excluir</button>` : ""}
            </td>
          </tr>`
      )
      .join("");
    if (permissao.editar) {
      container.querySelectorAll(".btn-editar").forEach((btn) =>
        btn.addEventListener("click", () => {
          const linha = dados.find((d) => d.id === Number(btn.dataset.id));
          preencherFormulario(linha);
        })
      );
    }
    if (permissao.excluir) {
      container.querySelectorAll(".btn-excluir").forEach((btn) =>
        btn.addEventListener("click", async () => {
          const confirmado = await confirmarAcao("Excluir este item?", "Essa ação não pode ser desfeita.");
          if (!confirmado) return;
          try {
            await api(`${config.endpoint}/${btn.dataset.id}`, { method: "DELETE" });
            recarregar();
          } catch (e) {
            mostrarErro(document.getElementById("mensagem-erro"), e);
          }
        })
      );
    }
  }

  if (form) {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const corpo = {};
      for (const campo of config.campos) {
        if (campo.apenasFiltro) continue;
        if (campo.tipo === "checkbox") {
          corpo[campo.nome] = form.elements[campo.nome].checked ? 1 : 0;
          continue;
        }
        if (campo.tipo === "multiselect") {
          corpo[campo.nome] = Array.from(form.elements[campo.nome].selectedOptions).map((o) => Number(o.value));
          continue;
        }
        const valor = form.elements[campo.nome].value;
        corpo[campo.nome] = campo.tipo === "number" || campo.opcoesEndpoint ? Number(valor) : valor;
      }
      try {
        if (editandoId) {
          await api(`${config.endpoint}/${editandoId}`, { method: "PUT", body: corpo });
        } else {
          await api(config.endpoint, { method: "POST", body: corpo });
        }
        editandoId = null;
        form.reset();
        botaoSalvar.textContent = "Adicionar";
        recarregar();
      } catch (e) {
        mostrarErro(document.getElementById("mensagem-erro"), e);
      }
    });
  }

  await recarregar();
}
```

- [ ] **Step 2: Update `cadastros.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel - Cadastros</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="componentes.css">
</head>
<body>
<div id="nav"></div>
<main>
  <p id="mensagem-erro" class="erro" hidden></p>
  <div id="secao-empresas"></div>
  <div id="secao-setores"></div>
  <div id="secao-usuarios"></div>
  <div id="secao-status"></div>
</main>
<script type="module" src="cadastros.js"></script>
</body>
</html>
```

- [ ] **Step 3: Update `cadastros.js`**

Única mudança: a linha do `montarNav` (o resto do arquivo — todos os 4
`renderCrud`, incluindo os campos da tela de Usuários — fica idêntico):

```js
import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro } from "./ui.js";
import { renderCrud } from "./crud-ui.js";

const usuario = exigirLogin();
if (usuario) {
  aplicarLayout(usuario);
  const mensagemErro = document.getElementById("mensagem-erro");

  renderCrud(document.getElementById("secao-empresas"), {
    titulo: "Empresas",
    endpoint: "/empresas",
    tela: "empresas",
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  }).catch((e) => mostrarErro(mensagemErro, e));

  renderCrud(document.getElementById("secao-setores"), {
    titulo: "Setores",
    endpoint: "/setores",
    tela: "setores",
    campos: [
      { nome: "nome", label: "Nome", obrigatorio: true },
      { nome: "empresa_id", label: "Empresa", obrigatorio: true, opcoesEndpoint: "/empresas" },
      { nome: "centro_custo", label: "Centro de custo" },
      {
        nome: "prazo_padrao_dias",
        label: "Prazo padrão (dias)",
        tipo: "number",
        obrigatorio: true,
        dica: "Usado para sugerir automaticamente o prazo de qualquer chamado aberto para este setor (data de abertura + este número de dias).",
      },
    ],
  }).catch((e) => mostrarErro(mensagemErro, e));

  renderCrud(document.getElementById("secao-usuarios"), {
    titulo: "Usuários",
    endpoint: "/usuarios",
    tela: "usuarios",
    campos: [
      { nome: "nome", label: "Nome", obrigatorio: true },
      {
        nome: "empresa_id",
        label: "Empresa",
        obrigatorio: true,
        opcoesEndpoint: "/empresas",
        apenasFiltro: true,
        dica: "Filtra a lista de Setor abaixo. Não é salva diretamente — o setor escolhido já indica a empresa.",
      },
      {
        nome: "setor_id",
        label: "Setor",
        obrigatorio: true,
        opcoesEndpoint: "/setores",
        dependeDe: "empresa_id",
        filtrarPor: "empresa_id",
      },
      {
        nome: "login",
        label: "Login",
        obrigatorio: true,
        dica: "Usado para entrar no sistema. Só letras e números, sem espaços, pontos ou caracteres especiais.",
      },
      {
        nome: "senha",
        label: "Senha",
        tipo: "password",
        dica: "Obrigatória ao criar um novo usuário — o próprio usuário troca no primeiro login. Ao editar, deixe em branco para manter a senha atual; preencher define uma nova senha e exige troca no próximo login.",
      },
      {
        nome: "admin",
        label: "Administrador",
        tipo: "checkbox",
        dica: "Ignora todos os grupos de permissão e libera acesso total a todas as telas e ações.",
      },
      {
        nome: "grupos",
        label: "Grupos de permissão",
        tipo: "multiselect",
        opcoesEndpoint: "/grupos",
        dica: "Define o que este usuário pode visualizar, inserir, editar ou excluir em cada tela. Administradores não precisam de grupo.",
      },
    ],
  }).catch((e) => mostrarErro(mensagemErro, e));

  renderCrud(document.getElementById("secao-status"), {
    titulo: "Status",
    endpoint: "/status",
    tela: "status",
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  }).catch((e) => mostrarErro(mensagemErro, e));
}
```

- [ ] **Step 4: Manually verify against the local dev server**

Start `wrangler pages dev .` via Bash. Log in as an admin, open
`cadastros.html`:
1. Confirm the sidebar/topbar render and all 4 sections (Empresas,
   Setores, Usuários, Status) load with the new button styles (Adicionar =
   verde, Editar = contorno, Excluir = vermelho).
2. Click "Excluir" on any row — confirm the CUSTOM modal appears (not
   `window.confirm`); "Cancelar" does nothing; "Confirmar" actually
   deletes.
3. Open `fluxo.html` too — confirm it STILL uses the old horizontal `.nav`
   (not migrated yet, expected until Task 12), but its "Excluir" on the
   Fluxos list (which also goes through `crud-ui.js`) now shows the same
   custom confirmation modal — a preview that Task 12's migration is
   mostly just the layout, not the CRUD behavior (already updated here).

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add crud-ui.js cadastros.html cadastros.js
git commit -m "crud-ui.js: standard buttons + confirmarAcao on delete; migrate cadastros.html"
```

---

## Task 12: Migrar `fluxo.html`/`fluxo.js`

O editor de Etapas/Ações é HTML feito à mão (não passa por `crud-ui.js`),
então precisa das mesmas mudanças de botão/confirmação que a Task 11 já
aplicou lá — inclusive fechando uma lacuna que existe hoje: excluir uma
etapa ou ação não pede confirmação nenhuma, nem o `window.confirm` nativo.

**Files:**
- Modify: `fluxo.html`
- Modify: `fluxo.js`

**Interfaces:**
- Consumes: `aplicarLayout` (`layout.js`), `confirmarAcao` (`modal.js`).

- [ ] **Step 1: Update `fluxo.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel - Fluxos</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="componentes.css">
</head>
<body>
<div id="nav"></div>
<main>
  <p id="mensagem-erro" class="erro" hidden></p>
  <div id="secao-fluxos"></div>
  <div id="secao-editar-etapas">
    <h2>Editar etapas de um fluxo</h2>
    <label>Fluxo <select id="select-fluxo"></select></label>
    <div id="secao-etapas"></div>
  </div>
</main>
<script type="module" src="fluxo.js"></script>
</body>
</html>
```

- [ ] **Step 2: Update `fluxo.js`**

```js
import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { info, mostrarErro } from "./ui.js";
import { renderCrud } from "./crud-ui.js";
import { confirmarAcao } from "./modal.js";
import { api } from "./api.js";

const usuario = exigirLogin();
let permissaoFluxos = { visualizar: false, inserir: false, editar: false, excluir: false };

if (usuario) {
  aplicarLayout(usuario);
  const mensagemErro = document.getElementById("mensagem-erro");
  permissaoFluxos = permissaoDaTela("fluxos");

  await renderCrud(document.getElementById("secao-fluxos"), {
    titulo: "Fluxos",
    endpoint: "/fluxos",
    tela: "fluxos",
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  }).catch((e) => mostrarErro(mensagemErro, e));

  const secaoEditarEtapas = document.getElementById("secao-editar-etapas");
  if (permissaoFluxos.visualizar) {
    await iniciarSelecaoFluxo();
  } else {
    secaoEditarEtapas.hidden = true;
  }
}

async function iniciarSelecaoFluxo() {
  const fluxos = await api("/fluxos");
  const select = document.getElementById("select-fluxo");
  select.innerHTML =
    `<option value="">Selecione um fluxo…</option>` +
    fluxos.map((f) => `<option value="${f.id}">${f.nome}</option>`).join("");
  select.addEventListener("change", () => {
    if (select.value) renderEtapas(Number(select.value));
    else document.getElementById("secao-etapas").innerHTML = "";
  });
}

async function renderEtapas(fluxoId) {
  const [etapas, setores] = await Promise.all([
    api(`/fluxos/${fluxoId}/etapas`),
    api("/setores"),
  ]);
  const container = document.getElementById("secao-etapas");

  const nomeSetor = (id) => setores.find((s) => s.id === id)?.nome ?? id;
  const nomeEtapa = (id) => etapas.find((e) => e.id === id)?.nome ?? "-";

  container.innerHTML = `
    <h3>Etapas</h3>
    <table>
      <thead>
        <tr><th>Nome</th><th>Setor</th><th>Tipo</th><th>Inicial?</th><th>Próxima etapa</th><th>Vínculo</th><th></th></tr>
      </thead>
      <tbody>
        ${etapas
          .map(
            (e) => `
          <tr>
            <td>${e.nome}</td>
            <td>${nomeSetor(e.setor_id)}</td>
            <td>${e.tipo}</td>
            <td>${e.eh_inicial ? "Sim" : "Não"}</td>
            <td>${e.etapa_proxima_id ? nomeEtapa(e.etapa_proxima_id) : "-"}</td>
            <td>${e.etapa_proxima_vinculo ?? "-"}</td>
            <td>
              ${e.tipo === "aprovacao" ? `<button type="button" class="btn btn-secundario btn-acoes" data-id="${e.id}">Ações</button>` : ""}
              ${permissaoFluxos.excluir ? `<button type="button" class="btn btn-perigo btn-excluir-etapa" data-id="${e.id}">Excluir</button>` : ""}
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>

    ${
      permissaoFluxos.inserir
        ? `
    <h4>Nova etapa</h4>
    <form class="formulario" id="form-etapa">
      <label>Nome <input name="nome" required></label>
      <label>Setor
        <select name="setor_id" required>
          ${setores.map((s) => `<option value="${s.id}">${s.nome}</option>`).join("")}
        </select>
      </label>
      <label>Tipo
        <select name="tipo" required>
          <option value="aprovacao">Aprovação</option>
          <option value="tarefa">Tarefa</option>
        </select>
      </label>
      <label><input type="checkbox" name="eh_inicial"> É a etapa inicial? ${info(
        "Marque só na etapa que abre o chamado mãe. O sistema finaliza essa etapa e avança o fluxo automaticamente assim que o chamado é criado."
      )}</label>
      <label>Próxima etapa (opcional - deixe em branco se esta etapa usa Ações) ${info(
        "Quando esta etapa for aprovada/finalizada, cria automaticamente um chamado para a etapa escolhida aqui. Deixe em branco se esta etapa libera uma lista de Ações em vez de uma única próxima etapa."
      )}
        <select name="etapa_proxima_id">
          <option value="">Nenhuma / usar Ações</option>
          ${etapas.map((e) => `<option value="${e.id}">${e.nome}</option>`).join("")}
        </select>
      </label>
      <label>Vínculo da próxima etapa ${info(
        "Define a quem o novo chamado fica atrelado na árvore: 'pai' o vincula a esta própria etapa; 'mãe' o vincula direto à raiz, pulando esta etapa."
      )}
        <select name="etapa_proxima_vinculo">
          <option value="pai">Chamado pai (imediato)</option>
          <option value="mae">Chamado mãe (raiz)</option>
        </select>
      </label>
      <button type="submit" class="btn btn-primario">Adicionar etapa</button>
    </form>
    `
        : ""
    }

    <div id="secao-acoes"></div>
  `;

  container.querySelectorAll(".btn-acoes").forEach((btn) =>
    btn.addEventListener("click", () => renderAcoes(Number(btn.dataset.id)))
  );
  if (permissaoFluxos.excluir) {
    container.querySelectorAll(".btn-excluir-etapa").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const confirmado = await confirmarAcao("Excluir esta etapa?", "Essa ação não pode ser desfeita.");
        if (!confirmado) return;
        try {
          await api(`/etapas/${btn.dataset.id}`, { method: "DELETE" });
          renderEtapas(fluxoId);
        } catch (e) {
          mostrarErro(document.getElementById("mensagem-erro"), e);
        }
      })
    );
  }

  if (permissaoFluxos.inserir) {
    document.getElementById("form-etapa").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const form = ev.target;
      try {
        await api(`/fluxos/${fluxoId}/etapas`, {
          method: "POST",
          body: {
            nome: form.elements.nome.value,
            setor_id: Number(form.elements.setor_id.value),
            tipo: form.elements.tipo.value,
            eh_inicial: form.elements.eh_inicial.checked,
            etapa_proxima_id: form.elements.etapa_proxima_id.value
              ? Number(form.elements.etapa_proxima_id.value)
              : null,
            etapa_proxima_vinculo: form.elements.etapa_proxima_id.value
              ? form.elements.etapa_proxima_vinculo.value
              : null,
          },
        });
        renderEtapas(fluxoId);
      } catch (e) {
        mostrarErro(document.getElementById("mensagem-erro"), e);
      }
    });

    const selectTipo = document.getElementById("form-etapa").elements.tipo;
    const checkboxInicial = document.getElementById("form-etapa").elements.eh_inicial;
    const campoProximaEtapa = document.getElementById("form-etapa").elements.etapa_proxima_id.closest("label");
    const campoVinculo = document.getElementById("form-etapa").elements.etapa_proxima_vinculo.closest("label");

    function atualizarCamposProximaEtapa() {
      // Uma etapa tipo "tarefa" só avança o fluxo automaticamente quando é a
      // etapa inicial (caso especial tratado na criação do chamado). Uma
      // "tarefa" não-inicial com etapa_proxima_id configurada nunca avançaria
      // sozinha, então escondemos os campos para não permitir essa combinação.
      const oculto = selectTipo.value === "tarefa" && !checkboxInicial.checked;
      campoProximaEtapa.hidden = oculto;
      campoVinculo.hidden = oculto;
    }
    selectTipo.addEventListener("change", atualizarCamposProximaEtapa);
    checkboxInicial.addEventListener("change", atualizarCamposProximaEtapa);
    atualizarCamposProximaEtapa();
  }
}

async function renderAcoes(etapaId) {
  const etapa = await api(`/etapas/${etapaId}`);
  const setores = await api("/setores");
  const container = document.getElementById("secao-acoes");

  container.innerHTML = `
    <h4>Ações de "${etapa.nome}"</h4>
    <table>
      <thead><tr><th>Rótulo</th><th>Setor destino</th><th>Vínculo</th><th>Pré-requisito</th><th></th></tr></thead>
      <tbody>
        ${etapa.acoes
          .map(
            (a) => `
          <tr>
            <td>${a.rotulo}</td>
            <td>${setores.find((s) => s.id === a.setor_destino_id)?.nome ?? a.setor_destino_id}</td>
            <td>${a.vinculo}</td>
            <td>${
              a.prerequisito_acao_id
                ? etapa.acoes.find((x) => x.id === a.prerequisito_acao_id)?.rotulo ?? "-"
                : "-"
            }</td>
            <td>${permissaoFluxos.excluir ? `<button type="button" class="btn btn-perigo btn-excluir-acao" data-id="${a.id}">Excluir</button>` : ""}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
    ${
      permissaoFluxos.inserir
        ? `
    <h5>Nova ação</h5>
    <form class="formulario" id="form-acao">
      <label>Rótulo <input name="rotulo" required></label>
      <label>Setor destino
        <select name="setor_destino_id" required>
          ${setores.map((s) => `<option value="${s.id}">${s.nome}</option>`).join("")}
        </select>
      </label>
      <label>Vínculo ${info(
        "Define a quem a tarefa criada fica atrelada na árvore: 'mãe' a vincula direto à raiz; 'pai' a vincula a esta etapa de aprovação."
      )}
        <select name="vinculo" required>
          <option value="mae">Chamado mãe (raiz)</option>
          <option value="pai">Chamado pai (imediato)</option>
        </select>
      </label>
      <label>Pré-requisito (opcional) ${info(
        "Se escolhida, a tarefa desta ação nasce bloqueada até que o chamado da ação pré-requisito seja finalizado."
      )}
        <select name="prerequisito_acao_id">
          <option value="">Nenhum</option>
          ${etapa.acoes.map((a) => `<option value="${a.id}">${a.rotulo}</option>`).join("")}
        </select>
      </label>
      <button type="submit" class="btn btn-primario">Adicionar ação</button>
    </form>
    `
        : ""
    }
  `;

  if (permissaoFluxos.excluir) {
    container.querySelectorAll(".btn-excluir-acao").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const confirmado = await confirmarAcao("Excluir esta ação?", "Essa ação não pode ser desfeita.");
        if (!confirmado) return;
        try {
          await api(`/acoes/${btn.dataset.id}`, { method: "DELETE" });
          renderAcoes(etapaId);
        } catch (e) {
          mostrarErro(document.getElementById("mensagem-erro"), e);
        }
      })
    );
  }

  if (permissaoFluxos.inserir) {
    document.getElementById("form-acao").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const form = ev.target;
      try {
        await api(`/etapas/${etapaId}/acoes`, {
          method: "POST",
          body: {
            rotulo: form.elements.rotulo.value,
            setor_destino_id: Number(form.elements.setor_destino_id.value),
            vinculo: form.elements.vinculo.value,
            prerequisito_acao_id: form.elements.prerequisito_acao_id.value
              ? Number(form.elements.prerequisito_acao_id.value)
              : null,
          },
        });
        renderAcoes(etapaId);
      } catch (e) {
        mostrarErro(document.getElementById("mensagem-erro"), e);
      }
    });
  }
}
```

- [ ] **Step 3: Manually verify against the local dev server**

Start `wrangler pages dev .` via Bash. Log in as an admin, open
`fluxo.html`:
1. Confirm the sidebar/topbar render, the Fluxos list works (already
   using the Task 11 button/confirm updates via `crud-ui.js`).
2. Pick a fluxo, confirm the Etapas table loads with the new button
   styles; click "Excluir" on an etapa — confirm the custom modal appears
   now (didn't before this task); cancel, then confirm for real.
3. Add a new etapa — confirm it still works, button is green/primary now.
4. Click "Ações" on an etapa — confirm the Ações table loads; excluir uma
   ação também pede confirmação agora; adicionar uma ação nova continua
   funcionando.

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add fluxo.html fluxo.js
git commit -m "Migrate fluxo.html to the new layout; add delete confirmation to etapas/acoes"
```

---

## Task 13: Migrar `grupos.html`/`grupos.js` (+ `confirmarAcao`)

O `window.confirm(...)` que faltava trocar (o outro já foi na Task 10).

**Files:**
- Modify: `grupos.html`
- Modify: `grupos.js`

**Interfaces:**
- Consumes: `aplicarLayout` (`layout.js`), `confirmarAcao` (`modal.js`).

- [ ] **Step 1: Update `grupos.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel - Grupos de Permissão</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="componentes.css">
</head>
<body>
<div id="nav"></div>
<main>
  <p id="mensagem-erro" class="erro" hidden></p>
  <div id="conteudo"></div>
</main>
<script type="module" src="grupos.js"></script>
</body>
</html>
```

- [ ] **Step 2: Update `grupos.js`**

```js
import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro, info } from "./ui.js";
import { confirmarAcao } from "./modal.js";
import { api } from "./api.js";

const TELAS = [
  { chave: "empresas", label: "Empresas" },
  { chave: "setores", label: "Setores" },
  { chave: "usuarios", label: "Usuários" },
  { chave: "status", label: "Status" },
  { chave: "fluxos", label: "Fluxos" },
  { chave: "chamados", label: "Chamados" },
];
const ACOES = ["visualizar", "inserir", "editar", "excluir"];

const usuario = exigirLogin();
if (usuario) {
  aplicarLayout(usuario);
  const mensagemErro = document.getElementById("mensagem-erro");
  const container = document.getElementById("conteudo");

  if (!usuario.admin) {
    container.innerHTML = "<p>Você não tem permissão para acessar esta tela.</p>";
  } else {
    iniciar(container, mensagemErro).catch((e) => mostrarErro(mensagemErro, e));
  }
}

async function iniciar(container, mensagemErro) {
  container.innerHTML = `
    <h2>Grupos de Permissão</h2>
    <ul id="lista-grupos"></ul>
    <form class="formulario" id="form-novo-grupo">
      <label>Novo grupo
        <input type="text" name="nome" required>
      </label>
      <button type="submit" class="btn btn-primario">Criar</button>
    </form>
    <div id="detalhe-grupo"></div>
  `;

  const lista = container.querySelector("#lista-grupos");
  const formNovo = container.querySelector("#form-novo-grupo");
  const detalhe = container.querySelector("#detalhe-grupo");
  let grupoSelecionadoId = null;

  async function recarregarLista() {
    const grupos = await api("/grupos");
    lista.innerHTML = grupos
      .map(
        (g) => `
        <li data-id="${g.id}">
          <button type="button" class="btn btn-secundario btn-selecionar" data-id="${g.id}">${g.nome}</button>
          <button type="button" class="btn btn-perigo btn-excluir" data-id="${g.id}">Excluir</button>
        </li>`
      )
      .join("");

    lista.querySelectorAll(".btn-selecionar").forEach((btn) =>
      btn.addEventListener("click", async () => {
        try {
          await abrirGrupo(Number(btn.dataset.id));
        } catch (e) {
          mostrarErro(mensagemErro, e);
        }
      })
    );
    lista.querySelectorAll(".btn-excluir").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const confirmado = await confirmarAcao(
          "Excluir este grupo?",
          "Usuários vinculados perdem as permissões dele."
        );
        if (!confirmado) return;
        try {
          await api(`/grupos/${btn.dataset.id}`, { method: "DELETE" });
          if (grupoSelecionadoId === Number(btn.dataset.id)) {
            grupoSelecionadoId = null;
            detalhe.innerHTML = "";
          }
          await recarregarLista();
        } catch (e) {
          mostrarErro(mensagemErro, e);
        }
      })
    );
  }

  async function abrirGrupo(id) {
    grupoSelecionadoId = id;
    const grupo = await api(`/grupos/${id}`);

    detalhe.innerHTML = `
      <h3>${grupo.nome}</h3>
      <form class="formulario" id="form-renomear">
        <label>Nome
          <input type="text" name="nome" value="${grupo.nome}" required>
        </label>
        <button type="submit" class="btn btn-primario">Salvar nome</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Tela</th>
            ${ACOES.map((a) => `<th>${a}</th>`).join("")}
            <th>Ver todos os setores ${info("Só relevante para Chamados, e só afeta a listagem 'Meus chamados': sem esta permissão, o usuário só vê ali os chamados do próprio setor. Abrir um chamado específico por link (inclusive de outro setor) e ver a árvore/comentários do chamado mãe sempre funciona para qualquer usuário autenticado, com ou sem esta permissão — isso é proposital.")}</th>
          </tr>
        </thead>
        <tbody>
          ${TELAS.map(
            (t) => `
            <tr data-tela="${t.chave}">
              <td>${t.label}</td>
              ${ACOES.map(
                (a) =>
                  `<td><input type="checkbox" data-acao="${a}" ${grupo.permissoes[t.chave][a] ? "checked" : ""}></td>`
              ).join("")}
              <td>
                ${
                  t.chave === "chamados"
                    ? `<input type="checkbox" data-acao="ver_todos_setores" ${grupo.permissoes.chamados.ver_todos_setores ? "checked" : ""}>`
                    : ""
                }
              </td>
            </tr>`
          ).join("")}
        </tbody>
      </table>
      <button type="button" id="btn-salvar-permissoes" class="btn btn-primario">Salvar permissões</button>
    `;

    detalhe.querySelector("#form-renomear").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nome = ev.target.elements.nome.value;
      try {
        await api(`/grupos/${id}`, { method: "PUT", body: { nome } });
        await recarregarLista();
      } catch (e) {
        mostrarErro(mensagemErro, e);
      }
    });

    detalhe.querySelector("#btn-salvar-permissoes").addEventListener("click", async () => {
      const matriz = {};
      for (const tela of TELAS) {
        const linha = detalhe.querySelector(`tr[data-tela="${tela.chave}"]`);
        matriz[tela.chave] = {};
        for (const acao of ACOES) {
          matriz[tela.chave][acao] = linha.querySelector(`input[data-acao="${acao}"]`).checked;
        }
        if (tela.chave === "chamados") {
          matriz.chamados.ver_todos_setores = linha.querySelector('input[data-acao="ver_todos_setores"]').checked;
        }
      }
      try {
        await api(`/grupos/${id}/permissoes`, { method: "PUT", body: matriz });
      } catch (e) {
        mostrarErro(mensagemErro, e);
      }
    });
  }

  formNovo.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const nome = formNovo.elements.nome.value;
    try {
      await api("/grupos", { method: "POST", body: { nome } });
      formNovo.reset();
      await recarregarLista();
    } catch (e) {
      mostrarErro(mensagemErro, e);
    }
  });

  await recarregarLista();
}
```

- [ ] **Step 3: Manually verify against the local dev server**

Start `wrangler pages dev .` via Bash. Log in as an admin, open
`grupos.html`:
1. Confirm the sidebar/topbar render, criar/renomear/salvar permissões
   ainda funcionam, com os novos estilos de botão.
2. Click "Excluir" num grupo — confirm the CUSTOM modal appears (not
   `window.confirm`); cancelar não faz nada; confirmar exclui de verdade.

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add grupos.html grupos.js
git commit -m "Migrate grupos.html to the new layout; replace window.confirm with confirmarAcao"
```

---

## Task 14: Migrar `geral.html`/`geral.js` (última tela) + limpeza final

Última das 7 telas — depois desta, `montarNav` (`ui.js`) e as regras
antigas `.nav`/`.nav-usuario`/`main{max-width}` (`style.css`) não têm mais
nenhum call site, então esta task também remove as duas.

**Files:**
- Modify: `geral.html`
- Modify: `geral.js`
- Modify: `ui.js` (remove `montarNav`)
- Modify: `style.css` (remove `.nav`/`.nav-usuario`/`main{max-width}`)

**Interfaces:**
- Consumes: `aplicarLayout` (`layout.js`).
- Removes: `montarNav` (`ui.js`) — confirmar antes de remover que nenhum
  arquivo ainda importa ela (ver Step 4).

- [ ] **Step 1: Update `geral.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel - Chamado Geral</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="componentes.css">
</head>
<body>
<div id="nav"></div>
<main>
  <p><a href="chamados.html">← Meus chamados</a></p>
  <h1>Chamado geral</h1>
  <div id="arvore" class="arvore"></div>
</main>
<script type="module" src="geral.js"></script>
</body>
</html>
```

- [ ] **Step 2: Update `geral.js`**

```js
import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { api } from "./api.js";

const usuario = exigirLogin();
const id = new URLSearchParams(window.location.search).get("id");

if (usuario && id) {
  aplicarLayout(usuario);
  carregarArvore();
}

function construirArvore(nos) {
  const porId = new Map(nos.map((n) => [n.id, { ...n, filhos: [] }]));
  const raizes = [];
  for (const no of porId.values()) {
    if (no.chamado_pai_id && porId.has(no.chamado_pai_id)) {
      porId.get(no.chamado_pai_id).filhos.push(no);
    } else {
      raizes.push(no);
    }
  }
  return raizes;
}

function nodeHtml(no) {
  return `
    <li>
      <details>
        <summary>
          #${no.id} - ${no.titulo} (${no.setor_nome}) - ${no.status_nome}
          ${no.resultado ? ` - ${no.resultado}` : ""}
          - prazo ${no.prazo}${no.data_finalizacao ? `, finalizado em ${no.data_finalizacao}` : ""}
        </summary>
        <div class="comentarios-no" data-id="${no.id}">Carregando comentários…</div>
        ${no.filhos.length > 0 ? `<ul>${no.filhos.map(nodeHtml).join("")}</ul>` : ""}
      </details>
    </li>
  `;
}

async function carregarArvore() {
  const nos = await api(`/chamados/${id}/arvore`);
  const raizes = construirArvore(nos);
  const container = document.getElementById("arvore");
  container.innerHTML = `<ul>${raizes.map(nodeHtml).join("")}</ul>`;

  container.querySelectorAll("details").forEach((detalhe) => {
    detalhe.addEventListener(
      "toggle",
      async () => {
        if (!detalhe.open) return;
        const divComentarios = detalhe.querySelector(":scope > .comentarios-no");
        const comentarios = await api(`/chamados/${divComentarios.dataset.id}/comentarios`);
        divComentarios.innerHTML =
          comentarios.length === 0
            ? "<em>Sem comentários.</em>"
            : `<ul>${comentarios
                .map(
                  (c) =>
                    `<li><strong>${c.usuario_nome ?? "Sistema"}</strong> (${c.data}): ${c.texto}</li>`
                )
                .join("")}</ul>`;
      },
      { once: true }
    );
  });
}
```

- [ ] **Step 3: Remove `montarNav` from `ui.js`**

```js
import { logout, permissaoDaTela } from "./auth.js";

export function info(texto) {
  return `<span class="info" title="${texto.replace(/"/g, "&quot;")}">i</span>`;
}

export function mostrarErro(elemento, erro) {
  elemento.textContent = erro && erro.message ? erro.message : String(erro);
  elemento.className = "erro";
  elemento.hidden = false;
}

export function mostrarMensagem(elemento, texto, tipo = "aviso") {
  elemento.textContent = texto;
  elemento.className = tipo === "sucesso" ? "mensagem-sucesso" : "mensagem-aviso";
  elemento.hidden = false;
}

export function situacaoClasse(situacao) {
  if (situacao === "vencido") return "badge badge-vencido";
  if (situacao === "alerta") return "badge badge-alerta";
  return "badge badge-ok";
}
```

`logout` e `permissaoDaTela` ficam sem uso neste arquivo depois que
`montarNav` sai — remova o import inteiro (como já está no bloco acima,
sem a linha `import { logout, permissaoDaTela } from "./auth.js";`).

Antes de aplicar esta mudança, confirme que nenhum arquivo ainda importa
`montarNav`:
```bash
grep -rn "montarNav" --include="*.js" .
```
Expected: zero resultados (as 7 telas foram todas migradas nas Tasks
7, 9-14).

- [ ] **Step 4: Remove old nav/main rules from `style.css`**

Delete estas linhas (adicionadas de volta deliberadamente na Task 3, sem
uso a partir de agora):
```css
.nav {
  display: flex;
  gap: 1rem;
  align-items: center;
  padding: 0.75rem 1.5rem;
  background: white;
  border-bottom: 1px solid var(--cor-borda);
}
.nav a { color: var(--cor-texto); text-decoration: none; }
.nav a:hover { text-decoration: underline; }
.nav-usuario { margin-left: auto; font-weight: bold; }

main { padding: 1.5rem; max-width: 960px; margin: 0 auto; }
```

- [ ] **Step 5: Manually verify against the local dev server**

Start `wrangler pages dev .` via Bash. Log in, open `geral.html?id=<id de
um chamado existente>` (pegue um id real de `chamados.html`):
1. Confirm the sidebar/topbar render, a árvore carrega, expandir um nó
   (`<details>`) carrega os comentários dele.
2. Abra TODAS as outras 6 telas (chamados, novo-chamado, chamado,
   cadastros, fluxo, grupos) — confirme que todas continuam funcionando
   normalmente com a sidebar (nada quebrou com a remoção do `.nav`/`main`
   antigo, já que nenhuma delas usa mais essas classes).
3. Redimensione pra mobile numa das telas — confirme que o menu "☰" ainda
   funciona.

```bash
npm test
```
Expected: 30/30 ainda passando.

- [ ] **Step 6: Commit**

```bash
git add geral.html geral.js ui.js style.css
git commit -m "Migrate geral.html (last screen); remove old nav/montarNav"
```

---

## Task 15: Estados vazios padronizados + tooltip em texto truncado

Fecha a seção G da spec (texto/conteúdo). O truncamento em si (reticências
em células de tabela longas) já é automático desde a Task 3
(`td { text-overflow: ellipsis; ... }`, `style.css`) — falta só o
`title="texto completo"` nos casos onde o texto truncado é mais informativo
que só o rótulo curto, e as mensagens de "nenhum registro" (hoje, tabelas
vazias só mostram um `<tbody>` em branco, sem explicação).

**Files:**
- Modify: `crud-ui.js` (`recarregar`) — cobre `cadastros.js` E a lista de
  Fluxos em `fluxo.js` de uma vez, por usarem o mesmo componente.
- Modify: `chamados.js` (`carregarChamados`)
- Modify: `grupos.js` (`recarregarLista`)
- Modify: `fluxo.js` (`renderEtapas`, `renderAcoes`)

- [ ] **Step 1: `crud-ui.js` — estado vazio na tabela genérica**

Em `recarregar()`, troque:
```js
    container.querySelector("tbody").innerHTML = dados
      .map(
        (linha) => `
          <tr data-id="${linha.id}">
            ${camposTabela.map((c) => `<td>${valorExibicao(linha, c, opcoesFK)}</td>`).join("")}
            <td>
              ${permissao.editar ? `<button type="button" class="btn btn-secundario btn-editar" data-id="${linha.id}">Editar</button>` : ""}
              ${permissao.excluir ? `<button type="button" class="btn btn-perigo btn-excluir" data-id="${linha.id}">Excluir</button>` : ""}
            </td>
          </tr>`
      )
      .join("");
```
por:
```js
    container.querySelector("tbody").innerHTML =
      dados.length === 0
        ? `<tr><td colspan="${camposTabela.length + 1}">Nenhum registro encontrado.</td></tr>`
        : dados
            .map(
              (linha) => `
                <tr data-id="${linha.id}">
                  ${camposTabela.map((c) => `<td>${valorExibicao(linha, c, opcoesFK)}</td>`).join("")}
                  <td>
                    ${permissao.editar ? `<button type="button" class="btn btn-secundario btn-editar" data-id="${linha.id}">Editar</button>` : ""}
                    ${permissao.excluir ? `<button type="button" class="btn btn-perigo btn-excluir" data-id="${linha.id}">Excluir</button>` : ""}
                  </td>
                </tr>`
            )
            .join("");
```

- [ ] **Step 2: `chamados.js` — estado vazio + tooltip no título do chamado**

Troque:
```js
async function carregarChamados() {
  const chamados = await api("/chamados");
  document.getElementById("tabela-chamados").innerHTML = chamados
    .map(
      (c) => `
        <tr>
          <td><a href="chamado.html?id=${c.id}">#${c.id} - ${c.titulo}</a></td>
          <td>${c.status_nome}</td>
          <td>${c.prazo}</td>
          <td>${situacaoBadge(c.prazo, c.status_nome)}</td>
        </tr>`
    )
    .join("");
}
```
por:
```js
async function carregarChamados() {
  const chamados = await api("/chamados");
  document.getElementById("tabela-chamados").innerHTML =
    chamados.length === 0
      ? `<tr><td colspan="4">Nenhum chamado encontrado.</td></tr>`
      : chamados
          .map(
            (c) => `
              <tr>
                <td><a href="chamado.html?id=${c.id}" title="${c.titulo}">#${c.id} - ${c.titulo}</a></td>
                <td>${c.status_nome}</td>
                <td>${c.prazo}</td>
                <td>${situacaoBadge(c.prazo, c.status_nome)}</td>
              </tr>`
          )
          .join("");
}
```

- [ ] **Step 3: `grupos.js` — estado vazio na lista de grupos**

Em `recarregarLista()`, troque:
```js
    const grupos = await api("/grupos");
    lista.innerHTML = grupos
      .map(
        (g) => `
        <li data-id="${g.id}">
          <button type="button" class="btn btn-secundario btn-selecionar" data-id="${g.id}">${g.nome}</button>
          <button type="button" class="btn btn-perigo btn-excluir" data-id="${g.id}">Excluir</button>
        </li>`
      )
      .join("");
```
por:
```js
    const grupos = await api("/grupos");
    lista.innerHTML =
      grupos.length === 0
        ? `<li>Nenhum grupo cadastrado ainda.</li>`
        : grupos
            .map(
              (g) => `
              <li data-id="${g.id}">
                <button type="button" class="btn btn-secundario btn-selecionar" data-id="${g.id}">${g.nome}</button>
                <button type="button" class="btn btn-perigo btn-excluir" data-id="${g.id}">Excluir</button>
              </li>`
            )
            .join("");
```

- [ ] **Step 4: `fluxo.js` — estado vazio em Etapas e Ações**

Em `renderEtapas`, dentro do template da tabela, troque:
```js
      <tbody>
        ${etapas
          .map(
            (e) => `
          <tr>
```
por (fecha o `tbody` condicionalmente — repare que o `</tbody>` e o
`.join("")` final do map não mudam, só a linha de abertura ganha a
checagem):
```js
      <tbody>
        ${
          etapas.length === 0
            ? `<tr><td colspan="7">Nenhuma etapa cadastrada ainda.</td></tr>`
            : etapas
                .map(
                  (e) => `
          <tr>
```
E, no fechamento dessa mesma expressão (logo depois do `.join("")` que já
existe para o `map` das etapas, antes de `</tbody>`), adicione o
fechamento do novo ternário — ou seja, a estrutura final desse trecho
inteiro fica:
```js
      <tbody>
        ${
          etapas.length === 0
            ? `<tr><td colspan="7">Nenhuma etapa cadastrada ainda.</td></tr>`
            : etapas
                .map(
                  (e) => `
          <tr>
            <td>${e.nome}</td>
            <td>${nomeSetor(e.setor_id)}</td>
            <td>${e.tipo}</td>
            <td>${e.eh_inicial ? "Sim" : "Não"}</td>
            <td>${e.etapa_proxima_id ? nomeEtapa(e.etapa_proxima_id) : "-"}</td>
            <td>${e.etapa_proxima_vinculo ?? "-"}</td>
            <td>
              ${e.tipo === "aprovacao" ? `<button type="button" class="btn btn-secundario btn-acoes" data-id="${e.id}">Ações</button>` : ""}
              ${permissaoFluxos.excluir ? `<button type="button" class="btn btn-perigo btn-excluir-etapa" data-id="${e.id}">Excluir</button>` : ""}
            </td>
          </tr>`
                )
                .join("")
        }
      </tbody>
```

Mesma mudança em `renderAcoes` (a tabela de Ações), trocando:
```js
      <tbody>
        ${etapa.acoes
          .map(
            (a) => `
          <tr>
```
por:
```js
      <tbody>
        ${
          etapa.acoes.length === 0
            ? `<tr><td colspan="5">Nenhuma ação cadastrada ainda.</td></tr>`
            : etapa.acoes
                .map(
                  (a) => `
          <tr>
            <td>${a.rotulo}</td>
            <td>${setores.find((s) => s.id === a.setor_destino_id)?.nome ?? a.setor_destino_id}</td>
            <td>${a.vinculo}</td>
            <td>${
              a.prerequisito_acao_id
                ? etapa.acoes.find((x) => x.id === a.prerequisito_acao_id)?.rotulo ?? "-"
                : "-"
            }</td>
            <td>${permissaoFluxos.excluir ? `<button type="button" class="btn btn-perigo btn-excluir-acao" data-id="${a.id}">Excluir</button>` : ""}</td>
          </tr>`
                )
                .join("")
        }
      </tbody>
```

- [ ] **Step 5: `grupos.js` — usar `mostrarMensagem` (sucesso) nos dois "Salvar"**

Hoje, salvar o nome de um grupo ou a matriz de permissões não dá NENHUM
retorno visual em caso de sucesso (só em caso de erro) — o usuário não
sabe se o clique funcionou. Adicione `import { mostrarMensagem } from "./ui.js";`
junto ao import de `mostrarErro`/`info` já existente, e troque o corpo
dos dois handlers:

```js
detalhe.querySelector("#form-renomear").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const nome = ev.target.elements.nome.value;
  try {
    await api(`/grupos/${id}`, { method: "PUT", body: { nome } });
    mostrarMensagem(mensagemErro, "Nome atualizado.", "sucesso");
    await recarregarLista();
  } catch (e) {
    mostrarErro(mensagemErro, e);
  }
});
```

```js
detalhe.querySelector("#btn-salvar-permissoes").addEventListener("click", async () => {
  const matriz = {};
  for (const tela of TELAS) {
    const linha = detalhe.querySelector(`tr[data-tela="${tela.chave}"]`);
    matriz[tela.chave] = {};
    for (const acao of ACOES) {
      matriz[tela.chave][acao] = linha.querySelector(`input[data-acao="${acao}"]`).checked;
    }
    if (tela.chave === "chamados") {
      matriz.chamados.ver_todos_setores = linha.querySelector('input[data-acao="ver_todos_setores"]').checked;
    }
  }
  try {
    await api(`/grupos/${id}/permissoes`, { method: "PUT", body: matriz });
    mostrarMensagem(mensagemErro, "Permissões salvas.", "sucesso");
  } catch (e) {
    mostrarErro(mensagemErro, e);
  }
});
```

`mensagemErro` já é um parâmetro que `abrirGrupo` recebe indiretamente via
closure (é a mesma variável de `iniciar(container, mensagemErro)`) — não
precisa de nenhum elemento novo no HTML, reaproveita o
`<p id="mensagem-erro">` que já existe.

- [ ] **Step 6: Manually verify against the local dev server**

Start `wrangler pages dev .` via Bash. Log in as an admin:
1. Open `chamados.html` — hover over a long chamado title, confirm a
   browser tooltip shows the full text.
2. Temporarily delete all rows from a small table (e.g. `status` via
   `cadastros.html`, or check a fluxo with zero etapas) and confirm
   "Nenhum registro encontrado."/"Nenhuma etapa cadastrada ainda." shows
   instead of a blank table — restore the deleted rows afterward if you
   removed real seed data (use `wrangler d1 execute ... --local` to
   re-insert, or just test against a fluxo/tela that's already naturally
   empty instead of deleting real data).
3. Confirm `grupos.html`'s list shows "Nenhum grupo cadastrado ainda." if
   you delete all test groups (or just check the message text/logic by
   reading the code — deleting all real groups isn't necessary if none
   exist to begin with in a fresh local DB).
4. On `grupos.html`, select a group, click "Salvar nome" — confirm a
   green "Nome atualizado." message appears (`.mensagem-sucesso` style);
   toggle a checkbox and click "Salvar permissões" — confirm "Permissões
   salvas." appears the same way.

```bash
npm test
```
Expected: 30/30 ainda passando.

- [ ] **Step 7: Commit**

```bash
git add crud-ui.js chamados.js grupos.js fluxo.js
git commit -m "Standardize empty states, add title tooltips, use mostrarMensagem on group saves"
```
