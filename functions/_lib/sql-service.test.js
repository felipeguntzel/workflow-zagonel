import test from "node:test";
import assert from "node:assert/strict";
import {
  classificarSql,
  gerarPreComandos,
  executarSql,
  traduzirMensagemErroSql,
  limparMensagemErroSql,
  diagnosticarErroSql,
} from "./sql-service.js";

test("classificarSql identifica consultas de leitura e comandos de mutação", () => {
  assert.equal(classificarSql("SELECT * FROM usuarios;").ehLeitura, true);
  assert.equal(classificarSql("  select id, nome from empresas").ehLeitura, true);
  assert.equal(classificarSql("-- comentario\nWITH cte AS (select 1) select * from cte").ehLeitura, true);
  assert.equal(classificarSql("/* bloco */ PRAGMA table_info(usuarios)").ehLeitura, true);

  assert.equal(classificarSql("INSERT INTO empresas (nome) VALUES ('X')").ehLeitura, false);
  assert.equal(classificarSql("UPDATE usuarios SET nome = 'Y' WHERE id = 1").ehLeitura, false);
  assert.equal(classificarSql("DELETE FROM status WHERE id = 2").ehLeitura, false);
  assert.equal(classificarSql("").vazio, true);
});

test("gerarPreComandos cria select, insert, update e delete para tabela", () => {
  const tabela = {
    nome: "empresas",
    colunas: [
      { nome: "id", tipo: "INTEGER", pk: true },
      { nome: "nome", tipo: "TEXT", pk: false },
      { nome: "codigo", tipo: "TEXT", pk: false },
    ],
  };

  const cmds = gerarPreComandos(tabela);
  assert.match(cmds.select, /SELECT \* FROM empresas LIMIT 100;/);
  assert.match(cmds.insert, /INSERT INTO empresas \(nome, codigo\)/);
  assert.match(cmds.update, /UPDATE empresas\nSET [\s\S]*WHERE id = 1;/);
  assert.match(cmds.delete, /DELETE FROM empresas\nWHERE id = 1;/);
  assert.match(cmds.reset_id, /DELETE FROM sqlite_sequence WHERE name = 'empresas';/);
});

test("executarSql executa SELECT e retorna linhas e colunas", async () => {
  const dbMock = {
    prepare: (sql) => ({
      all: async () => ({
        results: [
          { id: 1, nome: "Zagonel Matriz" },
          { id: 2, nome: "Filial 1" },
        ],
        meta: { duration: 5 },
      }),
    }),
  };

  const res = await executarSql(dbMock, "SELECT id, nome FROM empresas;");
  assert.equal(res.sucesso, true);
  assert.equal(res.tipo, "consulta");
  assert.deepEqual(res.colunas, ["id", "nome"]);
  assert.equal(res.totalLinhas, 2);
  assert.equal(res.linhas[0].nome, "Zagonel Matriz");
});

test("executarSql executa UPDATE/DELETE e retorna linhas afetadas", async () => {
  const dbMock = {
    prepare: (sql) => ({
      run: async () => ({
        meta: { changes: 3, last_row_id: null, duration: 8 },
      }),
    }),
  };

  const res = await executarSql(dbMock, "UPDATE empresas SET nome = 'Teste' WHERE id > 0;");
  assert.equal(res.sucesso, true);
  assert.equal(res.tipo, "execucao");
  assert.equal(res.linhasAfetadas, 3);
  assert.match(res.mensagem, /3 linha\(s\) afetada\(s\)/);
});

