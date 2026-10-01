import test from "node:test";
import assert from "node:assert/strict";
import { createTursoHttpAdapter, getTursoDb } from "./turso.js";
import { all, first, run, batch } from "./db.js";

test("turso: createTursoHttpAdapter maps pipeline responses into D1 interface", async () => {
  // Mock global fetch for this test
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const results = body.requests.map((req) => {
      if (req.type === "close") {
        return { type: "ok", response: { type: "close" } };
      }
      if (req.stmt?.sql?.includes("SELECT")) {
        return {
          type: "ok",
          response: {
            type: "execute",
            result: {
              cols: [{ name: "id" }, { name: "nome" }],
              rows: [
                [{ type: "integer", value: "1" }, { type: "text", value: "Teste" }],
              ],
              affected_row_count: 0,
              last_insert_rowid: null,
              query_duration_ms: 0.5,
            },
          },
        };
      }
      return {
        type: "ok",
        response: {
          type: "execute",
          result: {
            cols: [],
            rows: [],
            affected_row_count: 1,
            last_insert_rowid: "42",
            query_duration_ms: 0.5,
          },
        },
      };
    });

    return {
      ok: true,
      async json() {
        return { results };
      },
    };
  };

  try {
    const adapter = createTursoHttpAdapter({
      url: "libsql://test.turso.io",
      authToken: "test_token",
    });
    assert.equal(adapter._isTurso, true);

    // Test .all()
    const rows = await adapter.prepare("SELECT * FROM test WHERE id = ?").bind(1).all();
    assert.deepEqual(rows.results, [{ id: 1, nome: "Teste" }]);
    assert.equal(rows.success, true);
    assert.equal(rows.meta.changes, 0);

    // Test .first()
    const item = await adapter.prepare("SELECT * FROM test WHERE id = ?").bind(1).first();
    assert.deepEqual(item, { id: 1, nome: "Teste" });

    const colValue = await adapter.prepare("SELECT * FROM test WHERE id = ?").bind(1).first("nome");
    assert.equal(colValue, "Teste");

    // Test .run()
    const runResult = await adapter.prepare("INSERT INTO test (nome) VALUES (?)").bind("Novo").run();
    assert.equal(runResult.success, true);
    assert.equal(runResult.meta.changes, 1);
    assert.equal(runResult.meta.last_row_id, 42);

    // Test .batch()
    const batchRes = await adapter.batch([
      adapter.prepare("INSERT INTO test VALUES (?)").bind("a"),
      adapter.prepare("INSERT INTO test VALUES (?)").bind("b"),
    ]);
    assert.equal(batchRes.length, 2);

    // Test db.js integration with Turso adapter
    const allFromDb = await all(adapter, "SELECT * FROM test WHERE id = ?", 1);
    assert.deepEqual(allFromDb, [{ id: 1, nome: "Teste" }]);

    const firstFromDb = await first(adapter, "SELECT * FROM test WHERE id = ?", 1);
    assert.deepEqual(firstFromDb, { id: 1, nome: "Teste" });

    const runFromDb = await run(adapter, "UPDATE test SET nome = ? WHERE id = ?", "Atualizado", 1);
    assert.equal(runFromDb.meta.last_row_id, 42);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("turso: getTursoDb returns null when env vars are missing", () => {
  assert.equal(getTursoDb(null), null);
  assert.equal(getTursoDb({}), null);
  assert.equal(getTursoDb({ TURSO_DATABASE_URL: "url" }), null);
});

test("turso: getTursoDb creates and caches adapter when env vars are provided", () => {
  const env = {
    TURSO_DATABASE_URL: "libsql://workflow-zagonel-felipeguntzel.aws-sa-east-1.turso.io",
    TURSO_AUTH_TOKEN: "dummy_token",
  };
  const adapter1 = getTursoDb(env);
  assert.ok(adapter1);
  assert.equal(adapter1._isTurso, true);

  const adapter2 = getTursoDb(env);
  assert.equal(adapter1, adapter2, "Should return cached instance");
});
