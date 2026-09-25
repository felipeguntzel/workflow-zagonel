import { json, error } from "../../../_lib/http.js";
import { obterUsuarioDaRequisicao } from "../../../_lib/permissoes.js";
import { definirConsultaPadrao } from "../../../_lib/consultas.js";

export async function onRequestPost(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado.", 401);

  const id = Number(context.params.id);
  const body = await context.request.json().catch(() => ({}));
  const tela = body.tela || "chamados";
  const remover = body.remover === true;

  try {
    await definirConsultaPadrao(context.env.DB, tela, usuario.id, remover ? null : id);
    return json({ ok: true, consulta_id: remover ? null : id });
  } catch (err) {
    return error(err.message || "Erro ao definir consulta padrão.", 400);
  }
}