test("restaurarSequenciasIds executa DELETE em sqlite_sequence", async () => {
  const { restaurarSequenciasIds } = await import("./sql-service.js");
  const chamadas = [];
  const dbMock = {
    prepare: (sql) => ({
      bind: (...args) => {
        chamadas.push({ sql, args });
        return {
          run: async () => ({ meta: { changes: 1 } }),
        };
      },
      run: async () => {
        chamadas.push({ sql, args: [] });
        return { meta: { changes: 5 } };
      },
    }),
  };

  const res1 = await restaurarSequenciasIds(dbMock, "chamados");
  assert.equal(res1.sucesso, true);
  assert.equal(res1.tabela, "chamados");
  assert.ok(chamadas.some((c) => c.sql.includes("DELETE FROM sqlite_sequence WHERE name = ?") && c.args[0] === "chamados"));

  const res2 = await restaurarSequenciasIds(dbMock);
  assert.equal(res2.sucesso, true);
  assert.equal(res2.tabela, "todas");
  assert.ok(chamadas.some((c) => c.sql === "DELETE FROM sqlite_sequence"));
});

test("limparMensagemErroSql remove prefixos tecnicos de erro", () => {
  assert.equal(
    limparMensagemErroSql("D1_ERROR: FOREIGN KEY constraint failed"),
    "FOREIGN KEY constraint failed"
  );
  assert.equal(
    limparMensagemErroSql("SQLite error: UNIQUE constraint failed: chamados.id"),
    "UNIQUE constraint failed: chamados.id"
  );
  assert.equal(
    limparMensagemErroSql("Error: syntax error"),
    "syntax error"
  );
});

test("traduzirMensagemErroSql traduz erros comuns do SQLite", () => {
  // Foreign Key
  assert.match(
    traduzirMensagemErroSql("SQLite error: FOREIGN KEY constraint failed"),
    /Falha na restrição de chave estrangeira/
  );

  // Unique
  assert.match(
    traduzirMensagemErroSql("UNIQUE constraint failed: usuarios.email"),
    /Violação de valor único \(UNIQUE\): o campo "email" da tabela "usuarios"/
  );

  // Not Null
  assert.match(
    traduzirMensagemErroSql("NOT NULL constraint failed: chamados.titulo"),
    /Campo obrigatório não preenchido \(NOT NULL\): a coluna "titulo" da tabela "chamados"/
  );

  // Check
  assert.match(
    traduzirMensagemErroSql("CHECK constraint failed: tipo IN ('a','b')"),
    /Falha na validação de regra \(CHECK\)/
  );

  // No such table
  assert.match(
    traduzirMensagemErroSql("no such table: tabela_fantasma"),
    /Tabela não encontrada: a tabela "tabela_fantasma"/
  );

  // No such column
  assert.match(
    traduzirMensagemErroSql("no such column: campo_inexistente"),
    /Coluna não encontrada: a coluna "campo_inexistente"/
  );

  // Syntax error
  assert.match(
    traduzirMensagemErroSql('near "WHER": syntax error'),
    /Erro de sintaxe SQL próximo a "WHER"/
  );

  // Columns mismatch
  assert.match(
    traduzirMensagemErroSql("table chamados has 10 columns but 3 values were supplied"),
    /Incompatibilidade na quantidade de colunas/
  );

  // Database locked
  assert.match(
    traduzirMensagemErroSql("database is locked"),
    /banco de dados está ocupado no momento/
  );
});

