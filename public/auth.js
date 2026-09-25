const CHAVE = "workflow_zagonel_usuario";

export function getUsuarioLogado() {
  const raw = localStorage.getItem(CHAVE);
  return raw ? JSON.parse(raw) : null;
}

export function setUsuarioLogado(usuario) {
  localStorage.setItem(CHAVE, JSON.stringify(usuario));
  try {
    sessionStorage.removeItem("workflow_ignorar_versao_sessao");
    sessionStorage.setItem("workflow_verificar_versao_pos_login", "1");
  } catch (_) {}
}

export function logout() {
  localStorage.removeItem(CHAVE);
  try {
    sessionStorage.removeItem("workflow_ignorar_versao_sessao");
    sessionStorage.removeItem("workflow_verificar_versao_pos_login");
  } catch (_) {}
}

export function exigirLogin() {
  const usuario = getUsuarioLogado();
  if (!usuario) {
    window.location.href = "/";
    return null;
  }
  return usuario;
}

export const exigirUsuarioLogado = exigirLogin;

export function permissaoDaTela(tela) {
  const usuario = getUsuarioLogado();
  const vazio = { visualizar: false, inserir: false, editar: false, excluir: false };
  if (!usuario) return vazio;
  if (usuario.admin) {
    return { visualizar: true, inserir: true, editar: true, excluir: true, ver_todos_setores: true };
  }
  return usuario.permissoes?.[tela] ?? vazio;
}
