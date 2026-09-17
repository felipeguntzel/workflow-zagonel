const ITERACOES_PBKDF2 = 100000;
const PREFIXO_PBKDF2 = "pbkdf2";

function paraHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function deHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function iguaisConstante(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function derivarPbkdf2(senha, salt, iteracoes) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: iteracoes, hash: "SHA-256" },
    chave,
    256
  );
  return paraHex(new Uint8Array(bits));
}

async function hashLegado(senha) {
  const dados = new TextEncoder().encode(senha);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dados);
  return paraHex(new Uint8Array(hashBuffer));
}

// PBKDF2 com salt aleatório por usuário. Formato: "pbkdf2$<iterações>$<saltHex>$<hashHex>".
export async function hashSenha(senha) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivarPbkdf2(senha, salt, ITERACOES_PBKDF2);
  return `${PREFIXO_PBKDF2}$${ITERACOES_PBKDF2}$${paraHex(salt)}$${hash}`;
}

// Aceita também o formato legado (SHA-256 sem salt, usado antes desta migração) só para
// permitir a troca automática e transparente no login (ver functions/api/login.js).
export async function verificarSenha(senha, hashArmazenado) {
  if (!hashArmazenado) return false;
  if (hashArmazenado.startsWith(`${PREFIXO_PBKDF2}$`)) {
    const [, iteracoesStr, saltHex, hashHex] = hashArmazenado.split("$");
    const hash = await derivarPbkdf2(senha, deHex(saltHex), Number(iteracoesStr));
    return iguaisConstante(hash, hashHex);
  }
  return iguaisConstante(await hashLegado(senha), hashArmazenado);
}

export function ehHashLegado(hashArmazenado) {
  return !hashArmazenado?.startsWith(`${PREFIXO_PBKDF2}$`);
}

export function validarFormatoLogin(login) {
  return /^[a-z0-9]+$/.test(login);
}
