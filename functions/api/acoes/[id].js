import { run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";

export async function onRequestPut(context) {
  const body = await context.request.json();
  const campos = ["rotulo", "setor_destino_id", "vinculo", "prerequisito_acao_id"];
  const colunas = campos.filter((c) => body[c] !== undefined);
  if (colunas.length === 0) return error("Nenhum campo para atualizar");
  const set = colunas.map((c) => `${c} = ?`).join(", ");
  const valores = colunas.map((c) => body[c]);
  await run(context.env.DB, `UPDATE acoes SET ${set} WHERE id = ?`, ...valores, context.params.id);
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  await run(context.env.DB, "DELETE FROM acoes WHERE id = ?", context.params.id);
  return json({ ok: true });
}
