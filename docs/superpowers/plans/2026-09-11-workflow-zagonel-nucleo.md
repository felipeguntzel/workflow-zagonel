# WorkFlow Zagonel — Núcleo do Motor de Chamados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working, deployable prototype of the ticket/workflow engine
described in `docs/superpowers/specs/2026-09-11-workflow-zagonel-nucleo-design.md`,
running live on Cloudflare (Pages + Functions + D1), starting with the
"Produto Derivado" flow.

**Architecture:** Vanilla HTML/CSS/JS frontend (no framework, no build step),
served as static files by Cloudflare Pages. Backend is Cloudflare Pages
Functions (`/functions/api/**`) reading/writing a Cloudflare D1 (SQLite)
database. Business logic that doesn't need I/O (deadline math, cascade math,
flow-advance resolution, blocked-ticket check) lives in pure JS modules under
`functions/_lib/`, unit-tested with Node's built-in test runner
(`node --test`) — no test framework dependency. HTTP handlers stay thin
wrappers around these pure functions plus D1 queries, verified manually via
`wrangler pages dev` + curl during each task.

**Tech Stack:** Cloudflare Pages, Cloudflare Pages Functions, Cloudflare D1,
`wrangler` CLI (already installed and authenticated), plain JS (ES modules),
Node.js `node:test` + `node:assert/strict` for unit tests. No npm
dependencies are added.

## Global Constraints

- No frontend framework/bundler — plain HTML/CSS/JS only, one `<script type="module">` entry per page.
- No new npm dependencies. Tests use Node's built-in `node:test`.
- D1 binding name is always `DB` (used in `wrangler.toml` and in every Function's `env.DB`).
- Every date stored/compared is an ISO date string `YYYY-MM-DD` (no time component) to keep deadline math simple.
- Every list/detail JSON response uses snake_case keys matching the DB columns in `docs/modules/modelo-dados.md`.
- Every mutating endpoint (`POST`/`PUT`/`DELETE`) returns the updated resource as JSON, status 200/201 (the comentários/horas endpoints return the full updated list instead of a single row, since the frontend always re-renders the whole thread/ledger after posting); validation errors return `{ "error": "<message>" }` with status 400.
- Every relevant field/button in the frontend has a small `<span class="info" title="...">i</span>` (or equivalent) carrying the business-rule tooltip text — plain HTML `title` attribute is sufficient, no JS tooltip library.
- Git: commit after every task (not every step) using the message style already used in this repo, ending with the `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer.

---

## Task 1: Cloudflare D1 database, schema, and seed data

**Files:**
- Create: `wrangler.toml`
- Create: `migrations/0001_schema.sql`
- Create: `migrations/0002_seed.sql`
- Create: `package.json`

**Interfaces:**
- Produces: D1 database bound as `DB`, reachable from any Pages Function via `context.env.DB`. Tables: `empresas, setores, usuarios, status, fluxo_templates, etapas, acoes, chamados, comentarios, apontamentos_horas` — exact columns as below, consumed by every later task.

- [ ] **Step 1: Create the D1 database**

Run:
```bash
wrangler d1 create workflow_zagonel_db
```
Copy the `database_id` printed in the output — you'll need it in Step 2.

- [ ] **Step 2: Write `wrangler.toml`**

```toml
name = "workflow-zagonel"
pages_build_output_dir = "."
compatibility_date = "2026-09-01"

[[d1_databases]]
binding = "DB"
database_name = "workflow_zagonel_db"
database_id = "PASTE_THE_DATABASE_ID_FROM_STEP_1_HERE"
```

- [ ] **Step 3: Write the schema migration**

Create `migrations/0001_schema.sql`:

```sql
CREATE TABLE empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL
);

CREATE TABLE setores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  centro_custo TEXT,
  prazo_padrao_dias INTEGER NOT NULL DEFAULT 5
);

CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  setor_id INTEGER NOT NULL REFERENCES setores(id)
);

CREATE TABLE status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE
);

CREATE TABLE fluxo_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL
);

CREATE TABLE etapas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fluxo_template_id INTEGER NOT NULL REFERENCES fluxo_templates(id),
  nome TEXT NOT NULL,
  setor_id INTEGER NOT NULL REFERENCES setores(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('aprovacao','tarefa')),
  eh_inicial INTEGER NOT NULL DEFAULT 0,
  etapa_proxima_id INTEGER REFERENCES etapas(id),
  etapa_proxima_vinculo TEXT CHECK (etapa_proxima_vinculo IN ('mae','pai'))
);

CREATE TABLE acoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etapa_id INTEGER NOT NULL REFERENCES etapas(id),
  rotulo TEXT NOT NULL,
  setor_destino_id INTEGER NOT NULL REFERENCES setores(id),
  vinculo TEXT NOT NULL CHECK (vinculo IN ('mae','pai')),
  prerequisito_acao_id INTEGER REFERENCES acoes(id)
);

CREATE TABLE chamados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fluxo_template_id INTEGER NOT NULL REFERENCES fluxo_templates(id),
  etapa_id INTEGER REFERENCES etapas(id),
  acao_origem_id INTEGER REFERENCES acoes(id),
  chamado_mae_id INTEGER REFERENCES chamados(id),
  chamado_pai_id INTEGER REFERENCES chamados(id),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  status_id INTEGER NOT NULL REFERENCES status(id),
  resultado TEXT CHECK (resultado IN ('aprovado','reprovado')),
  solicitante_id INTEGER NOT NULL REFERENCES usuarios(id),
  responsavel_id INTEGER REFERENCES usuarios(id),
  data_abertura TEXT NOT NULL,
  prazo TEXT NOT NULL,
  data_finalizacao TEXT
);

CREATE TABLE comentarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chamado_id INTEGER NOT NULL REFERENCES chamados(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  data TEXT NOT NULL,
  texto TEXT NOT NULL,
  eh_justificativa INTEGER NOT NULL DEFAULT 0
);
-- usuario_id is NULL for system-generated comments (e.g. cascading deadline
-- adjustments) — the frontend renders a NULL author as "Sistema".

CREATE TABLE apontamentos_horas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chamado_id INTEGER NOT NULL REFERENCES chamados(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  data TEXT NOT NULL,
  horas REAL NOT NULL,
  observacao TEXT
);
```

- [ ] **Step 4: Write the seed migration**

Create `migrations/0002_seed.sql`:

```sql
INSERT INTO empresas (id, nome) VALUES
  (1, 'Zagonel S.A'),
  (2, 'Zagonel Iluminação');

INSERT INTO status (id, nome) VALUES
  (1, 'previsto'),
  (2, 'em desenvolvimento'),
  (3, 'finalizado'),
  (4, 'suspenso'),
  (5, 'aguardando terceiros');

INSERT INTO setores (id, nome, empresa_id, centro_custo, prazo_padrao_dias) VALUES
  (1, 'Comercial', 1, 'CC-COM', 3),
  (2, 'Projetos', 1, 'CC-PROJ', 5),
  (3, 'Desenvolvimento de Produto', 1, 'CC-DEV', 10),
  (4, 'Engenharia de Produto', 1, 'CC-ENG', 7),
  (5, 'Marketing', 1, 'CC-MKT', 5);

INSERT INTO usuarios (id, nome, setor_id) VALUES
  (1, 'Ana (Comercial)', 1),
  (2, 'Bruno (Projetos)', 2),
  (3, 'Carla (Desenvolvimento)', 3),
  (4, 'Diego (Engenharia)', 4),
  (5, 'Elisa (Marketing)', 5);

INSERT INTO fluxo_templates (id, nome) VALUES (1, 'Produto Derivado');

INSERT INTO etapas (id, fluxo_template_id, nome, setor_id, tipo, eh_inicial, etapa_proxima_id, etapa_proxima_vinculo) VALUES
  (1, 1, 'Solicitação', 1, 'tarefa', 1, 2, 'pai'),
  (2, 1, 'Avaliação Projetos', 2, 'aprovacao', 0, 3, 'mae'),
  (3, 1, 'Desenvolvimento de Produto', 3, 'aprovacao', 0, NULL, NULL);

INSERT INTO acoes (id, etapa_id, rotulo, setor_destino_id, vinculo, prerequisito_acao_id) VALUES
  (1, 3, 'Criar ficha técnica nova', 4, 'mae', NULL),
  (2, 3, 'Criar material gráfico novo', 4, 'mae', NULL),
  (3, 3, 'Criar embalagem nova (caixa/blister)', 5, 'mae', NULL);
```

- [ ] **Step 5: Apply both migrations locally**

Run:
```bash
wrangler d1 execute workflow_zagonel_db --local --file=migrations/0001_schema.sql
wrangler d1 execute workflow_zagonel_db --local --file=migrations/0002_seed.sql
```
Expected: both commands print `🚣 Executed N commands` with no errors.

- [ ] **Step 6: Verify seed data locally**

Run:
```bash
wrangler d1 execute workflow_zagonel_db --local --command="SELECT id, nome FROM setores"
```
Expected: a table with the 5 seeded setores.

- [ ] **Step 7: Create `package.json` for the test runner**

```json
{
  "name": "workflow-zagonel",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test functions/_lib/**/*.test.js",
    "dev": "wrangler pages dev . --d1=DB=workflow_zagonel_db",
    "deploy": "wrangler pages deploy ."
  }
}
```

- [ ] **Step 8: Apply both migrations to the remote (production) database**

Run:
```bash
wrangler d1 execute workflow_zagonel_db --remote --file=migrations/0001_schema.sql
wrangler d1 execute workflow_zagonel_db --remote --file=migrations/0002_seed.sql
```
Expected: same success output as Step 5, this time against the production D1 instance.

- [ ] **Step 9: Commit**

```bash
git add wrangler.toml migrations/ package.json
git commit -m "Add D1 schema, seed data, and wrangler/package config"
```

---

## Task 2: Shared backend libs — `db.js`, `http.js`

**Files:**
- Create: `functions/_lib/db.js`
- Create: `functions/_lib/http.js`
- Test: `functions/_lib/http.test.js`

**Interfaces:**
- Produces: `all(db, sql, ...params) -> Promise<Array<object>>`, `first(db, sql, ...params) -> Promise<object|null>`, `run(db, sql, ...params) -> Promise<object>` (from `db.js`); `json(data, status=200) -> Response`, `error(message, status=400) -> Response` (from `http.js`). Every later Function file imports these.

- [ ] **Step 1: Write `functions/_lib/db.js`**

```js
export function all(db, sql, ...params) {
  return db.prepare(sql).bind(...params).all().then((r) => r.results);
}

