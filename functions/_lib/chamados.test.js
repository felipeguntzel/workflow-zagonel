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
  const sqlsExecutados = [];
  const mockDb = {
    prepare(sql) {
      sqlsExecutados.push(sql);
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
  assert.ok(sqlsExecutados.some((s) => s.includes("LEFT JOIN fluxo_templates ft ON ft.id = c.fluxo_template_id")));
  assert.ok(!sqlsExecutados.some((s) => s.includes("fluxos_template")));
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

test("criarChamado aceita etapa_id e acao_origem_id juntos", async () => {
  const { criarChamado } = await import("./chamados.js");
  const inseridos = [];
  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          this.params = params;
          return this;
        },
        async first() {
          if (sql.includes("FROM chamados WHERE id = ?")) {
            return { id: 3, etapa_id: 10, acao_origem_id: 5 };
          }
          if (sql.includes("FROM status")) {
            return { id: 1 };
          }
          if (sql.includes("FROM etapas")) {
            return { setor_id: 2, prazo_padrao_dias: 3 };
          }
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          if (sql.includes("INSERT INTO chamados")) {
            inseridos.push({ sql, params: this.params });
          }
          return { meta: { last_row_id: 3 } };
        },
      };
    },
  };

  const chamado = await criarChamado(mockDb, {
    fluxo_template_id: 1,
    etapa_id: 10,
    acao_origem_id: 5,
    chamado_mae_id: 1,
    chamado_pai_id: 1,
    empresa_id: 1,
    solicitante_id: 1,
  });

  assert.equal(chamado.id, 3);
  assert.equal(inseridos.length, 1);
  assert.equal(inseridos[0].params[1], 10); // etapa_id
  assert.equal(inseridos[0].params[2], 5);  // acao_origem_id
});

test("criarChamado aplica fallback caso o banco legado falhe com CHECK constraint", async () => {
  const { criarChamado } = await import("./chamados.js");
  let tentouComAcao = false;
  let usouFallback = false;
  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          this.params = params;
          return this;
        },
        async first() {
          if (sql.includes("FROM chamados WHERE id = ?")) {
            return { id: 4, etapa_id: 10, acao_origem_id: null };
          }
          if (sql.includes("FROM status")) {
            return { id: 1 };
          }
          if (sql.includes("FROM etapas")) {
            return { setor_id: 2, prazo_padrao_dias: 3 };
          }
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          if (sql.includes("INSERT INTO chamados")) {
            if (this.params[2] !== null && !tentouComAcao) {
              tentouComAcao = true;
              throw new Error("CHECK constraint failed: (etapa_id IS NOT NULL) != (acao_origem_id IS NOT NULL)");
            }
            if (this.params[2] === null) {
              usouFallback = true;
            }
          }
          return { meta: { last_row_id: 4 } };
        },
      };
    },
  };

  const chamado = await criarChamado(mockDb, {
    fluxo_template_id: 1,
    etapa_id: 10,
    acao_origem_id: 5,
    chamado_mae_id: 1,
    chamado_pai_id: 1,
    empresa_id: 1,
    solicitante_id: 1,
  });

  assert.ok(tentouComAcao);
  assert.ok(usouFallback);
  assert.equal(chamado.id, 4);
});

test("verificarPermissaoComentariosChamado permite comentários em subchamados normais", async () => {
  const { verificarPermissaoComentariosChamado } = await import("./chamados.js");
  const subchamado = { id: 2, chamado_mae_id: 1 };
  const mockDb = {};
  const res = await verificarPermissaoComentariosChamado(mockDb, subchamado);
  assert.equal(res.permitido, true);
});

test("verificarPermissaoComentariosChamado permite comentários no chamado mãe enquanto etapa 1 está prevista", async () => {
  const { verificarPermissaoComentariosChamado } = await import("./chamados.js");
  const chamadoMae = { id: 1, chamado_mae_id: null };
  const mockDb = {
    prepare(sql) {
      return {
        bind() { return this; },
        async all() {
          return {
            results: [
              { id: 2, status_nome: "previsto", resultado: null, data_finalizacao: null, etapa_tipo: "aprovacao" },
              { id: 3, status_nome: "previsto", resultado: null, data_finalizacao: null, etapa_tipo: "aprovacao" },
            ],
          };
        },
      };
    },
  };
  const res = await verificarPermissaoComentariosChamado(mockDb, chamadoMae);
  assert.equal(res.permitido, true);
});

test("verificarPermissaoComentariosChamado bloqueia comentários no chamado mãe quando etapa 1 foi aprovada/finalizada", async () => {
  const { verificarPermissaoComentariosChamado } = await import("./chamados.js");
  const chamadoMae = { id: 1, chamado_mae_id: null };
  const mockDb = {
    prepare(sql) {
      return {
        bind() { return this; },
        async all() {
          return {
            results: [
              { id: 2, status_nome: "finalizado", resultado: "aprovado", data_finalizacao: "2026-09-28", etapa_tipo: "aprovacao" },
              { id: 3, status_nome: "previsto", resultado: null, data_finalizacao: null, etapa_tipo: "aprovacao" },
            ],
          };
        },
      };
    },
  };
  const res = await verificarPermissaoComentariosChamado(mockDb, chamadoMae);
  assert.equal(res.permitido, false);
  assert.ok(res.motivo.includes("primeira etapa de aprovação estiver prevista"));
});

