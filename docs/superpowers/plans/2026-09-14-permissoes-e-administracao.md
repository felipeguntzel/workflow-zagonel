# Permissões, Sessão e Administração — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current no-real-auth login into a real access-control
system: signed session tokens, permission groups (view/insert/edit/delete
per screen), an admin bypass, admin-set initial passwords with forced
change on first login, and a production data reset to start real usage.

**Architecture:** Login now issues an HMAC-signed, stateless session token
(no session table) that the frontend attaches to every API call; the
backend derives the caller's identity and permissions from that token on
every request, replacing the current "trust whatever the client claims"
model. A `grupos_permissao` / `permissoes` / `usuario_grupos` schema
defines, per screen, what each group can view/insert/edit/delete; a
user's effective permission is the union of all their groups, and an
`admin` flag bypasses this entirely. The frontend hides controls the
user can't use in addition to the backend enforcing it.

**Tech Stack:** Cloudflare D1, Cloudflare Pages Functions, Web Crypto API
(`crypto.subtle` HMAC-SHA256, no new dependency), Cloudflare Pages secrets
(`wrangler pages secret put`) for the signing key, plain HTML/CSS/JS,
Node's built-in `node:test`.

## Global Constraints

- No new npm dependencies.
- The session-signing secret (`SESSAO_SEGREDO`) is never committed to the repo — local dev reads it from a gitignored `.dev.vars`, production from a Cloudflare Pages secret.
- Session tokens are valid for 8 hours from issuance; there is no revocation before expiry (documented as deferred in the design spec).
- Every mutating/reading API endpoint (except `POST /api/login`, `POST /api/trocar-senha`, `GET /api/chamados/:id/arvore`, and `GET/POST /api/chamados/:id/comentarios`) requires a valid session token AND the specific screen/action permission — 401 if the token is missing/invalid, 403 if valid but lacking the permission.
- `GET /api/chamados/:id/arvore` and `GET/POST /api/chamados/:id/comentarios` require only a valid session (any authenticated user), never a specific permission — this is an intentional, explicit exception, not an oversight.
- Wherever an endpoint used to trust a client-supplied `usuario_id`/`solicitante_id`/`setor_id` for identifying who's acting, it now derives that from the authenticated session instead — this closes a real spoofing gap and is a deliberate improvement, not scope creep.
- Git: commit after every task, ending with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## Task 1: D1 migration — admin/deve_trocar_senha columns, permission-group tables

**Files:**
- Create: `migrations/0004_permissoes.sql`
- Create: `.dev.vars` (gitignored)
- Modify: `.gitignore`

**Interfaces:**
- Produces: `usuarios.admin` (0/1), `usuarios.deve_trocar_senha` (0/1); tables `grupos_permissao(id, nome)`, `permissoes(id, grupo_id, tela, visualizar, inserir, editar, excluir, ver_todos_setores)` with `UNIQUE(grupo_id, tela)`, `usuario_grupos(usuario_id, grupo_id)` with a composite primary key. Consumed by every later task.
- Produces: a `SESSAO_SEGREDO` secret available as `context.env.SESSAO_SEGREDO` locally (via `.dev.vars`) and in production (via `wrangler pages secret put`).

- [ ] **Step 1: Write the migration**

Create `migrations/0004_permissoes.sql`:

```sql
ALTER TABLE usuarios ADD COLUMN admin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN deve_trocar_senha INTEGER NOT NULL DEFAULT 0;

CREATE TABLE grupos_permissao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL
);

CREATE TABLE permissoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grupo_id INTEGER NOT NULL REFERENCES grupos_permissao(id),
  tela TEXT NOT NULL CHECK (tela IN ('empresas','setores','usuarios','status','fluxos','chamados')),
  visualizar INTEGER NOT NULL DEFAULT 0,
  inserir INTEGER NOT NULL DEFAULT 0,
  editar INTEGER NOT NULL DEFAULT 0,
  excluir INTEGER NOT NULL DEFAULT 0,
  ver_todos_setores INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX idx_permissoes_grupo_tela ON permissoes(grupo_id, tela);

CREATE TABLE usuario_grupos (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  grupo_id INTEGER NOT NULL REFERENCES grupos_permissao(id),
  PRIMARY KEY (usuario_id, grupo_id)
);
```

`ver_todos_setores` only means something when `tela = 'chamados'`; it's a
column on every row for simplicity (ignored for other telas) rather than a
separate table for one extra flag.

- [ ] **Step 2: Apply the migration locally and remotely**

```bash
wrangler d1 execute workflow_zagonel_db --local --file=migrations/0004_permissoes.sql
wrangler d1 execute workflow_zagonel_db --remote --file=migrations/0004_permissoes.sql
```
Expected: both succeed with no errors.

- [ ] **Step 3: Set up the session-signing secret**

Add `.dev.vars` to `.gitignore` (it must never be committed — it's local-only, equivalent to secrets), alongside the existing `.wrangler/`, `.worktrees/`, `.superpowers/` entries:

```
.wrangler/
.worktrees/
.superpowers/
.dev.vars
```

Create `.dev.vars` at the repo root (for local `wrangler pages dev`) with a
random value — any long random string works, e.g. generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Write the output into `.dev.vars` as:

```
SESSAO_SEGREDO=<o-valor-gerado-acima>
```

Then set the same kind of secret for production (generate a SEPARATE random
value for production — never reuse the local dev one):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```bash
echo "<o-novo-valor-gerado>" | wrangler pages secret put SESSAO_SEGREDO --project-name=workflow-zagonel
```

Verify it was set:

```bash
wrangler pages secret list --project-name=workflow-zagonel
```
Expected: `SESSAO_SEGREDO` appears in the list (value not shown, by design).

- [ ] **Step 4: Verify locally**

```bash
wrangler d1 execute workflow_zagonel_db --local --command="SELECT admin, deve_trocar_senha FROM usuarios LIMIT 1"
```
Expected: a row with `admin: 0, deve_trocar_senha: 0`.

- [ ] **Step 5: Commit**

`.dev.vars` must NOT be committed (it's gitignored) — only stage the migration and the `.gitignore` change:

```bash
git add migrations/0004_permissoes.sql .gitignore
git commit -m "Add admin/deve_trocar_senha columns and permission-group tables"
```

---

## Task 2: `functions/_lib/sessao.js` — signed session tokens

**Files:**
- Create: `functions/_lib/sessao.js`
- Create: `functions/_lib/sessao.test.js`

**Interfaces:**
- Produces: `gerarToken(usuarioId, segredo) -> Promise<string>` (a `"<usuarioId>.<expiraEmMs>.<assinaturaHex>"` token, valid 8 hours from generation), `verificarToken(token, segredo) -> Promise<{usuarioId: number} | null>` (null on any invalid/tampered/expired/malformed token). Consumed by Task 3 (`permissoes.js`) and Task 4 (`POST /api/login`).

- [ ] **Step 1: Write the failing tests**

Create `functions/_lib/sessao.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { gerarToken, verificarToken } from "./sessao.js";

test("gerarToken produces a token verificarToken accepts, returning the same usuarioId", async () => {
  const token = await gerarToken(42, "segredo-teste");
  const resultado = await verificarToken(token, "segredo-teste");
  assert.deepEqual(resultado, { usuarioId: 42 });
});

test("verificarToken rejects a token signed with a different segredo", async () => {
  const token = await gerarToken(42, "segredo-a");
  const resultado = await verificarToken(token, "segredo-b");
  assert.equal(resultado, null);
});

test("verificarToken rejects a tampered payload", async () => {
  const token = await gerarToken(42, "segredo-teste");
  const [usuarioId, expiraEm, assinatura] = token.split(".");
  const tokenAdulterado = `${Number(usuarioId) + 1}.${expiraEm}.${assinatura}`;
  const resultado = await verificarToken(tokenAdulterado, "segredo-teste");
  assert.equal(resultado, null);
});

test("verificarToken rejects an expired token", async () => {
  // Constructs a validly-signed but already-expired token directly, since
  // gerarToken() always issues one with a fixed future validity window —
  // this is the one place the signing logic is re-derived rather than
  // reused, specifically to build a fixture gerarToken cannot produce.
  const payload = "42." + (Date.now() - 1000);
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("segredo-teste"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinaturaBuffer = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(payload));
  const assinatura = Array.from(new Uint8Array(assinaturaBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const tokenExpirado = `${payload}.${assinatura}`;
  const resultado = await verificarToken(tokenExpirado, "segredo-teste");
  assert.equal(resultado, null);
});

test("verificarToken rejects malformed or empty tokens", async () => {
  assert.equal(await verificarToken("nao-e-um-token", "segredo-teste"), null);
  assert.equal(await verificarToken("", "segredo-teste"), null);
  assert.equal(await verificarToken(null, "segredo-teste"), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test functions/_lib/sessao.test.js`
Expected: FAIL — `Cannot find module './sessao.js'`

- [ ] **Step 3: Write `functions/_lib/sessao.js`**

```js
const VALIDADE_MS = 8 * 60 * 60 * 1000; // 8 horas

async function assinar(payload, segredo) {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function gerarToken(usuarioId, segredo) {
  const expiraEm = Date.now() + VALIDADE_MS;
  const payload = `${usuarioId}.${expiraEm}`;
  const assinatura = await assinar(payload, segredo);
  return `${payload}.${assinatura}`;
}

export async function verificarToken(token, segredo) {
  if (!token || typeof token !== "string") return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [usuarioIdStr, expiraEmStr, assinaturaRecebida] = partes;
  const payload = `${usuarioIdStr}.${expiraEmStr}`;
  const assinaturaEsperada = await assinar(payload, segredo);
  if (assinaturaEsperada !== assinaturaRecebida) return null;
  const expiraEm = Number(expiraEmStr);
  if (!Number.isFinite(expiraEm) || Date.now() > expiraEm) return null;
  const usuarioId = Number(usuarioIdStr);
  if (!Number.isFinite(usuarioId)) return null;
  return { usuarioId };
}
```

`crypto` is a global in both the Cloudflare Workers runtime and modern
Node.js — no import needed (same pattern already used in
`functions/_lib/auth.js`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test functions/_lib/sessao.test.js`
Expected: PASS, 5 tests passing.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass (30 total: 25 from before this plan plus these 5).

- [ ] **Step 6: Commit**

```bash
git add functions/_lib/sessao.js functions/_lib/sessao.test.js
git commit -m "Add signed session-token generation and verification with unit tests"
```

---

## Task 3: `functions/_lib/permissoes.js` + wire sessions into login + `POST /api/trocar-senha`

`permissoes.js` has no standalone HTTP surface of its own — it's a library
other endpoints call. This task builds it AND wires it into the first two
endpoints that need it (login issuing a token+permissions, and the forced
password-change flow), so there's something to actually curl and verify.

**Files:**
- Create: `functions/_lib/permissoes.js`
- Modify: `functions/api/login.js` (issue a token and the permissions map on success)
- Create: `functions/api/trocar-senha.js`

**Interfaces:**
- Consumes: `first`/`all` (`functions/_lib/db.js`), `error` (`functions/_lib/http.js`), `verificarToken` (`functions/_lib/sessao.js`, Task 2), `hashSenha` (`functions/_lib/auth.js`).
- Produces: `obterUsuarioDaRequisicao(request, env) -> Promise<{id, nome, setor_id, admin, deve_trocar_senha} | null>` (reads the `Authorization: Bearer <token>` header, verifies it, loads the user row — `admin`/`deve_trocar_senha` are `0`/`1` as stored), `obterPermissoesDoUsuario(db, usuarioId) -> Promise<{empresas: {visualizar,inserir,editar,excluir}, setores: {...}, usuarios: {...}, status: {...}, fluxos: {...}, chamados: {visualizar,inserir,editar,excluir,ver_todos_setores}}>` (an admin user gets every flag `true`), `exigirPermissao(context, tela, acao) -> Promise<{usuario, permissoes} | {erro: Response}>` (401 if no valid session, 403 if `deve_trocar_senha === 1` OR if valid but lacking the permission — callers do `const {usuario, erro} = await exigirPermissao(...); if (erro) return erro;`), `exigirAdmin(context) -> Promise<{usuario} | {erro: Response}>` (401/403 the same way, including the same forced-password-change block, plus requires `admin === 1` specifically — managing permission groups themselves is deliberately admin-only, never gated by a group's own permissions, so a group can never grant itself more power). The forced-password-change block (added after a whole-branch review caught it missing — the design always intended it, see design spec section D) means every `tela`/`acao`-gated endpoint is unreachable until the user completes `POST /api/trocar-senha`, which stays reachable throughout since it calls `obterUsuarioDaRequisicao` directly, never `exigirPermissao`/`exigirAdmin`. `GET /api/chamados/:id/arvore` and `GET/POST /api/chamados/:id/comentarios` (Task 7) also call `obterUsuarioDaRequisicao` directly and so are NOT blocked by a pending forced password change — consistent with their existing "open to any valid session, no permission check at all" design, not a new gap. All consumed by every remaining backend task.

- [ ] **Step 1: Write `functions/_lib/permissoes.js`**

```js
import { first, all } from "./db.js";
import { verificarToken } from "./sessao.js";
import { error } from "./http.js";

const TELAS = ["empresas", "setores", "usuarios", "status", "fluxos", "chamados"];

export async function obterUsuarioDaRequisicao(request, env) {
  const cabecalho = request.headers.get("Authorization") ?? "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  const verificado = await verificarToken(token, env.SESSAO_SEGREDO);
  if (!verificado) return null;
  const usuario = await first(
    env.DB,
    "SELECT id, nome, setor_id, admin, deve_trocar_senha FROM usuarios WHERE id = ?",
    verificado.usuarioId
  );
  return usuario ?? null;
}

export async function obterPermissoesDoUsuario(db, usuarioId) {
  const resultado = {};
  for (const tela of TELAS) {
    resultado[tela] = { visualizar: false, inserir: false, editar: false, excluir: false };
  }
  resultado.chamados.ver_todos_setores = false;

  const usuario = await first(db, "SELECT admin FROM usuarios WHERE id = ?", usuarioId);
  if (usuario && usuario.admin) {
    for (const tela of TELAS) {
      resultado[tela] = { visualizar: true, inserir: true, editar: true, excluir: true };
    }
    resultado.chamados.ver_todos_setores = true;
    return resultado;
  }

  const linhas = await all(
    db,
    `SELECT p.tela, p.visualizar, p.inserir, p.editar, p.excluir, p.ver_todos_setores
     FROM permissoes p
     JOIN usuario_grupos ug ON ug.grupo_id = p.grupo_id
     WHERE ug.usuario_id = ?`,
    usuarioId
  );
  for (const linha of linhas) {
    const alvo = resultado[linha.tela];
    if (!alvo) continue;
    alvo.visualizar = alvo.visualizar || linha.visualizar === 1;
    alvo.inserir = alvo.inserir || linha.inserir === 1;
    alvo.editar = alvo.editar || linha.editar === 1;
    alvo.excluir = alvo.excluir || linha.excluir === 1;
    if (linha.tela === "chamados") {
      resultado.chamados.ver_todos_setores =
        resultado.chamados.ver_todos_setores || linha.ver_todos_setores === 1;
    }
  }
  return resultado;
}

export async function exigirPermissao(context, tela, acao) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return { erro: error("Não autenticado", 401) };
  if (usuario.deve_trocar_senha === 1) {
    return { erro: error("Troque sua senha antes de continuar", 403) };
  }
  const permissoes = await obterPermissoesDoUsuario(context.env.DB, usuario.id);
  const permitido = usuario.admin === 1 || Boolean(permissoes[tela]?.[acao]);
  if (!permitido) return { erro: error("Acesso negado", 403) };
  return { usuario, permissoes };
}

export async function exigirAdmin(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return { erro: error("Não autenticado", 401) };
  if (usuario.deve_trocar_senha === 1) {
    return { erro: error("Troque sua senha antes de continuar", 403) };
  }
  if (usuario.admin !== 1) return { erro: error("Acesso restrito a administradores", 403) };
  return { usuario };
}
```

No unit test for this file: every function here does real D1 I/O
(consistent with `functions/_lib/chamados.js` and `functions/_lib/crud.js`
from earlier phases of this project, which are also manually verified
rather than unit-tested). Verified in Step 3 below instead.

- [ ] **Step 2: Update `functions/api/login.js` to issue a token and permissions**

Replace the file entirely:

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
    "SELECT id, nome, setor_id, admin, deve_trocar_senha FROM usuarios WHERE login = ? AND senha_hash = ?",
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

This changes the login response shape: it now includes `admin`,
`deve_trocar_senha`, `token`, and `permissoes` alongside the existing `id`,
`nome`, `setor_id`. Frontend tasks later in this plan rely on this exact
shape.

- [ ] **Step 3: Write `functions/api/trocar-senha.js`**

```js
import { run } from "../_lib/db.js";
import { json, error } from "../_lib/http.js";
import { hashSenha } from "../_lib/auth.js";
import { obterUsuarioDaRequisicao } from "../_lib/permissoes.js";

export async function onRequestPost(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);
  const body = await context.request.json();
  if (!body.nova_senha) return error("Nova senha é obrigatória");
  const senhaHash = await hashSenha(body.nova_senha);
  await run(
    context.env.DB,
    "UPDATE usuarios SET senha_hash = ?, deve_trocar_senha = 0 WHERE id = ?",
    senhaHash,
    usuario.id
  );
  return json({ ok: true });
}
```

- [ ] **Step 4: Manually verify against the local dev server**

With `npm run dev` running (it now needs `SESSAO_SEGREDO` from `.dev.vars`,
set up in Task 1 — `wrangler pages dev` reads `.dev.vars` automatically):

```bash
curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"1234ana\"}"
```
Expected: `200` with a body shaped like
`{"id":1,"nome":"Ana (Comercial)","setor_id":1,"admin":0,"deve_trocar_senha":0,"token":"1.<timestamp>.<hex>","permissoes":{"empresas":{"visualizar":false,...},...,"chamados":{...,"ver_todos_setores":false}}}`
— note `ana` has no groups yet (Task 1 didn't touch `usuario_grupos`), so
every permission is `false` at this point; that's expected until later
tasks let you create groups (Task 8) and assign users to them (Task 5's
`PUT /api/usuarios/:id` with `grupos`, or a direct `usuario_grupos`
insert for quick manual testing) — Task 16's data reset is what creates
the real admin user, `felipe`, in production.

Take the `token` from that response and verify the password-change flow:
```bash
curl -s -X POST http://localhost:8788/api/trocar-senha -H "content-type: application/json" -H "Authorization: Bearer <token>" -d "{\"nova_senha\":\"novaSenha123\"}"
```
Expected: `200` `{"ok":true}`. Then confirm the old password no longer
works and the new one does:
```bash
curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"1234ana\"}" -w "\nHTTP:%{http_code}\n"
curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"novaSenha123\"}"
```
Expected: first returns `401`, second returns `200` with `"deve_trocar_senha":0`.

Also confirm a request with no/garbage token is rejected:
```bash
curl -s -X POST http://localhost:8788/api/trocar-senha -H "content-type: application/json" -d "{\"nova_senha\":\"x\"}" -w "\nHTTP:%{http_code}\n"
```
Expected: `401`.

Confirm the forced-password-change block: temporarily flag a user as
needing a password change and verify every `tela`/`acao`-gated endpoint is
blocked while `trocar-senha` itself stays reachable.
```bash
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET deve_trocar_senha = 1 WHERE login = 'ana'"
TOKEN3=$(curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"novaSenha123\"}" | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).token))")
curl -s http://localhost:8788/api/empresas -H "Authorization: Bearer $TOKEN3" -w "\nHTTP:%{http_code}\n"
curl -s -X POST http://localhost:8788/api/trocar-senha -H "content-type: application/json" -H "Authorization: Bearer $TOKEN3" -d "{\"nova_senha\":\"1234ana\"}" -w "\nHTTP:%{http_code}\n"
```
Expected: first call `403` "Troque sua senha antes de continuar" (any
gated endpoint works the same way — `empresas` here is just a convenient
one, already gated since Task 4); second call `200` — `trocar-senha`
itself is never blocked by its own gate. Confirm the flag actually clears
and normal access resumes:
```bash
curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"1234ana\"}"
curl -s http://localhost:8788/api/empresas -H "Authorization: Bearer <novo-token>" -w "\nHTTP:%{http_code}\n"
```
Expected: login response has `"deve_trocar_senha":0`; the `empresas` call
now returns whatever it returned before this check (`403` for lacking the
`empresas` permission itself is fine — the point is it's no longer the
forced-password-change `403`, distinguishable by the error message).

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/permissoes.js functions/api/login.js functions/api/trocar-senha.js
git commit -m "Add permission-checking library, session-issuing login, and forced password change"
```

