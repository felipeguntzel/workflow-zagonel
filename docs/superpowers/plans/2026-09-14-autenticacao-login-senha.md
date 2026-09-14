# Autenticação com Login/Senha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current no-password "pick a user from a dropdown" login
with real login/password authentication stored in D1, and redesign the login
screen as a full-viewport, professional split-screen layout.

**Architecture:** A new `login`/`senha_hash` pair of columns on `usuarios`
(distinct from the existing free-text `nome` display field). Passwords are
never stored or transmitted in plain text — only a SHA-256 hex digest,
computed with the Workers-native `crypto.subtle` API (no new dependency). A
new `POST /api/login` endpoint verifies credentials; the existing Usuários
CRUD is rewritten to never expose `senha_hash` and to validate/normalize
`login` on create and edit. The frontend login page becomes a real
username+password form in a split-screen layout.

**Tech Stack:** Cloudflare D1 (SQLite), Cloudflare Pages Functions, Web
Crypto API (`crypto.subtle`), plain HTML/CSS/JS (no framework), Node's
built-in `node:test` for unit tests — consistent with the existing project.

## Global Constraints

- `login` is normalized to lowercase both when saved and when authenticating (`"Ana"` and `"ana"` are the same login).
- `login` format: only `[a-z0-9]+` after lowercasing — no spaces, dots, or special characters. Validated both client-side (HTML `pattern` attribute, UX only) and server-side (source of truth).
- Passwords are never stored, logged, or returned in plain text — only as a SHA-256 hex digest via `crypto.subtle.digest("SHA-256", ...)`.
- Default password on user creation is always `"1234" + login` (lowercase), computed server-side — there is no manual password field in this phase.
- `GET`/list endpoints for `usuarios` must never include `senha_hash` in the response.
- Login failure returns a generic `401` with `{"error": "Login ou senha inválidos"}` — never reveal whether the login exists.
- No new npm dependencies. No automated tests for HTTP routes or frontend (manual `wrangler pages dev` + curl/browser verification, consistent with the rest of this project) — only the pure `_lib/auth.js` functions get `node:test` unit tests.
- Git: commit after every task, ending with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## Task 1: D1 migration — `login`/`senha_hash` columns and seed data

**Files:**
- Create: `migrations/0003_auth.sql`

**Interfaces:**
- Produces: `usuarios.login` (TEXT, nullable at the schema level but always populated by application logic — see Task 4), `usuarios.senha_hash` (TEXT, same), a unique index on `login`. Seeded rows: `ana`/`bruno`/`carla`/`diego`/`elisa` with password `"1234" + login` each, pre-hashed below. Consumed by Task 3 (login endpoint) and Task 4 (Usuários CRUD).

- [ ] **Step 1: Write the migration**

Create `migrations/0003_auth.sql`:

```sql
ALTER TABLE usuarios ADD COLUMN login TEXT;
ALTER TABLE usuarios ADD COLUMN senha_hash TEXT;

UPDATE usuarios SET login = 'ana', senha_hash = '4176647594e2a5ba663e60d7240a308d6562755d22c70d717a704b48448648b3' WHERE id = 1;
UPDATE usuarios SET login = 'bruno', senha_hash = '98981011393a27881e7ffa36c1f5e3d47696b7e42e60f6396eac64f48844ecf3' WHERE id = 2;
UPDATE usuarios SET login = 'carla', senha_hash = 'de61e66d40f4603da5287ce97aea2e24c68de99b7e0ed203529187d855d620b8' WHERE id = 3;
UPDATE usuarios SET login = 'diego', senha_hash = '68d5be8de9b4ea88805927a1f7514680184e54199b7154a3914481c36d780355' WHERE id = 4;
UPDATE usuarios SET login = 'elisa', senha_hash = '85cc0d1ce6356679ca75f5013d7c4c0cb6b17e4a6d5150470f9616a5d1f382c1' WHERE id = 5;

CREATE UNIQUE INDEX idx_usuarios_login ON usuarios(login);
```

