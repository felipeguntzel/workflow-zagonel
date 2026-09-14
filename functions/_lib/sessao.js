const VALIDADE_MS = 8 * 60 * 60 * 1000; // 8 horas

async function assinar(payload, segredo) {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function gerarToken(usuarioId, segredo) {
  const expiraEm = Date.now() + VALIDADE_MS;
  const payload = `${usuarioId}.${expiraEm}`;
  const assinatura = await assinar(payload, segredo);
  return `${payload}.${assinatura}`;
}

export async function verificarToken(token, segredo) {
  if (!token || typeof token !== "string") return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [usuarioIdStr, expiraEmStr, assinaturaRecebida] = partes;
  const payload = `${usuarioIdStr}.${expiraEmStr}`;
  const assinaturaEsperada = await assinar(payload, segredo);
  if (assinaturaEsperada !== assinaturaRecebida) return null;
  const expiraEm = Number(expiraEmStr);
  if (!Number.isFinite(expiraEm) || Date.now() > expiraEm) return null;
  const usuarioId = Number(usuarioIdStr);
  if (!Number.isFinite(usuarioId)) return null;
  return { usuarioId };
}
