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

test("sincronizarProgressoChamadoMae mantém mãe em andamento se houver subchamados pendentes", async () => {
  const { sincronizarProgressoChamadoMae } = await import("./chamados.js");
  const sqlExecutados = [];

  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          this.params = params;
          return this;
        },
        async first() {
          if (sql.includes("FROM chamados WHERE id = ?")) {
            return { id: 2, chamado_mae_id: 1 };
          }
          if (sql.includes("FROM status")) {
            return { id: 2 };
          }
          return null;
        },
        async all() {
          if (sql.includes("WHERE chamado_mae_id = ?")) {
            return {
              results: [
                { id: 2, status_id: 3, data_finalizacao: "2026-09-25" },
                { id: 3, status_id: 1, data_finalizacao: null },
              ],
            };
          }
          return { results: [] };
        },
        async run() {
          sqlExecutados.push({ sql, params: this.params });
          return { meta: {} };
        },
      };
    },
  };

  await sincronizarProgressoChamadoMae(mockDb, 2, "2026-09-25");

  assert.ok(
    sqlExecutados.some(
      (e) => e.sql.includes("UPDATE chamados SET status_id = ?, data_finalizacao = NULL WHERE id = ?")
    ),
    "Deveria manter chamado mãe em andamento"
  );
});

test("sincronizarProgressoChamadoMae finaliza mãe quando todos subchamados estão concluídos", async () => {
  const { sincronizarProgressoChamadoMae } = await import("./chamados.js");
  const sqlExecutados = [];

  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          this.params = params;
          return this;
        },
        async first() {
          if (sql.includes("FROM chamados WHERE id = ?")) {
            return { id: 3, chamado_mae_id: 1 };
          }
          if (sql.includes("FROM status WHERE LOWER(nome) = LOWER(?)")) {
            return { id: 3 };
          }
          return null;
        },
        async all() {
          if (sql.includes("WHERE chamado_mae_id = ?")) {
            return {
              results: [
                { id: 2, status_id: 3, data_finalizacao: "2026-09-24" },
                { id: 3, status_id: 3, data_finalizacao: "2026-09-25" },
              ],
            };
          }
          return { results: [] };
        },
        async run() {
          sqlExecutados.push({ sql, params: this.params });
          return { meta: {} };
        },
      };
    },
  };

  await sincronizarProgressoChamadoMae(mockDb, 3, "2026-09-25");

  assert.ok(
    sqlExecutados.some(
      (e) => e.sql.includes("UPDATE chamados SET status_id = ?, data_finalizacao = COALESCE(data_finalizacao, ?) WHERE id = ?")
    ),
    "Deveria finalizar o chamado mãe quando todos os subchamados terminarem"
  );
});

test("avancarFluxo padroniza titulo dos subchamados como 'Etapa tal - Ref Chamado X'", async () => {
  const { avancarFluxo } = await import("./chamados.js");
  const chamadosInseridos = [];

  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          this.params = params;
          return this;
        },
        async first() {
          if (sql.includes("FROM etapas WHERE id = ?")) {
            return { nome: "Criar Ficha Técnica" };
          }
          if (sql.includes("FROM status")) {
            return { id: 1, nome: "previsto" };
          }
          if (sql.includes("FROM chamados WHERE id = ?")) {
            return { id: 2, titulo: chamadosInseridos[0]?.titulo };
          }
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          if (sql.includes("INSERT INTO chamados")) {
            chamadosInseridos.push({ sql, params: this.params });
          }
          return { meta: { last_row_id: 2 } };
        },
      };
    },
  };

  const chamadoMae = {
    id: 19,
    chamado_mae_id: null,
    fluxo_template_id: 1,
    empresa_id: 1,
    solicitante_id: 5,
    titulo: "DUCHA MOMENT 9000W",
    prioridade: "normal",
    observacao: "Solicitação original",
  };

  const etapa = {
    id: 100,
    acoes: [
      {
        id: 50,
        rotulo: "Criar Ficha",
        setor_destino_id: 2,
        etapa_destino_id: 101,
        vinculo: "mae",
      },
    ],
  };

  const criados = await avancarFluxo(mockDb, chamadoMae, etapa, { 50: true });

  assert.equal(criados.length, 1);
  // O título do subchamado inserido deve conter 'Criar Ficha Técnica - Ref Chamado 19'
  const paramsInsert = chamadosInseridos[0].params;
  const tituloGerado = paramsInsert.find((p) => typeof p === "string" && p.includes("Ref Chamado 19"));
  assert.equal(tituloGerado, "Criar Ficha Técnica - Ref Chamado 19");
});