---

## Task 4: Permission-gate the generic CRUD factory (Empresas, Setores, Status, FluxoTemplates)

`functions/_lib/crud.js` is reused by `empresas`, `setores`, `status`, and
`fluxos` (FluxoTemplates) — enhancing it once gates all four without
touching their individual route files beyond adding one `tela:` line each.

**Files:**
- Modify: `functions/_lib/crud.js`
- Modify: `functions/api/empresas/index.js`, `functions/api/empresas/[id].js`
- Modify: `functions/api/setores/index.js`, `functions/api/setores/[id].js`
- Modify: `functions/api/status/index.js`, `functions/api/status/[id].js`
- Modify: `functions/api/fluxos/index.js`, `functions/api/fluxos/[id].js`

**Interfaces:**
- Consumes: `exigirPermissao` (`functions/_lib/permissoes.js`, Task 3).
- Produces: `crudHandlers(table, {required, optional, tela})` and `crudItemHandlers(table, {required, optional, tela})` — same shape as before plus the new required `tela` option, which every call site must now supply.

- [ ] **Step 1: Replace `functions/_lib/crud.js`**

```js
import { all, first, run } from "./db.js";
import { json, error } from "./http.js";
import { exigirPermissao } from "./permissoes.js";

export function crudHandlers(table, { required = [], optional = [], tela } = {}) {
  const campos = [...required, ...optional];

  async function onRequestGet(context) {
    const { erro } = await exigirPermissao(context, tela, "visualizar");
    if (erro) return erro;
    return json(await all(context.env.DB, `SELECT * FROM ${table} ORDER BY id`));
  }

  async function onRequestPost(context) {
    const { erro } = await exigirPermissao(context, tela, "inserir");
    if (erro) return erro;
    const body = await context.request.json();
    for (const campo of required) {
      if (body[campo] === undefined || body[campo] === null || body[campo] === "") {
        return error(`Campo obrigatório: ${campo}`);
      }
    }
    const colunas = campos.filter((c) => body[c] !== undefined);
    const placeholders = colunas.map(() => "?").join(", ");
    const valores = colunas.map((c) => body[c]);
    const resultado = await run(
      context.env.DB,
      `INSERT INTO ${table} (${colunas.join(", ")}) VALUES (${placeholders})`,
      ...valores
    );
    const novo = await first(
      context.env.DB,
      `SELECT * FROM ${table} WHERE id = ?`,
      resultado.meta.last_row_id
    );
    return json(novo, 201);
  }

  return { onRequestGet, onRequestPost };
}

export function crudItemHandlers(table, { required = [], optional = [], tela } = {}) {
  const campos = [...required, ...optional];

  async function onRequestGet(context) {
    const { erro } = await exigirPermissao(context, tela, "visualizar");
    if (erro) return erro;
    const row = await first(context.env.DB, `SELECT * FROM ${table} WHERE id = ?`, context.params.id);
    if (!row) return error("Não encontrado", 404);
    return json(row);
  }

  async function onRequestPut(context) {
    const { erro } = await exigirPermissao(context, tela, "editar");
    if (erro) return erro;
    const body = await context.request.json();
    const colunas = campos.filter((c) => body[c] !== undefined);
    if (colunas.length === 0) return error("Nenhum campo para atualizar");
    const set = colunas.map((c) => `${c} = ?`).join(", ");
    const valores = colunas.map((c) => body[c]);
    await run(context.env.DB, `UPDATE ${table} SET ${set} WHERE id = ?`, ...valores, context.params.id);
    const atualizado = await first(context.env.DB, `SELECT * FROM ${table} WHERE id = ?`, context.params.id);
    if (!atualizado) return error("Não encontrado", 404);
    return json(atualizado);
  }

  async function onRequestDelete(context) {
    const { erro } = await exigirPermissao(context, tela, "excluir");
    if (erro) return erro;
    await run(context.env.DB, `DELETE FROM ${table} WHERE id = ?`, context.params.id);
    return json({ ok: true });
  }

  return { onRequestGet, onRequestPut, onRequestDelete };
}
```

- [ ] **Step 2: Add `tela` to every call site**

`functions/api/empresas/index.js`:
```js
import { crudHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPost } = crudHandlers("empresas", {
  required: ["nome"],
  tela: "empresas",
});
```

`functions/api/empresas/[id].js`:
```js
import { crudItemHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPut, onRequestDelete } = crudItemHandlers("empresas", {
  required: ["nome"],
  tela: "empresas",
});
```

`functions/api/setores/index.js`:
```js
import { crudHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPost } = crudHandlers("setores", {
  required: ["nome", "empresa_id", "prazo_padrao_dias"],
  optional: ["centro_custo"],
  tela: "setores",
});
```

`functions/api/setores/[id].js`:
```js
import { crudItemHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPut, onRequestDelete } = crudItemHandlers("setores", {
  required: ["nome", "empresa_id", "prazo_padrao_dias"],
  optional: ["centro_custo"],
  tela: "setores",
});
```

`functions/api/status/index.js`:
```js
import { crudHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPost } = crudHandlers("status", {
  required: ["nome"],
  tela: "status",
});
```

`functions/api/status/[id].js`:
```js
import { crudItemHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPut, onRequestDelete } = crudItemHandlers("status", {
  required: ["nome"],
  tela: "status",
});
```

`functions/api/fluxos/index.js`:
```js
import { crudHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPost } = crudHandlers("fluxo_templates", {
  required: ["nome"],
  tela: "fluxos",
});
```

`functions/api/fluxos/[id].js`:
```js
import { crudItemHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPut, onRequestDelete } = crudItemHandlers("fluxo_templates", {
  required: ["nome"],
  tela: "fluxos",
});
```

- [ ] **Step 3: Manually verify permission enforcement against the local dev server**

With `npm run dev` running, log in as `ana` (from Task 3's verification,
her password is now `novaSenha123`, and she has no groups yet, so every
permission is `false`):
```bash
TOKEN=$(curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"novaSenha123\"}" | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).token))")
curl -s http://localhost:8788/api/empresas -H "Authorization: Bearer $TOKEN" -w "\nHTTP:%{http_code}\n"
curl -s http://localhost:8788/api/empresas -w "\nHTTP:%{http_code}\n"
```
Expected: first call (valid token, no permission) returns `403`; second
call (no token at all) returns `401`.

- [ ] **Step 4: Commit**

