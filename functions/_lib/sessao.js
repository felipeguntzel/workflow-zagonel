const VALIDADE_MS = 8 * 60 * 60 * 1000; // 8 horas
const SEGREDO_PADRAO = "workflow-zagonel-default-session-secret-fallback";

async function assinar(payload, segredo) {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo || SEGREDO_PADRAO),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function gerarToken(usuarioId, segredo, emitidoEm = Date.now()) {
  const expiraEm = emitidoEm + VALIDADE_MS;
  const payload = `${usuarioId}.${emitidoEm}.${expiraEm}`;
  const assinatura = await assinar(payload, segredo || SEGREDO_PADRAO);
  return `${payload}.${assinatura}`;
}

export async function verificarToken(token, segredo) {
  if (!token || typeof token !== "string") return null;
  const partes = token.split(".");
  if (partes.length === 4) {
    const [usuarioIdStr, emitidoEmStr, expiraEmStr, assinaturaRecebida] = partes;
    const payload = `${usuarioIdStr}.${emitidoEmStr}.${expiraEmStr}`;
    const assinaturaEsperada = await assinar(payload, segredo || SEGREDO_PADRAO);
    if (assinaturaEsperada !== assinaturaRecebida) return null;
    const expiraEm = Number(expiraEmStr);
    if (!Number.isFinite(expiraEm) || Date.now() > expiraEm) return null;
    const emitidoEm = Number(emitidoEmStr);
    if (!Number.isFinite(emitidoEm)) return null;
    const usuarioId = Number(usuarioIdStr);
    if (!Number.isFinite(usuarioId)) return null;
    return { usuarioId, emitidoEm };
  }
  if (partes.length === 3) {
    const [usuarioIdStr, expiraEmStr, assinaturaRecebida] = partes;
    const payload = `${usuarioIdStr}.${expiraEmStr}`;
    const assinaturaEsperada = await assinar(payload, segredo || SEGREDO_PADRAO);
    if (assinaturaEsperada !== assinaturaRecebida) return null;
    const expiraEm = Number(expiraEmStr);
    if (!Number.isFinite(expiraEm) || Date.now() > expiraEm) return null;
    const usuarioId = Number(usuarioIdStr);
    if (!Number.isFinite(usuarioId)) return null;
    return { usuarioId, emitidoEm: 0 };
  }
  return null;
}
