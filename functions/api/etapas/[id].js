import { run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { carregarEtapaComAcoes } from "../../_lib/etapas.js";

export async function onRequestGet(context) {
  const etapa = await carregarEtapaComAcoes(context.env.DB, context.params.id);
  if (!etapa) return error("Não encontrada", 404);
  return json(etapa);
}

export async function onRequestPut(context) {
  const body = await context.request.json();
  const campos = ["nome", "setor_id", "tipo", "eh_inicial", "etapa_proxima_id", "etapa_proxima_vinculo"];
  const colunas = campos.filter((c) => body[c] !== undefined);
  if (colunas.length === 0) return error("Nenhum campo para atualizar");
  const set = colunas.map((c) => `${c} = ?`).join(", ");
  const valores = colunas.map((c) => body[c]);
  await run(context.env.DB, `UPDATE etapas SET ${set} WHERE id = ?`, ...valores, context.params.id);
  const atualizada = await carregarEtapaComAcoes(context.env.DB, context.params.id);
  if (!atualizada) return error("Não encontrada", 404);
  return json(atualizada);
}

export async function onRequestDelete(context) {
  await run(context.env.DB, "DELETE FROM acoes WHERE etapa_id = ?", context.params.id);
  await run(context.env.DB, "DELETE FROM etapas WHERE id = ?", context.params.id);
  return json({ ok: true });
}
