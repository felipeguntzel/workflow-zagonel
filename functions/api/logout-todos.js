import { run } from "../_lib/db.js";
import { json, error } from "../_lib/http.js";
import { obterUsuarioDaRequisicao } from "../_lib/permissoes.js";

export async function onRequestPost(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);
  const agora = Date.now();
  await run(context.env.DB, "UPDATE usuarios SET token_valido_apos = ? WHERE id = ?", agora, usuario.id);
  return json({ ok: true, mensagem: "Todas as outras sessões foram encerradas com sucesso." });
}
