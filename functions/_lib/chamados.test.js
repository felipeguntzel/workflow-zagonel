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
  assert.ok(sqlExecutados.some((s) => s.includes("ALTER TABLE status ADD COLUMN cor TEXT")));
  assert.ok(sqlExecutados.some((s) => s.includes("ALTER TABLE fluxo_templates ADD COLUMN ativo INTEGER DEFAULT 1")));
});

test("chamadoComDetalhes utiliza tabela fluxo_templates e consulta status_cor", async () => {
  const { chamadoComDetalhes } = await import("./chamados.js");
  let sqlExecutado = "";
  const mockDb = {
    prepare(sql) {
      sqlExecutado = sql;
      return {
        bind() { return this; },
        async first() {
          return {
            id: 1,
            titulo: "Chamado Teste",
            status_nome: "previsto",
            status_cor: "#2563eb",
            prazo: "2026-10-10",
          };
        },
        async all() {
          return { results: [] };
        },
      };
    },
  };
  const res = await chamadoComDetalhes(mockDb, 1);
  assert.ok(sqlExecutado.includes("LEFT JOIN fluxo_templates ft ON ft.id = c.fluxo_template_id"));
  assert.ok(!sqlExecutado.includes("fluxos_template"));
  assert.equal(res.status_cor, "#2563eb");
});
