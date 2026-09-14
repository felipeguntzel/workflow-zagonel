export async function hashSenha(senha) {
  const dados = new TextEncoder().encode(senha);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dados);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function validarFormatoLogin(login) {
  return /^[a-z0-9]+$/.test(login);
}
