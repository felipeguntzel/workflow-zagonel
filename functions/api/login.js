import { first } from "../_lib/db.js";
import { json, error } from "../_lib/http.js";
import { hashSenha } from "../_lib/auth.js";

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.login || !body.senha) {
    return error("Login e senha são obrigatórios");
  }
  const loginNormalizado = body.login.toLowerCase();
  const senhaHash = await hashSenha(body.senha);
  const usuario = await first(
    context.env.DB,
    "SELECT id, nome, setor_id FROM usuarios WHERE login = ? AND senha_hash = ?",
    loginNormalizado,
    senhaHash
  );
  if (!usuario) {
    return error("Login ou senha inválidos", 401);
  }
  return json(usuario);
}
