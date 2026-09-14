import { all, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { hojeISO } from "../../../_lib/chamados.js";

async function listarComentarios(db, chamadoId) {
  return all(
    db,
    `SELECT c.*, u.nome AS usuario_nome
     FROM comentarios c
     LEFT JOIN usuarios u ON u.id = c.usuario_id
     WHERE c.chamado_id = ?
     ORDER BY c.id`,
    chamadoId
  );
}

export async function onRequestGet(context) {
  return json(await listarComentarios(context.env.DB, context.params.id));
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.usuario_id || !body.texto) {
    return error("Campos obrigatórios: usuario_id, texto");
  }
  await run(
    context.env.DB,
    `INSERT INTO comentarios (chamado_id, usuario_id, data, texto, eh_justificativa)
     VALUES (?, ?, ?, ?, 0)`,
    context.params.id,
    body.usuario_id,
    hojeISO(),
    body.texto
  );
  return json(await listarComentarios(context.env.DB, context.params.id), 201);
}