```bash
git add functions/_lib/crud.js functions/api/empresas functions/api/setores functions/api/status functions/api/fluxos/index.js "functions/api/fluxos/[id].js"
git commit -m "Permission-gate the generic CRUD factory: empresas, setores, status, fluxos"
```

---

## Task 5: Usuários — permission gates, admin-set password, admin flag, group assignment

**Files:**
- Modify: `functions/api/usuarios/index.js` (replace entirely)
- Modify: `functions/api/usuarios/[id].js` (replace entirely)

**Interfaces:**
- Consumes: `exigirPermissao` (Task 3), `hashSenha`/`validarFormatoLogin` (`functions/_lib/auth.js`).
- Produces (HTTP): every response shape is now `{id, nome, setor_id, login, admin, deve_trocar_senha, grupos: [grupoId, ...]}` — `senha_hash` still never appears. `POST` now requires `senha` (the admin-chosen initial password) instead of auto-generating one, accepts `admin` (0/1) and `grupos` (array of grupo ids). `PUT` can optionally include `senha` (a reset — also re-sets `deve_trocar_senha=1`), `admin`, and `grupos` (replaces the user's group memberships entirely).

**Isolation, same principle as Task 8's `exigirAdmin`:** `usuarios.editar`/`usuarios.inserir` are ordinary CRUD permissions a ranked group could plausibly hold — they must never be enough, by themselves, to grant MORE power than the group itself already has, whether via the `admin` flag or via `grupos` membership (either one lets a group promote any user, including its own members, to power the group doesn't actually hold — defeating the whole permission-group model). So `POST` with a truthy `body.admin`, or a non-empty `body.grupos`, additionally requires the CALLER to already be `admin === 1`; a non-admin caller gets `403` on either attempt, even with full `usuarios.inserir`. `PUT` applies the same rule to both fields but compares against the target user's CURRENT stored value rather than merely checking whether the field is present: it only requires the caller to already be admin when the submitted value would actually CHANGE the target's `admin` flag or group membership — a `PUT` that redundantly resends the target's existing `admin` value or the exact same `grupos` array (as the frontend's generic form always does for `admin`, whether or not the checkbox was touched — see Task 12) does not trip the gate. This is on top of, not instead of, the normal `exigirPermissao(context, "usuarios", acao)` gate every handler still has. Both `POST` and `PUT` also validate every id in a `grupos` array against `grupos_permissao` up front, before mutating anything — a request naming a nonexistent `grupo_id` is rejected whole (`400`) rather than partially applied.

- [ ] **Step 1: Replace `functions/api/usuarios/index.js`**

```js
import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { hashSenha, validarFormatoLogin } from "../../_lib/auth.js";
import { exigirPermissao } from "../../_lib/permissoes.js";

async function carregarGruposDoUsuario(db, usuarioId) {
  const linhas = await all(db, "SELECT grupo_id FROM usuario_grupos WHERE usuario_id = ?", usuarioId);
  return linhas.map((l) => l.grupo_id);
}

async function validarGruposExistem(db, grupos) {
  if (grupos.length === 0) return true;
  const placeholders = grupos.map(() => "?").join(", ");
  const validos = await all(db, `SELECT id FROM grupos_permissao WHERE id IN (${placeholders})`, ...grupos);
  return validos.length === new Set(grupos).size;
}

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "usuarios", "visualizar");
  if (erro) return erro;
  const usuarios = await all(
    context.env.DB,
    "SELECT id, nome, setor_id, login, admin, deve_trocar_senha FROM usuarios ORDER BY id"
  );
  for (const usuario of usuarios) {
    usuario.grupos = await carregarGruposDoUsuario(context.env.DB, usuario.id);
  }
  return json(usuarios);
}

export async function onRequestPost(context) {
  const { usuario, erro } = await exigirPermissao(context, "usuarios", "inserir");
  if (erro) return erro;
  const body = await context.request.json();
  if (!body.nome || !body.setor_id || !body.login || !body.senha) {
    return error("Campos obrigatórios: nome, setor_id, login, senha");
  }
  if (body.admin && usuario.admin !== 1) {
    return error("Apenas administradores podem conceder admin a um usuário.", 403);
  }
  const login = String(body.login).toLowerCase();
  if (!validarFormatoLogin(login)) {
    return error(
      "Login inválido: use apenas letras e números, sem espaços, pontos ou caracteres especiais"
    );
  }
  const existente = await first(context.env.DB, "SELECT id FROM usuarios WHERE login = ?", login);
  if (existente) {
    return error("Já existe um usuário com esse login");
  }
  const grupos = Array.isArray(body.grupos) ? body.grupos : [];
  if (!(await validarGruposExistem(context.env.DB, grupos))) {
    return error("Um ou mais grupos informados não existem.");
  }
  if (grupos.length > 0 && usuario.admin !== 1) {
    return error("Apenas administradores podem atribuir grupos a um usuário.", 403);
  }
  const senhaHash = await hashSenha(body.senha);
  const admin = body.admin ? 1 : 0;
  const resultado = await run(
    context.env.DB,
    "INSERT INTO usuarios (nome, setor_id, login, senha_hash, admin, deve_trocar_senha) VALUES (?, ?, ?, ?, ?, 1)",
    body.nome,
    body.setor_id,
    login,
    senhaHash,
    admin
  );
  const novoId = resultado.meta.last_row_id;
  for (const grupoId of grupos) {
    await run(
      context.env.DB,
      "INSERT INTO usuario_grupos (usuario_id, grupo_id) VALUES (?, ?)",
      novoId,
      grupoId
    );
  }
  const novo = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login, admin, deve_trocar_senha FROM usuarios WHERE id = ?",
    novoId
  );
  novo.grupos = grupos;
  return json(novo, 201);
}
```

`body.admin && usuario.admin !== 1` gates the admin field, on top of
the ordinary `usuarios.inserir` check every other field already went
through — a group with `usuarios.inserir` can create ordinary users freely,
but can never mint a new admin unless the caller creating them is already
one. The SAME isolation applies to `grupos` (added after a whole-branch
review caught the gap): a non-empty `grupos` array on creation also requires
the caller to already be admin — otherwise a group holding only
`usuarios.visualizar`+`inserir` could enumerate every group via `GET
/api/grupos` (Task 8's one open exception) and mint a brand-new user
pre-loaded into the most privileged group it found, which defeats the
permission-group model exactly the way an unguarded `admin` field would.
`validarGruposExistem` runs before the `INSERT INTO usuarios` — a
bad `grupo_id` is rejected whole, never partially applied.

- [ ] **Step 2: Replace `functions/api/usuarios/[id].js`**

```js
import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { hashSenha, validarFormatoLogin } from "../../_lib/auth.js";
import { exigirPermissao } from "../../_lib/permissoes.js";

async function carregarGruposDoUsuario(db, usuarioId) {
  const linhas = await all(db, "SELECT grupo_id FROM usuario_grupos WHERE usuario_id = ?", usuarioId);
  return linhas.map((l) => l.grupo_id);
}

async function validarGruposExistem(db, grupos) {
  if (grupos.length === 0) return true;
  const placeholders = grupos.map(() => "?").join(", ");
  const validos = await all(db, `SELECT id FROM grupos_permissao WHERE id IN (${placeholders})`, ...grupos);
  return validos.length === new Set(grupos).size;
}

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "usuarios", "visualizar");
  if (erro) return erro;
  const usuario = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login, admin, deve_trocar_senha FROM usuarios WHERE id = ?",
    context.params.id
  );
  if (!usuario) return error("Não encontrado", 404);
  usuario.grupos = await carregarGruposDoUsuario(context.env.DB, usuario.id);
  return json(usuario);
}

export async function onRequestPut(context) {
  const { usuario, erro } = await exigirPermissao(context, "usuarios", "editar");
  if (erro) return erro;
  const body = await context.request.json();

  if (body.admin !== undefined) {
    const alvo = await first(context.env.DB, "SELECT admin FROM usuarios WHERE id = ?", context.params.id);
    if (!alvo) return error("Não encontrado", 404);
    const novoAdmin = body.admin ? 1 : 0;
    if (novoAdmin !== alvo.admin && usuario.admin !== 1) {
      return error("Apenas administradores podem alterar o status de administrador de um usuário.", 403);
    }
  }

  const colunas = ["nome", "setor_id"].filter((c) => body[c] !== undefined);
  const valores = colunas.map((c) => body[c]);

  let login = null;
  if (body.login !== undefined) {
    login = String(body.login).toLowerCase();
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
    colunas.push("login");
    valores.push(login);
  }

  if (body.senha !== undefined && body.senha !== "") {
    const senhaHash = await hashSenha(body.senha);
    colunas.push("senha_hash", "deve_trocar_senha");
    valores.push(senhaHash, 1);
  }

  if (body.admin !== undefined) {
    colunas.push("admin");
    valores.push(body.admin ? 1 : 0);
  }

  if (Array.isArray(body.grupos)) {
    if (!(await validarGruposExistem(context.env.DB, body.grupos))) {
      return error("Um ou mais grupos informados não existem.");
    }
    const gruposAtuais = await carregarGruposDoUsuario(context.env.DB, context.params.id);
    const mudouGrupos =
      gruposAtuais.length !== body.grupos.length ||
      gruposAtuais.some((g) => !body.grupos.includes(g));
    if (mudouGrupos && usuario.admin !== 1) {
      return error("Apenas administradores podem alterar os grupos de um usuário.", 403);
    }
  }

  if (colunas.length === 0 && body.grupos === undefined) {
    return error("Nenhum campo para atualizar");
  }

  if (colunas.length > 0) {
    const set = colunas.map((c) => `${c} = ?`).join(", ");
    await run(context.env.DB, `UPDATE usuarios SET ${set} WHERE id = ?`, ...valores, context.params.id);
  }

  if (Array.isArray(body.grupos)) {
    await run(context.env.DB, "DELETE FROM usuario_grupos WHERE usuario_id = ?", context.params.id);
    for (const grupoId of body.grupos) {
      await run(
        context.env.DB,
        "INSERT INTO usuario_grupos (usuario_id, grupo_id) VALUES (?, ?)",
        context.params.id,
        grupoId
      );
    }
  }

  const atualizado = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login, admin, deve_trocar_senha FROM usuarios WHERE id = ?",
    context.params.id
  );
  if (!atualizado) return error("Não encontrado", 404);
  atualizado.grupos = await carregarGruposDoUsuario(context.env.DB, context.params.id);
  return json(atualizado);
}

export async function onRequestDelete(context) {
  const { erro } = await exigirPermissao(context, "usuarios", "excluir");
  if (erro) return erro;
  await run(context.env.DB, "DELETE FROM usuario_grupos WHERE usuario_id = ?", context.params.id);
  await run(context.env.DB, "DELETE FROM usuarios WHERE id = ?", context.params.id);
  return json({ ok: true });
}
```

- [ ] **Step 3: Manually verify against the local dev server**

You'll need an authenticated admin to test this (permission-gated end to
end) — the real admin user (`felipe`) doesn't exist until Task 9's data
reset, so for THIS task's verification only, temporarily grant `ana`
admin directly in the local D1 (undone at the end of this step, since
Task 9 is what actually establishes the real admin):

```bash
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 1 WHERE login = 'ana'"
TOKEN=$(curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"novaSenha123\"}" | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).token))")
curl -s -X POST http://localhost:8788/api/usuarios -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"nome\":\"Teste Silva\",\"setor_id\":1,\"login\":\"testesilva\",\"senha\":\"minhasenha\"}"
curl -s http://localhost:8788/api/usuarios -H "Authorization: Bearer $TOKEN"
```
Expected: the created user has no `senha_hash` field, has
`"deve_trocar_senha":1`, and the list confirms it. Verify the new user can
actually log in with the admin-chosen password:
```bash
curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"testesilva\",\"senha\":\"minhasenha\"}"
```
Expected: `200`, `"deve_trocar_senha":1`.

