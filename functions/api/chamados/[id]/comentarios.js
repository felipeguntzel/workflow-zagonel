import { all, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { hojeISO } from "../../../_lib/chamados.js";
import { obterUsuarioDaRequisicao } from "../../../_lib/permissoes.js";

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
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);
  return json(await listarComentarios(context.env.DB, context.params.id));
}

export async function onRequestPost(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);
  const body = await context.request.json();
  if (!body.texto) {
    return error("Campo obrigatório: texto");
  }
  await run(
    context.env.DB,
    `INSERT INTO comentarios (chamado_id, usuario_id, data, texto, eh_justificativa)
     VALUES (?, ?, ?, ?, 0)`,
    context.params.id,
    usuario.id,
    hojeISO(),
    body.texto
  );
  return json(await listarComentarios(context.env.DB, context.params.id), 201);
}
