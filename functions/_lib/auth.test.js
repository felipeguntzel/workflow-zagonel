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

test("validarFormatoLogin accepts nome.sobrenome format and single names with lowercase letters and numbers", () => {
  assert.equal(validarFormatoLogin("felipe.guntzel"), true);
  assert.equal(validarFormatoLogin("projetos.zagonel"), true);
  assert.equal(validarFormatoLogin("projetoszagonel"), true);
  assert.equal(validarFormatoLogin("ana.silva"), true);
  assert.equal(validarFormatoLogin("bruno.123"), true);
  assert.equal(validarFormatoLogin("joao.carlos.silva"), true);
  assert.equal(validarFormatoLogin("ti_suporte"), true);
  assert.equal(validarFormatoLogin("ana"), true);
  assert.equal(validarFormatoLogin("felipe"), true);
});

test("validarFormatoLogin rejects spaces, uppercase or symbols", () => {
  assert.equal(validarFormatoLogin("ana silva"), false);
  assert.equal(validarFormatoLogin("ana@silva"), false);
  assert.equal(validarFormatoLogin("Ana.silva"), false);
  assert.equal(validarFormatoLogin(".silva"), false);
  assert.equal(validarFormatoLogin("ana."), false);
  assert.equal(validarFormatoLogin("ana..silva"), false);
  assert.equal(validarFormatoLogin(""), false);
});

test("validarComplexidadeSenha aceita senha valida com letras e numeros", () => {
  const res = validarComplexidadeSenha("aB3dEf");
  assert.equal(res.valido, true);
});

test("validarComplexidadeSenha aceita senha puramente numerica valida", () => {
  const res = validarComplexidadeSenha("849201");
  assert.equal(res.valido, true);
});

test("validarComplexidadeSenha rejeita senhas com menos de 6 caracteres", () => {
  const res = validarComplexidadeSenha("12345");
  assert.equal(res.valido, false);
  assert.match(res.mensagem, /mínimo 6/);
});

test("validarComplexidadeSenha rejeita senhas com mais de 10 caracteres", () => {
  const res = validarComplexidadeSenha("12345678901");
  assert.equal(res.valido, false);
  assert.match(res.mensagem, /máximo 10/);
});

test("validarComplexidadeSenha rejeita senha puramente numerica com digitos repetidos", () => {
  const res = validarComplexidadeSenha("111111");
  assert.equal(res.valido, false);
  assert.match(res.mensagem, /repetidos/);
});

test("validarComplexidadeSenha rejeita senha numerica em sequencia crescente", () => {
  const res = validarComplexidadeSenha("123456");
  assert.equal(res.valido, false);
  assert.match(res.mensagem, /sequência de 1 em 1/);
});

test("validarComplexidadeSenha rejeita senha numerica em sequencia decrescente", () => {
  const res = validarComplexidadeSenha("654321");
  assert.equal(res.valido, false);
  assert.match(res.mensagem, /sequência de 1 em 1/);
});

test("validarComplexidadeSenha aceita hash SHA-256 do cliente", () => {
  const res = validarComplexidadeSenha("0c60f131d742c3aa3da17c0d065ad49121a9f00c4eeeaf87e48598d85f20e846");
  assert.equal(res.valido, true);
});
