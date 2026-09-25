import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, APP_VERSAO, APP_BUILD } from "./versao.js";

test("onRequestGet retorna versão e build corretos com cabeçalhos no-cache", async () => {
  const res = await onRequestGet();
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.versao, APP_VERSAO);
  assert.equal(data.build, APP_BUILD);
  assert.ok(typeof data.timestamp === "number");
  assert.equal(res.headers.get("Cache-Control"), "no-cache, no-store, must-revalidate");
});
