import { all, first, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { exigirPermissao } from "../../../_lib/permissoes.js";

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "visualizar");
  if (erro) return erro;
  const etapas = await all(
    context.env.DB,
    "SELECT * FROM etapas WHERE fluxo_template_id = ? ORDER BY id",
    context.params.id
  );
  return json(etapas);
}

export async function onRequestPost(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "inserir");
  if (erro) return erro;
  const body = await context.request.json();
  if (!body.nome || !body.setor_id || !body.tipo) {
    return error("Campos obrigatórios: nome, setor_id, tipo");
  }
  const resultado = await run(
    context.env.DB,
    `INSERT INTO etapas (fluxo_template_id, nome, setor_id, tipo, eh_inicial, etapa_proxima_id, etapa_proxima_vinculo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    context.params.id,
    body.nome,
    body.setor_id,
    body.tipo,
    body.eh_inicial ? 1 : 0,
    body.etapa_proxima_id ?? null,
    body.etapa_proxima_vinculo ?? null
  );
  const nova = await first(context.env.DB, "SELECT * FROM etapas WHERE id = ?", resultado.meta.last_row_id);
  return json(nova, 201);
}