test("diagnosticarErroSql identifica tabelas e campos dependentes ao tentar DELETE", async () => {
  // Mock do DB contendo chamados, comentarios e apontamentos_horas
  const dbMock = {
    prepare: (sql) => {
      const sqlNorm = String(sql || "").trim();

      // sqlite_master
      if (sqlNorm.includes("sqlite_master")) {
        return {
          bind: () => ({
            all: async () => ({ results: [{ name: "comentarios" }, { name: "apontamentos_horas" }, { name: "chamados" }] }),
          }),
          all: async () => ({ results: [{ name: "comentarios" }, { name: "apontamentos_horas" }, { name: "chamados" }] }),
        };
      }

      // PRAGMA foreign_key_list
      if (sqlNorm.includes("PRAGMA foreign_key_list(\"comentarios\")")) {
        return {
          bind: () => ({
            all: async () => ({
              results: [
                { id: 0, table: "chamados", from: "chamado_id", to: "id", on_delete: "NO ACTION" },
              ],
            }),
          }),
          all: async () => ({
            results: [
              { id: 0, table: "chamados", from: "chamado_id", to: "id", on_delete: "NO ACTION" },
            ],
          }),
        };
      }

      if (sqlNorm.includes("PRAGMA foreign_key_list(\"apontamentos_horas\")")) {
        return {
          bind: () => ({
            all: async () => ({
              results: [
                { id: 0, table: "chamados", from: "chamado_id", to: "id", on_delete: "NO ACTION" },
              ],
            }),
          }),
          all: async () => ({
            results: [
              { id: 0, table: "chamados", from: "chamado_id", to: "id", on_delete: "NO ACTION" },
            ],
          }),
        };
      }

      if (sqlNorm.includes("PRAGMA foreign_key_list(\"chamados\")")) {
        return {
          bind: () => ({ all: async () => ({ results: [] }) }),
          all: async () => ({ results: [] }),
        };
      }

      // SELECT COUNT(*)
      if (sqlNorm.includes('FROM "comentarios"')) {
        return {
          bind: () => ({ first: async () => ({ total: 5 }) }),
          first: async () => ({ total: 5 }),
        };
      }

      if (sqlNorm.includes('FROM "apontamentos_horas"')) {
        return {
          bind: () => ({ first: async () => ({ total: 1 }) }),
          first: async () => ({ total: 1 }),
        };
      }

      return {
        bind: () => ({
          all: async () => ({ results: [] }),
          first: async () => null,
          run: async () => ({ meta: {} }),
        }),
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ meta: {} }),
      };
    },
  };

  const errFk = new Error("SQLite error: FOREIGN KEY constraint failed");
  const diag = await diagnosticarErroSql(dbMock, "DELETE FROM chamados;", errFk);

  assert.equal(diag.ehForeignKey, true);
  assert.equal(diag.tipoErro, "FOREIGN_KEY_DELETE_BLOCKED");
  assert.equal(diag.tabela, "chamados");
  assert.equal(diag.dependencias.length, 2);

  const depComentarios = diag.dependencias.find((d) => d.tabela === "comentarios");
  assert.ok(depComentarios);
  assert.equal(depComentarios.campo, "chamado_id");
  assert.equal(depComentarios.totalRegistros, 5);
  assert.equal(depComentarios.comandoExclusao, "DELETE FROM comentarios;");

  const depApontamentos = diag.dependencias.find((d) => d.tabela === "apontamentos_horas");
  assert.ok(depApontamentos);
  assert.equal(depApontamentos.campo, "chamado_id");
  assert.equal(depApontamentos.totalRegistros, 1);
  assert.equal(depApontamentos.comandoExclusao, "DELETE FROM apontamentos_horas;");

  assert.match(diag.mensagemAmigavel, /comentarios.*chamado_id.*5 registro/s);
  assert.match(diag.mensagemAmigavel, /apontamentos_horas.*chamado_id.*1 registro/s);
});

test("executarSql anexa diagnostico traduzido ao lancar erro de foreign key", async () => {
  const dbMock = {
    prepare: (sql) => {
      const sqlNorm = String(sql || "");
      if (sqlNorm.includes("sqlite_master")) {
        return {
          bind: () => ({ all: async () => ({ results: [] }) }),
          all: async () => ({ results: [] }),
        };
      }
      return {
        run: async () => {
          throw new Error("SQLite error: FOREIGN KEY constraint failed");
        },
      };
    },
  };

  await assert.rejects(
    async () => {
      await executarSql(dbMock, "DELETE FROM chamados;");
    },
    (err) => {
      assert.match(err.message, /Falha na restrição de integridade|FOREIGN KEY/);
      assert.ok(err.diagnostico);
      assert.equal(err.diagnostico.ehForeignKey, true);
      return true;
    }
  );
});