Now confirm the admin-escalation guard: give a SECOND user only `usuarios.editar`/`inserir` (no admin) via a group, and confirm they can edit ordinary fields but not touch `admin`:
```bash
wrangler d1 execute workflow_zagonel_db --local --command="INSERT INTO grupos_permissao (nome) VALUES ('Teste - Usuarios CRUD')"
wrangler d1 execute workflow_zagonel_db --local --command="INSERT INTO permissoes (grupo_id, tela, visualizar, inserir, editar, excluir) VALUES (last_insert_rowid(), 'usuarios', 1, 1, 1, 0)"
wrangler d1 execute workflow_zagonel_db --local --command="INSERT INTO usuario_grupos (usuario_id, grupo_id) SELECT id, (SELECT id FROM grupos_permissao WHERE nome = 'Teste - Usuarios CRUD') FROM usuarios WHERE login = 'bruno'"
TOKEN2=$(curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"bruno\",\"senha\":\"1234bruno\"}" | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).token))")
curl -s -X PUT http://localhost:8788/api/usuarios/<id-do-teste-silva> -H "content-type: application/json" -H "Authorization: Bearer $TOKEN2" -d "{\"nome\":\"Teste Silva Renomeado\"}" -w "\nHTTP:%{http_code}\n"
curl -s -X PUT http://localhost:8788/api/usuarios/<id-do-teste-silva> -H "content-type: application/json" -H "Authorization: Bearer $TOKEN2" -d "{\"admin\":0}" -w "\nHTTP:%{http_code}\n"
curl -s -X PUT http://localhost:8788/api/usuarios/<id-do-teste-silva> -H "content-type: application/json" -H "Authorization: Bearer $TOKEN2" -d "{\"admin\":1}" -w "\nHTTP:%{http_code}\n"
curl -s -X POST http://localhost:8788/api/usuarios -H "content-type: application/json" -H "Authorization: Bearer $TOKEN2" -d "{\"nome\":\"Outro Admin\",\"setor_id\":1,\"login\":\"outroadmin\",\"senha\":\"x\",\"admin\":1}" -w "\nHTTP:%{http_code}\n"
```
Expected: first call `200` (renaming is an ordinary edit, `usuarios.editar` is enough); second call `200` — `testesilva` is already non-admin, so redundantly resending `admin:0` (exactly what the frontend's generic form always does, whether or not the checkbox was touched — see Task 12) is NOT a real change and must not 403 a non-admin editor; third call `403` (this one IS a real change, `0` → `1`, so bruno lacks the standing to make it even with full `usuarios.editar`); fourth call `403` for the analogous reason on creation. Then confirm an invalid `grupo_id` is rejected whole:
```bash
curl -s -X PUT http://localhost:8788/api/usuarios/<id-do-teste-silva> -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"grupos\":[999999]}" -w "\nHTTP:%{http_code}\n"
```
Expected: `400` "Um ou mais grupos informados não existem." — confirm via a follow-up `GET` that `testesilva`'s `grupos` is unchanged (not partially cleared).

Clean up and restore `ana`'s temporary admin flag:
```bash
curl -s -X DELETE http://localhost:8788/api/usuarios/<id-do-teste-silva> -H "Authorization: Bearer $TOKEN"
wrangler d1 execute workflow_zagonel_db --local --command="DELETE FROM usuario_grupos WHERE usuario_id = (SELECT id FROM usuarios WHERE login = 'bruno')"
wrangler d1 execute workflow_zagonel_db --local --command="DELETE FROM permissoes WHERE grupo_id = (SELECT id FROM grupos_permissao WHERE nome = 'Teste - Usuarios CRUD')"
wrangler d1 execute workflow_zagonel_db --local --command="DELETE FROM grupos_permissao WHERE nome = 'Teste - Usuarios CRUD'"
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 0 WHERE login = 'ana'"
```

- [ ] **Step 4: Commit**

```bash
git add functions/api/usuarios/index.js "functions/api/usuarios/[id].js"
git commit -m "Usuários: permission gates, admin-set password, admin flag, group assignment"
```

---

## Task 6: Permission-gate Etapas and Ações (tela `fluxos`)

**Files:**
- Modify: `functions/api/fluxos/[id]/etapas.js`
- Modify: `functions/api/etapas/[id].js`
- Modify: `functions/api/etapas/[id]/acoes.js`
- Modify: `functions/api/acoes/[id].js`

**Interfaces:**
- Consumes: `exigirPermissao` (Task 3), all as `tela: "fluxos"`.

- [ ] **Step 1: Replace `functions/api/fluxos/[id]/etapas.js`**

```js
import { all, first, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { exigirPermissao } from "../../../_lib/permissoes.js";

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "visualizar");
  if (erro) return erro;
  const etapas = await all(
    context.env.DB,
    "SELECT * FROM etapas WHERE fluxo_template_id = ? ORDER BY id",
    context.params.id
  );
  return json(etapas);
}

export async function onRequestPost(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "inserir");
  if (erro) return erro;
  const body = await context.request.json();
  if (!body.nome || !body.setor_id || !body.tipo) {
    return error("Campos obrigatórios: nome, setor_id, tipo");
  }
  const resultado = await run(
    context.env.DB,
    `INSERT INTO etapas (fluxo_template_id, nome, setor_id, tipo, eh_inicial, etapa_proxima_id, etapa_proxima_vinculo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    context.params.id,
    body.nome,
    body.setor_id,
    body.tipo,
    body.eh_inicial ? 1 : 0,
    body.etapa_proxima_id ?? null,
    body.etapa_proxima_vinculo ?? null
  );
  const nova = await first(context.env.DB, "SELECT * FROM etapas WHERE id = ?", resultado.meta.last_row_id);
  return json(nova, 201);
}
```

- [ ] **Step 2: Replace `functions/api/etapas/[id].js`**

```js
import { run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { carregarEtapaComAcoes } from "../../_lib/etapas.js";
import { exigirPermissao } from "../../_lib/permissoes.js";

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "visualizar");
  if (erro) return erro;
  const etapa = await carregarEtapaComAcoes(context.env.DB, context.params.id);
  if (!etapa) return error("Não encontrada", 404);
  return json(etapa);
}

export async function onRequestPut(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "editar");
  if (erro) return erro;
  const body = await context.request.json();
  const campos = ["nome", "setor_id", "tipo", "eh_inicial", "etapa_proxima_id", "etapa_proxima_vinculo"];
  const colunas = campos.filter((c) => body[c] !== undefined);
  if (colunas.length === 0) return error("Nenhum campo para atualizar");
  const set = colunas.map((c) => `${c} = ?`).join(", ");
  const valores = colunas.map((c) => body[c]);
  await run(context.env.DB, `UPDATE etapas SET ${set} WHERE id = ?`, ...valores, context.params.id);
  const atualizada = await carregarEtapaComAcoes(context.env.DB, context.params.id);
  if (!atualizada) return error("Não encontrada", 404);
  return json(atualizada);
}

export async function onRequestDelete(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "excluir");
  if (erro) return erro;
  await run(context.env.DB, "DELETE FROM acoes WHERE etapa_id = ?", context.params.id);
  await run(context.env.DB, "DELETE FROM etapas WHERE id = ?", context.params.id);
  return json({ ok: true });
}
```

- [ ] **Step 3: Replace `functions/api/etapas/[id]/acoes.js`**

```js
import { first, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { exigirPermissao } from "../../../_lib/permissoes.js";

export async function onRequestPost(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "inserir");
  if (erro) return erro;
  const body = await context.request.json();
  if (!body.rotulo || !body.setor_destino_id || !body.vinculo) {
    return error("Campos obrigatórios: rotulo, setor_destino_id, vinculo");
  }
  const resultado = await run(
    context.env.DB,
    `INSERT INTO acoes (etapa_id, rotulo, setor_destino_id, vinculo, prerequisito_acao_id)
     VALUES (?, ?, ?, ?, ?)`,
    context.params.id,
    body.rotulo,
    body.setor_destino_id,
    body.vinculo,
    body.prerequisito_acao_id ?? null
  );
  const nova = await first(context.env.DB, "SELECT * FROM acoes WHERE id = ?", resultado.meta.last_row_id);
  return json(nova, 201);
}
```

- [ ] **Step 4: Replace `functions/api/acoes/[id].js`**

```js
import { first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirPermissao } from "../../_lib/permissoes.js";

export async function onRequestPut(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "editar");
  if (erro) return erro;
  const body = await context.request.json();
  const campos = ["rotulo", "setor_destino_id", "vinculo", "prerequisito_acao_id"];
  const colunas = campos.filter((c) => body[c] !== undefined);
  if (colunas.length === 0) return error("Nenhum campo para atualizar");
  const set = colunas.map((c) => `${c} = ?`).join(", ");
  const valores = colunas.map((c) => body[c]);
  await run(context.env.DB, `UPDATE acoes SET ${set} WHERE id = ?`, ...valores, context.params.id);
  const atualizada = await first(context.env.DB, "SELECT * FROM acoes WHERE id = ?", context.params.id);
  if (!atualizada) return error("Não encontrada", 404);
  return json(atualizada);
}

export async function onRequestDelete(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "excluir");
  if (erro) return erro;
  await run(context.env.DB, "DELETE FROM acoes WHERE id = ?", context.params.id);
  return json({ ok: true });
}
```

- [ ] **Step 5: Manually verify against the local dev server**

Reuse the temporary-admin trick from Task 5 (grant `ana` admin, log in,
test, revoke):
```bash
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 1 WHERE login = 'ana'"
TOKEN=$(curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"novaSenha123\"}" | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).token))")
curl -s http://localhost:8788/api/fluxos/1/etapas -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:8788/api/fluxos/1/etapas -w "\nHTTP:%{http_code}\n"
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 0 WHERE login = 'ana'"
```
Expected: first call (with token) returns the seeded etapas; second call
(no token) returns `401`.

- [ ] **Step 6: Commit**

```bash
git add "functions/api/fluxos/[id]" "functions/api/etapas" "functions/api/acoes"
git commit -m "Permission-gate Etapas and Ações endpoints"
```

---

## Task 7: Chamados — permission gates, token-derived scope and identity

This is the most involved backend task: `GET /api/chamados` stops trusting
a client-supplied `?setor_id=` and instead derives scope from the
authenticated user (all chamados if admin or `ver_todos_setores`, else only
their own `setor_id`); `POST /api/chamados` and `POST /api/chamados/:id/decisao`
stop trusting a client-supplied `solicitante_id`/`usuario_id` and use the
authenticated user's own id instead. `GET /api/chamados/:id/arvore` and
`GET/POST /api/chamados/:id/comentarios` are deliberately left open to any
authenticated user — no specific permission — per the design's explicit
"every user can view the mãe tree as a viewer" rule.

**Files:**
- Modify: `functions/api/chamados/index.js`
- Modify: `functions/api/chamados/[id].js`
- Modify: `functions/api/chamados/[id]/decisao.js`
- Modify: `functions/api/chamados/[id]/horas.js`
- Modify: `functions/api/chamados/[id]/comentarios.js`
- Modify: `functions/api/chamados/[id]/arvore.js`

**Interfaces:**
- Consumes: `exigirPermissao`/`obterUsuarioDaRequisicao` (Task 3).

- [ ] **Step 1: Replace `functions/api/chamados/index.js`**

```js
import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { carregarEtapaComAcoes } from "../../_lib/etapas.js";
import { criarChamado, avancarFluxo, hojeISO } from "../../_lib/chamados.js";
import { exigirPermissao } from "../../_lib/permissoes.js";

export async function onRequestGet(context) {
  const { usuario, permissoes, erro } = await exigirPermissao(context, "chamados", "visualizar");
  if (erro) return erro;

  const verTodos = usuario.admin === 1 || permissoes.chamados.ver_todos_setores;
  const condicaoSetor = verTodos ? "1 = 1" : "COALESCE(e.setor_id, a.setor_destino_id) = ?";
  const parametros = verTodos ? [] : [usuario.setor_id];

  const chamados = await all(
    context.env.DB,
    `SELECT
       c.*,
       COALESCE(e.setor_id, a.setor_destino_id) AS setor_id,
       COALESCE(e.nome, a.rotulo) AS titulo,
       st.nome AS status_nome
     FROM chamados c
     LEFT JOIN etapas e ON e.id = c.etapa_id
     LEFT JOIN acoes a ON a.id = c.acao_origem_id
     LEFT JOIN status st ON st.id = c.status_id
     WHERE ${condicaoSetor}
     ORDER BY c.prazo`,
    ...parametros
  );
  return json(chamados);
}

export async function onRequestPost(context) {
  const { usuario, erro } = await exigirPermissao(context, "chamados", "inserir");
  if (erro) return erro;
  const body = await context.request.json();
  if (!body.fluxo_template_id || !body.etapa_inicial_id) {
    return error("Campos obrigatórios: fluxo_template_id, etapa_inicial_id");
  }
  const etapa = await carregarEtapaComAcoes(context.env.DB, body.etapa_inicial_id);
  if (!etapa || !etapa.eh_inicial || Number(etapa.fluxo_template_id) !== Number(body.fluxo_template_id)) {
    return error("etapa_inicial_id inválido para este fluxo_template_id");
  }
  const solicitante = await first(
    context.env.DB,
    "SELECT u.id, s.empresa_id FROM usuarios u JOIN setores s ON s.id = u.setor_id WHERE u.id = ?",
    usuario.id
  );
  if (!solicitante) return error("solicitante inválido");

  const mae = await criarChamado(context.env.DB, {
    fluxo_template_id: body.fluxo_template_id,
    etapa_id: etapa.id,
    chamado_mae_id: null,
    chamado_pai_id: null,
    empresa_id: solicitante.empresa_id,
    solicitante_id: usuario.id,
    prazo: body.prazo ?? null,
  });

  const hoje = hojeISO();
  await run(
    context.env.DB,
    "UPDATE chamados SET status_id = (SELECT id FROM status WHERE nome = 'finalizado'), data_finalizacao = ? WHERE id = ?",
    hoje,
    mae.id
  );
  const maeFinalizada = { ...mae, data_finalizacao: hoje };

  const criados = await avancarFluxo(context.env.DB, maeFinalizada, etapa, {});
  return json({ chamado: maeFinalizada, criados }, 201);
}
```

`solicitante_id` is no longer read from the request body — it's always the
authenticated caller's own id now, closing a spoofing gap the old
client-supplied version had.

- [ ] **Step 2: Replace `functions/api/chamados/[id].js`**

```js
import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { chamadoComDetalhes, hojeISO, aplicarCascataAtraso, computarBloqueado } from "../../_lib/chamados.js";
import { exigirPermissao } from "../../_lib/permissoes.js";

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "chamados", "visualizar");
  if (erro) return erro;
  const chamado = await chamadoComDetalhes(context.env.DB, context.params.id);
  if (!chamado) return error("Não encontrado", 404);
  return json(chamado);
}

