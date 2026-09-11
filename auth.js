const CHAVE = "workflow_zagonel_usuario";

export function getUsuarioLogado() {
  const raw = localStorage.getItem(CHAVE);
  return raw ? JSON.parse(raw) : null;
}

export function setUsuarioLogado(usuario) {
  localStorage.setItem(CHAVE, JSON.stringify(usuario));
}

export function logout() {
  localStorage.removeItem(CHAVE);
}

export function exigirLogin() {
  const usuario = getUsuarioLogado();
  if (!usuario) {
    window.location.href = "index.html";
    return null;
  }
  return usuario;
}