These are the real SHA-256 hex digests of `"1234ana"`, `"1234bruno"`,
`"1234carla"`, `"1234diego"`, `"1234elisa"` respectively (already computed
and verified — you don't need to recompute them, but you can verify any one
with `node -e "crypto.subtle.digest('SHA-256', new TextEncoder().encode('1234ana')).then(b => console.log(Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')))"`).

- [ ] **Step 2: Apply the migration locally**

Run:
```bash
wrangler d1 execute workflow_zagonel_db --local --file=migrations/0003_auth.sql
```
Expected: `🚣 Executed N commands` with no errors.

- [ ] **Step 3: Verify locally**

Run:
```bash
wrangler d1 execute workflow_zagonel_db --local --command="SELECT id, login, senha_hash FROM usuarios ORDER BY id"
```
Expected: 5 rows, each with a non-null `login` (`ana`, `bruno`, `carla`, `diego`, `elisa`) and a 64-character `senha_hash`.

- [ ] **Step 4: Apply the migration to the remote (production) database**

Run:
```bash
wrangler d1 execute workflow_zagonel_db --remote --file=migrations/0003_auth.sql
```
Expected: same success output as Step 2, against the production D1 instance.

- [ ] **Step 5: Commit**

```bash
git add migrations/0003_auth.sql
git commit -m "Add login/senha_hash columns and seed default credentials"
```

---

## Task 2: `functions/_lib/auth.js` — password hashing and login format validation

**Files:**
- Create: `functions/_lib/auth.js`
- Create: `functions/_lib/auth.test.js`

**Interfaces:**
- Produces: `hashSenha(senha: string) -> Promise<string>` (64-char lowercase hex SHA-256 digest), `validarFormatoLogin(login: string) -> boolean` (true only for a non-empty string matching `/^[a-z0-9]+$/` — caller must lowercase the input first, this function does not normalize). Consumed by Task 3 and Task 4.

- [ ] **Step 1: Write the failing tests**

Create `functions/_lib/auth.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { hashSenha, validarFormatoLogin } from "./auth.js";

test("hashSenha computes the SHA-256 hex digest of the input", async () => {
  const hash = await hashSenha("1234ana");
  assert.equal(hash, "4176647594e2a5ba663e60d7240a308d6562755d22c70d717a704b48448648b3");
});

test("hashSenha produces different hashes for different inputs", async () => {
  const a = await hashSenha("1234ana");
  const b = await hashSenha("1234bruno");
  assert.notEqual(a, b);
});

test("validarFormatoLogin accepts lowercase letters and digits only", () => {
  assert.equal(validarFormatoLogin("ana"), true);
  assert.equal(validarFormatoLogin("bruno123"), true);
});

test("validarFormatoLogin rejects spaces, dots, and special characters", () => {
  assert.equal(validarFormatoLogin("ana silva"), false);
  assert.equal(validarFormatoLogin("ana.silva"), false);
  assert.equal(validarFormatoLogin("ana@silva"), false);
  assert.equal(validarFormatoLogin(""), false);
});

test("validarFormatoLogin rejects uppercase (caller must lowercase first)", () => {
  assert.equal(validarFormatoLogin("Ana"), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test functions/_lib/auth.test.js`
Expected: FAIL — `Cannot find module './auth.js'`

- [ ] **Step 3: Write `functions/_lib/auth.js`**

```js
export async function hashSenha(senha) {
  const dados = new TextEncoder().encode(senha);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dados);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function validarFormatoLogin(login) {
  return /^[a-z0-9]+$/.test(login);
}
```

