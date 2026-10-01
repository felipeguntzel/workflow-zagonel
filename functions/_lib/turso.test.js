import test from "node:test";
import assert from "node:assert/strict";
import { createTursoD1Adapter, getTursoDb } from "./turso.js";
import { all, first, run, batch } from "./db.js";

test("turso: createTursoD1Adapter wraps execute into D1 interface", async () => {
  const mockClient = {
    async execute({ sql, args }) {
      if (sql.includes("SELECT")) {
        return {
          columns: ["id", "nome"],
          rows: [{ id: 1, nome: "Teste" }],
          rowsAffected: 0,
        };
      }
      return {
        columns: [],
        rows: [],
        rowsAffected: 1,
        lastInsertRowid: 42n,
      };
    },
    async batch(stmts) {
      return stmts.map((s, idx) => ({
        columns: ["id"],
        rows: [{ id: idx + 1 }],
        rowsAffected: 1,
        lastInsertRowid: BigInt(idx + 1),
      }));
    },
    async executeMultiple(sql) {
      return;
    },
  };

  const adapter = createTursoD1Adapter(mockClient);
  assert.equal(adapter._isTurso, true);

  // Test .all()
  const rows = await adapter.prepare("SELECT * FROM test WHERE id = ?").bind(1).all();
  assert.deepEqual(rows.results, [{ id: 1, nome: "Teste" }]);
  assert.equal(rows.success, true);

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
  assert.equal(batchRes[0].results[0].id, 1);
  assert.equal(batchRes[1].results[0].id, 2);

  // Test functions/_lib/db.js integration with Turso adapter
  const allFromDb = await all(adapter, "SELECT * FROM test WHERE id = ?", 1);
  assert.deepEqual(allFromDb, [{ id: 1, nome: "Teste" }]);

  const firstFromDb = await first(adapter, "SELECT * FROM test WHERE id = ?", 1);
  assert.deepEqual(firstFromDb, { id: 1, nome: "Teste" });

  const runFromDb = await run(adapter, "UPDATE test SET nome = ? WHERE id = ?", "Atualizado", 1);
  assert.equal(runFromDb.meta.last_row_id, 42);
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
