import { first, run } from "../_lib/db.js";
import { json, error } from "../_lib/http.js";
import { hashSenha, verificarSenha, ehHashLegado } from "../_lib/auth.js";
import { gerarToken } from "../_lib/sessao.js";
import { obterPermissoesDoUsuario } from "../_lib/permissoes.js";

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.login || !body.senha) {
    return error("Login e senha são obrigatórios");
  }
  const loginNormalizado = String(body.login).toLowerCase();
  const usuario = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, admin, deve_trocar_senha, fonte, tamanho_fonte, tema, senha_hash FROM usuarios WHERE login = ?",
    loginNormalizado
  );
  if (!usuario || !(await verificarSenha(body.senha, usuario.senha_hash))) {
    return error("Login ou senha inválidos", 401);
  }
  if (ehHashLegado(usuario.senha_hash)) {
    await run(context.env.DB, "UPDATE usuarios SET senha_hash = ? WHERE id = ?", await hashSenha(body.senha), usuario.id);
  }
  delete usuario.senha_hash;
  const token = await gerarToken(usuario.id, context.env.SESSAO_SEGREDO);
  const permissoes = await obterPermissoesDoUsuario(context.env.DB, usuario.id);
  return json({ ...usuario, token, permissoes });
}
