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
  if (typeof login !== "string") return false;
  return /^[a-z0-9]+(\.[a-z0-9]+)+$/.test(login);
}

export function ehSequenciaNumerica(str) {
  if (typeof str !== "string" || str.length < 2) return false;
  let crescente = true;
  let decrescente = true;
  for (let i = 1; i < str.length; i++) {
    const prev = Number(str[i - 1]);
    const curr = Number(str[i]);
    if (curr !== prev + 1) crescente = false;
    if (curr !== prev - 1) decrescente = false;
  }
  return crescente || decrescente;
}

export function validarComplexidadeSenha(senha) {
  if (typeof senha !== "string") {
    return { valido: false, mensagem: "Senha inválida." };
  }
  // Se for hash criptográfico SHA-256 de 64 caracteres hex vindo do cliente
  if (/^[a-f0-9]{64}$/i.test(senha)) {
    return { valido: true };
  }
  if (senha.length < 6) {
    return { valido: false, mensagem: "A senha deve ter no mínimo 6 caracteres." };
  }
  if (senha.length > 10) {
    return { valido: false, mensagem: "A senha deve ter no máximo 10 caracteres." };
  }
  if (/^\d+$/.test(senha)) {
    if (new Set(senha).size === 1) {
      return { valido: false, mensagem: "A senha numérica não pode conter números repetidos (ex: 111111)." };
    }
    if (ehSequenciaNumerica(senha)) {
      return { valido: false, mensagem: "A senha numérica não pode ser uma sequência de 1 em 1 (ex: 123456)." };
    }
  }
  return { valido: true };
}
