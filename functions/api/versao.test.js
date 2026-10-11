import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { onRequestGet, APP_VERSAO, APP_BUILD } from "./versao.js";
import { VERSAO_CLIENTE } from "../../public/versao.js";

test("onRequestGet retorna versão e build corretos com cabeçalhos no-cache", async () => {
  const res = await onRequestGet();
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.versao, APP_VERSAO);
  assert.equal(data.build, APP_BUILD);
  assert.ok(typeof data.timestamp === "number");
  assert.equal(res.headers.get("Cache-Control"), "no-cache, no-store, must-revalidate");
});

test("APP_VERSAO do backend coincide com VERSAO_CLIENTE do frontend e versao.json", () => {
  assert.equal(APP_VERSAO, VERSAO_CLIENTE, "APP_VERSAO deve ser idêntica a VERSAO_CLIENTE");
  const rawJson = fs.readFileSync(new URL("../../public/versao.json", import.meta.url), "utf8");
  const parsed = JSON.parse(rawJson);
  assert.equal(parsed.versao, VERSAO_CLIENTE, "versao.json deve ter a mesma versão de VERSAO_CLIENTE");
});
