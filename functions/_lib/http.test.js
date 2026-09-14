import test from "node:test";
import assert from "node:assert/strict";
import { json, error } from "./http.js";

test("json() returns a Response with the given status and JSON body", async () => {
  const res = json({ a: 1 }, 201);
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("content-type"), "application/json");
  assert.deepEqual(await res.json(), { a: 1 });
});

test("json() defaults to status 200", async () => {
  const res = json({ ok: true });
  assert.equal(res.status, 200);
});

test("error() wraps the message and defaults to status 400", async () => {
  const res = error("algo deu errado");
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "algo deu errado" });
});

test("error() accepts a custom status", async () => {
  const res = error("não encontrado", 404);
  assert.equal(res.status, 404);
});
