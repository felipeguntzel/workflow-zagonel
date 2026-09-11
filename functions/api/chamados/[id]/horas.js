import { all, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";

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
  return json(await resumoHoras(context.env.DB, context.params.id));
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.usuario_id || !body.data || !body.horas) {
    return error("Campos obrigatórios: usuario_id, data, horas");
  }
  await run(
    context.env.DB,
    `INSERT INTO apontamentos_horas (chamado_id, usuario_id, data, horas, observacao)
     VALUES (?, ?, ?, ?, ?)`,
    context.params.id,
    body.usuario_id,
    body.data,
    body.horas,
    body.observacao ?? null
  );
  return json(await resumoHoras(context.env.DB, context.params.id), 201);
}