export async function onRequestPut(context) {
  const { erro } = await exigirPermissao(context, "chamados", "editar");
  if (erro) return erro;
  const body = await context.request.json();
  const camposPermitidos = ["status_id", "responsavel_id", "prazo"];
  const colunas = camposPermitidos.filter((c) => body[c] !== undefined);
  if (colunas.length === 0) return error("Nenhum campo para atualizar");

  const set = colunas.map((c) => `${c} = ?`).join(", ");
  const valores = colunas.map((c) => body[c]);
  const hoje = hojeISO();

  if (body.status_id !== undefined) {
    const statusRow = await first(context.env.DB, "SELECT nome FROM status WHERE id = ?", body.status_id);
    if (statusRow && statusRow.nome === "finalizado") {
      const chamadoAtual = await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", context.params.id);
      if (!chamadoAtual) return error("Não encontrado", 404);
      if (await computarBloqueado(context.env.DB, chamadoAtual)) {
        return error("Não é possível finalizar: chamado bloqueado aguardando pré-requisito.", 409);
      }
      await run(
        context.env.DB,
        `UPDATE chamados SET ${set}, data_finalizacao = COALESCE(data_finalizacao, ?) WHERE id = ?`,
        ...valores,
        hoje,
        context.params.id
      );
    } else {
      await run(context.env.DB, `UPDATE chamados SET ${set} WHERE id = ?`, ...valores, context.params.id);
    }
  } else {
    await run(context.env.DB, `UPDATE chamados SET ${set} WHERE id = ?`, ...valores, context.params.id);
  }

  const atualizado = await chamadoComDetalhes(context.env.DB, context.params.id);
  if (!atualizado) return error("Não encontrado", 404);

  if (atualizado.status_nome === "finalizado" && atualizado.data_finalizacao === hoje) {
    await aplicarCascataAtraso(context.env.DB, atualizado, hoje);
  }

  return json(atualizado);
}

async function coletarSubarvore(db, chamadoId) {
  const ids = [Number(chamadoId)];
  const filhos = await all(db, "SELECT id FROM chamados WHERE chamado_pai_id = ?", chamadoId);
  for (const filho of filhos) {
    ids.push(...(await coletarSubarvore(db, filho.id)));
  }
  return ids;
}

export async function onRequestDelete(context) {
  const { erro } = await exigirPermissao(context, "chamados", "excluir");
  if (erro) return erro;
  const ids = await coletarSubarvore(context.env.DB, context.params.id);
  // ponytail: coletarSubarvore returns ids parent-first (preorder); chamados.chamado_mae_id
  // and chamado_pai_id are self-referencing FKs enforced by D1, so a parent row can't be
  // deleted while a descendant still points at it. Deleting in reverse order guarantees every
  // descendant is gone before its ancestor's row is removed (reverse of a preorder walk always
  // puts descendants before ancestors), with no other change to the collection logic.
  for (const chamadoId of [...ids].reverse()) {
    await run(context.env.DB, "DELETE FROM apontamentos_horas WHERE chamado_id = ?", chamadoId);
    await run(context.env.DB, "DELETE FROM comentarios WHERE chamado_id = ?", chamadoId);
    await run(context.env.DB, "DELETE FROM chamados WHERE id = ?", chamadoId);
  }
  return json({ ok: true, excluidos: ids });
}
```

- [ ] **Step 3: Replace `functions/api/chamados/[id]/decisao.js`**

```js
import { run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { carregarEtapaComAcoes } from "../../../_lib/etapas.js";
import { exigirPermissao } from "../../../_lib/permissoes.js";
import {
  chamadoComDetalhes,
  finalizarComCascata,
  avancarFluxo,
  aplicarCascataAtraso,
  hojeISO,
} from "../../../_lib/chamados.js";

export async function onRequestPost(context) {
  const { usuario, erro } = await exigirPermissao(context, "chamados", "editar");
  if (erro) return erro;
  const body = await context.request.json();
  if (body.decisao !== "aprovado" && body.decisao !== "reprovado") {
    return error("Campo 'decisao' deve ser 'aprovado' ou 'reprovado'");
  }
  const chamado = await chamadoComDetalhes(context.env.DB, context.params.id);
  if (!chamado) return error("Não encontrado", 404);
  if (!chamado.etapa_id || chamado.etapa_tipo !== "aprovacao") {
    return error("Este chamado não é uma etapa de aprovação");
  }

  const hoje = hojeISO();

  if (body.decisao === "reprovado") {
    if (!body.justificativa) return error("Justificativa é obrigatória ao reprovar");
    await run(
      context.env.DB,
      `INSERT INTO comentarios (chamado_id, usuario_id, data, texto, eh_justificativa)
       VALUES (?, ?, ?, ?, 1)`,
      chamado.id,
      usuario.id,
      hoje,
      body.justificativa
    );
    await finalizarComCascata(context.env.DB, chamado.id, { hoje, resultadoOrigem: "reprovado" });
    const atualizado = await chamadoComDetalhes(context.env.DB, chamado.id);
    await aplicarCascataAtraso(context.env.DB, atualizado, hoje);
    return json({ chamado: atualizado, criados: [] });
  }

  await run(
    context.env.DB,
    `UPDATE chamados
     SET status_id = (SELECT id FROM status WHERE nome = 'finalizado'),
         resultado = 'aprovado',
         data_finalizacao = COALESCE(data_finalizacao, ?)
     WHERE id = ?`,
    hoje,
    chamado.id
  );
  const atualizado = await chamadoComDetalhes(context.env.DB, chamado.id);
  const etapa = await carregarEtapaComAcoes(context.env.DB, chamado.etapa_id);
  const criados = await avancarFluxo(context.env.DB, atualizado, etapa, body.acoes ?? {});
  await aplicarCascataAtraso(context.env.DB, atualizado, hoje);
  return json({ chamado: atualizado, criados });
}
```

`usuario_id` for the justificativa comment is now the authenticated caller
(`usuario.id`), not a client-supplied value.

- [ ] **Step 4: Replace `functions/api/chamados/[id]/horas.js`**

```js
import { all, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { exigirPermissao } from "../../../_lib/permissoes.js";

async function resumoHoras(db, chamadoId) {
  const lancamentos = await all(
    db,
    `SELECT h.*, u.nome AS usuario_nome
     FROM apontamentos_horas h
     JOIN usuarios u ON u.id = h.usuario_id
     WHERE h.chamado_id = ?
     ORDER BY h.data`,
    chamadoId
  );
  const total_horas = lancamentos.reduce((soma, l) => soma + l.horas, 0);
  return { lancamentos, total_horas };
}

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "chamados", "visualizar");
  if (erro) return erro;
  return json(await resumoHoras(context.env.DB, context.params.id));
}

export async function onRequestPost(context) {
  const { usuario, erro } = await exigirPermissao(context, "chamados", "inserir");
  if (erro) return erro;
  const body = await context.request.json();
  if (!body.data || !body.horas) {
    return error("Campos obrigatórios: data, horas");
  }
  await run(
    context.env.DB,
    `INSERT INTO apontamentos_horas (chamado_id, usuario_id, data, horas, observacao)
     VALUES (?, ?, ?, ?, ?)`,
    context.params.id,
    usuario.id,
    body.data,
    body.horas,
    body.observacao ?? null
  );
  return json(await resumoHoras(context.env.DB, context.params.id), 201);
}
```

- [ ] **Step 5: Replace `functions/api/chamados/[id]/comentarios.js`**

Only requires a valid session — no `chamados` permission check, per this
plan's explicit exception:

```js
import { all, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { hojeISO } from "../../../_lib/chamados.js";
import { obterUsuarioDaRequisicao } from "../../../_lib/permissoes.js";

async function listarComentarios(db, chamadoId) {
  return all(
    db,
    `SELECT c.*, u.nome AS usuario_nome
     FROM comentarios c
     LEFT JOIN usuarios u ON u.id = c.usuario_id
     WHERE c.chamado_id = ?
     ORDER BY c.id`,
    chamadoId
  );
}

export async function onRequestGet(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);
  return json(await listarComentarios(context.env.DB, context.params.id));
}

export async function onRequestPost(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);
  const body = await context.request.json();
  if (!body.texto) {
    return error("Campo obrigatório: texto");
  }
  await run(
    context.env.DB,
    `INSERT INTO comentarios (chamado_id, usuario_id, data, texto, eh_justificativa)
     VALUES (?, ?, ?, ?, 0)`,
    context.params.id,
    usuario.id,
    hojeISO(),
    body.texto
  );
  return json(await listarComentarios(context.env.DB, context.params.id), 201);
}
```

- [ ] **Step 6: Replace `functions/api/chamados/[id]/arvore.js`**

Also only requires a valid session, no specific permission:

```js
import { all, first } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { obterUsuarioDaRequisicao } from "../../../_lib/permissoes.js";

export async function onRequestGet(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);

  const raiz = await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", context.params.id);
  if (!raiz) return error("Não encontrado", 404);
  const raizId = raiz.chamado_mae_id ?? raiz.id;

  const nos = await all(
    context.env.DB,
    `SELECT
       c.*,
       COALESCE(e.setor_id, a.setor_destino_id) AS setor_id,
       s.nome AS setor_nome,
       COALESCE(e.nome, a.rotulo) AS titulo,
       st.nome AS status_nome
     FROM chamados c
     LEFT JOIN etapas e ON e.id = c.etapa_id
     LEFT JOIN acoes a ON a.id = c.acao_origem_id
     LEFT JOIN setores s ON s.id = COALESCE(e.setor_id, a.setor_destino_id)
     LEFT JOIN status st ON st.id = c.status_id
     WHERE c.id = ? OR c.chamado_mae_id = ?
     ORDER BY c.id`,
    raizId,
    raizId
  );
  return json(nos);
}
```

- [ ] **Step 7: Manually verify against the local dev server**

Grant `ana` admin temporarily again (same pattern as Tasks 5-6):
```bash
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 1 WHERE login = 'ana'"
TOKEN=$(curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"novaSenha123\"}" | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).token))")
curl -s http://localhost:8788/api/chamados -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:8788/api/chamados -w "\nHTTP:%{http_code}\n"
```
Expected: with token, returns all chamados (ana is admin, sees everything
regardless of setor); without token, `401`. Confirm comentarios/arvore stay
open to a NON-admin, non-permissioned session too — log in as a fresh user
with zero permissions (e.g. reset `ana`'s admin flag first) and confirm:
```bash
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 0 WHERE login = 'ana'"
TOKEN2=$(curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"novaSenha123\"}" | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).token))")
curl -s http://localhost:8788/api/chamados/1/arvore -H "Authorization: Bearer $TOKEN2" -w "\nHTTP:%{http_code}\n"
curl -s http://localhost:8788/api/chamados -H "Authorization: Bearer $TOKEN2" -w "\nHTTP:%{http_code}\n"
```
Expected: `/arvore` (with token, no permission) still returns `200`; the
plain `/chamados` list (with token, no `chamados.visualizar` permission)
returns `403`.

- [ ] **Step 8: Commit**

```bash
git add functions/api/chamados
git commit -m "Chamados: permission gates, token-derived scope and identity"
```

---

## Task 8: Grupos de Permissão — backend (admin-only)

Managing permission groups themselves is restricted to administrators —
it's deliberately NOT one of the six granular telas (a group could never be
configured to grant itself group-management rights, since that
configuration surface doesn't exist for groups to reach).

**Exceção pontual:** o cadastro de Usuários (tela `usuarios`) precisa listar
os grupos existentes para popular o seletor múltiplo "Grupos" (Task 12) —
mas essa tela pode ser aberta por quem tem `usuarios.visualizar` sem ser
admin. Por isso `GET /api/grupos` (a listagem simples, só `id`+`nome`) usa
`exigirPermissao(context, "usuarios", "visualizar")` em vez de
`exigirAdmin`; ele já cobre admin de qualquer forma (admin passa em
qualquer `exigirPermissao`). Criar/renomear/excluir grupos e ver ou salvar a
matriz de permissões de um grupo (`POST /api/grupos`, tudo em
`/api/grupos/:id` e `/api/grupos/:id/permissoes`) continuam estritamente
`exigirAdmin` — só a listagem básica é compartilhada.

**Files:**
- Create: `functions/api/grupos/index.js`
- Create: `functions/api/grupos/[id].js`
- Create: `functions/api/grupos/[id]/permissoes.js`

**Interfaces:**
- Consumes: `exigirAdmin` (Task 3), `exigirPermissao` (Task 3).
- Produces (HTTP): `GET /api/grupos` (lista simples `{id, nome}`, liberado para quem tem `usuarios.visualizar` — não exige admin), `POST /api/grupos` (admin-only), `GET/PUT/DELETE /api/grupos/:id` (admin-only; GET/PUT embed a `permissoes` matrix: `{empresas: {visualizar,inserir,editar,excluir}, ..., chamados: {...,ver_todos_setores}}`, always all 6 telas present even if a grupo has no rows for some yet), `PUT /api/grupos/:id/permissoes` (admin-only; body is that same matrix shape; upserts one row per tela).

- [ ] **Step 1: Write `functions/api/grupos/index.js`**

```js
import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirAdmin, exigirPermissao } from "../../_lib/permissoes.js";

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "usuarios", "visualizar");
  if (erro) return erro;
  return json(await all(context.env.DB, "SELECT * FROM grupos_permissao ORDER BY id"));
}

export async function onRequestPost(context) {
  const { erro } = await exigirAdmin(context);
  if (erro) return erro;
  const body = await context.request.json();
  if (!body.nome) return error("Campo obrigatório: nome");
  const resultado = await run(context.env.DB, "INSERT INTO grupos_permissao (nome) VALUES (?)", body.nome);
  const novo = await first(
    context.env.DB,
    "SELECT * FROM grupos_permissao WHERE id = ?",
    resultado.meta.last_row_id
  );
  return json(novo, 201);
}
```

- [ ] **Step 2: Write `functions/api/grupos/[id].js`**

```js
import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirAdmin } from "../../_lib/permissoes.js";

const TELAS = ["empresas", "setores", "usuarios", "status", "fluxos", "chamados"];

