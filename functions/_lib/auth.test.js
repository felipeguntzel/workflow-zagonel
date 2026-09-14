import test from "node:test";
import assert from "node:assert/strict";
import { hashSenha, validarFormatoLogin } from "./auth.js";

test("hashSenha computes the SHA-256 hex digest of the input", async () => {
  const hash = await hashSenha("1234ana");
  assert.equal(hash, "4176647594e2a5ba663e60d7240a308d6562755d22c70d717a704b48448648b3");
});

test("hashSenha produces different hashes for different inputs", async () => {
  const a = await hashSenha("1234ana");
  const b = await hashSenha("1234bruno");
  assert.notEqual(a, b);
});

test("validarFormatoLogin accepts lowercase letters and digits only", () => {
  assert.equal(validarFormatoLogin("ana"), true);
  assert.equal(validarFormatoLogin("bruno123"), true);
});

test("validarFormatoLogin rejects spaces, dots, and special characters", () => {
  assert.equal(validarFormatoLogin("ana silva"), false);
  assert.equal(validarFormatoLogin("ana.silva"), false);
  assert.equal(validarFormatoLogin("ana@silva"), false);
  assert.equal(validarFormatoLogin(""), false);
});

test("validarFormatoLogin rejects uppercase (caller must lowercase first)", () => {
  assert.equal(validarFormatoLogin("Ana"), false);
});
