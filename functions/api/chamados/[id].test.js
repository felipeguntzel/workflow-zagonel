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

test("onRequestPut permite que o usuario responsavel altere o status do chamado", async () => {
  const { onRequestPut } = await import("./[id].js");
  const token = await gerarToken(5, SEGREDO);

  const dbMock = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM usuarios WHERE id = ?")) {
                // Usuário comum, não admin, setor 2
                return { id: 5, nome: "Operador Dev", setor_id: 2, admin: 0, deve_trocar_senha: 0 };
              }
              if (sql.includes("FROM chamados c")) {
                // Chamado onde responsavel_id = 5
                return {
                  id: 3,
                  responsavel_id: 5,
                  setor_id: 2,
                  status_id: 1,
                  status_nome: "previsto",
                  titulo: "Aprovação 2 - Desenvolvimento",
                  etapa_id: 2,
                  etapa_tipo: "aprovacao"
                };
              }
              if (sql.includes("FROM status WHERE id = ?")) {
                return { nome: "em desenvolvimento" };
              }
              return null;
            },
            async all() {
              if (sql.includes("FROM usuario_grupos")) {
                return { results: [] };
              }
              if (sql.includes("PRAGMA table_info")) {
                return { results: [{ name: "titulo" }, { name: "prioridade" }, { name: "observacao" }, { name: "empresa_id" }] };
              }
              return { results: [] };
            },
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };

  const ctx = {
    request: new Request("http://localhost/api/chamados/3", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status_id: 2 }),
    }),
    params: { id: "3" },
    env: { DB: dbMock, SESSAO_SEGREDO: SEGREDO },
  };

  const res = await onRequestPut(ctx);
  assert.equal(res.status, 200);
});

test("onRequestPut rejeita alteração se usuário não for responsável, nem do setor, nem tiver permissão", async () => {
  const { onRequestPut } = await import("./[id].js");
  const token = await gerarToken(9, SEGREDO);

  const dbMock = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM usuarios WHERE id = ?")) {
                // Usuário comum de outro setor (setor 9)
                return { id: 9, nome: "Outro Usuário", setor_id: 9, admin: 0, deve_trocar_senha: 0 };
              }
              if (sql.includes("FROM chamados c")) {
                // Chamado do setor 2 com outro responsável
                return {
                  id: 3,
                  responsavel_id: 5,
                  setor_id: 2,
                  status_id: 1,
                  status_nome: "previsto",
                  titulo: "Aprovação 2",
                  etapa_id: 2
                };
              }
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };

  const ctx = {
    request: new Request("http://localhost/api/chamados/3", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status_id: 2 }),
    }),
    params: { id: "3" },
    env: { DB: dbMock, SESSAO_SEGREDO: SEGREDO },
  };

  const res = await onRequestPut(ctx);
  assert.equal(res.status, 403);
});

