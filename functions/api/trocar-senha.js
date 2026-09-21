import { run } from "../_lib/db.js";
import { json, error } from "../_lib/http.js";
import { hashSenha, validarComplexidadeSenha } from "../_lib/auth.js";
import { obterUsuarioDaRequisicao } from "../_lib/permissoes.js";

export async function onRequestPost(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);
  const body = await context.request.json();
  const checagem = validarComplexidadeSenha(body.nova_senha);
  if (!checagem.valido) {
    return error(checagem.mensagem);
  }
  const senhaHash = await hashSenha(body.nova_senha);
  const agora = Date.now();
  await run(
    context.env.DB,
    "UPDATE usuarios SET senha_hash = ?, deve_trocar_senha = 0, token_valido_apos = ? WHERE id = ?",
    senhaHash,
    agora,
    usuario.id
  );
  return json({ ok: true });
}
