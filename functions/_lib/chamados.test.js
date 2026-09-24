import test from "node:test";
import assert from "node:assert/strict";
import { hojeISO, garantirColunasChamados } from "./chamados.js";

test("hojeISO retorna data atual no formato YYYY-MM-DD", () => {
  const data = hojeISO();
  assert.match(data, /^\d{4}-\d{2}-\d{2}$/);
});

test("garantirColunasChamados adiciona titulo, prioridade e observacao se faltarem", async () => {
  const sqlExecutados = [];
  const colunasExistentes = [{ name: "id" }, { name: "solicitante_id" }];

  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          this.params = params;
          return this;
        },
        async all() {
          if (sql.includes("PRAGMA table_info")) {
            return { results: colunasExistentes };
          }
          return { results: [] };
        },
        async run() {
          sqlExecutados.push(sql);
          return { meta: {} };
        },
        async first() {
          return null;
        },
      };
    },
  };

  await garantirColunasChamados(mockDb);

  assert.ok(sqlExecutados.some((s) => s.includes("ADD COLUMN titulo")));
  assert.ok(sqlExecutados.some((s) => s.includes("ADD COLUMN prioridade")));
  assert.ok(sqlExecutados.some((s) => s.includes("ADD COLUMN observacao")));
});
