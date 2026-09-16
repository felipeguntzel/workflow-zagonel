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
