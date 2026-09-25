import test from "node:test";
import assert from "node:assert/strict";
import { VERSAO_CLIENTE } from "./versao.js";
import { limparCacheApi } from "./api.js";

test("VERSAO_CLIENTE está definida e segue semver", () => {
  assert.ok(VERSAO_CLIENTE);
  assert.match(VERSAO_CLIENTE, /^\d+\.\d+\.\d+/);
});

test("limparCacheApi executa sem lançar erros", () => {
  assert.doesNotThrow(() => limparCacheApi());
  assert.doesNotThrow(() => limparCacheApi("/setores"));
});
