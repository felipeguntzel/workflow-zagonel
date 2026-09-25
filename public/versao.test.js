import test from "node:test";
import assert from "node:assert/strict";
import { VERSAO_CLIENTE, removerIndicadorDiscretoNovaVersao } from "./versao.js";
import { limparCacheApi } from "./api.js";
import { setUsuarioLogado, logout } from "./auth.js";

// Mock simples de sessionStorage e localStorage para ambiente node:test
globalThis.sessionStorage = globalThis.sessionStorage || {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
  clear() { this._data = {}; },
};

globalThis.localStorage = globalThis.localStorage || {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
  clear() { this._data = {}; },
};

test("VERSAO_CLIENTE está definida e segue semver", () => {
  assert.ok(VERSAO_CLIENTE);
  assert.match(VERSAO_CLIENTE, /^\d+\.\d+\.\d+/);
});

test("limparCacheApi executa sem lançar erros", () => {
  assert.doesNotThrow(() => limparCacheApi());
  assert.doesNotThrow(() => limparCacheApi("/setores"));
});

test("removerIndicadorDiscretoNovaVersao executa sem lançar erros em qualquer ambiente", () => {
  assert.doesNotThrow(() => removerIndicadorDiscretoNovaVersao());
});

test("setUsuarioLogado registra flag de verificação pós-login e logout limpa", () => {
  setUsuarioLogado({ id: 1, nome: "Teste" });
  assert.equal(sessionStorage.getItem("workflow_verificar_versao_pos_login"), "1");

  logout();
  assert.equal(sessionStorage.getItem("workflow_verificar_versao_pos_login"), null);
});

test("URL com parâmetros preserva id e rota ao adicionar parâmetro atualizado", () => {
  const urlExemplo = new URL("https://app.workflow.com/chamado?id=42&tab=historico");
  urlExemplo.searchParams.set("atualizado", "12345678");

  assert.equal(urlExemplo.pathname, "/chamado");
  assert.equal(urlExemplo.searchParams.get("id"), "42");
  assert.equal(urlExemplo.searchParams.get("tab"), "historico");
  assert.equal(urlExemplo.searchParams.get("atualizado"), "12345678");
});
