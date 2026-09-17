import { json, error } from "../../../_lib/http.js";
import { first, run } from "../../../_lib/db.js";
import { exigirPermissao } from "../../../_lib/permissoes.js";
import { listarCamposDaEtapa, salvarCampoEtapa } from "../../../_lib/campos.js";

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "visualizar");
  if (erro) return erro;

  const campos = await listarCamposDaEtapa(context.env.DB, context.params.id);
  return json(campos);
}

export async function onRequestPost(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "inserir");
  if (erro) return erro;

  const body = await context.request.json();
  if (!body.nome || !body.rotulo || !body.tipo) {
    return error("Campos obrigatórios: nome, rotulo, tipo");
  }

  const etapa = await first(context.env.DB, "SELECT * FROM etapas WHERE id = ?", context.params.id);
  if (!etapa) return error("Etapa não encontrada", 404);

  const salvo = await salvarCampoEtapa(context.env.DB, etapa.id, body);
  return json(salvo, 201);
}

export async function onRequestDelete(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "excluir");
  if (erro) return erro;

  const url = new URL(context.request.url);
  const campoId = url.searchParams.get("campo_id");
  if (!campoId) return error("Parâmetro campo_id obrigatório");

  await run(context.env.DB, "DELETE FROM campos_etapa WHERE id = ? AND etapa_id = ?", campoId, context.params.id);
  return json({ ok: true });
}
