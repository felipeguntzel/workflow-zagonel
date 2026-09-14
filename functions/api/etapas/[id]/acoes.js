import { first, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.rotulo || !body.setor_destino_id || !body.vinculo) {
    return error("Campos obrigatórios: rotulo, setor_destino_id, vinculo");
  }
  const resultado = await run(
    context.env.DB,
    `INSERT INTO acoes (etapa_id, rotulo, setor_destino_id, vinculo, prerequisito_acao_id)
     VALUES (?, ?, ?, ?, ?)`,
    context.params.id,
    body.rotulo,
    body.setor_destino_id,
    body.vinculo,
    body.prerequisito_acao_id ?? null
  );
  const nova = await first(context.env.DB, "SELECT * FROM acoes WHERE id = ?", resultado.meta.last_row_id);
  return json(nova, 201);
}
