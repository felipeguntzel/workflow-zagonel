import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestDelete } from "./index.js";

function mockContext({ method = "GET", url = "http://localhost/api/auditoria", admin = 1 } = {}) {
  const db = {
    prepare(query) {
      return {
        bind(...args) {
          return {
            async run() {
              return { meta: { changes: 3 } };
            },
            async all() {
              if (query.includes("sqlite_master")) {
                return { results: [] };
              }
              if (query.includes("auditoria_sistema")) {
                return { results: [{ id: 1, entidade: "chamados", acao: "criacao", criado_em: "2026-09-28 09:00:00" }] };
              }
              return { results: [] };
            },
            async first() {
              if (query.includes("COUNT(*)")) {
                return { total: 1 };
              }
              return null;
            },
          };
        },
      };
    },
  };

  return {
    request: new Request(url, {
      method,
      headers: {
        Authorization: "Bearer token-mock",
      },
    }),
    env: {
      DB: db,
      SESSAO_SEGREDO: "segredo-teste",
    },
    // Mock para compatibilidade se exigirAdmin for chamado diretamente
    usuario: { id: 1, nome: "Admin", admin: 1 },
  };
}

test("onRequestGet retorna erro 401 se nao autenticado", async () => {
  const ctx = {
    request: new Request("http://localhost/api/auditoria"),
    env: { DB: {}, SESSAO_SEGREDO: "teste" },
  };
  const res = await onRequestGet(ctx);
  assert.equal(res.status, 401);
});

test("onRequestDelete retorna erro 401 se nao autenticado", async () => {
  const ctx = {
    request: new Request("http://localhost/api/auditoria", { method: "DELETE" }),
    env: { DB: {}, SESSAO_SEGREDO: "teste" },
  };
  const res = await onRequestDelete(ctx);
  assert.equal(res.status, 401);
});
