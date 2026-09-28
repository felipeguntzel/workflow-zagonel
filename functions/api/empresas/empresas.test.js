import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "./index.js";
import { onRequestDelete } from "./[id].js";
import { gerarToken } from "../../_lib/sessao.js";

test("empresas: onRequestPost atribui o menor ID disponivel ao cadastrar", async () => {
  const token = await gerarToken(999, "segredo-teste");

  let queryInsert = "";
  let paramsInsert = [];

  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          this.params = params;
          return this;
        },
        async first() {
          if (sql.includes("FROM usuarios WHERE id = ?")) {
            return { id: 999, nome: "Admin", admin: 1 };
          }
          if (sql.includes("SELECT id FROM empresas WHERE LOWER")) {
            return null;
          }
          if (sql.includes("next_id")) {
            // Simula consulta de menor ID vago retornando 4
            return { next_id: 4 };
          }
          if (sql.includes("SELECT * FROM empresas WHERE id = ?")) {
            return { id: 4, codigo: "004", nome: "Empresa 4" };
          }
          return null;
        },
        async run() {
          if (sql.includes("INSERT INTO empresas")) {
            queryInsert = sql;
            paramsInsert = this.params;
          }
          return { meta: { last_row_id: 4 } };
        },
      };
    },
  };

  const context = {
    env: { DB: mockDb, SESSAO_SEGREDO: "segredo-teste" },
    request: new Request("http://localhost/api/empresas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ nome: "Empresa 4" }),
    }),
  };

  const res = await onRequestPost(context);
  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.id, 4);
  assert.equal(json.codigo, "004");
  assert.ok(queryInsert.includes("INSERT INTO empresas"));
  assert.equal(paramsInsert[0], 4); // Primeiro parâmetro é o ID 4
});

test("empresas: onRequestDelete remove empresa e atualiza sequencia", async () => {
  const token = await gerarToken(999, "segredo-teste");
  let deleteSequenceChamado = false;

  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          this.params = params;
          return this;
        },
        async all() {
          return { results: [] };
        },
        async first() {
          if (sql.includes("FROM usuarios WHERE id = ?")) {
            return { id: 999, nome: "Admin", admin: 1 };
          }
          if (sql.includes("SELECT * FROM empresas WHERE id = ?")) {
            return { id: 4, nome: "Empresa 4" };
          }
          if (sql.includes("COALESCE(MAX(id), 0)")) {
            return { max_id: 3 };
          }
          return null;
        },
        async run() {
          if (sql.includes("sqlite_sequence")) {
            deleteSequenceChamado = true;
          }
          return { meta: { changes: 1 } };
        },
      };
    },
  };

  const context = {
    env: { DB: mockDb, SESSAO_SEGREDO: "segredo-teste" },
    params: { id: "4" },
    request: new Request("http://localhost/api/empresas/4", {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    }),
  };

  const res = await onRequestDelete(context);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.ok(deleteSequenceChamado);
});
