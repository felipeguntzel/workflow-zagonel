import { all, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { exigirPermissao } from "../../../_lib/permissoes.js";

async function resumoHoras(db, chamadoId) {
  const lancamentos = await all(
    db,
    `SELECT h.*, u.nome AS usuario_nome
     FROM apontamentos_horas h
     JOIN usuarios u ON u.id = h.usuario_id
     WHERE h.chamado_id = ?
     ORDER BY h.data`,
    chamadoId
  );
  const total_horas = lancamentos.reduce((soma, l) => soma + l.horas, 0);
  return { lancamentos, total_horas };
}

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "chamados", "visualizar");
  if (erro) return erro;
  return json(await resumoHoras(context.env.DB, context.params.id));
}

export async function onRequestPost(context) {
  const { usuario, erro } = await exigirPermissao(context, "chamados", "inserir");
  if (erro) return erro;
  const body = await context.request.json();
  if (!body.data || !body.horas) {
    return error("Campos obrigatórios: data, horas");
  }
  await run(
    context.env.DB,
    `INSERT INTO apontamentos_horas (chamado_id, usuario_id, data, horas, observacao)
     VALUES (?, ?, ?, ?, ?)`,
    context.params.id,
    usuario.id,
    body.data,
    body.horas,
    body.observacao ?? null
  );
  return json(await resumoHoras(context.env.DB, context.params.id), 201);
}
