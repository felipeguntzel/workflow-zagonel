import test from "node:test";
import assert from "node:assert/strict";
import { gerarToken, verificarToken } from "./sessao.js";

test("gerarToken produces a token verificarToken accepts, returning the same usuarioId", async () => {
  const agora = Date.now();
  const token = await gerarToken(42, "segredo-teste", agora);
  const resultado = await verificarToken(token, "segredo-teste");
  assert.equal(resultado.usuarioId, 42);
  assert.equal(resultado.emitidoEm, agora);
});

test("verificarToken accepts legacy 3-part token for backward compatibility", async () => {
  // Gera token de 3 partes legado assinado
  const expiraEm = Date.now() + 10000;
  const payload = `42.${expiraEm}`;
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("segredo-teste"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinaturaBuffer = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(payload));
  const assinatura = Array.from(new Uint8Array(assinaturaBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const tokenLegado = `${payload}.${assinatura}`;
  const resultado = await verificarToken(tokenLegado, "segredo-teste");
  assert.equal(resultado.usuarioId, 42);
  assert.equal(resultado.emitidoEm, 0);
});

test("verificarToken rejects a token signed with a different segredo", async () => {
  const token = await gerarToken(42, "segredo-a");
  const resultado = await verificarToken(token, "segredo-b");
  assert.equal(resultado, null);
});

test("verificarToken rejects a tampered payload", async () => {
  const token = await gerarToken(42, "segredo-teste");
  const [usuarioId, emitidoEm, expiraEm, assinatura] = token.split(".");
  const tokenAdulterado = `${Number(usuarioId) + 1}.${emitidoEm}.${expiraEm}.${assinatura}`;
  const resultado = await verificarToken(tokenAdulterado, "segredo-teste");
  assert.equal(resultado, null);
});

test("verificarToken rejects an expired token", async () => {
  // Constructs a validly-signed but already-expired token directly, since
  // gerarToken() always issues one with a fixed future validity window,
  // this is the one place the signing logic is re-derived rather than
  // reused, specifically to build a fixture gerarToken cannot produce.
  const payload = "42." + (Date.now() - 1000);
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("segredo-teste"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinaturaBuffer = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(payload));
  const assinatura = Array.from(new Uint8Array(assinaturaBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const tokenExpirado = `${payload}.${assinatura}`;
  const resultado = await verificarToken(tokenExpirado, "segredo-teste");
  assert.equal(resultado, null);
});

test("verificarToken rejects malformed or empty tokens", async () => {
  assert.equal(await verificarToken("nao-e-um-token", "segredo-teste"), null);
  assert.equal(await verificarToken("", "segredo-teste"), null);
  assert.equal(await verificarToken(null, "segredo-teste"), null);
});