async function carregarMatrizPermissoes(db, grupoId) {
  const linhas = await all(db, "SELECT * FROM permissoes WHERE grupo_id = ?", grupoId);
  const matriz = {};
  for (const tela of TELAS) {
    matriz[tela] = { visualizar: false, inserir: false, editar: false, excluir: false };
  }
  matriz.chamados.ver_todos_setores = false;
  for (const linha of linhas) {
    matriz[linha.tela] = {
      visualizar: linha.visualizar === 1,
      inserir: linha.inserir === 1,
      editar: linha.editar === 1,
      excluir: linha.excluir === 1,
    };
    if (linha.tela === "chamados") {
      matriz.chamados.ver_todos_setores = linha.ver_todos_setores === 1;
    }
  }
  return matriz;
}

export async function onRequestGet(context) {
  const { erro } = await exigirAdmin(context);
  if (erro) return erro;
  const grupo = await first(context.env.DB, "SELECT * FROM grupos_permissao WHERE id = ?", context.params.id);
  if (!grupo) return error("Não encontrado", 404);
  grupo.permissoes = await carregarMatrizPermissoes(context.env.DB, grupo.id);
  return json(grupo);
}

export async function onRequestPut(context) {
  const { erro } = await exigirAdmin(context);
  if (erro) return erro;
  const body = await context.request.json();
  if (!body.nome) return error("Campo obrigatório: nome");
  await run(context.env.DB, "UPDATE grupos_permissao SET nome = ? WHERE id = ?", body.nome, context.params.id);
  const atualizado = await first(context.env.DB, "SELECT * FROM grupos_permissao WHERE id = ?", context.params.id);
  if (!atualizado) return error("Não encontrado", 404);
  atualizado.permissoes = await carregarMatrizPermissoes(context.env.DB, atualizado.id);
  return json(atualizado);
}

