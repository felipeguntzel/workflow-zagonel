import test from "node:test";
import assert from "node:assert/strict";
import { validarDependenciasExclusao, atualizarContadorId } from "./dependencias.js";

function criarDbMock({ allResult = [], firstResult = null } = {}) {
  const executed = [];
  return {
    executed,
    prepare(query) {
      return {
        bind(...args) {
          return {
            async all() {
              executed.push({ query, args, method: "all" });
              const res = typeof allResult === "function" ? allResult(query, args) : allResult;
              return { results: res };
            },
            async first() {
              executed.push({ query, args, method: "first" });
              const res = typeof firstResult === "function" ? firstResult(query, args) : firstResult;
              return res;
            },
            async run() {
              executed.push({ query, args, method: "run" });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

test("validarDependenciasExclusao orienta exclusão quando empresa tem setores", async () => {
  const db = criarDbMock({
    firstResult: (q) => (q.includes("empresas") ? { nome: "Zagonel S.A" } : null),
    allResult: (q) => (q.includes("setores") ? [{ id: 1, nome: "Engenharia de Produto" }] : []),
  });

  const msg = await validarDependenciasExclusao(db, "empresas", 1);
  assert.ok(msg);
  assert.match(msg, /Não é possível excluir a empresa "Zagonel S.A"/);
  assert.match(msg, /Engenharia de Produto/);
  assert.match(msg, /O que fazer:/);
  assert.match(msg, /Cadastros > Setores/);
});

test("validarDependenciasExclusao permite exclusão quando empresa não tem dependências", async () => {
  const db = criarDbMock({
    firstResult: { nome: "Empresa Teste" },
    allResult: [],
  });

  const msg = await validarDependenciasExclusao(db, "empresas", 99);
  assert.equal(msg, null);
});

test("validarDependenciasExclusao orienta quando setor tem usuários vinculados", async () => {
  const db = criarDbMock({
    firstResult: { nome: "Engenharia de Produto" },
    allResult: (q) => (q.includes("usuarios") ? [{ id: 1, nome: "Carlos" }] : []),
  });

  const msg = await validarDependenciasExclusao(db, "setores", 1);
  assert.ok(msg);
  assert.match(msg, /Não é possível excluir o setor "Engenharia de Produto"/);
  assert.match(msg, /Carlos/);
  assert.match(msg, /Cadastros > Usuários/);
});

test("validarDependenciasExclusao orienta quando grupo tem usuários vinculados", async () => {
  const db = criarDbMock({
    firstResult: { nome: "Admin Geral" },
    allResult: [{ id: 1, nome: "Administrador" }],
  });

  const msg = await validarDependenciasExclusao(db, "grupos_permissao", 1);
  assert.ok(msg);
  assert.match(msg, /Não é possível excluir o grupo "Admin Geral"/);
  assert.match(msg, /Administrador/);
});

test("atualizarContadorId executa UPDATE em sqlite_sequence com MAX(id)", async () => {
  const db = criarDbMock({
    firstResult: { max_id: 3 },
  });

  await atualizarContadorId(db, "empresas");
  const updateCall = db.executed.find((e) => e.query.includes("sqlite_sequence"));
  assert.ok(updateCall);
  assert.equal(updateCall.args[0], 3);
  assert.equal(updateCall.args[1], "empresas");
});