`crypto` is a global in both the Cloudflare Workers runtime and modern
Node.js (verified on Node v24) — no import needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test functions/_lib/auth.test.js`
Expected: PASS, 5 tests passing.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests across every `functions/_lib/*.test.js` file pass (25 total: the 20 from Fase 1 plus these 5).

- [ ] **Step 6: Commit**

```bash
git add functions/_lib/auth.js functions/_lib/auth.test.js
git commit -m "Add password hashing and login format validation with unit tests"
```

---

## Task 3: `POST /api/login`

**Files:**
- Create: `functions/api/login.js`

**Interfaces:**
- Consumes: `first` (`functions/_lib/db.js`), `json`/`error` (`functions/_lib/http.js`), `hashSenha` (`functions/_lib/auth.js`, Task 2).
- Produces (HTTP): `POST /api/login` — body `{login, senha}` → `200` with `{id, nome, setor_id}` on success, `400` if either field is missing, `401` with `{"error": "Login ou senha inválidos"}` on any mismatch.

- [ ] **Step 1: Write `functions/api/login.js`**

```js
import { first } from "../_lib/db.js";
import { json, error } from "../_lib/http.js";
import { hashSenha } from "../_lib/auth.js";

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.login || !body.senha) {
    return error("Login e senha são obrigatórios");
  }
  const loginNormalizado = body.login.toLowerCase();
  const senhaHash = await hashSenha(body.senha);
  const usuario = await first(
    context.env.DB,
    "SELECT id, nome, setor_id FROM usuarios WHERE login = ? AND senha_hash = ?",
    loginNormalizado,
    senhaHash
  );
  if (!usuario) {
    return error("Login ou senha inválidos", 401);
  }
  return json(usuario);
}
```

- [ ] **Step 2: Manually verify against the local dev server**

Run (in one terminal, leave it running):
```bash
npm run dev
```

In another terminal:
```bash
curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"1234ana\"}"
curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"Ana\",\"senha\":\"1234ana\"}"
curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"errada\"}" -w "\nHTTP:%{http_code}\n"
curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"naoexiste\",\"senha\":\"x\"}" -w "\nHTTP:%{http_code}\n"
```
Expected: first two calls (note the second uses `"Ana"` with a capital A) both return `200` with `{"id":1,"nome":"Ana (Comercial)","setor_id":1}`; third and fourth both return `401` with the same generic `{"error":"Login ou senha inválidos"}` message.

- [ ] **Step 3: Commit**

```bash
git add functions/api/login.js
git commit -m "Add POST /api/login authentication endpoint"
```

---

## Task 4: Usuários CRUD — never expose `senha_hash`, validate `login`

The existing `functions/api/usuarios/index.js` and `functions/api/usuarios/[id].js`
use the generic `crudHandlers`/`crudItemHandlers` factory from Task 4 of the
Fase 1 plan, which does `SELECT * FROM usuarios` — that would leak
`senha_hash` in every response. This task replaces both files with
hand-written handlers scoped to `id, nome, setor_id, login` only, and adds
`login` format/uniqueness validation on both create and edit (edit support
is included, not just create, so the Cadastros form doesn't silently ignore
an edited `login` value — see Task 6).

**Files:**
- Modify: `functions/api/usuarios/index.js` (replace entirely)
- Modify: `functions/api/usuarios/[id].js` (replace entirely)

**Interfaces:**
- Consumes: `all`/`first`/`run` (`functions/_lib/db.js`), `json`/`error` (`functions/_lib/http.js`), `hashSenha`/`validarFormatoLogin` (`functions/_lib/auth.js`, Task 2).
- Produces (HTTP): `GET/POST /api/usuarios`, `GET/PUT/DELETE /api/usuarios/:id` — every response shape is `{id, nome, setor_id, login}`, never `senha_hash`.

- [ ] **Step 1: Replace `functions/api/usuarios/index.js`**

```js
import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { hashSenha, validarFormatoLogin } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const usuarios = await all(
    context.env.DB,
    "SELECT id, nome, setor_id, login FROM usuarios ORDER BY id"
  );
  return json(usuarios);
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.nome || !body.setor_id || !body.login) {
    return error("Campos obrigatórios: nome, setor_id, login");
  }
  const login = body.login.toLowerCase();
  if (!validarFormatoLogin(login)) {
    return error(
      "Login inválido: use apenas letras e números, sem espaços, pontos ou caracteres especiais"
    );
  }
  const existente = await first(context.env.DB, "SELECT id FROM usuarios WHERE login = ?", login);
  if (existente) {
    return error("Já existe um usuário com esse login");
  }
  const senhaHash = await hashSenha(`1234${login}`);
  const resultado = await run(
    context.env.DB,
    "INSERT INTO usuarios (nome, setor_id, login, senha_hash) VALUES (?, ?, ?, ?)",
    body.nome,
    body.setor_id,
    login,
    senhaHash
  );
  const novo = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login FROM usuarios WHERE id = ?",
    resultado.meta.last_row_id
  );
  return json(novo, 201);
}
```

- [ ] **Step 2: Replace `functions/api/usuarios/[id].js`**

```js
import { first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { validarFormatoLogin } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const usuario = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login FROM usuarios WHERE id = ?",
    context.params.id
  );
  if (!usuario) return error("Não encontrado", 404);
  return json(usuario);
}

export async function onRequestPut(context) {
  const body = await context.request.json();
  const campos = ["nome", "setor_id"];
  const colunas = campos.filter((c) => body[c] !== undefined);

  let login = null;
  if (body.login !== undefined) {
    login = body.login.toLowerCase();
    if (!validarFormatoLogin(login)) {
      return error(
        "Login inválido: use apenas letras e números, sem espaços, pontos ou caracteres especiais"
      );
    }
    const existente = await first(
      context.env.DB,
      "SELECT id FROM usuarios WHERE login = ? AND id != ?",
      login,
      context.params.id
    );
    if (existente) return error("Já existe um usuário com esse login");
  }

  if (colunas.length === 0 && login === null) {
    return error("Nenhum campo para atualizar");
  }

  const colunasFinal = login !== null ? [...colunas, "login"] : colunas;
  const valoresFinal = login !== null ? [...colunas.map((c) => body[c]), login] : colunas.map((c) => body[c]);
  const set = colunasFinal.map((c) => `${c} = ?`).join(", ");
  await run(context.env.DB, `UPDATE usuarios SET ${set} WHERE id = ?`, ...valoresFinal, context.params.id);

  const atualizado = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login FROM usuarios WHERE id = ?",
    context.params.id
  );
  if (!atualizado) return error("Não encontrado", 404);
  return json(atualizado);
}

export async function onRequestDelete(context) {
  await run(context.env.DB, "DELETE FROM usuarios WHERE id = ?", context.params.id);
  return json({ ok: true });
}
```

- [ ] **Step 3: Manually verify against the local dev server**

With `npm run dev` running:
```bash
curl -s http://localhost:8788/api/usuarios
curl -s -X POST http://localhost:8788/api/usuarios -H "content-type: application/json" -d "{\"nome\":\"Teste Silva\",\"setor_id\":1,\"login\":\"Teste\"}"
curl -s -X POST http://localhost:8788/api/usuarios -H "content-type: application/json" -d "{\"nome\":\"Duplicado\",\"setor_id\":1,\"login\":\"ana\"}"
curl -s -X POST http://localhost:8788/api/usuarios -H "content-type: application/json" -d "{\"nome\":\"Invalido\",\"setor_id\":1,\"login\":\"tem espaco\"}"
curl -s -X PUT http://localhost:8788/api/usuarios/6 -H "content-type: application/json" -d "{\"login\":\"teste2\"}"
curl -s -X DELETE http://localhost:8788/api/usuarios/6
```
Expected: first call's rows all have a `login` field and NO `senha_hash` field; second call returns `201` with `{"id":6,"nome":"Teste Silva","setor_id":1,"login":"teste"}` (lowercased); third call returns `400` `{"error":"Já existe um usuário com esse login"}`; fourth returns `400` with the format-validation message; fifth returns the row with `"login":"teste2"`; sixth returns `{"ok":true}`.

- [ ] **Step 4: Commit**

```bash
git add functions/api/usuarios/index.js functions/api/usuarios/[id].js
git commit -m "Rewrite Usuários CRUD to validate login and never expose senha_hash"
```

---

## Task 5: Frontend login screen — split-screen layout, real credentials

**Files:**
- Modify: `index.html` (replace entirely)
- Modify: `index.js` (replace entirely)
- Modify: `style.css` (remove the old `.login` rules, add `.login-split*` rules)

**Interfaces:**
- Consumes: `api` (`api.js`), `setUsuarioLogado` (`auth.js`) — both unchanged.
- Produces: the login page now posts to `/api/login` (Task 3) instead of fetching `/api/usuarios`.

- [ ] **Step 1: Replace `index.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WorkFlow Zagonel — Entrar</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="login-split">
  <div class="login-split__destaque">
    <h1>WorkFlow Zagonel</h1>
    <p>Gestão de chamados de alteração e criação de produto</p>
  </div>
  <div class="login-split__form">
    <form class="formulario" id="form-login">
      <h2>Entrar</h2>
      <label>Usuário
        <input type="text" name="login" required autocomplete="username" pattern="[A-Za-z0-9]+">
      </label>
      <label>Senha
        <input type="password" name="senha" required autocomplete="current-password">
      </label>
      <button type="submit">Entrar</button>
      <p id="mensagem-erro" class="erro" hidden></p>
    </form>
  </div>
</div>
<script type="module" src="index.js"></script>
</body>
</html>
```

- [ ] **Step 2: Replace `index.js`**

```js
import { api } from "./api.js";
import { setUsuarioLogado } from "./auth.js";

document.getElementById("form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const mensagemErro = document.getElementById("mensagem-erro");
  mensagemErro.hidden = true;
  try {
    const usuario = await api("/login", {
      method: "POST",
      body: {
        login: form.elements.login.value,
        senha: form.elements.senha.value,
      },
    });
    setUsuarioLogado(usuario);
    window.location.href = "chamados.html";
  } catch (e) {
    mensagemErro.textContent = e.message;
    mensagemErro.hidden = false;
  }
});
```

- [ ] **Step 3: Update `style.css`**

Remove these two lines (the old dropdown-based login layout, now unused):
```css
.login { max-width: 320px; margin: 4rem auto; text-align: center; }
.login select, .login button { width: 100%; padding: 0.5rem; margin-top: 0.5rem; }
```

Add in their place:
```css
.login-split {
  display: flex;
  min-height: 100vh;
  width: 100%;
}
.login-split__destaque {
  flex: 1 1 50%;
  background: linear-gradient(135deg, var(--cor-primaria), #1d4a35);
  color: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 2rem;
}
.login-split__destaque h1 { font-size: 2.5rem; margin: 0 0 0.5rem; }
.login-split__form {
  flex: 1 1 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}
.login-split__form form { width: 100%; max-width: 360px; }
@media (max-width: 720px) {
  .login-split { flex-direction: column; }
  .login-split__destaque { flex: 0 0 auto; padding: 1.5rem; }
  .login-split__destaque h1 { font-size: 1.75rem; }
}
```

- [ ] **Step 4: Manually verify in the browser**

With `npm run dev` running, open `http://localhost:8788/`. Expected: full-viewport split-screen layout (green gradient panel with "WorkFlow Zagonel" on one side, login form on the other), no scrollbar from unused space. Log in with `ana` / `1234ana` — expect redirect to `chamados.html`. Go back and try `ana` / `senhaerrada` — expect the error message to appear inline without navigating away. Resize the browser to a narrow (mobile) width — expect the two panels to stack vertically instead of side-by-side.

- [ ] **Step 5: Commit**

```bash
git add index.html index.js style.css
git commit -m "Redesign login screen: split-screen layout with real login/senha form"
```

---

## Task 6: Cadastros — add `login` field to the Usuários form

**Files:**
- Modify: `cadastros.js`

**Interfaces:**
- Consumes: `renderCrud` (`crud-ui.js`, unchanged), `info` (`ui.js`, unchanged).

- [ ] **Step 1: Add the `login` field to the Usuários `renderCrud` config**

In `cadastros.js`, find the Usuários `renderCrud` call and change:

```js
  renderCrud(document.getElementById("secao-usuarios"), {
    titulo: "Usuários",
    endpoint: "/usuarios",
    campos: [
      { nome: "nome", label: "Nome", obrigatorio: true },
      { nome: "setor_id", label: "Setor", obrigatorio: true, opcoesEndpoint: "/setores" },
    ],
  }).catch((e) => mostrarErro(mensagemErro, e));
```

to:

```js
  renderCrud(document.getElementById("secao-usuarios"), {
    titulo: "Usuários",
    endpoint: "/usuarios",
    campos: [
      { nome: "nome", label: "Nome", obrigatorio: true },
      { nome: "setor_id", label: "Setor", obrigatorio: true, opcoesEndpoint: "/setores" },
      {
        nome: "login",
        label: "Login",
        obrigatorio: true,
        dica: "Usado para entrar no sistema. Só letras e números, sem espaços, pontos ou caracteres especiais. A senha padrão do novo usuário é '1234' + o login (ex.: login 'joao' → senha '1234joao').",
      },
    ],
  }).catch((e) => mostrarErro(mensagemErro, e));
```

- [ ] **Step 2: Manually verify in the browser**

With `npm run dev` running, log in and open "Cadastros". In the Usuários section, confirm the table now shows a "Login" column with each seeded user's login (`ana`, `bruno`, etc.), and the "Novo / Editar" form has a "Login" field with the info tooltip. Add a new user with nome "Fulano Teste", a setor, and login "fulano" — confirm it appears in the table. Edit an existing throwaway user's login to something else and confirm it saves. Delete the throwaway user to leave seed data intact. Confirm the form never shows or asks for a password field.

- [ ] **Step 3: Commit**

```bash
git add cadastros.js
git commit -m "Add login field to the Usuários cadastro form"
```

---

## Task 7: Deploy and production smoke test

**Files:** none (verification-only task).

- [ ] **Step 1: Run the full unit test suite one last time**

Run: `npm test`
Expected: all tests pass (25 total).

- [ ] **Step 2: Push**

```bash
git push
```
Expected: Cloudflare Pages picks up the push and deploys.

- [ ] **Step 3: Smoke test the production API**

```bash
curl -s -X POST https://workflow-zagonel.pages.dev/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"1234ana\"}"
curl -s -X POST https://workflow-zagonel.pages.dev/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"errada\"}" -w "\nHTTP:%{http_code}\n"
curl -s https://workflow-zagonel.pages.dev/api/usuarios
```
Expected: first call returns `200` with Ana's user data; second returns `401`; third returns the usuário list with `login` fields and no `senha_hash`.

- [ ] **Step 4: Smoke test the production UI**

Open `https://workflow-zagonel.pages.dev/` in a browser. Expected: the new
split-screen login renders correctly full-viewport. Log in as `bruno` /
`1234bruno` and confirm it reaches "Meus chamados".

- [ ] **Step 5: Update `docs/PENDENCIAS.md` if anything surfaces**

If the smoke test surfaces a rough edge that isn't a correctness bug, add
it to `docs/PENDENCIAS.md`. If it's a genuine bug, fix it as a follow-up
task instead of deferring it.

- [ ] **Step 6: Commit (only if Step 5 changed `docs/PENDENCIAS.md`)**

```bash
git add docs/PENDENCIAS.md
git commit -m "Note follow-up ideas from login/senha production smoke test"
git push
```
