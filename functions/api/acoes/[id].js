import { first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirPermissao } from "../../_lib/permissoes.js";
import { assegurarColunaObservacaoAcoes } from "../../_lib/etapas.js";

export async function onRequestPut(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "editar");
  if (erro) return erro;
  const body = await context.request.json();
  await assegurarColunaObservacaoAcoes(context.env.DB);
  const campos = ["rotulo", "setor_destino_id", "vinculo", "prerequisito_acao_id", "observacao", "etapa_destino_id"];
  const colunas = campos.filter((c) => body[c] !== undefined);
  if (colunas.length === 0) return error("Nenhum campo para atualizar");
  const set = colunas.map((c) => `${c} = ?`).join(", ");
  const valores = colunas.map((c) => body[c]);
  await run(context.env.DB, `UPDATE acoes SET ${set} WHERE id = ?`, ...valores, context.params.id);
  const atualizada = await first(context.env.DB, "SELECT * FROM acoes WHERE id = ?", context.params.id);
  if (!atualizada) return error("Não encontrada", 404);
  return json(atualizada);
}

export async function onRequestDelete(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "excluir");
  if (erro) return erro;
  await run(context.env.DB, "DELETE FROM acoes WHERE id = ?", context.params.id);
  return json({ ok: true });
}
