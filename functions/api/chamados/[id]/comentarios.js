import { all, first, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { hojeISO } from "../../../_lib/chamados.js";
import { obterUsuarioDaRequisicao } from "../../../_lib/permissoes.js";
import { registrarAuditoria } from "../../../_lib/auditoria.js";

async function listarComentarios(db, chamadoId, podeVerPrivados) {
  const condicao = podeVerPrivados ? "1 = 1" : "COALESCE(c.eh_privado, 0) = 0";
  return all(
    db,
    `SELECT c.*, u.nome AS usuario_nome
     FROM comentarios c
     LEFT JOIN usuarios u ON u.id = c.usuario_id
     WHERE c.chamado_id = ? AND ${condicao}
     ORDER BY c.id`,
    chamadoId
  );
}

export async function onRequestGet(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);

  const chamado = await first(
    context.env.DB,
    `SELECT c.*, COALESCE(e.setor_id, a.setor_destino_id) AS setor_id
     FROM chamados c
     LEFT JOIN etapas e ON e.id = c.etapa_id
     LEFT JOIN acoes a ON a.id = c.acao_origem_id
     WHERE c.id = ?`,
    context.params.id
  );
  if (!chamado) return error("Chamado não encontrado", 404);

  const ehAdmin = usuario.admin === 1;
  const ehDoSetor = usuario.setor_id === chamado.setor_id;
  const ehResponsavel = usuario.id === chamado.responsavel_id;
  const ehSolicitante = usuario.id === chamado.solicitante_id;
  const podeVerPrivados = ehAdmin || ehDoSetor || ehResponsavel || ehSolicitante;

  return json(await listarComentarios(context.env.DB, context.params.id, podeVerPrivados));
}

export async function onRequestPost(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);

  const chamado = await first(
    context.env.DB,
    `SELECT c.*, COALESCE(e.setor_id, a.setor_destino_id) AS setor_id
     FROM chamados c
     LEFT JOIN etapas e ON e.id = c.etapa_id
     LEFT JOIN acoes a ON a.id = c.acao_origem_id
     WHERE c.id = ?`,
    context.params.id
  );
  if (!chamado) return error("Chamado não encontrado", 404);

  const body = await context.request.json();
  if (!body.texto) {
    return error("Campo obrigatório: texto");
  }

  const ehPrivado = body.eh_privado ? 1 : 0;

  await run(
    context.env.DB,
    `INSERT INTO comentarios (chamado_id, usuario_id, data, texto, eh_justificativa, eh_privado)
     VALUES (?, ?, ?, ?, 0, ?)`,
    context.params.id,
    usuario.id,
    hojeISO(),
    body.texto,
    ehPrivado
  );

  const raizId = chamado.chamado_mae_id || chamado.id;
  await registrarAuditoria(context.env.DB, {
    chamado_mae_id: raizId,
    chamado_id: chamado.id,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    acao: "comentario",
    detalhes: `Adicionou comentário${ehPrivado ? " (privado)" : ""}: "${body.texto.slice(0, 60)}${body.texto.length > 60 ? "..." : ""}"`
  });

  const ehAdmin = usuario.admin === 1;
  const ehDoSetor = usuario.setor_id === chamado.setor_id;
  const ehResponsavel = usuario.id === chamado.responsavel_id;
  const ehSolicitante = usuario.id === chamado.solicitante_id;
  const podeVerPrivados = ehAdmin || ehDoSetor || ehResponsavel || ehSolicitante;

  return json(await listarComentarios(context.env.DB, context.params.id, podeVerPrivados), 201);
}