export async function onRequestDelete(context) {
  const { erro } = await exigirAdmin(context);
  if (erro) return erro;
  await run(context.env.DB, "DELETE FROM usuario_grupos WHERE grupo_id = ?", context.params.id);
  await run(context.env.DB, "DELETE FROM permissoes WHERE grupo_id = ?", context.params.id);
  await run(context.env.DB, "DELETE FROM grupos_permissao WHERE id = ?", context.params.id);
  return json({ ok: true });
}
```

- [ ] **Step 3: Write `functions/api/grupos/[id]/permissoes.js`**

```js
import { first, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { exigirAdmin } from "../../../_lib/permissoes.js";

const TELAS = ["empresas", "setores", "usuarios", "status", "fluxos", "chamados"];

export async function onRequestPut(context) {
  const { erro } = await exigirAdmin(context);
  if (erro) return erro;
  const grupo = await first(context.env.DB, "SELECT id FROM grupos_permissao WHERE id = ?", context.params.id);
  if (!grupo) return error("Não encontrado", 404);

  const body = await context.request.json();
  for (const tela of TELAS) {
    const valores = body[tela] ?? {};
    const existente = await first(
      context.env.DB,
      "SELECT id FROM permissoes WHERE grupo_id = ? AND tela = ?",
      context.params.id,
      tela
    );
    const visualizar = valores.visualizar ? 1 : 0;
    const inserir = valores.inserir ? 1 : 0;
    const editar = valores.editar ? 1 : 0;
    const excluir = valores.excluir ? 1 : 0;
    const verTodosSetores = tela === "chamados" && valores.ver_todos_setores ? 1 : 0;
    if (existente) {
      await run(
        context.env.DB,
        `UPDATE permissoes SET visualizar = ?, inserir = ?, editar = ?, excluir = ?, ver_todos_setores = ?
         WHERE id = ?`,
        visualizar,
        inserir,
        editar,
        excluir,
        verTodosSetores,
        existente.id
      );
    } else {
      await run(
        context.env.DB,
        `INSERT INTO permissoes (grupo_id, tela, visualizar, inserir, editar, excluir, ver_todos_setores)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        context.params.id,
        tela,
        visualizar,
        inserir,
        editar,
        excluir,
        verTodosSetores
      );
    }
  }
  return json({ ok: true });
}
```

- [ ] **Step 4: Manually verify against the local dev server**

Grant `ana` admin temporarily again:
```bash
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 1 WHERE login = 'ana'"
TOKEN=$(curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"novaSenha123\"}" | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).token))")
curl -s -X POST http://localhost:8788/api/grupos -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"nome\":\"Projetos - Visualizador\"}"
curl -s http://localhost:8788/api/grupos/1 -H "Authorization: Bearer $TOKEN"
curl -s -X PUT http://localhost:8788/api/grupos/1/permissoes -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"chamados\":{\"visualizar\":true,\"inserir\":true,\"editar\":true,\"excluir\":false,\"ver_todos_setores\":false}}"
curl -s http://localhost:8788/api/grupos/1 -H "Authorization: Bearer $TOKEN"
```
Expected: first call creates the grupo (`id:1`); second shows the matrix
with all telas `false`; third saves chamados' permissions; fourth shows
`chamados: {visualizar:true, inserir:true, editar:true, excluir:false, ver_todos_setores:false}`
with every other tela still all-`false`.

Now confirm the split behavior for a non-admin: grant grupo 1 also
`usuarios.visualizar` and link `ana` to it (this is what lets a
non-admin open the Usuários screen and its Grupos multi-select in Task 12),
then remove her admin flag:
```bash
curl -s -X PUT http://localhost:8788/api/grupos/1/permissoes -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"usuarios\":{\"visualizar\":true,\"inserir\":false,\"editar\":false,\"excluir\":false}}"
wrangler d1 execute workflow_zagonel_db --local --command="INSERT INTO usuario_grupos (usuario_id, grupo_id) SELECT id, 1 FROM usuarios WHERE login = 'ana'"
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 0 WHERE login = 'ana'"
TOKEN2=$(curl -s -X POST http://localhost:8788/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"novaSenha123\"}" | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).token))")
curl -s http://localhost:8788/api/grupos -H "Authorization: Bearer $TOKEN2" -w "\nHTTP:%{http_code}\n"
curl -s http://localhost:8788/api/grupos/1 -H "Authorization: Bearer $TOKEN2" -w "\nHTTP:%{http_code}\n"
curl -s -X POST http://localhost:8788/api/grupos -H "content-type: application/json" -H "Authorization: Bearer $TOKEN2" -d "{\"nome\":\"x\"}" -w "\nHTTP:%{http_code}\n"
```
Expected: first call `200` with the grupo list (the plain listing only
needs `usuarios.visualizar`, not admin); second and third calls `403`
(detail view and creation stay strictly admin-only, even for a user who
can list groups). Clean up the test linkage afterward:
```bash
wrangler d1 execute workflow_zagonel_db --local --command="DELETE FROM usuario_grupos WHERE usuario_id = (SELECT id FROM usuarios WHERE login = 'ana') AND grupo_id = 1"
```

- [ ] **Step 5: Commit**

```bash
git add functions/api/grupos
git commit -m "Add Grupos de Permissão backend (admin-only)"
```

---

## Task 9: Frontend — attach session token to every request, forced password change

**Files:**
- Modify: `api.js` (attach `Authorization` header)
- Modify: `index.js` (redirect to the password-change screen when required)
- Create: `trocar-senha.html`
- Create: `trocar-senha.js`

**Interfaces:**
- Consumes: `getUsuarioLogado`/`setUsuarioLogado` (`auth.js`, unchanged), `api` (`api.js`).
- Produces: every `api(...)` call now sends `Authorization: Bearer <token>` automatically when a logged-in user has one stored.

- [ ] **Step 1: Update `api.js`**

```js
import { getUsuarioLogado } from "./auth.js";

const BASE = "/api";

export async function api(path, options = {}) {
  const usuario = getUsuarioLogado();
  const headers = { "content-type": "application/json" };
  if (usuario?.token) headers.Authorization = `Bearer ${usuario.token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
  return data;
}
```

- [ ] **Step 2: Update `index.js` to redirect based on `deve_trocar_senha`**

Replace the success branch of the submit handler:

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
    window.location.href = usuario.deve_trocar_senha ? "trocar-senha.html" : "chamados.html";
  } catch (e) {
    mensagemErro.textContent = e.message;
    mensagemErro.hidden = false;
  }
});
```

- [ ] **Step 3: Write `trocar-senha.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WorkFlow Zagonel - Trocar Senha</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
</head>
<body>
<main>
  <h1>Trocar senha</h1>
  <p>Esta é sua primeira vez entrando com essa senha, ou ela foi redefinida por um administrador. Escolha uma nova senha para continuar.</p>
  <form class="formulario" id="form-trocar-senha">
    <label>Nova senha
      <input type="password" name="nova_senha" required minlength="4">
    </label>
    <label>Confirmar nova senha
      <input type="password" name="confirmar_senha" required minlength="4">
    </label>
    <button type="submit">Salvar nova senha</button>
    <p id="mensagem-erro" class="erro" hidden></p>
  </form>
</main>
<script type="module" src="trocar-senha.js"></script>
</body>
</html>
```

- [ ] **Step 4: Write `trocar-senha.js`**

```js
import { exigirLogin, getUsuarioLogado, setUsuarioLogado } from "./auth.js";
import { api } from "./api.js";
import { mostrarErro } from "./ui.js";

const usuario = exigirLogin();
if (usuario) {
  document.getElementById("form-trocar-senha").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const mensagemErro = document.getElementById("mensagem-erro");
    mensagemErro.hidden = true;
    const novaSenha = form.elements.nova_senha.value;
    const confirmarSenha = form.elements.confirmar_senha.value;
    if (novaSenha !== confirmarSenha) {
      mensagemErro.textContent = "As senhas digitadas não coincidem.";
      mensagemErro.hidden = false;
      return;
    }
    try {
      await api("/trocar-senha", { method: "POST", body: { nova_senha: novaSenha } });
      setUsuarioLogado({ ...getUsuarioLogado(), deve_trocar_senha: false });
      window.location.href = "chamados.html";
    } catch (e) {
      mostrarErro(mensagemErro, e);
    }
  });
}
```

- [ ] **Step 5: Manually verify in the browser**

With `npm run dev` running, use one of the throwaway users you created and
deleted in earlier tasks' verification instead — or create a fresh
throwaway one via curl (see Task 5's pattern) with `deve_trocar_senha`
implicitly `1`. Log in with it at `http://localhost:8788/` — expected:
redirected straight to `trocar-senha.html` (not `chamados.html`). Submit
mismatched passwords — expected: inline error, no navigation. Submit
matching passwords — expected: redirected to `chamados.html`. Log out and
log back in with the NEW password — expected: this time it goes straight
to `chamados.html` (no forced redirect), confirming `deve_trocar_senha`
was actually cleared server-side.

- [ ] **Step 6: Commit**

```bash
git add api.js index.js trocar-senha.html trocar-senha.js
git commit -m "Attach session token to every API call; add forced password-change screen"
```

---

## Task 10: Frontend — permission-lookup helper, nav hides links the user can't use

**Files:**
- Modify: `auth.js` (add `permissaoDaTela`)
- Modify: `ui.js` (`montarNav` hides Cadastros/Fluxos/Grupos links per permission)

**Interfaces:**
- Produces: `permissaoDaTela(tela) -> {visualizar, inserir, editar, excluir, ver_todos_setores?}` (admin always gets every flag `true`; a logged-out call returns all-`false`). Consumed by `crud-ui.js`, `fluxo.js`, `chamado.js`, `chamados.js`, `cadastros.js`, `grupos.js` in later tasks.

- [ ] **Step 1: Add `permissaoDaTela` to `auth.js`**

Append to the end of the file:

```js
export function permissaoDaTela(tela) {
  const usuario = getUsuarioLogado();
  const vazio = { visualizar: false, inserir: false, editar: false, excluir: false };
  if (!usuario) return vazio;
  if (usuario.admin) {
    return { visualizar: true, inserir: true, editar: true, excluir: true, ver_todos_setores: true };
  }
  return usuario.permissoes?.[tela] ?? vazio;
}
```

- [ ] **Step 2: Update `montarNav` in `ui.js`**

```js
import { logout, permissaoDaTela } from "./auth.js";

export function info(texto) {
  return `<span class="info" title="${texto.replace(/"/g, "&quot;")}">i</span>`;
}

export function mostrarErro(elemento, erro) {
  elemento.textContent = erro && erro.message ? erro.message : String(erro);
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

- [ ] **Step 3: Manually verify in the browser**

With `npm run dev` running, log in as a user with no groups and `admin=0`
(e.g. `ana`, unless you left her temporarily admin from an earlier task's
verification — if so, reset her first:
`wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 0 WHERE login = 'ana'"`).
Expected: the nav shows only "Meus chamados" and "Sair" — no "Cadastros",
"Fluxos", or "Grupos de Permissão" links. Temporarily grant her admin
again and reload any page — expected: all four links appear (including
"Grupos de Permissão"). Reset her admin flag back to `0` when done.

- [ ] **Step 4: Commit**

```bash
git add auth.js ui.js
git commit -m "Add permission lookup helper; nav hides links the user can't use"
```

---

## Task 11: `crud-ui.js` — permission gating and cascading select filter

**Files:**
- Modify: `crud-ui.js` (replace entirely)

**Interfaces:**
- Consumes: `permissaoDaTela` (`auth.js`, Task 10).
- Produces: `renderCrud(container, config)` now requires `config.tela` (used to gate visibility/write access) and supports two new optional `campo` properties: `apenasFiltro: true` (the field exists in the form to help filter another field's options, but is never sent to the backend and never shown as its own table column) and, on the DEPENDENT field, `dependeDe: "<nome do campo pai>"` + `filtrarPor: "<propriedade a comparar>"` (its `opcoesEndpoint` options are filtered to those whose `[filtrarPor]` matches the pai field's current value; starts empty until the pai has a value). Consumed by `cadastros.js` (Task 12) and reused as-is by `fluxo.js`/`grupos.js` (Tasks 13-14) for the plain non-cascading case.

- [ ] **Step 1: Replace `crud-ui.js`**

```js
import { api } from "./api.js";
import { info, mostrarErro } from "./ui.js";
import { permissaoDaTela } from "./auth.js";

function valorExibicao(linha, campo, opcoesFK) {
  if (campo.opcoesEndpoint) {
    const opcoes = opcoesFK[campo.nome] ?? [];
    const alvo = opcoes.find((o) => o.id === linha[campo.nome]);
    return alvo ? alvo.nome : linha[campo.nome];
  }
  return linha[campo.nome] ?? "";
}

function campoInputHtml(campo, opcoesFK) {
  const rotulo = campo.dica ? `${campo.label} ${info(campo.dica)}` : campo.label;
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
  const permissao = permissaoDaTela(config.tela);
  if (!permissao.visualizar) {
    container.innerHTML = `<h2>${config.titulo}</h2><p>Você não tem permissão para visualizar esta tela.</p>`;
    return;
  }

  const opcoesFK = {};
  for (const campo of config.campos) {
    if (campo.opcoesEndpoint) opcoesFK[campo.nome] = await api(campo.opcoesEndpoint);
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
             <button type="submit">Adicionar</button>
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

    // Primeiro os campos "pai": derivam seu valor a partir da linha e
    // disparam o evento de mudança, que popula as opções do campo
    // dependente antes de definirmos o valor dele no passo seguinte.
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
              ${permissao.editar ? `<button type="button" class="btn-editar" data-id="${linha.id}">Editar</button>` : ""}
              ${permissao.excluir ? `<button type="button" class="btn-excluir" data-id="${linha.id}">Excluir</button>` : ""}
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

- [ ] **Step 2: Manually verify against the local dev server (non-cascading case first)**

`cadastros.js` and `fluxo.js` haven't been updated to pass `tela`/the new
field options yet (that's Tasks 12 and 14) — this step only confirms the base
gating logic didn't break anything by temporarily passing `tela` inline in
the browser console. With `npm run dev` running and logged in as an admin
(grant `ana` admin temporarily again), open `cadastros.html`, open the
browser console, and run:
```js
const { renderCrud } = await import("./crud-ui.js");
await renderCrud(document.createElement("div"), { titulo: "Teste", endpoint: "/empresas", tela: "empresas", campos: [{ nome: "nome", label: "Nome", obrigatorio: true }] });
```
Expected: no error thrown (a real visual check happens once Task 12 wires
this into the actual page). Revert `ana`'s admin flag when done.

- [ ] **Step 3: Commit**

```bash
git add crud-ui.js
git commit -m "crud-ui.js: gate write/edit/delete by permission, support cascading select filters"
```

---

## Task 12: `cadastros.js` — wire `tela` into every screen, new Usuário fields

**Files:**
- Modify: `crud-ui.js` (add `checkbox` and `multiselect` field types)
- Modify: `cadastros.js` (replace entirely)

**Interfaces:**
- Consumes: `renderCrud` (`crud-ui.js`, Task 11), `GET /api/grupos` (Task 8 — the plain listing, reachable with `usuarios.visualizar`).
- Produces: two new `campo.tipo` values usable by any `renderCrud` config from now on — `"checkbox"` (renders a checkbox, stores `0`/`1`) and `"multiselect"` (renders a multi-select fed by `opcoesEndpoint`, stores an array of ids). Neither existed before this task; `admin` and `grupos` on the Usuários screen are their first use.

The Usuários screen needed two field shapes `crud-ui.js` didn't support yet
(a checkbox for `admin`, a multi-select for `grupos`), so this task extends
the shared component first, then wires it into `cadastros.js` — the same
"extend the shared piece, then use it" pattern Task 11 itself followed for
`dependeDe`/`filtrarPor`.

- [ ] **Step 1: Extend `crud-ui.js` with `checkbox` and `multiselect` field types**

Apply these changes on top of Task 11's version (only the four touched
functions are shown — everything else in the file stays the same):

```js
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
```

Inside `preencherFormulario`, the second pass (the one that sets every
non-`apenasFiltro` field after the pai/dependente pass) becomes:

```js
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
```

And the submit handler's field-serialization loop becomes:

```js
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
```

Password fields need no special handling here: `usuarios/[id].js` (Task 5)
already ignores `senha` when it arrives as `""` on `PUT`, so a blank
"Senha" field on edit correctly means "keep the current password" with no
extra frontend logic.

- [ ] **Step 2: Replace `cadastros.js`**

```js
import { exigirLogin } from "./auth.js";
import { montarNav, mostrarErro } from "./ui.js";
import { renderCrud } from "./crud-ui.js";

const usuario = exigirLogin();
if (usuario) {
  document.getElementById("nav").replaceWith(montarNav(usuario));
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

`crud-ui.js`'s generic submit loop (Task 11) sends every non-`apenasFiltro`
field on every save, including `admin` — so a `PUT` from this form always
carries `body.admin` (`0` or `1`), whether or not the checkbox was actually
touched. This is safe because `functions/api/usuarios/[id].js` (Task 5) only
requires the caller to already be admin when `body.admin` would actually
CHANGE the target's stored value, not merely because it's present — see
Task 5's `onRequestPut`. A non-admin editor with `usuarios.editar` can still
save an ordinary edit (which redundantly resends the target's current,
unchanged `admin` value) without hitting that gate.

- [ ] **Step 3: Manually verify against the local dev server**

Grant `ana` admin temporarily (undone at the end of this step):
```bash
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 1 WHERE login = 'ana'"
```
With `npm run dev` running, log in as `ana`, open `cadastros.html`, and in
the Usuários section:
1. Pick a value in "Empresa" — confirm "Setor" repopulates with only that
   empresa's setores.
2. Create a user with a "Senha", leave "Administrador" unchecked, select
   one or more "Grupos". Confirm the created row shows the group names
   (not raw ids) in the table and `admin` shows "Não".
3. Click "Editar" on that row — confirm "Empresa" and "Setor" preselect
   correctly (derived from the setor the user already has), "Senha" is
   blank, and "Grupos" shows the previously selected groups highlighted.
4. Save the edit with "Senha" left blank — confirm (via the Network tab
   or a quick `curl .../api/login`) the user can still log in with their
   original password.
5. Check "Administrador" and save — confirm the table now shows "Sim" for
   that row.

Revert `ana`'s admin flag:
```bash
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 0 WHERE login = 'ana'"
```

- [ ] **Step 4: Commit**

```bash
git add crud-ui.js cadastros.js
git commit -m "cadastros.js: pass tela to every screen, add Empresa filter/Senha/Admin/Grupos to Usuários"
```

---

## Task 13: Grupos de Permissão — new screen (admin-only)

This is a custom screen, not built on `renderCrud` — it doesn't map to one
of the six generic telas, and its list-detail-matrix shape (list of
groups, click one to edit its name and its 6×4 permission matrix) doesn't
fit the generic component. It's gated by `usuario?.admin` alone (the same
check `montarNav`, Task 10, already uses to decide whether to show the nav
link), matching the backend's `exigirAdmin` — nothing here goes through
`permissaoDaTela`.

**Files:**
- Create: `grupos.html`
- Create: `grupos.js`

**Interfaces:**
- Consumes: `exigirLogin`, `montarNav`, `mostrarErro`, `info` (existing), `api` (`api.js`), `GET/POST/PUT/DELETE /api/grupos`, `PUT /api/grupos/:id/permissoes` (Task 8).

- [ ] **Step 1: Create `grupos.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel - Grupos de Permissão</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
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

- [ ] **Step 2: Create `grupos.js`**

```js
import { exigirLogin } from "./auth.js";
import { montarNav, mostrarErro, info } from "./ui.js";
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
  document.getElementById("nav").replaceWith(montarNav(usuario));
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
      <button type="submit">Criar</button>
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
          <button type="button" class="btn-selecionar" data-id="${g.id}">${g.nome}</button>
          <button type="button" class="btn-excluir" data-id="${g.id}">Excluir</button>
        </li>`
      )
      .join("");

    lista.querySelectorAll(".btn-selecionar").forEach((btn) =>
      btn.addEventListener("click", () => abrirGrupo(Number(btn.dataset.id)))
    );
    lista.querySelectorAll(".btn-excluir").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!window.confirm("Excluir este grupo? Usuários vinculados perdem as permissões dele.")) return;
        try {
          await api(`/grupos/${btn.dataset.id}`, { method: "DELETE" });
          if (grupoSelecionadoId === Number(btn.dataset.id)) {
            grupoSelecionadoId = null;
            detalhe.innerHTML = "";
          }
          recarregarLista();
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
        <button type="submit">Salvar nome</button>
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
      <button type="button" id="btn-salvar-permissoes">Salvar permissões</button>
    `;

    detalhe.querySelector("#form-renomear").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nome = ev.target.elements.nome.value;
      try {
        await api(`/grupos/${id}`, { method: "PUT", body: { nome } });
        recarregarLista();
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
      recarregarLista();
    } catch (e) {
      mostrarErro(mensagemErro, e);
    }
  });

  await recarregarLista();
}
```

- [ ] **Step 3: Manually verify against the local dev server**

Grant `ana` admin temporarily (undone at the end of this step):
```bash
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 1 WHERE login = 'ana'"
```
With `npm run dev` running, log in as `ana`, click "Grupos de Permissão" in
the nav:
1. Create a group ("Projetos - Visualizador"). Confirm it appears in the
   list.
2. Click it — confirm the matrix shows with every checkbox unchecked and
   "Ver todos os setores" only present on the Chamados row.
3. Check `visualizar` for Chamados and `ver_todos_setores`, click "Salvar
   permissões". Reload the page, reopen the group — confirm both are
   still checked (round-tripped through the backend).
4. Rename the group via "Salvar nome" — confirm the list updates.
5. Excluir the group — confirm it disappears from the list and the
   detail panel clears.

Log in as a non-admin user (or temporarily unset `ana`'s admin flag) and
confirm `grupos.html` shows "Você não tem permissão para acessar esta
tela." instead of the screen, and the nav has no "Grupos de Permissão"
link. Revert `ana`'s admin flag:
```bash
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 0 WHERE login = 'ana'"
```

- [ ] **Step 4: Commit**

```bash
git add grupos.html grupos.js
git commit -m "Add Grupos de Permissão screen (admin-only)"
```

---

## Task 14: `fluxo.js` — permission gating for the custom Etapas/Ações UI

The Fluxos screen has two parts: the `FluxoTemplates` list at the top,
already covered by `renderCrud` (Task 11/12 handle its gating once
`cadastros`-style tasks pass `tela: "fluxos"`), and a custom Etapas/Ações
editor below it that `renderCrud` doesn't touch at all — it's hand-rolled
DOM code. This task gates that hand-rolled part: hide the whole editor if
the user lacks `fluxos.visualizar`, hide "Nova etapa"/"Nova ação" if they
lack `inserir`, hide "Excluir" buttons if they lack `excluir`.

**Files:**
- Modify: `fluxo.html` (wrap the etapas editor in a container `renderCrud`-style gating can target)
- Modify: `fluxo.js` (replace entirely)

**Interfaces:**
- Consumes: `permissaoDaTela` (`auth.js`, Task 10).

- [ ] **Step 1: Update `fluxo.html`**

Wrap the etapas editor (everything below the Fluxos list) in a container
`div` so it can be hidden as a unit:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel - Fluxos</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
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

- [ ] **Step 2: Replace `fluxo.js`**

```js
import { exigirLogin, permissaoDaTela } from "./auth.js";
import { montarNav, info, mostrarErro } from "./ui.js";
import { renderCrud } from "./crud-ui.js";
import { api } from "./api.js";

const usuario = exigirLogin();
let permissaoFluxos = { visualizar: false, inserir: false, editar: false, excluir: false };

if (usuario) {
  document.getElementById("nav").replaceWith(montarNav(usuario));
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
              ${e.tipo === "aprovacao" ? `<button type="button" class="btn-acoes" data-id="${e.id}">Ações</button>` : ""}
              ${permissaoFluxos.excluir ? `<button type="button" class="btn-excluir-etapa" data-id="${e.id}">Excluir</button>` : ""}
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
      <button type="submit">Adicionar etapa</button>
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
            <td>${permissaoFluxos.excluir ? `<button type="button" class="btn-excluir-acao" data-id="${a.id}">Excluir</button>` : ""}</td>
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
      <button type="submit">Adicionar ação</button>
    </form>
    `
        : ""
    }
  `;

  if (permissaoFluxos.excluir) {
    container.querySelectorAll(".btn-excluir-acao").forEach((btn) =>
      btn.addEventListener("click", async () => {
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

Grant `ana` admin temporarily (undone at the end of this step):
```bash
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 1 WHERE login = 'ana'"
```
With `npm run dev` running, log in as `ana`, open `fluxo.html`:
1. As admin (full permission), confirm "Nova etapa"/"Nova ação" forms and
   "Excluir" buttons all appear and still work exactly as before.
2. Remove her admin flag and, without linking her to any group (so
   `fluxos.visualizar` is `false`), reload `fluxo.html` — confirm the
   whole "Editar etapas de um fluxo" block is hidden (the `renderCrud`
   Fluxos list at the top shows its own "sem permissão" message).
3. Grant a group with `fluxos: {visualizar: true, inserir: false, editar: false, excluir: false}`
   and link her to it (reusing the `grupos`/`usuario_grupos` endpoints from
   Tasks 8/5) — reload: confirm the etapas/ações tables show, but "Nova
   etapa", "Nova ação", and every "Excluir" button are gone.
4. Add `inserir: true` to that group's `fluxos` permissions — reload:
   confirm "Nova etapa"/"Nova ação" reappear but "Excluir" buttons stay
   hidden.

Revert `ana`'s admin flag and remove the test group linkage:
```bash
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 1 WHERE login = 'ana'"
wrangler d1 execute workflow_zagonel_db --local --command="DELETE FROM usuario_grupos WHERE usuario_id = (SELECT id FROM usuarios WHERE login = 'ana')"
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 0 WHERE login = 'ana'"
```

- [ ] **Step 4: Commit**

```bash
git add fluxo.html fluxo.js
git commit -m "fluxo.js: gate Etapas/Ações editor by fluxos permission"
```

---

## Task 15: `chamados.js`/`chamado.js`/`novo-chamado.js` — drop client-supplied identity, gate actions by permission

Three cleanups now that the backend (Task 7) derives identity and sector
scope from the session token instead of trusting the client:

1. `chamados.js`'s listing no longer needs (or should send) `?setor_id=` —
   the backend already ignores it and derives scope from the token, so
   sending it is just dead, misleading code.
2. `novo-chamado.js` and `chamado.js` stop sending `solicitante_id`/
   `usuario_id` in request bodies — harmless since the backend ignores
   them now, but leaving them in would misleadingly suggest the client
   still controls that identity.
3. `chamado.js` gates its action controls by `chamados` permission:
   aprovar/reprovar and the status-save button need `editar`, lançar
   horas needs `inserir`, excluir chamado needs `excluir` — comentar stays
   open to any valid session, per the design's explicit exception.

**Files:**
- Modify: `chamados.html` (add `id`s for the gated link and an error slot)
- Modify: `chamados.js` (replace entirely)
- Modify: `novo-chamado.js` (replace entirely)
- Modify: `chamado.js` (replace entirely)

**Interfaces:**
- Consumes: `permissaoDaTela` (`auth.js`, Task 10).

- [ ] **Step 1: Update `chamados.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel - Meus Chamados</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
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

- [ ] **Step 2: Replace `chamados.js`**

```js
import { exigirLogin, permissaoDaTela } from "./auth.js";
import { montarNav, mostrarErro } from "./ui.js";
import { api } from "./api.js";

const usuario = exigirLogin();
if (usuario) {
  document.getElementById("nav").replaceWith(montarNav(usuario));
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

`/chamados` no longer takes `?setor_id=` — the backend derives the scope
(own setor, or every setor if admin/`ver_todos_setores`) from the session
token (Task 7).

- [ ] **Step 3: Replace `novo-chamado.js`**

```js
import { exigirLogin } from "./auth.js";
import { montarNav } from "./ui.js";
import { api } from "./api.js";

const usuario = exigirLogin();
if (usuario) {
  document.getElementById("nav").replaceWith(montarNav(usuario));
  iniciar();
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

- [ ] **Step 4: Replace `chamado.js`**

```js
import { exigirLogin, permissaoDaTela } from "./auth.js";
import { montarNav, info, mostrarErro } from "./ui.js";
import { api } from "./api.js";

const usuario = exigirLogin();
const id = new URLSearchParams(window.location.search).get("id");
const permissaoChamados = usuario
  ? permissaoDaTela("chamados")
  : { visualizar: false, inserir: false, editar: false, excluir: false };

if (usuario && id) {
  document.getElementById("nav").replaceWith(montarNav(usuario));
  iniciar();
}

function iniciar() {
  document.getElementById("link-geral").addEventListener("click", async (ev) => {
    ev.preventDefault();
    const chamado = await api(`/chamados/${id}`);
    window.location.href = `geral.html?id=${chamado.chamado_mae_id ?? chamado.id}`;
  });

  const botaoExcluir = document.getElementById("btn-excluir-chamado");
  if (permissaoChamados.excluir) {
    botaoExcluir.addEventListener("click", async () => {
      if (!window.confirm("Excluir este chamado e toda a sua subárvore? Isso não pode ser desfeito.")) {
        return;
      }
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
    <button type="button" id="btn-aprovar">Aprovar</button>
    <label>Justificativa (obrigatória para reprovar)
      <textarea id="justificativa"></textarea>
    </label>
    <button type="button" id="btn-reprovar">Reprovar</button>
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
    <button type="button" id="btn-salvar-status">Salvar status</button>
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

- [ ] **Step 5: Manually verify against the local dev server**

Grant `ana` admin temporarily (undone at the end of this step):
```bash
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 1 WHERE login = 'ana'"
```
With `npm run dev` running, log in as `ana`:
1. Open `chamados.html` — confirm it still lists chamados (now with no
   `?setor_id=` in the request) and "+ Abrir novo chamado" is visible.
2. Open an existing chamado — confirm aprovar/reprovar (or status-save),
   lançar horas, and excluir chamado all still work exactly as before.
3. Remove her admin flag and, without any group, reload the same chamado
   — confirm "Excluir chamado" and the "Lançar horas" form are gone, the
   avaliação/status block (`#acao`) is empty, but the comentários list
   and the comment form are still there and usable, and "+ Abrir novo
   chamado" is hidden on `chamados.html`.
4. Grant a group with only `chamados: {visualizar: true, inserir: true, editar: false, excluir: false}`
   and link her to it — reload: confirm "Lançar horas" reappears and
   works, but excluir and the avaliação/status controls stay hidden.

Revert `ana` and remove the test group linkage:
```bash
wrangler d1 execute workflow_zagonel_db --local --command="DELETE FROM usuario_grupos WHERE usuario_id = (SELECT id FROM usuarios WHERE login = 'ana')"
wrangler d1 execute workflow_zagonel_db --local --command="UPDATE usuarios SET admin = 1 WHERE login = 'ana'"
```

- [ ] **Step 6: Commit**

```bash
git add chamados.html chamados.js novo-chamado.js chamado.js
git commit -m "Drop client-supplied identity/setor_id, gate chamado actions by permission"
```

---

## Task 16: Production data reset — remote D1 only

**Precondition:** this task must run AFTER the branch containing Tasks
1-15 has been merged to `master` and Cloudflare Pages has deployed it —
`felipe`'s forced password-change flow (`trocar-senha.html`) and the
permission system only exist once that code is live. Running the reset
earlier would just leave production briefly without an admin user; running
it against a still-old deployment risks confusing manual testing. If this
plan is being executed via `superpowers:subagent-driven-development`, this
task runs *after* `finishing-a-development-branch`'s merge step, as a
manual follow-up — flag this to whoever is driving the plan rather than
running it automatically mid-branch.

**Never run this against `--local`.** Local dev D1 deliberately keeps the
seed users (`ana`/`bruno`/`carla`/`diego`/`elisa`) for every other task's
verification steps in this plan — wiping them locally would break future
local testing for no benefit, since local dev data was never meant to
mirror production.

**On `felipe`'s initial password being committed as plaintext below:** a
whole-branch review flagged this and it was discussed explicitly with the
human partner — decision: keep it as a fixed, known value. This is safe
specifically because `exigirPermissao`/`exigirAdmin` (Task 3, amended)
now block every `tela`/`acao`-gated endpoint for any user with
`deve_trocar_senha = 1`, so even a leaked initial password can only be
used to change the password itself, nothing else — and Task 17's smoke
test makes that change the very first thing done with the account, right
after the reset runs. Do not generate a random password here instead
without checking with the human partner first — this was a deliberate,
already-made call, not an oversight.

**Files:**
- Create: `migrations/0005_reset_producao.sql`

**Interfaces:**
- Consumes: the `usuarios`/`chamados`/`comentarios`/`apontamentos_horas`/`usuario_grupos` schema (Tasks 1's `admin`/`deve_trocar_senha` columns must already exist in production, which they do once Task 1's migration was applied to `--remote`).

- [ ] **Step 1: Write the reset script**

Chamados, comentários and apontamentos_horas all cascade through
self-/cross-referencing foreign keys D1 enforces (the same kind of
constraint that required a specific deletion order in the original
chamado-subtree DELETE endpoint) — children are deleted before parents,
and `chamados`' own self-referencing `chamado_mae_id`/`chamado_pai_id`
columns are nulled out before the bulk delete so no row is ever left
pointing at another row still being removed in the same statement:

```sql
-- Reset de dados para iniciar o uso real em produção. Aplicar SOMENTE
-- com --remote - nunca no D1 local, que mantém os usuários semeados para
-- as demais tarefas deste plano.

DELETE FROM apontamentos_horas;
DELETE FROM comentarios;
UPDATE chamados SET chamado_mae_id = NULL, chamado_pai_id = NULL;
DELETE FROM chamados;

DELETE FROM usuario_grupos WHERE usuario_id IN (
  SELECT id FROM usuarios WHERE login IN ('ana', 'bruno', 'carla', 'diego', 'elisa')
);
DELETE FROM usuarios WHERE login IN ('ana', 'bruno', 'carla', 'diego', 'elisa');

-- login 'felipe', senha inicial '1234felipe' (troca obrigatória no 1º
-- login), admin, setor_id 1 ('Comercial' - irrelevante na prática já
-- que admin ignora o filtro por setor, mas o campo é obrigatório).
-- Hash = SHA-256("1234felipe"), no mesmo formato de functions/_lib/auth.js.
INSERT INTO usuarios (nome, setor_id, login, senha_hash, admin, deve_trocar_senha)
VALUES (
  'Felipe',
  1,
  'felipe',
  '0c60f131d742c3aa3da17c0d065ad49121a9f00c4eeeaf87e48598d85f20e846',
  1,
  1
);
```

Save this as `migrations/0005_reset_producao.sql`.

- [ ] **Step 2: Apply it to production only**

```bash
wrangler d1 execute workflow_zagonel_db --remote --file=migrations/0005_reset_producao.sql
```
Expected: success, no FK constraint errors.

- [ ] **Step 3: Verify against production**

```bash
curl -s -X POST https://workflow-zagonel.pages.dev/api/login -H "content-type: application/json" -d "{\"login\":\"felipe\",\"senha\":\"1234felipe\"}"
```
Expected: `200`, body includes `"admin":1`, `"deve_trocar_senha":1`, and a
`permissoes` object where every tela is `true` (admin bypass). Confirm the
old seed users are gone:
```bash
curl -s -X POST https://workflow-zagonel.pages.dev/api/login -H "content-type: application/json" -d "{\"login\":\"ana\",\"senha\":\"1234ana\"}" -w "\nHTTP:%{http_code}\n"
```
Expected: `401` (no such user). Adjust the URL above to match whatever
domain this deployment actually publishes to.

- [ ] **Step 4: Commit**

```bash
git add migrations/0005_reset_producao.sql
git commit -m "Add production data reset: drop seed users, create admin user felipe"
```

---

## Task 17: Final production smoke test (browser, end-to-end)

Every prior task has its own local-dev verification step; this one is the
closing check that the whole feature actually works together, live, the
way leadership will see it. No code changes — this task is purely manual
verification in the deployed site, using the real `felipe` admin account
Task 16 just created. Nothing here should require touching source files;
if it does, that's a real bug this plan missed and needs its own fix
before considering the feature done.

**Files:** none (verification only).

- [ ] **Step 1: First login as `felipe` and forced password change**

In a real browser, open the production URL and log in with
`felipe` / `1234felipe`. Expected: immediately redirected to
`trocar-senha.html` (not `chamados.html`). Set a new password there.
Expected: redirected to `chamados.html` afterward, and a second login
with the old `1234felipe` password now fails while the new one works.

- [ ] **Step 2: Admin sees everything**

Still logged in as `felipe`: confirm the nav shows "Meus chamados",
"Cadastros", "Fluxos", and "Grupos de Permissão". Open `cadastros.html`
and confirm all four sections (Empresas, Setores, Usuários, Status) load
and their forms/Editar/Excluir controls are all present. Open
`fluxo.html` and confirm the Fluxos list and the Etapas/Ações editor both
load with full controls. Open `grupos.html` and confirm it loads (empty
list, since production has no groups yet unless created in this test).

- [ ] **Step 3: Create a real permission group and a real limited user**

As `felipe`, in `grupos.html`, create a group ("Solicitante - Comercial")
with only `chamados: {visualizar: true, inserir: true, editar: false, excluir: false}`
(no `ver_todos_setores`). In `cadastros.html`'s Usuários section, create a
new user (a real one to actually use, or a throwaway to delete after this
test — your call) with Empresa "Zagonel S.A", Setor "Comercial", a login,
an initial password, "Administrador" left unchecked, and "Grupos" set to
the group just created.

- [ ] **Step 4: Confirm the limited user is actually limited**

Log out, log in as the new user, and confirm: forced to `trocar-senha.html`
first; after changing the password, the nav shows only "Meus chamados"
(no "Cadastros", "Fluxos", or "Grupos de Permissão"); `GET /api/chamados`
only returns chamados for the Comercial setor (open the browser's network
tab or just check the rendered list); opening an existing chamado shows
"Lançar horas" but not "Excluir chamado" and not the aprovar/reprovar or
status-save controls; commenting still works.

- [ ] **Step 5: Clean up test artifacts**

If the group/user created in Steps 3-4 were only for this test (not real
users you intend to keep), log back in as `felipe` and delete them via
`cadastros.html`/`grupos.html` — leaving stray test data in production
would just confuse the first real rollout.

No commit for this task (verification only) — if a real defect surfaces
here, open a small follow-up fix, verify it, and commit that instead.
