import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "./index.js";
import { onRequestPut } from "./[id].js";
import { gerarToken } from "../../_lib/sessao.js";

test("onRequestPost rejeita cor duplicada em status", async () => {
  const token = await gerarToken(999, "segredo-teste");

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
          if (sql.includes("SELECT id, nome FROM status WHERE LOWER(cor)")) {
            return { id: 1, nome: "previsto", cor: "#2563eb" };
          }
          return null;
        },
        async run() {
          return { meta: { last_row_id: 2 } };
        },
      };
    },
  };

  const context = {
    env: { DB: mockDb, SESSAO_SEGREDO: "segredo-teste" },
    request: new Request("http://localhost/api/status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ nome: "novo status", cor: "#2563eb" }),
    }),
  };

  const res = await onRequestPost(context);
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.ok(json.error.includes("já está em uso pelo status"));
});

test("onRequestPut rejeita cor duplicada quando outro status ja a utiliza", async () => {
  const token = await gerarToken(999, "segredo-teste");

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
          if (sql.includes("SELECT * FROM status WHERE id = ?")) {
            return { id: 2, nome: "em andamento", cor: "#10b981" };
          }
          if (sql.includes("SELECT id, nome FROM status WHERE LOWER(cor) = LOWER(?) AND id != ?")) {
            return { id: 1, nome: "previsto", cor: "#2563eb" };
          }
          return null;
        },
        async run() {
          return { meta: {} };
        },
      };
    },
  };

  const context = {
    env: { DB: mockDb, SESSAO_SEGREDO: "segredo-teste" },
    params: { id: "2" },
    request: new Request("http://localhost/api/status/2", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ nome: "em andamento", cor: "#2563eb" }),
    }),
  };

  const res = await onRequestPut(context);
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.ok(json.error.includes("já está em uso pelo status"));
});
