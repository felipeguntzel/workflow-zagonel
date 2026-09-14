import { first } from "../_lib/db.js";
import { json, error } from "../_lib/http.js";
import { hashSenha } from "../_lib/auth.js";
import { gerarToken } from "../_lib/sessao.js";
import { obterPermissoesDoUsuario } from "../_lib/permissoes.js";

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.login || !body.senha) {
    return error("Login e senha são obrigatórios");
  }
  const loginNormalizado = String(body.login).toLowerCase();
  const senhaHash = await hashSenha(body.senha);
  const usuario = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, admin, deve_trocar_senha FROM usuarios WHERE login = ? AND senha_hash = ?",
    loginNormalizado,
    senhaHash
  );
  if (!usuario) {
    return error("Login ou senha inválidos", 401);
  }
  const token = await gerarToken(usuario.id, context.env.SESSAO_SEGREDO);
  const permissoes = await obterPermissoesDoUsuario(context.env.DB, usuario.id);
  return json({ ...usuario, token, permissoes });
}
