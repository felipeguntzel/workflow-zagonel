import test from "node:test";
import assert from "node:assert/strict";
import { classificarSql, gerarPreComandos, executarSql } from "./sql-service.js";

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
