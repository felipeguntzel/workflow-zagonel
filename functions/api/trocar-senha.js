import { run } from "../_lib/db.js";
import { json, error } from "../_lib/http.js";
import { hashSenha } from "../_lib/auth.js";
import { obterUsuarioDaRequisicao } from "../_lib/permissoes.js";

export async function onRequestPost(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);
  const body = await context.request.json();
  if (!body.nova_senha || body.nova_senha.length < 8) {
    return error("A nova senha deve ter pelo menos 8 caracteres.");
  }
  const senhaHash = await hashSenha(body.nova_senha);
  await run(
    context.env.DB,
    "UPDATE usuarios SET senha_hash = ?, deve_trocar_senha = 0 WHERE id = ?",
    senhaHash,
    usuario.id
  );
  return json({ ok: true });
}