export function first(db, sql, ...params) {
  return db.prepare(sql).bind(...params).first();
}

export function run(db, sql, ...params) {
  return db.prepare(sql).bind(...params).run();
}
```

- [ ] **Step 2: Write the failing test for `http.js`**

Create `functions/_lib/http.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { json, error } from "./http.js";

test("json() returns a Response with the given status and JSON body", async () => {
  const res = json({ a: 1 }, 201);
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("content-type"), "application/json");
  assert.deepEqual(await res.json(), { a: 1 });
});

test("json() defaults to status 200", async () => {
  const res = json({ ok: true });
  assert.equal(res.status, 200);
});

test("error() wraps the message and defaults to status 400", async () => {
  const res = error("algo deu errado");
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "algo deu errado" });
});

test("error() accepts a custom status", async () => {
  const res = error("não encontrado", 404);
  assert.equal(res.status, 404);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test functions/_lib/http.test.js`
Expected: FAIL — `Cannot find module './http.js'`

- [ ] **Step 4: Write `functions/_lib/http.js`**

```js
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test functions/_lib/http.test.js`
Expected: PASS, 4 tests passing.

- [ ] **Step 6: Commit**

```bash
git add functions/_lib/db.js functions/_lib/http.js functions/_lib/http.test.js
git commit -m "Add shared D1 and HTTP response helpers"
```

---

## Task 3: Pure logic — deadlines (`prazos.js`) and flow advance (`fluxo.js`)

**Files:**
- Create: `functions/_lib/prazos.js`
- Create: `functions/_lib/prazos.test.js`
- Create: `functions/_lib/fluxo.js`
- Create: `functions/_lib/fluxo.test.js`

**Interfaces:**
- Produces from `prazos.js`: `calcularPrazoSugerido(dataAberturaISO, prazoPadraoDias) -> string`, `situacaoPrazo(prazoISO, hojeISO, finalizado) -> "ok"|"alerta"|"vencido"`, `calcularDiasAtraso(prazoISO, dataFinalizacaoISO) -> number`, `empurrarPrazo(prazoISO, diasAtraso) -> string`. All ISO strings are `YYYY-MM-DD`.
- Produces from `fluxo.js`: `resolverProximosChamados(etapa, triggering, decisoesAcoes) -> Array<{etapa_id, acao_origem_id, setor_id, chamado_pai_id, chamado_mae_id}>`, `estaBloqueado(acaoOrigem, chamadosIrmaos) -> boolean`. `etapa` shape: `{ id, etapa_proxima_id, etapa_proxima_vinculo, acoes: [{id, setor_destino_id, vinculo}] }`. `triggering` shape: `{ id, chamado_mae_id }`. Consumed by Task 6 (Chamados API).

- [ ] **Step 1: Write the failing tests for `prazos.js`**

Create `functions/_lib/prazos.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularPrazoSugerido,
  situacaoPrazo,
  calcularDiasAtraso,
  empurrarPrazo,
} from "./prazos.js";

test("calcularPrazoSugerido adds N days to the opening date", () => {
  assert.equal(calcularPrazoSugerido("2026-01-01", 5), "2026-01-06");
});

test("situacaoPrazo returns 'ok' when finalizado is true, regardless of date", () => {
  assert.equal(situacaoPrazo("2020-01-01", "2026-01-01", true), "ok");
});

test("situacaoPrazo returns 'vencido' when today is past the deadline", () => {
  assert.equal(situacaoPrazo("2026-01-01", "2026-01-05", false), "vencido");
});

test("situacaoPrazo returns 'alerta' within 2 days of the deadline", () => {
  assert.equal(situacaoPrazo("2026-01-05", "2026-01-03", false), "alerta");
  assert.equal(situacaoPrazo("2026-01-05", "2026-01-04", false), "alerta");
});

test("situacaoPrazo returns 'ok' when more than 2 days remain", () => {
  assert.equal(situacaoPrazo("2026-01-10", "2026-01-01", false), "ok");
});

test("calcularDiasAtraso returns 0 when finished on or before the deadline", () => {
  assert.equal(calcularDiasAtraso("2026-01-10", "2026-01-10"), 0);
  assert.equal(calcularDiasAtraso("2026-01-10", "2026-01-05"), 0);
});

test("calcularDiasAtraso returns the number of late days", () => {
  assert.equal(calcularDiasAtraso("2026-01-10", "2026-01-13"), 3);
});

test("empurrarPrazo pushes the deadline forward by N days", () => {
  assert.equal(empurrarPrazo("2026-01-10", 3), "2026-01-13");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test functions/_lib/prazos.test.js`
Expected: FAIL — `Cannot find module './prazos.js'`

- [ ] **Step 3: Write `functions/_lib/prazos.js`**

```js
const DIA_MS = 24 * 60 * 60 * 1000;

function paraISO(date) {
  return date.toISOString().slice(0, 10);
}

export function calcularPrazoSugerido(dataAberturaISO, prazoPadraoDias) {
  const abertura = new Date(`${dataAberturaISO}T00:00:00Z`);
  return paraISO(new Date(abertura.getTime() + prazoPadraoDias * DIA_MS));
}

export function situacaoPrazo(prazoISO, hojeISO, finalizado) {
  if (finalizado) return "ok";
  const prazo = new Date(`${prazoISO}T00:00:00Z`);
  const hoje = new Date(`${hojeISO}T00:00:00Z`);
  const diffDias = Math.round((prazo.getTime() - hoje.getTime()) / DIA_MS);
  if (diffDias < 0) return "vencido";
  if (diffDias <= 2) return "alerta";
  return "ok";
}

export function calcularDiasAtraso(prazoISO, dataFinalizacaoISO) {
  const prazo = new Date(`${prazoISO}T00:00:00Z`);
  const fim = new Date(`${dataFinalizacaoISO}T00:00:00Z`);
  const dias = Math.round((fim.getTime() - prazo.getTime()) / DIA_MS);
  return dias > 0 ? dias : 0;
}

export function empurrarPrazo(prazoISO, diasAtraso) {
  const prazo = new Date(`${prazoISO}T00:00:00Z`);
  return paraISO(new Date(prazo.getTime() + diasAtraso * DIA_MS));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test functions/_lib/prazos.test.js`
Expected: PASS, 8 tests passing.

- [ ] **Step 5: Write the failing tests for `fluxo.js`**

Create `functions/_lib/fluxo.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { resolverProximosChamados, estaBloqueado } from "./fluxo.js";

test("resolverProximosChamados creates one chamado for etapa_proxima_id, linked per etapa_proxima_vinculo=mae", () => {
  const etapa = { id: 2, etapa_proxima_id: 3, etapa_proxima_vinculo: "mae", acoes: [] };
  const triggering = { id: 20, chamado_mae_id: 10 };
  const resultado = resolverProximosChamados(etapa, triggering, {});
  assert.deepEqual(resultado, [
    { etapa_id: 3, acao_origem_id: null, setor_id: null, chamado_pai_id: 10, chamado_mae_id: 10 },
  ]);
});

test("resolverProximosChamados links to the immediate parent when etapa_proxima_vinculo=pai", () => {
  const etapa = { id: 1, etapa_proxima_id: 2, etapa_proxima_vinculo: "pai", acoes: [] };
  const triggering = { id: 10, chamado_mae_id: null };
  const resultado = resolverProximosChamados(etapa, triggering, {});
  assert.deepEqual(resultado, [
    { etapa_id: 2, acao_origem_id: null, setor_id: null, chamado_pai_id: 10, chamado_mae_id: 10 },
  ]);
});

test("resolverProximosChamados only creates chamados for ações marked true", () => {
  const etapa = {
    id: 3,
    etapa_proxima_id: null,
    etapa_proxima_vinculo: null,
    acoes: [
      { id: 1, setor_destino_id: 4, vinculo: "mae" },
      { id: 2, setor_destino_id: 4, vinculo: "mae" },
      { id: 3, setor_destino_id: 5, vinculo: "mae" },
    ],
  };
  const triggering = { id: 30, chamado_mae_id: 10 };
  const resultado = resolverProximosChamados(etapa, triggering, { 1: true, 2: false, 3: true });
  assert.deepEqual(resultado, [
    { etapa_id: null, acao_origem_id: 1, setor_id: 4, chamado_pai_id: 10, chamado_mae_id: 10 },
    { etapa_id: null, acao_origem_id: 3, setor_id: 5, chamado_pai_id: 10, chamado_mae_id: 10 },
  ]);
});

test("resolverProximosChamados uses chamado_pai_id=triggering.id for acao vinculo=pai", () => {
  const etapa = {
    id: 3,
    etapa_proxima_id: null,
    etapa_proxima_vinculo: null,
    acoes: [{ id: 1, setor_destino_id: 4, vinculo: "pai" }],
  };
  const triggering = { id: 30, chamado_mae_id: 10 };
  const resultado = resolverProximosChamados(etapa, triggering, { 1: true });
  assert.equal(resultado[0].chamado_pai_id, 30);
  assert.equal(resultado[0].chamado_mae_id, 10);
});

test("resolverProximosChamados returns [] when there is no next etapa and no ações", () => {
  const etapa = { id: 9, etapa_proxima_id: null, etapa_proxima_vinculo: null, acoes: [] };
  const resultado = resolverProximosChamados(etapa, { id: 90, chamado_mae_id: 10 }, {});
  assert.deepEqual(resultado, []);
});

test("estaBloqueado is false when the ação has no prerequisito", () => {
  assert.equal(estaBloqueado({ id: 1, prerequisito_acao_id: null }, []), false);
});

test("estaBloqueado is true when the prerequisite sibling chamado is not finalizado", () => {
  const acaoOrigem = { id: 2, prerequisito_acao_id: 1 };
  const irmaos = [{ acao_origem_id: 1, data_finalizacao: null }];
  assert.equal(estaBloqueado(acaoOrigem, irmaos), true);
});

test("estaBloqueado is false when the prerequisite sibling chamado is finalizado", () => {
  const acaoOrigem = { id: 2, prerequisito_acao_id: 1 };
  const irmaos = [{ acao_origem_id: 1, data_finalizacao: "2026-01-05" }];
  assert.equal(estaBloqueado(acaoOrigem, irmaos), false);
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `node --test functions/_lib/fluxo.test.js`
Expected: FAIL — `Cannot find module './fluxo.js'`

- [ ] **Step 7: Write `functions/_lib/fluxo.js`**

```js
export function resolverProximosChamados(etapa, triggering, decisoesAcoes = {}) {
  const raizId = triggering.chamado_mae_id ?? triggering.id;

  if (etapa.acoes && etapa.acoes.length > 0) {
    return etapa.acoes
      .filter((acao) => decisoesAcoes[acao.id] === true)
      .map((acao) => ({
        etapa_id: null,
        acao_origem_id: acao.id,
        setor_id: acao.setor_destino_id,
        chamado_pai_id: acao.vinculo === "mae" ? raizId : triggering.id,
        chamado_mae_id: raizId,
      }));
  }

  if (etapa.etapa_proxima_id) {
    return [
      {
        etapa_id: etapa.etapa_proxima_id,
        acao_origem_id: null,
        setor_id: null,
        chamado_pai_id: etapa.etapa_proxima_vinculo === "mae" ? raizId : triggering.id,
        chamado_mae_id: raizId,
      },
    ];
  }

  return [];
}

export function estaBloqueado(acaoOrigem, chamadosIrmaos) {
  if (!acaoOrigem || !acaoOrigem.prerequisito_acao_id) return false;
  const irmao = chamadosIrmaos.find(
    (c) => c.acao_origem_id === acaoOrigem.prerequisito_acao_id
  );
  if (!irmao) return false;
  return irmao.data_finalizacao == null;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `node --test functions/_lib/fluxo.test.js`
Expected: PASS, 7 tests passing.

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: all tests across `http.test.js`, `prazos.test.js`, `fluxo.test.js` pass.

- [ ] **Step 10: Commit**

```bash
git add functions/_lib/prazos.js functions/_lib/prazos.test.js functions/_lib/fluxo.js functions/_lib/fluxo.test.js
git commit -m "Add pure deadline and flow-advance logic with unit tests"
```

---

## Task 4: Simple CRUD API — Empresas, Setores, Usuários, Status

Cloudflare Pages Functions routes by file path: `functions/api/empresas/index.js`
handles `/api/empresas` (list/create), `functions/api/empresas/[id].js` handles
`/api/empresas/:id` (get/update/delete). Because these 4 tables are simple
key-value-ish records with only required/optional field lists differing, a
tiny shared factory avoids rewriting the same 5 handlers 4 times.

**Files:**
- Create: `functions/_lib/crud.js`
- Create: `functions/api/empresas/index.js`
- Create: `functions/api/empresas/[id].js`
- Create: `functions/api/setores/index.js`
- Create: `functions/api/setores/[id].js`
- Create: `functions/api/usuarios/index.js`
- Create: `functions/api/usuarios/[id].js`
- Create: `functions/api/status/index.js`
- Create: `functions/api/status/[id].js`

**Interfaces:**
- Consumes: `all/first/run` from `functions/_lib/db.js`, `json/error` from `functions/_lib/http.js` (Task 2).
- Produces: `crudHandlers(table, {required, optional}) -> {onRequestGet, onRequestPost}` and `crudItemHandlers(table, {required, optional}) -> {onRequestGet, onRequestPut, onRequestDelete}`, re-used by Task 5 for `fluxo_templates`/`etapas`/`acoes`.
- Produces (HTTP): `GET/POST /api/empresas`, `GET/PUT/DELETE /api/empresas/:id`, and the same 5 routes for `setores`, `usuarios`, `status`.

- [ ] **Step 1: Write `functions/_lib/crud.js`**

```js
import { all, first, run } from "./db.js";
import { json, error } from "./http.js";

export function crudHandlers(table, { required = [], optional = [] } = {}) {
  const campos = [...required, ...optional];

  async function onRequestGet(context) {
    return json(await all(context.env.DB, `SELECT * FROM ${table} ORDER BY id`));
  }

  async function onRequestPost(context) {
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

export function crudItemHandlers(table, { required = [], optional = [] } = {}) {
  const campos = [...required, ...optional];

  async function onRequestGet(context) {
    const row = await first(context.env.DB, `SELECT * FROM ${table} WHERE id = ?`, context.params.id);
    if (!row) return error("Não encontrado", 404);
    return json(row);
  }

  async function onRequestPut(context) {
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
    await run(context.env.DB, `DELETE FROM ${table} WHERE id = ?`, context.params.id);
    return json({ ok: true });
  }

  return { onRequestGet, onRequestPut, onRequestDelete };
}
```

- [ ] **Step 2: Wire up Empresas**

Create `functions/api/empresas/index.js`:
```js
import { crudHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPost } = crudHandlers("empresas", {
  required: ["nome"],
});
```

Create `functions/api/empresas/[id].js`:
```js
import { crudItemHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPut, onRequestDelete } = crudItemHandlers("empresas", {
  required: ["nome"],
});
```

- [ ] **Step 3: Wire up Setores**

Create `functions/api/setores/index.js`:
```js
import { crudHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPost } = crudHandlers("setores", {
  required: ["nome", "empresa_id", "prazo_padrao_dias"],
  optional: ["centro_custo"],
});
```

Create `functions/api/setores/[id].js`:
```js
import { crudItemHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPut, onRequestDelete } = crudItemHandlers("setores", {
  required: ["nome", "empresa_id", "prazo_padrao_dias"],
  optional: ["centro_custo"],
});
```

- [ ] **Step 4: Wire up Usuários**

Create `functions/api/usuarios/index.js`:
```js
import { crudHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPost } = crudHandlers("usuarios", {
  required: ["nome", "setor_id"],
});
```

Create `functions/api/usuarios/[id].js`:
```js
import { crudItemHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPut, onRequestDelete } = crudItemHandlers("usuarios", {
  required: ["nome", "setor_id"],
});
```

- [ ] **Step 5: Wire up Status**

Create `functions/api/status/index.js`:
```js
import { crudHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPost } = crudHandlers("status", {
  required: ["nome"],
});
```

Create `functions/api/status/[id].js`:
```js
import { crudItemHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPut, onRequestDelete } = crudItemHandlers("status", {
  required: ["nome"],
});
```

- [ ] **Step 6: Manually verify against the local dev server**

Run (in one terminal, leave it running):
```bash
npm run dev
```

In another terminal:
```bash
curl -s http://localhost:8788/api/empresas
curl -s -X POST http://localhost:8788/api/setores -H "content-type: application/json" -d "{\"nome\":\"Teste\",\"empresa_id\":1,\"prazo_padrao_dias\":4}"
curl -s http://localhost:8788/api/setores/6
curl -s -X PUT http://localhost:8788/api/setores/6 -H "content-type: application/json" -d "{\"centro_custo\":\"CC-TESTE\"}"
curl -s -X DELETE http://localhost:8788/api/setores/6
```
Expected: first call returns the 2 seeded empresas as JSON array; POST returns the created setor with `id: 6`; GET by id returns the same row; PUT returns it with `centro_custo` updated; DELETE returns `{"ok":true}`, and a following GET on `/api/setores/6` returns 404.

- [ ] **Step 7: Commit**

```bash
git add functions/_lib/crud.js functions/api/empresas functions/api/setores functions/api/usuarios functions/api/status
git commit -m "Add generic CRUD API for empresas, setores, usuarios, status"
```

---

## Task 5: FluxoTemplates, Etapas, Ações API

**Files:**
- Create: `functions/_lib/etapas.js`
- Create: `functions/api/fluxos/index.js`
- Create: `functions/api/fluxos/[id].js`
- Create: `functions/api/fluxos/[id]/etapas.js`
- Create: `functions/api/etapas/[id].js`
- Create: `functions/api/etapas/[id]/acoes.js`
- Create: `functions/api/acoes/[id].js`

**Interfaces:**
- Consumes: `all/first/run` (Task 2), `json/error` (Task 2), `crudHandlers/crudItemHandlers` (Task 4).
- Produces: `carregarEtapaComAcoes(db, etapaId) -> {id, fluxo_template_id, nome, setor_id, tipo, eh_inicial, etapa_proxima_id, etapa_proxima_vinculo, acoes: Array<{id, rotulo, setor_destino_id, vinculo, prerequisito_acao_id}>} | null` — consumed directly (not over HTTP) by Task 6's flow-advance logic.
- Produces (HTTP): `GET/POST /api/fluxos`, `GET/PUT/DELETE /api/fluxos/:id`, `GET/POST /api/fluxos/:id/etapas`, `GET/PUT/DELETE /api/etapas/:id` (GET embeds `acoes`), `POST /api/etapas/:id/acoes`, `PUT/DELETE /api/acoes/:id`.

- [ ] **Step 1: Write `functions/_lib/etapas.js`**

```js
import { all, first } from "./db.js";

export async function carregarEtapaComAcoes(db, etapaId) {
  const etapa = await first(db, "SELECT * FROM etapas WHERE id = ?", etapaId);
  if (!etapa) return null;
  const acoes = await all(db, "SELECT * FROM acoes WHERE etapa_id = ? ORDER BY id", etapaId);
  return { ...etapa, acoes };
}
```

- [ ] **Step 2: Wire up FluxoTemplates (reusing the Task 4 CRUD factory)**

Create `functions/api/fluxos/index.js`:
```js
import { crudHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPost } = crudHandlers("fluxo_templates", {
  required: ["nome"],
});
```

Create `functions/api/fluxos/[id].js`:
```js
import { crudItemHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPut, onRequestDelete } = crudItemHandlers("fluxo_templates", {
  required: ["nome"],
});
```

- [ ] **Step 3: Write nested Etapas routes**

Create `functions/api/fluxos/[id]/etapas.js`:
```js
import { all, first, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";

export async function onRequestGet(context) {
  const etapas = await all(
    context.env.DB,
    "SELECT * FROM etapas WHERE fluxo_template_id = ? ORDER BY id",
    context.params.id
  );
  return json(etapas);
}

export async function onRequestPost(context) {
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

- [ ] **Step 4: Write single Etapa routes (embedding suas Ações)**

Create `functions/api/etapas/[id].js`:
```js
import { run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { carregarEtapaComAcoes } from "../../_lib/etapas.js";

export async function onRequestGet(context) {
  const etapa = await carregarEtapaComAcoes(context.env.DB, context.params.id);
  if (!etapa) return error("Não encontrada", 404);
  return json(etapa);
}

export async function onRequestPut(context) {
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
  await run(context.env.DB, "DELETE FROM acoes WHERE etapa_id = ?", context.params.id);
  await run(context.env.DB, "DELETE FROM etapas WHERE id = ?", context.params.id);
  return json({ ok: true });
}
```

- [ ] **Step 5: Write Ações routes**

Create `functions/api/etapas/[id]/acoes.js`:
```js
import { first, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";

export async function onRequestPost(context) {
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

Create `functions/api/acoes/[id].js`:
```js
import { run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";

export async function onRequestPut(context) {
  const body = await context.request.json();
  const campos = ["rotulo", "setor_destino_id", "vinculo", "prerequisito_acao_id"];
  const colunas = campos.filter((c) => body[c] !== undefined);
  if (colunas.length === 0) return error("Nenhum campo para atualizar");
  const set = colunas.map((c) => `${c} = ?`).join(", ");
  const valores = colunas.map((c) => body[c]);
  await run(context.env.DB, `UPDATE acoes SET ${set} WHERE id = ?`, ...valores, context.params.id);
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  await run(context.env.DB, "DELETE FROM acoes WHERE id = ?", context.params.id);
  return json({ ok: true });
}
```

- [ ] **Step 6: Manually verify against the local dev server**

With `npm run dev` running:
```bash
curl -s http://localhost:8788/api/fluxos
curl -s http://localhost:8788/api/fluxos/1/etapas
curl -s http://localhost:8788/api/etapas/3
```
Expected: first call returns the seeded "Produto Derivado" fluxo; second returns its 3 seeded etapas; third returns etapa 3 ("Desenvolvimento de Produto") with its 3 seeded `acoes` embedded.

- [ ] **Step 7: Commit**

```bash
git add functions/_lib/etapas.js functions/api/fluxos functions/api/etapas functions/api/acoes
git commit -m "Add FluxoTemplates/Etapas/Ações configuration API"
```

---

## Task 6: Chamados API — abrir, listar, árvore, decisão, status

**Files:**
- Create: `functions/_lib/chamados.js`
- Create: `functions/api/chamados/index.js`
- Create: `functions/api/chamados/[id].js`
- Create: `functions/api/chamados/[id]/decisao.js`
- Create: `functions/api/chamados/[id]/arvore.js`

**Interfaces:**
- Consumes: `all/first/run` (Task 2), `json/error` (Task 2), `carregarEtapaComAcoes` (Task 5), `resolverProximosChamados/estaBloqueado` (Task 3), `calcularPrazoSugerido/calcularDiasAtraso/empurrarPrazo/situacaoPrazo` (Task 3).
- Produces: `criarChamado(db, spec) -> chamadoRow`, `avancarFluxo(db, chamado, etapa, decisoesAcoes) -> Array<chamadoRow>`, `finalizarComCascata(db, chamadoId, {hoje, resultadoOrigem}) -> void`, `aplicarCascataAtraso(db, chamado, hoje) -> void`, `computarBloqueado(db, chamado) -> boolean`, `chamadoComDetalhes(db, id) -> object|null` — consumed by Task 7 (comentários endpoint reuses `chamadoComDetalhes` shape) and by the frontend.
- Produces (HTTP): `GET /api/chamados?setor_id=X`, `POST /api/chamados`, `GET/PUT/DELETE /api/chamados/:id` (DELETE cascades to every descendant, per the "CRUD e testabilidade" requirement in the design spec), `POST /api/chamados/:id/decisao`, `GET /api/chamados/:id/arvore`.

- [ ] **Step 1: Write `functions/_lib/chamados.js`**

```js
import { all, first, run } from "./db.js";
import {
  calcularPrazoSugerido,
  calcularDiasAtraso,
  empurrarPrazo,
  situacaoPrazo,
} from "./prazos.js";
import { resolverProximosChamados, estaBloqueado } from "./fluxo.js";

export function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

async function statusIdPorNome(db, nome) {
  const row = await first(db, "SELECT id FROM status WHERE nome = ?", nome);
  return row.id;
}

async function resolverSetorEPrazoPadrao(db, { etapa_id, acao_origem_id }) {
  if (etapa_id) {
    const row = await first(
      db,
      `SELECT s.id AS setor_id, s.prazo_padrao_dias
       FROM etapas e JOIN setores s ON s.id = e.setor_id
       WHERE e.id = ?`,
      etapa_id
    );
    return row;
  }
  const row = await first(
    db,
    `SELECT s.id AS setor_id, s.prazo_padrao_dias
     FROM acoes a JOIN setores s ON s.id = a.setor_destino_id
     WHERE a.id = ?`,
    acao_origem_id
  );
  return row;
}

export async function criarChamado(db, spec) {
  const { prazo_padrao_dias } = await resolverSetorEPrazoPadrao(db, spec);
  const hoje = hojeISO();
  const prazo = spec.prazo ?? calcularPrazoSugerido(hoje, prazo_padrao_dias);
  const statusPrevisto = await statusIdPorNome(db, "previsto");
  const resultado = await run(
    db,
    `INSERT INTO chamados
       (fluxo_template_id, etapa_id, acao_origem_id, chamado_mae_id, chamado_pai_id,
        empresa_id, status_id, solicitante_id, data_abertura, prazo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    spec.fluxo_template_id,
    spec.etapa_id ?? null,
    spec.acao_origem_id ?? null,
    spec.chamado_mae_id ?? null,
    spec.chamado_pai_id ?? null,
    spec.empresa_id,
    statusPrevisto,
    spec.solicitante_id,
    hoje,
    prazo
  );
  return first(db, "SELECT * FROM chamados WHERE id = ?", resultado.meta.last_row_id);
}

export async function avancarFluxo(db, chamado, etapa, decisoesAcoes = {}) {
  const especificacoes = resolverProximosChamados(
    etapa,
    { id: chamado.id, chamado_mae_id: chamado.chamado_mae_id },
    decisoesAcoes
  );
  const criados = [];
  for (const spec of especificacoes) {
    const criado = await criarChamado(db, {
      fluxo_template_id: chamado.fluxo_template_id,
      etapa_id: spec.etapa_id,
      acao_origem_id: spec.acao_origem_id,
      chamado_mae_id: spec.chamado_mae_id,
      chamado_pai_id: spec.chamado_pai_id,
      empresa_id: chamado.empresa_id,
      solicitante_id: chamado.solicitante_id,
    });
    criados.push(criado);
  }
  return criados;
}

export async function finalizarComCascata(db, chamadoId, { hoje, resultadoOrigem = null }) {
  const statusFinalizado = await statusIdPorNome(db, "finalizado");
  let atual = await first(db, "SELECT * FROM chamados WHERE id = ?", chamadoId);
  let primeira = true;
  while (atual) {
    const resultado = primeira ? resultadoOrigem : atual.resultado;
    await run(
      db,
      `UPDATE chamados
       SET status_id = ?, data_finalizacao = COALESCE(data_finalizacao, ?), resultado = ?
       WHERE id = ?`,
      statusFinalizado,
      hoje,
      resultado,
      atual.id
    );
    if (atual.chamado_pai_id == null) break;
    atual = await first(db, "SELECT * FROM chamados WHERE id = ?", atual.chamado_pai_id);
    primeira = false;
  }
}

export async function aplicarCascataAtraso(db, chamado, hoje) {
  const diasAtraso = calcularDiasAtraso(chamado.prazo, hoje);
  if (diasAtraso <= 0) return;
  const raizId = chamado.chamado_mae_id ?? chamado.id;
  const statusPrevisto = await statusIdPorNome(db, "previsto");
  const dependentes = await all(
    db,
    `SELECT * FROM chamados
     WHERE status_id = ? AND id != ? AND (id = ? OR chamado_mae_id = ?)`,
    statusPrevisto,
    chamado.id,
    raizId,
    raizId
  );
  for (const dep of dependentes) {
    const novoPrazo = empurrarPrazo(dep.prazo, diasAtraso);
    await run(db, "UPDATE chamados SET prazo = ? WHERE id = ?", novoPrazo, dep.id);
    await run(
      db,
      `INSERT INTO comentarios (chamado_id, usuario_id, data, texto, eh_justificativa)
       VALUES (?, NULL, ?, ?, 0)`,
      dep.id,
      hoje,
      `Prazo ajustado de ${dep.prazo} para ${novoPrazo} devido a atraso de ${diasAtraso} dia(s) no chamado #${chamado.id}.`
    );
  }
}

export async function computarBloqueado(db, chamado) {
  if (!chamado.acao_origem_id) return false;
  const acao = await first(db, "SELECT * FROM acoes WHERE id = ?", chamado.acao_origem_id);
  if (!acao || !acao.prerequisito_acao_id) return false;
  const irmaos = await all(
    db,
    "SELECT acao_origem_id, data_finalizacao FROM chamados WHERE chamado_mae_id = ?",
    chamado.chamado_mae_id
  );
  return estaBloqueado(acao, irmaos);
}

export async function chamadoComDetalhes(db, id) {
  const chamado = await first(
    db,
    `SELECT
       c.*,
       COALESCE(e.setor_id, a.setor_destino_id) AS setor_id,
       s.nome AS setor_nome,
       COALESCE(e.nome, a.rotulo) AS titulo,
       e.tipo AS etapa_tipo,
       st.nome AS status_nome
     FROM chamados c
     LEFT JOIN etapas e ON e.id = c.etapa_id
     LEFT JOIN acoes a ON a.id = c.acao_origem_id
     LEFT JOIN setores s ON s.id = COALESCE(e.setor_id, a.setor_destino_id)
     LEFT JOIN status st ON st.id = c.status_id
     WHERE c.id = ?`,
    id
  );
  if (!chamado) return null;
  const bloqueado = await computarBloqueado(db, chamado);
  const situacao = situacaoPrazo(chamado.prazo, hojeISO(), chamado.data_finalizacao != null);
  return { ...chamado, bloqueado, situacao_prazo: situacao };
}
```

- [ ] **Step 2: Write `functions/api/chamados/index.js`**

```js
import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { carregarEtapaComAcoes } from "../../_lib/etapas.js";
import { criarChamado, avancarFluxo, hojeISO } from "../../_lib/chamados.js";

export async function onRequestGet(context) {
  const setorId = new URL(context.request.url).searchParams.get("setor_id");
  if (!setorId) return error("Parâmetro obrigatório: setor_id");
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
     WHERE COALESCE(e.setor_id, a.setor_destino_id) = ?
     ORDER BY c.prazo`,
    setorId
  );
  return json(chamados);
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.fluxo_template_id || !body.etapa_inicial_id || !body.solicitante_id) {
    return error("Campos obrigatórios: fluxo_template_id, etapa_inicial_id, solicitante_id");
  }
  const etapa = await carregarEtapaComAcoes(context.env.DB, body.etapa_inicial_id);
  if (!etapa || !etapa.eh_inicial || etapa.fluxo_template_id !== body.fluxo_template_id) {
    return error("etapa_inicial_id inválido para este fluxo_template_id");
  }
  const solicitante = await first(
    context.env.DB,
    "SELECT u.id, s.empresa_id FROM usuarios u JOIN setores s ON s.id = u.setor_id WHERE u.id = ?",
    body.solicitante_id
  );
  if (!solicitante) return error("solicitante_id inválido");

  const mae = await criarChamado(context.env.DB, {
    fluxo_template_id: body.fluxo_template_id,
    etapa_id: etapa.id,
    chamado_mae_id: null,
    chamado_pai_id: null,
    empresa_id: solicitante.empresa_id,
    solicitante_id: body.solicitante_id,
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

- [ ] **Step 3: Write `functions/api/chamados/[id].js`**

```js
import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { chamadoComDetalhes, hojeISO, aplicarCascataAtraso } from "../../_lib/chamados.js";

export async function onRequestGet(context) {
  const chamado = await chamadoComDetalhes(context.env.DB, context.params.id);
  if (!chamado) return error("Não encontrado", 404);
  return json(chamado);
}

export async function onRequestPut(context) {
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
  const ids = await coletarSubarvore(context.env.DB, context.params.id);
  for (const chamadoId of ids) {
    await run(context.env.DB, "DELETE FROM apontamentos_horas WHERE chamado_id = ?", chamadoId);
    await run(context.env.DB, "DELETE FROM comentarios WHERE chamado_id = ?", chamadoId);
    await run(context.env.DB, "DELETE FROM chamados WHERE id = ?", chamadoId);
  }
  return json({ ok: true, excluidos: ids });
}
```

`onRequestDelete` walks `chamado_pai_id` recursively from the given chamado
(this works whether it's the mãe or any descendant — `chamado_pai_id`, no
matter which `vinculo` set it, always points to a node already inside the
same tree, so the recursion never misses a branch) and removes it plus every
descendant, cascading through their comentários and apontamentos first.

- [ ] **Step 4: Write `functions/api/chamados/[id]/decisao.js`**

```js
import { run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { carregarEtapaComAcoes } from "../../../_lib/etapas.js";
import {
  chamadoComDetalhes,
  finalizarComCascata,
  avancarFluxo,
  aplicarCascataAtraso,
  hojeISO,
} from "../../../_lib/chamados.js";

export async function onRequestPost(context) {
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
      body.usuario_id ?? null,
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

- [ ] **Step 5: Write `functions/api/chamados/[id]/arvore.js`**

```js
import { all, first } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";

export async function onRequestGet(context) {
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

- [ ] **Step 6: Manually verify the full "Produto Derivado" happy path**

With `npm run dev` running:
```bash
curl -s -X POST http://localhost:8788/api/chamados -H "content-type: application/json" \
  -d "{\"fluxo_template_id\":1,\"etapa_inicial_id\":1,\"solicitante_id\":1}"
```
Expected: `201`, JSON with `chamado` (id, `etapa_id: 1`, `status` finalizado) and
`criados: [{ etapa_id: 2, chamado_mae_id: <mae.id>, chamado_pai_id: <mae.id>, ... }]`.
Note the new chamado's id for the Projetos ticket (call it `<projetos_id>`).

```bash
curl -s -X POST http://localhost:8788/api/chamados/<projetos_id>/decisao -H "content-type: application/json" \
  -d "{\"usuario_id\":2,\"decisao\":\"aprovado\"}"
```
Expected: `200`, `criados` has one chamado for etapa 3 (Desenvolvimento), `chamado_pai_id` equal to the mãe's id (per `etapa_proxima_vinculo = mae`). Note its id as `<dev_id>`.

```bash
curl -s -X POST http://localhost:8788/api/chamados/<dev_id>/decisao -H "content-type: application/json" \
  -d "{\"usuario_id\":3,\"decisao\":\"aprovado\",\"acoes\":{\"1\":true,\"2\":false,\"3\":true}}"
```
Expected: `200`, `criados` has exactly 2 chamados (ação 1 "ficha técnica" and ação 3 "embalagem"), both with `chamado_pai_id` equal to the mãe's id.

```bash
curl -s "http://localhost:8788/api/chamados/<mae_id>/arvore"
```
Expected: an array with 4 rows total (mãe, Projetos, Desenvolvimento, and the 2 created ação tasks) — ação 2 ("material gráfico") absent since it was marked `false`.

- [ ] **Step 7: Manually verify the reject path**

```bash
curl -s -X POST http://localhost:8788/api/chamados -H "content-type: application/json" \
  -d "{\"fluxo_template_id\":1,\"etapa_inicial_id\":1,\"solicitante_id\":1}"
curl -s -X POST http://localhost:8788/api/chamados/<novo_projetos_id>/decisao -H "content-type: application/json" \
  -d "{\"usuario_id\":2,\"decisao\":\"reprovado\",\"justificativa\":\"Sem viabilidade comercial\"}"
curl -s "http://localhost:8788/api/chamados/<novo_projetos_id>/arvore"
```
Expected: the second curl returns `200` with `chamado.resultado: "reprovado"` and `chamado.status_nome: "finalizado"`; the árvore call shows both the mãe and the Projetos chamado with `status_nome: "finalizado"`.

- [ ] **Step 8: Manually verify cascading delete**

```bash
curl -s -X DELETE http://localhost:8788/api/chamados/<mae_id>
curl -s "http://localhost:8788/api/chamados/<mae_id>"
```
Expected: the DELETE returns `{"ok":true,"excluidos":[<mae_id>, <projetos_id>, <dev_id>, ...]}` listing every id created in Step 6's happy-path test; the following GET returns `404`.

- [ ] **Step 9: Commit**

```bash
git add functions/_lib/chamados.js functions/api/chamados
git commit -m "Add Chamados API: abrir, listar, árvore, decisão, status, exclusão em cascata"
```

---

## Task 7: Comentários e Apontamento de Horas API

**Files:**
- Create: `functions/api/chamados/[id]/comentarios.js`
- Create: `functions/api/chamados/[id]/horas.js`

**Interfaces:**
- Consumes: `all/run` (Task 2), `json/error` (Task 2), `hojeISO` (Task 6).
- Produces (HTTP): `GET/POST /api/chamados/:id/comentarios` (both return the full updated list), `GET/POST /api/chamados/:id/horas` (both return `{ lancamentos, total_horas }`).

- [ ] **Step 1: Write `functions/api/chamados/[id]/comentarios.js`**

```js
import { all, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { hojeISO } from "../../../_lib/chamados.js";

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
  return json(await listarComentarios(context.env.DB, context.params.id));
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.usuario_id || !body.texto) {
    return error("Campos obrigatórios: usuario_id, texto");
  }
  await run(
    context.env.DB,
    `INSERT INTO comentarios (chamado_id, usuario_id, data, texto, eh_justificativa)
     VALUES (?, ?, ?, ?, 0)`,
    context.params.id,
    body.usuario_id,
    hojeISO(),
    body.texto
  );
  return json(await listarComentarios(context.env.DB, context.params.id), 201);
}
```

- [ ] **Step 2: Write `functions/api/chamados/[id]/horas.js`**

```js
import { all, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";

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
  return json(await resumoHoras(context.env.DB, context.params.id));
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.usuario_id || !body.data || !body.horas) {
    return error("Campos obrigatórios: usuario_id, data, horas");
  }
  await run(
    context.env.DB,
    `INSERT INTO apontamentos_horas (chamado_id, usuario_id, data, horas, observacao)
     VALUES (?, ?, ?, ?, ?)`,
    context.params.id,
    body.usuario_id,
    body.data,
    body.horas,
    body.observacao ?? null
  );
  return json(await resumoHoras(context.env.DB, context.params.id), 201);
}
```

- [ ] **Step 3: Manually verify against the local dev server**

With `npm run dev` running (use any existing chamado id from Task 6's manual
tests, e.g. the mãe chamado's id):
```bash
curl -s -X POST http://localhost:8788/api/chamados/<mae_id>/comentarios -H "content-type: application/json" \
  -d "{\"usuario_id\":1,\"texto\":\"Solicitação registrada.\"}"
curl -s http://localhost:8788/api/chamados/<mae_id>/comentarios
curl -s -X POST http://localhost:8788/api/chamados/<mae_id>/horas -H "content-type: application/json" \
  -d "{\"usuario_id\":2,\"data\":\"2026-09-11\",\"horas\":1.5,\"observacao\":\"Análise inicial\"}"
curl -s http://localhost:8788/api/chamados/<mae_id>/horas
```
Expected: comment appears with `usuario_nome: "Ana (Comercial)"`; the deadline-cascade comment(s) from Task 6's Step 7 (if any) appear with `usuario_nome: null`; horas call returns `{"lancamentos":[...],"total_horas":1.5}`.

- [ ] **Step 4: Commit**

```bash
git add functions/api/chamados
git commit -m "Add Comentários and Apontamento de Horas API"
```

---

## Task 8: Frontend shell — login, nav, shared JS/CSS

No frontend framework: each screen is its own static HTML file (no client-side
router), sharing `style.css` and small JS modules loaded via
`<script type="module">`. This replaces the current placeholder
`index.html` (blank "WorkFlow Zagonel" page) with the real login screen.

**Files:**
- Modify: `index.html` (replace blank placeholder with the login screen)
- Create: `index.js`
- Create: `api.js`
- Create: `auth.js`
- Create: `ui.js`
- Create: `style.css`

**Interfaces:**
- Produces: `api(path, options) -> Promise<any>` (throws `Error(message)` on non-2xx), `getUsuarioLogado()/setUsuarioLogado(u)/logout()/exigirLogin()`, `info(texto) -> string`, `situacaoClasse(situacao) -> string`, `montarNav(usuario) -> string` — used by every later frontend task.

- [ ] **Step 1: Write `api.js`**

```js
const BASE = "/api";

export async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
  return data;
}
```

- [ ] **Step 2: Write `auth.js`**

```js
const CHAVE = "workflow_zagonel_usuario";

export function getUsuarioLogado() {
  const raw = localStorage.getItem(CHAVE);
  return raw ? JSON.parse(raw) : null;
}

export function setUsuarioLogado(usuario) {
  localStorage.setItem(CHAVE, JSON.stringify(usuario));
}

export function logout() {
  localStorage.removeItem(CHAVE);
}

export function exigirLogin() {
  const usuario = getUsuarioLogado();
  if (!usuario) {
    window.location.href = "index.html";
    return null;
  }
  return usuario;
}
```

- [ ] **Step 3: Write `ui.js`**

```js
import { logout } from "./auth.js";

export function info(texto) {
  return `<span class="info" title="${texto.replace(/"/g, "&quot;")}">i</span>`;
}

export function situacaoClasse(situacao) {
  if (situacao === "vencido") return "badge badge-vencido";
  if (situacao === "alerta") return "badge badge-alerta";
  return "badge badge-ok";
}

export function montarNav(usuario) {
  const nav = document.createElement("nav");
  nav.className = "nav";
  nav.innerHTML = `
    <a href="chamados.html">Meus chamados</a>
    <a href="cadastros.html">Cadastros</a>
    <a href="fluxo.html">Fluxos</a>
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

- [ ] **Step 4: Write `style.css`**

```css
:root {
  --cor-fundo: #f7f7f5;
  --cor-texto: #1f2933;
  --cor-borda: #d6d9dc;
  --cor-primaria: #2f6f4f;
  --cor-vencido: #c0392b;
  --cor-alerta: #b8860b;
  --cor-ok: #2f6f4f;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: var(--cor-fundo);
  color: var(--cor-texto);
}

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

.login { max-width: 320px; margin: 4rem auto; text-align: center; }
.login select, .login button { width: 100%; padding: 0.5rem; margin-top: 0.5rem; }

table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--cor-borda); }

.info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  background: var(--cor-borda);
  color: white;
  font-size: 0.7rem;
  font-style: italic;
  margin-left: 0.3rem;
  cursor: help;
}

.badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 1rem;
  color: white;
  font-size: 0.8rem;
}
.badge-vencido { background: var(--cor-vencido); }
.badge-alerta { background: var(--cor-alerta); }
.badge-ok { background: var(--cor-ok); }

.erro { color: var(--cor-vencido); }

form.formulario { display: flex; flex-direction: column; gap: 0.5rem; max-width: 480px; }
form.formulario label { display: flex; flex-direction: column; gap: 0.2rem; }

.arvore ul { list-style: none; padding-left: 1.25rem; }
.arvore > ul { padding-left: 0; }
```

- [ ] **Step 5: Replace `index.html` with the login screen**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel — Entrar</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<main class="login">
  <h1>WorkFlow Zagonel</h1>
  <label>
    Usuário
    <select id="select-usuario"></select>
  </label>
  <button id="btn-entrar">Entrar</button>
  <p id="mensagem-erro" class="erro" hidden></p>
</main>
<script type="module" src="index.js"></script>
</body>
</html>
```

- [ ] **Step 6: Write `index.js`**

```js
import { api } from "./api.js";
import { setUsuarioLogado } from "./auth.js";

const select = document.getElementById("select-usuario");
const mensagemErro = document.getElementById("mensagem-erro");

async function carregarUsuarios() {
  const usuarios = await api("/usuarios");
  select.innerHTML = usuarios
    .map((u) => `<option value="${u.id}" data-setor="${u.setor_id}">${u.nome}</option>`)
    .join("");
}

document.getElementById("btn-entrar").addEventListener("click", () => {
  const opcao = select.selectedOptions[0];
  if (!opcao) return;
  setUsuarioLogado({
    id: Number(opcao.value),
    setor_id: Number(opcao.dataset.setor),
    nome: opcao.textContent,
  });
  window.location.href = "chamados.html";
});

carregarUsuarios().catch((e) => {
  mensagemErro.textContent = e.message;
  mensagemErro.hidden = false;
});
```

- [ ] **Step 7: Manually verify in the browser**

With `npm run dev` running, open `http://localhost:8788/`. Expected: page
shows "WorkFlow Zagonel", a dropdown populated with the 5 seeded usuários,
and clicking "Entrar" redirects to `chamados.html` (a 404 is expected for now
— that page is built in Task 11).

- [ ] **Step 8: Commit**

```bash
git add index.html index.js api.js auth.js ui.js style.css
git commit -m "Add frontend shell: login screen, shared api/auth/ui helpers"
```

---

## Task 9: Cadastros — Empresas, Setores, Usuários, Status (CRUD screens)

One page (`cadastros.html`) with 4 sections, each rendered by a shared
generic CRUD widget (`crud-ui.js`) — mirrors the backend's `crud.js` reuse
rationale: identical list/create/edit/delete shape, only field config
differs.

**Files:**
- Create: `crud-ui.js`
- Create: `cadastros.html`
- Create: `cadastros.js`

**Interfaces:**
- Consumes: `api` (Task 8), `exigirLogin/montarNav/info` (Task 8).
- Produces: `renderCrud(container, {titulo, endpoint, campos: [{nome, label, tipo?, obrigatorio?, opcoesEndpoint?, dica?}]}) -> Promise<void>` — `dica`, when present, renders an `info()` tooltip next to the field label (the transversal UI requirement from the design spec). Reused as-is by Task 10 for FluxoTemplates.

- [ ] **Step 1: Write `crud-ui.js`**

```js
import { api } from "./api.js";
import { info } from "./ui.js";

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
    const opcoes = opcoesFK[campo.nome] ?? [];
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
  const opcoesFK = {};
  for (const campo of config.campos) {
    if (campo.opcoesEndpoint) opcoesFK[campo.nome] = await api(campo.opcoesEndpoint);
  }

  let editandoId = null;

  container.innerHTML = `
    <h2>${config.titulo}</h2>
    <table>
      <thead><tr>${config.campos.map((c) => `<th>${c.label}</th>`).join("")}<th></th></tr></thead>
      <tbody></tbody>
    </table>
    <h3>Novo / Editar</h3>
    <form class="formulario">
      ${config.campos.map((c) => campoInputHtml(c, opcoesFK)).join("")}
      <button type="submit">Adicionar</button>
    </form>
  `;

  const form = container.querySelector("form");
  const botaoSalvar = form.querySelector("button[type=submit]");

  function preencherFormulario(linha) {
    editandoId = linha.id;
    for (const campo of config.campos) {
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
            ${config.campos.map((c) => `<td>${valorExibicao(linha, c, opcoesFK)}</td>`).join("")}
            <td>
              <button type="button" class="btn-editar" data-id="${linha.id}">Editar</button>
              <button type="button" class="btn-excluir" data-id="${linha.id}">Excluir</button>
            </td>
          </tr>`
      )
      .join("");
    container.querySelectorAll(".btn-editar").forEach((btn) =>
      btn.addEventListener("click", () => {
        const linha = dados.find((d) => d.id === Number(btn.dataset.id));
        preencherFormulario(linha);
      })
    );
    container.querySelectorAll(".btn-excluir").forEach((btn) =>
      btn.addEventListener("click", async () => {
        await api(`${config.endpoint}/${btn.dataset.id}`, { method: "DELETE" });
        recarregar();
      })
    );
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const corpo = {};
    for (const campo of config.campos) {
      const valor = form.elements[campo.nome].value;
      corpo[campo.nome] = campo.tipo === "number" || campo.opcoesEndpoint ? Number(valor) : valor;
    }
    if (editandoId) {
      await api(`${config.endpoint}/${editandoId}`, { method: "PUT", body: corpo });
    } else {
      await api(config.endpoint, { method: "POST", body: corpo });
    }
    editandoId = null;
    form.reset();
    botaoSalvar.textContent = "Adicionar";
    recarregar();
  });

  await recarregar();
}
```

- [ ] **Step 2: Write `cadastros.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel — Cadastros</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div id="nav"></div>
<main>
  <div id="secao-empresas"></div>
  <div id="secao-setores"></div>
  <div id="secao-usuarios"></div>
  <div id="secao-status"></div>
</main>
<script type="module" src="cadastros.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write `cadastros.js`**

```js
import { exigirLogin } from "./auth.js";
import { montarNav } from "./ui.js";
import { renderCrud } from "./crud-ui.js";

const usuario = exigirLogin();
if (usuario) {
  document.getElementById("nav").replaceWith(montarNav(usuario));

  renderCrud(document.getElementById("secao-empresas"), {
    titulo: "Empresas",
    endpoint: "/empresas",
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  });

  renderCrud(document.getElementById("secao-setores"), {
    titulo: "Setores",
    endpoint: "/setores",
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
  });

  renderCrud(document.getElementById("secao-usuarios"), {
    titulo: "Usuários",
    endpoint: "/usuarios",
    campos: [
      { nome: "nome", label: "Nome", obrigatorio: true },
      { nome: "setor_id", label: "Setor", obrigatorio: true, opcoesEndpoint: "/setores" },
    ],
  });

  renderCrud(document.getElementById("secao-status"), {
    titulo: "Status",
    endpoint: "/status",
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  });
}
```

- [ ] **Step 4: Manually verify in the browser**

With `npm run dev` running, log in at `http://localhost:8788/` and navigate to
"Cadastros". Expected: 4 sections render with the seeded rows. Add a new
Empresa "Teste Ltda", confirm it appears; click "Editar" on it, change the
name, "Salvar", confirm the table updates; click "Excluir", confirm it's
removed. Repeat quickly for Setores (confirm the "Empresa" dropdown is
populated) to check the foreign-key select works end to end.

- [ ] **Step 5: Commit**

```bash
git add crud-ui.js cadastros.html cadastros.js
git commit -m "Add Cadastros screen: Empresas, Setores, Usuários, Status CRUD"
```

---

## Task 10: Cadastro de Fluxo — FluxoTemplates, Etapas, Ações

**Files:**
- Create: `fluxo.html`
- Create: `fluxo.js`

**Interfaces:**
- Consumes: `api` (Task 8), `exigirLogin/montarNav` (Task 8), `renderCrud` (Task 9), `GET/POST /api/fluxos/:id/etapas`, `GET/PUT/DELETE /api/etapas/:id`, `POST /api/etapas/:id/acoes`, `PUT/DELETE /api/acoes/:id` (Task 5).

- [ ] **Step 1: Write `fluxo.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel — Fluxos</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div id="nav"></div>
<main>
  <div id="secao-fluxos"></div>
  <h2>Editar etapas de um fluxo</h2>
  <label>Fluxo <select id="select-fluxo"></select></label>
  <div id="secao-etapas"></div>
</main>
<script type="module" src="fluxo.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `fluxo.js` — templates list and fluxo selector**

```js
import { exigirLogin } from "./auth.js";
import { montarNav, info } from "./ui.js";
import { renderCrud } from "./crud-ui.js";
import { api } from "./api.js";

const usuario = exigirLogin();
if (usuario) {
  document.getElementById("nav").replaceWith(montarNav(usuario));
  await renderCrud(document.getElementById("secao-fluxos"), {
    titulo: "Fluxos",
    endpoint: "/fluxos",
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  });
  await iniciarSelecaoFluxo();
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
```

- [ ] **Step 3: Append the Etapas editor to `fluxo.js`**

```js
async function renderEtapas(fluxoId) {
  const [etapas, setores] = await Promise.all([
    api(`/fluxos/${fluxoId}/etapas`),
    api("/setores"),
  ]);
  const container = document.getElementById("secao-etapas");

  const nomeSetor = (id) => setores.find((s) => s.id === id)?.nome ?? id;
  const nomeEtapa = (id) => etapas.find((e) => e.id === id)?.nome ?? "—";

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
            <td>${e.etapa_proxima_id ? nomeEtapa(e.etapa_proxima_id) : "—"}</td>
            <td>${e.etapa_proxima_vinculo ?? "—"}</td>
            <td>
              ${e.tipo === "aprovacao" ? `<button type="button" class="btn-acoes" data-id="${e.id}">Ações</button>` : ""}
              <button type="button" class="btn-excluir-etapa" data-id="${e.id}">Excluir</button>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>

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
      <label>Próxima etapa (opcional — deixe em branco se esta etapa usa Ações) ${info(
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

    <div id="secao-acoes"></div>
  `;

  container.querySelectorAll(".btn-acoes").forEach((btn) =>
    btn.addEventListener("click", () => renderAcoes(Number(btn.dataset.id)))
  );
  container.querySelectorAll(".btn-excluir-etapa").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await api(`/etapas/${btn.dataset.id}`, { method: "DELETE" });
      renderEtapas(fluxoId);
    })
  );

  document.getElementById("form-etapa").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
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
  });
}
```

- [ ] **Step 4: Append the Ações editor to `fluxo.js`**

```js
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
                ? etapa.acoes.find((x) => x.id === a.prerequisito_acao_id)?.rotulo ?? "—"
                : "—"
            }</td>
            <td><button type="button" class="btn-excluir-acao" data-id="${a.id}">Excluir</button></td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
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
  `;

  container.querySelectorAll(".btn-excluir-acao").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await api(`/acoes/${btn.dataset.id}`, { method: "DELETE" });
      renderAcoes(etapaId);
    })
  );

  document.getElementById("form-acao").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
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
  });
}
```

- [ ] **Step 5: Manually verify in the browser**

With `npm run dev` running, log in and open "Fluxos". Select "Produto
Derivado" in the dropdown. Expected: 3 seeded etapas listed ("Solicitação",
"Avaliação Projetos", "Desenvolvimento de Produto"), the last one showing an
"Ações" button. Click it — expected: 3 seeded ações listed ("Criar ficha
técnica nova", "Criar material gráfico novo", "Criar embalagem nova"). Add a
throwaway etapa and a throwaway ação to confirm the create forms work, then
delete both to leave the seeded data intact.

- [ ] **Step 6: Commit**

```bash
git add fluxo.html fluxo.js
git commit -m "Add Cadastro de Fluxo screen: Etapas and Ações editors"
```

---

## Task 11: Meus Chamados (home) + Abrir Novo Chamado

Deadline-badge logic is duplicated here as a few inline lines instead of
importing `functions/_lib/prazos.js`, because Cloudflare Pages does not
serve `/functions/**` as static assets — the frontend and the Functions
backend cannot share an ES module without a build step, which this project
deliberately doesn't have.

**Files:**
- Create: `chamados.html`
- Create: `chamados.js`
- Create: `novo-chamado.html`
- Create: `novo-chamado.js`

**Interfaces:**
- Consumes: `api` (Task 8), `exigirLogin/montarNav` (Task 8), `GET /api/chamados?setor_id=`, `POST /api/chamados`, `GET /api/fluxos`, `GET /api/fluxos/:id/etapas` (Tasks 5–6).

- [ ] **Step 1: Write `chamados.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel — Meus Chamados</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div id="nav"></div>
<main>
  <h1>Meus chamados</h1>
  <p><a href="novo-chamado.html">+ Abrir novo chamado</a></p>
  <table>
    <thead><tr><th>Chamado</th><th>Status</th><th>Prazo</th><th>Situação</th></tr></thead>
    <tbody id="tabela-chamados"></tbody>
  </table>
</main>
<script type="module" src="chamados.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `chamados.js`**

```js
import { exigirLogin } from "./auth.js";
import { montarNav } from "./ui.js";
import { api } from "./api.js";

const usuario = exigirLogin();
if (usuario) {
  document.getElementById("nav").replaceWith(montarNav(usuario));
  carregarChamados();
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
  const chamados = await api(`/chamados?setor_id=${usuario.setor_id}`);
  document.getElementById("tabela-chamados").innerHTML = chamados
    .map(
      (c) => `
        <tr>
          <td><a href="chamado.html?id=${c.id}">#${c.id} — ${c.titulo}</a></td>
          <td>${c.status_nome}</td>
          <td>${c.prazo}</td>
          <td>${situacaoBadge(c.prazo, c.status_nome)}</td>
        </tr>`
    )
    .join("");
}
```

- [ ] **Step 3: Write `novo-chamado.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel — Novo Chamado</title>
<link rel="stylesheet" href="style.css">
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
    <label>Prazo (opcional — se vazio, usa o padrão do setor)
      <input type="date" name="prazo">
    </label>
    <button type="submit">Abrir chamado</button>
  </form>
  <p id="mensagem-erro" class="erro" hidden></p>
</main>
<script type="module" src="novo-chamado.js"></script>
</body>
</html>
```

- [ ] **Step 4: Write `novo-chamado.js`**

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
          solicitante_id: usuario.id,
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

- [ ] **Step 5: Manually verify in the browser**

With `npm run dev` running, log in as "Ana (Comercial)". "Meus chamados"
should load (empty, or with rows from Task 6/7's curl tests). Click "+ Abrir
novo chamado", select "Produto Derivado" / "Solicitação", submit. Expected:
redirect to `chamado.html?id=...` (a 404 is expected for now — built in Task
12). Go back to "Meus chamados" as Ana — the new mãe chamado should NOT
appear (it's already finalizado and its setor is Comercial, but more
importantly the flow already advanced past it); log out and log in as "Bruno
(Projetos)" and confirm the new Projetos chamado for this mãe appears there
instead, with a status/prazo badge.

- [ ] **Step 6: Commit**

```bash
git add chamados.html chamados.js novo-chamado.html novo-chamado.js
git commit -m "Add Meus Chamados and Abrir Novo Chamado screens"
```

---

## Task 12: Detalhe do Chamado — aprovar/reprovar, ações, status, horas, comentários

**Files:**
- Create: `chamado.html`
- Create: `chamado.js`

**Interfaces:**
- Consumes: `api` (Task 8), `exigirLogin/montarNav/info` (Task 8), `GET/PUT/DELETE /api/chamados/:id`, `POST /api/chamados/:id/decisao` (Task 6), `GET /api/etapas/:id` (Task 5), `GET/POST /api/chamados/:id/horas`, `GET/POST /api/chamados/:id/comentarios` (Task 7), `GET /api/status` (Task 4).

- [ ] **Step 1: Write `chamado.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel — Chamado</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div id="nav"></div>
<main>
  <p><a href="chamados.html">← Meus chamados</a> | <a id="link-geral" href="#">Ver chamado geral</a></p>
  <div id="detalhe"></div>
  <div id="acao"></div>
  <p><button type="button" id="btn-excluir-chamado">Excluir chamado</button></p>
  <section>
    <h2>Apontamento de horas <span id="total-horas"></span></h2>
    <ul id="lista-horas"></ul>
    <form class="formulario" id="form-horas">
      <label>Data <input type="date" name="data" required></label>
      <label>Horas <input type="number" step="0.5" min="0.5" name="horas" required></label>
      <label>Observação <input type="text" name="observacao"></label>
      <button type="submit">Lançar horas</button>
    </form>
  </section>
  <section>
    <h2>Comentários</h2>
    <ul id="lista-comentarios"></ul>
    <form class="formulario" id="form-comentario">
      <label>Novo comentário <textarea name="texto" required></textarea></label>
      <button type="submit">Comentar</button>
    </form>
  </section>
</main>
<script type="module" src="chamado.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write the top of `chamado.js` — bootstrap and detail rendering**

```js
import { exigirLogin } from "./auth.js";
import { montarNav, info } from "./ui.js";
import { api } from "./api.js";

const usuario = exigirLogin();
const id = new URLSearchParams(window.location.search).get("id");

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

  document.getElementById("btn-excluir-chamado").addEventListener("click", async () => {
    if (!window.confirm("Excluir este chamado e toda a sua subárvore? Isso não pode ser desfeito.")) {
      return;
    }
    await api(`/chamados/${id}`, { method: "DELETE" });
    window.location.href = "chamados.html";
  });

  document.getElementById("form-horas").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    await api(`/chamados/${id}/horas`, {
      method: "POST",
      body: {
        usuario_id: usuario.id,
        data: form.elements.data.value,
        horas: Number(form.elements.horas.value),
        observacao: form.elements.observacao.value || null,
      },
    });
    form.reset();
    carregarHoras();
  });

  document.getElementById("form-comentario").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    await api(`/chamados/${id}/comentarios`, {
      method: "POST",
      body: { usuario_id: usuario.id, texto: form.elements.texto.value },
    });
    form.reset();
    carregarComentarios();
  });

  carregarTudo();
}

async function carregarTudo() {
  await Promise.all([carregarDetalhe(), carregarHoras(), carregarComentarios()]);
}

async function carregarDetalhe() {
  const chamado = await api(`/chamados/${id}`);
  const finalizado = chamado.status_nome === "finalizado";

  document.getElementById("detalhe").innerHTML = `
    <h1>#${chamado.id} — ${chamado.titulo}</h1>
    <p>Setor: ${chamado.setor_nome} ${info("Setor responsável por esta etapa/tarefa.")}</p>
    <p>Status: ${chamado.status_nome} — Prazo: ${chamado.prazo} (${chamado.situacao_prazo})</p>
    ${chamado.resultado ? `<p>Resultado: ${chamado.resultado}</p>` : ""}
    ${
      chamado.bloqueado
        ? `<p class="erro">Bloqueado: aguardando outra ação pré-requisito finalizar.</p>`
        : ""
    }
  `;

  const acaoContainer = document.getElementById("acao");
  if (finalizado) {
    acaoContainer.innerHTML = "";
    return;
  }

  if (chamado.etapa_id && chamado.etapa_tipo === "aprovacao") {
    await renderAprovacao(chamado);
  } else {
    await renderStatusManual(chamado);
  }
}
```

- [ ] **Step 3: Append the aprovação panel to `chamado.js`**

```js
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
        body: { ...corpo, usuario_id: usuario.id },
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
```

- [ ] **Step 4: Append the manual-status panel to `chamado.js`**

```js
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
    await api(`/chamados/${chamado.id}`, { method: "PUT", body: { status_id: statusId } });
    carregarTudo();
  });
}
```

- [ ] **Step 5: Append horas and comentários rendering to `chamado.js`**

```js
async function carregarHoras() {
  const resumo = await api(`/chamados/${id}/horas`);
  document.getElementById("total-horas").textContent = `(total: ${resumo.total_horas}h)`;
  document.getElementById("lista-horas").innerHTML = resumo.lancamentos
    .map(
      (l) =>
        `<li>${l.data} — ${l.usuario_nome} — ${l.horas}h ${l.observacao ? `(${l.observacao})` : ""}</li>`
    )
    .join("");
}

async function carregarComentarios() {
  const comentarios = await api(`/chamados/${id}/comentarios`);
  document.getElementById("lista-comentarios").innerHTML = comentarios
    .map(
      (c) =>
        `<li><strong>${c.usuario_nome ?? "Sistema"}</strong> (${c.data})${
          c.eh_justificativa ? " — justificativa" : ""
        }: ${c.texto}</li>`
    )
    .join("");
}
```

- [ ] **Step 6: Manually verify the full happy path in the browser**

With `npm run dev` running: log in as "Bruno (Projetos)", open the Projetos
chamado created in Task 11's manual test. Expected: "Avaliação" panel with
Aprovar/Reprovar (no ações fieldset — this etapa has none). Click "Aprovar".
Expected: page reloads showing `status: finalizado`, `resultado: aprovado`.
Log out, log in as "Carla (Desenvolvimento)", open the newly created
Desenvolvimento chamado (visible in her "Meus chamados"). Expected:
"Avaliação" panel WITH a 3-checkbox "Ações" fieldset. Check "Criar ficha
técnica nova" and "Criar embalagem nova", leave "material gráfico"
unchecked, click Aprovar. Log in as "Diego (Engenharia)" — confirm 1 new
chamado ("Criar ficha técnica nova") appears in his "Meus chamados" with a
manual status selector (no aprovação panel, since it's an ação-leaf task).
Log in as "Elisa (Marketing)" — confirm "Criar embalagem nova" appears for
her. Finally open the mãe chamado's "Ver chamado geral" link from any of
these screens and confirm all created chamados show up in the tree.

- [ ] **Step 7: Commit**

```bash
git add chamado.html chamado.js
git commit -m "Add Detalhe do Chamado screen: decisão, ações, status, horas, comentários"
```

---

## Task 13: Chamado Geral — árvore somente leitura

**Files:**
- Create: `geral.html`
- Create: `geral.js`

**Interfaces:**
- Consumes: `api` (Task 8), `exigirLogin/montarNav` (Task 8), `GET /api/chamados/:id/arvore` (Task 6), `GET /api/chamados/:id/comentarios` (Task 7).

- [ ] **Step 1: Write `geral.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>WorkFlow Zagonel — Chamado Geral</title>
<link rel="stylesheet" href="style.css">
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

- [ ] **Step 2: Write `geral.js`**

```js
import { exigirLogin } from "./auth.js";
import { montarNav } from "./ui.js";
import { api } from "./api.js";

const usuario = exigirLogin();
const id = new URLSearchParams(window.location.search).get("id");

if (usuario && id) {
  document.getElementById("nav").replaceWith(montarNav(usuario));
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
          #${no.id} — ${no.titulo} (${no.setor_nome}) — ${no.status_nome}
          ${no.resultado ? ` — ${no.resultado}` : ""}
          — prazo ${no.prazo}${no.data_finalizacao ? `, finalizado em ${no.data_finalizacao}` : ""}
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

- [ ] **Step 3: Manually verify in the browser**

With `npm run dev` running, open the "Ver chamado geral" link from any
chamado created in Task 12's manual test. Expected: a collapsed tree with
the mãe at the top; expanding it reveals the Projetos and Desenvolvimento
nodes nested under it, and expanding Desenvolvimento reveals the 2 ação
tasks. Clicking each `<summary>` open for the first time loads and shows its
comments (including the justificativa comment if you also ran Task 6 Step
7's reject-path test on a different mãe). Confirm there are no action
buttons anywhere on this page — it must be read-only.

- [ ] **Step 4: Commit**

```bash
git add geral.html geral.js
git commit -m "Add Chamado Geral screen: read-only mãe/descendants tree"
```

---

## Task 14: Deploy and end-to-end smoke test on production

The Cloudflare Pages project is already connected to GitHub
(`felipeguntzel/workflow-zagonel`, branch `master`) with automatic deploys,
so `git push` alone triggers a production build. This task pushes everything
built in Tasks 1–13 and verifies the live site end to end.

**Files:** none (verification-only task).

- [ ] **Step 1: Run the full unit test suite one last time**

Run: `npm test`
Expected: every test in `functions/_lib/*.test.js` passes.

- [ ] **Step 2: Push to GitHub**

```bash
git push
```
Expected: Cloudflare Pages picks up the push and starts a build (check
`https://dash.cloudflare.com/5a06fe060a86db82aa4bd7effc27eabd/pages/view/workflow-zagonel`
for the deployment status, or run `wrangler pages deployment list --project-name=workflow-zagonel`).

- [ ] **Step 3: Confirm the remote D1 database has the schema and seed data**

Run:
```bash
wrangler d1 execute workflow_zagonel_db --remote --command="SELECT nome FROM fluxo_templates"
```
Expected: returns "Produto Derivado" (already applied in Task 1 Step 8 — this
just confirms the production binding in `wrangler.toml` matches).

- [ ] **Step 4: Smoke test the production API**

```bash
curl -s https://workflow-zagonel.pages.dev/api/empresas
curl -s https://workflow-zagonel.pages.dev/api/fluxos/1/etapas
```
Expected: same JSON shapes verified locally in Tasks 4–5.

- [ ] **Step 5: Smoke test the production UI**

Open `https://workflow-zagonel.pages.dev/` in a browser. Repeat a short
version of Task 12 Step 6's walkthrough: log in as "Ana (Comercial)", open
"Novo Chamado", create one "Produto Derivado" request, log in as "Bruno
(Projetos)" and approve it, confirm the Desenvolvimento chamado appears for
"Carla (Desenvolvimento)", and confirm "Ver chamado geral" shows the tree.

- [ ] **Step 6: Update `docs/PENDENCIAS.md` if the smoke test surfaces anything deferrable**

If Step 5 surfaces a rough edge that isn't a correctness bug (e.g. "the
árvore view could use a print-friendly layout"), add it to
`docs/PENDENCIAS.md` under a new bullet rather than scope-creeping this
plan. If it's a genuine bug (wrong data, broken flow), fix it as a follow-up
task instead of deferring it.

- [ ] **Step 7: Commit (only if Step 6 changed `docs/PENDENCIAS.md`)**

```bash
git add docs/PENDENCIAS.md
git commit -m "Note follow-up ideas from Fase 1 production smoke test"
git push
```
