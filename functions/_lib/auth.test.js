import test from "node:test";
import assert from "node:assert/strict";
import { hashSenha, verificarSenha, ehHashLegado, validarFormatoLogin, validarComplexidadeSenha } from "./auth.js";

test("hashSenha produces a self-describing pbkdf2$iterações$salt$hash string", async () => {
  const hash = await hashSenha("1234ana");
  assert.match(hash, /^pbkdf2\$\d+\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
});

test("hashSenha salts each call, so the same password hashes differently every time", async () => {
  const a = await hashSenha("1234ana");
  const b = await hashSenha("1234ana");
  assert.notEqual(a, b);
});

test("verificarSenha accepts the correct password against a pbkdf2 hash", async () => {
  const hash = await hashSenha("1234ana");
  assert.equal(await verificarSenha("1234ana", hash), true);
});

test("verificarSenha rejects the wrong password against a pbkdf2 hash", async () => {
  const hash = await hashSenha("1234ana");
  assert.equal(await verificarSenha("outrasenha", hash), false);
});

test("verificarSenha still accepts the legacy SHA-256-without-salt hash (pre-migration users)", async () => {
  const hashLegado = "4176647594e2a5ba663e60d7240a308d6562755d22c70d717a704b48448648b3";
  assert.equal(await verificarSenha("1234ana", hashLegado), true);
  assert.equal(await verificarSenha("senhaerrada", hashLegado), false);
});

test("verificarSenha returns false for a missing/null stored hash instead of throwing", async () => {
  assert.equal(await verificarSenha("qualquer", null), false);
});

test("ehHashLegado tells apart the old plain SHA-256 hash from the new pbkdf2$ format", async () => {
  const novo = await hashSenha("1234ana");
  assert.equal(ehHashLegado(novo), false);
  assert.equal(ehHashLegado("4176647594e2a5ba663e60d7240a308d6562755d22c70d717a704b48448648b3"), true);
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

test("validarComplexidadeSenha aceita senha forte valida", () => {
  const res = validarComplexidadeSenha("SenhaForte@2026");
  assert.equal(res.valido, true);
});

test("validarComplexidadeSenha rejeita senhas com menos de 8 caracteres", () => {
  const res = validarComplexidadeSenha("S1@a");
  assert.equal(res.valido, false);
  assert.match(res.mensagem, /8 caracteres/);
});

test("validarComplexidadeSenha rejeita senha sem letra maiuscula", () => {
  const res = validarComplexidadeSenha("senhaforte@2026");
  assert.equal(res.valido, false);
  assert.match(res.mensagem, /maiúscula/);
});

test("validarComplexidadeSenha rejeita senha sem letra minuscula", () => {
  const res = validarComplexidadeSenha("SENHAFORTE@2026");
  assert.equal(res.valido, false);
  assert.match(res.mensagem, /minúscula/);
});

test("validarComplexidadeSenha rejeita senha sem numero", () => {
  const res = validarComplexidadeSenha("SenhaForte@Alfa");
  assert.equal(res.valido, false);
  assert.match(res.mensagem, /número/);
});

test("validarComplexidadeSenha rejeita senha sem caractere especial", () => {
  const res = validarComplexidadeSenha("SenhaForte2026");
  assert.equal(res.valido, false);
  assert.match(res.mensagem, /especial ou símbolo/);
});
