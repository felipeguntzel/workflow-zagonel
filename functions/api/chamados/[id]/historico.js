import { json, error } from "../../../_lib/http.js";
import { obterUsuarioDaRequisicao } from "../../../_lib/permissoes.js";
import { listarAuditoriaDoChamado } from "../../../_lib/auditoria.js";
import { first } from "../../../_lib/db.js";

export async function onRequestGet(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);

  const chamado = await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", context.params.id);
  if (!chamado) return error("Chamado não encontrado", 404);

  const raizId = chamado.chamado_mae_id || chamado.id;
  const historico = await listarAuditoriaDoChamado(context.env.DB, raizId);
  return json(historico);
}
