import { run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { carregarEtapaComAcoes } from "../../_lib/etapas.js";
import { exigirPermissao } from "../../_lib/permissoes.js";
import { validarDependenciasExclusao, atualizarContadorId } from "../../_lib/dependencias.js";

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "visualizar");
  if (erro) return erro;
  const etapa = await carregarEtapaComAcoes(context.env.DB, context.params.id);
  if (!etapa) return error("Não encontrada", 404);
  return json(etapa);
}

export async function onRequestPut(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "editar");
  if (erro) return erro;
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
  const { erro } = await exigirPermissao(context, "fluxos", "excluir");
  if (erro) return erro;
  const erroDependencia = await validarDependenciasExclusao(context.env.DB, "etapas", context.params.id);
  if (erroDependencia) return error(erroDependencia, 400);

  try {
    await run(context.env.DB, "DELETE FROM acoes WHERE etapa_id = ?", context.params.id);
    await run(context.env.DB, "DELETE FROM etapas WHERE id = ?", context.params.id);
    await atualizarContadorId(context.env.DB, "etapas");
    await atualizarContadorId(context.env.DB, "acoes");
    return json({ ok: true });
  } catch (e) {
    if (String(e.message).includes("FOREIGN KEY") || String(e.message).includes("CONSTRAINT")) {
      return error(
        "Não é possível excluir esta etapa pois existem outros registros vinculados a ela.",
        400
      );
    }
    throw e;
  }
}
