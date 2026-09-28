import test from "node:test";
import assert from "node:assert/strict";
import { onRequestDelete } from "./[id].js";
import { gerarToken } from "../../_lib/sessao.js";

const SEGREDO = "segredo-teste-chamados-delete";

test("onRequestDelete retorna erro 401 se nao autenticado", async () => {
  const ctx = {
    request: new Request("http://localhost/api/chamados/10", { method: "DELETE" }),
    params: { id: "10" },
    env: { DB: {}, SESSAO_SEGREDO: SEGREDO },
  };
  const res = await onRequestDelete(ctx);
  assert.equal(res.status, 401);
});

test("onRequestDelete remove subarvore e limpa dependencias com sucesso", async () => {
  const token = await gerarToken(1, SEGREDO);

  const sqlExecutados = [];

  const dbMock = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              sqlExecutados.push({ sql, args, op: "first" });
              if (sql.includes("FROM usuarios WHERE id = ?")) {
                return { id: 1, nome: "Admin", setor_id: 1, admin: 1, deve_trocar_senha: 0 };
              }
              if (sql.includes("FROM chamados WHERE id = ?")) {
                return { id: 10, chamado_mae_id: 10, titulo: "Chamado Raiz" };
              }
              return null;
            },
            async all() {
              sqlExecutados.push({ sql, args, op: "all" });
              if (sql.includes("chamado_mae_id = ? OR id = ?")) {
                return { results: [{ id: 10 }, { id: 11 }] };
              }
              return { results: [] };
            },
            async run() {
              sqlExecutados.push({ sql, args, op: "run" });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };

  const ctx = {
    request: new Request("http://localhost/api/chamados/10", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),
    params: { id: "10" },
    env: { DB: dbMock, SESSAO_SEGREDO: SEGREDO },
  };

  const res = await onRequestDelete(ctx);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.deepEqual(data.excluidos, [10, 11]);

  // Verifica se desvinculou FKs
  const updateFk = sqlExecutados.some(
    (e) => e.op === "run" && e.sql.includes("UPDATE chamados SET chamado_pai_id = NULL, chamado_mae_id = NULL")
  );
  assert.equal(updateFk, true);

  // Verifica se deletou historico_auditoria
  const deleteHist = sqlExecutados.some(
    (e) => e.op === "run" && e.sql.includes("DELETE FROM historico_auditoria WHERE chamado_id = ? OR chamado_mae_id = ?")
  );
  assert.equal(deleteHist, true);

  // Verifica se deletou de chamados
  const deleteChamado = sqlExecutados.some(
    (e) => e.op === "run" && e.sql.includes("DELETE FROM chamados WHERE id = ?")
  );
  assert.equal(deleteChamado, true);
});
