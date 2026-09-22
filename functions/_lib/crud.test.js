import test from "node:test";
import assert from "node:assert/strict";
import { campoObrigatorioFaltando } from "./crud.js";

test("campoObrigatorioFaltando returns null when all required fields are present and non-empty", () => {
  assert.equal(campoObrigatorioFaltando({ nome: "Ana" }, ["nome"]), null);
});

test("campoObrigatorioFaltando flags an empty string as missing (PUT zeroing a required field)", () => {
  assert.equal(campoObrigatorioFaltando({ nome: "" }, ["nome"]), "nome");
});

test("campoObrigatorioFaltando flags null as missing", () => {
  assert.equal(campoObrigatorioFaltando({ nome: null }, ["nome"]), "nome");
});

test("campoObrigatorioFaltando ignores an absent field by default (PUT: field just not being updated)", () => {
  assert.equal(campoObrigatorioFaltando({}, ["nome"]), null);
});

test("campoObrigatorioFaltando with exigirPresente flags an absent field too (POST create)", () => {
  assert.equal(campoObrigatorioFaltando({}, ["nome"], { exigirPresente: true }), "nome");
});

test("assegurarEsquemaTabela executa ALTER TABLE para fluxo_templates de forma segura", async () => {
  const { assegurarEsquemaTabela } = await import("./crud.js");
  let comandoSql = "";
  const mockDb = {
    prepare(sql) {
      comandoSql = sql;
      return {
        bind() { return this; },
        async run() { return { meta: {} }; }
      };
    }
  };
  await assegurarEsquemaTabela(mockDb, "fluxo_templates");
  assert.ok(comandoSql.includes("ALTER TABLE fluxo_templates ADD COLUMN descricao TEXT"));
});

test("assegurarEsquemaTabela executa ALTER TABLE para empresas codigo de forma segura", async () => {
  const { assegurarEsquemaTabela } = await import("./crud.js");
  let comandoSql = "";
  const mockDb = {
    prepare(sql) {
      comandoSql = sql;
      return {
        bind() { return this; },
        async run() { return { meta: {} }; }
      };
    }
  };
  await assegurarEsquemaTabela(mockDb, "empresas");
  assert.ok(comandoSql.includes("ALTER TABLE empresas ADD COLUMN codigo TEXT"));
});

