import { all, first, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { hojeISO, verificarPermissaoComentariosChamado } from "../../../_lib/chamados.js";
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
    `SELECT c.*, COALESCE(e.setor_id, a.setor_destino_id) AS setor_id, e.nome AS etapa_nome
     FROM chamados c
     LEFT JOIN etapas e ON e.id = c.etapa_id
     LEFT JOIN acoes a ON a.id = c.acao_origem_id
     WHERE c.id = ?`,
    context.params.id
  );
  if (!chamado) return error("Chamado não encontrado", 404);

  const perm = await verificarPermissaoComentariosChamado(context.env.DB, chamado);
  if (!perm.permitido) {
    return error(perm.motivo, 403);
  }

  const ehChamadoMae = !chamado.chamado_mae_id || chamado.chamado_mae_id === 0;
  const ehSolicitante = Number(chamado.solicitante_id) === Number(usuario.id);
  const ehResponsavel = chamado.responsavel_id != null && Number(chamado.responsavel_id) === Number(usuario.id);

  // Regra: o usuário que abriu o chamado só vai conseguir fazer comentários caso assuma a tarefa
  if (ehSolicitante && !ehChamadoMae && !ehResponsavel) {
    return error("O usuário que abriu o chamado só pode comentar caso assuma a tarefa.", 403);
  }

  const body = await context.request.json();
  const textoLimpo = String(body.texto || "").trim();
  if (!textoLimpo) {
    return error("Campo obrigatório: texto");
  }

  // Previne duplicação acidental por cliques múltiplos ou chamadas concorrentes
  const duplicado = await first(
    context.env.DB,
    "SELECT id FROM comentarios WHERE chamado_id = ? AND usuario_id = ? AND texto = ? AND data = ? ORDER BY id DESC LIMIT 1",
    context.params.id,
    usuario.id,
    textoLimpo,
    hojeISO()
  );
  const ehAdmin = usuario.admin === 1;
  const ehDoSetor = usuario.setor_id === chamado.setor_id;
  const podeVerPrivados = ehAdmin || ehDoSetor || ehResponsavel || ehSolicitante;

  if (duplicado) {
    return json(await listarComentarios(context.env.DB, context.params.id, podeVerPrivados), 200);
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
  const etapaNome = chamado.etapa_nome || (chamado.chamado_mae_id ? `Etapa #${chamado.id}` : "Solicitação Inicial");
  await registrarAuditoria(context.env.DB, {
    chamado_mae_id: raizId,
    chamado_id: chamado.id,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    acao: "comentario",
    detalhes: `Comentário na etapa "${etapaNome}"${ehPrivado ? " (privado)" : ""}: "${body.texto.slice(0, 60)}${body.texto.length > 60 ? "..." : ""}"`
  });

  return json(await listarComentarios(context.env.DB, context.params.id, podeVerPrivados), 201);
}

export async function onRequestDelete(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);

  const url = new URL(context.request.url);
  const comentarioId = url.searchParams.get("comentario_id");
  if (!comentarioId) return error("Parâmetro comentario_id obrigatório");

  const comentario = await first(context.env.DB, "SELECT * FROM comentarios WHERE id = ?", comentarioId);
  if (!comentario || String(comentario.chamado_id) !== String(context.params.id)) {
    return error("Comentário não encontrado", 404);
  }

  const chamado = await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", context.params.id);
  if (!chamado) return error("Chamado não encontrado", 404);

  // Regra: Somente pode remover se a atividade não foi finalizada ainda
  if (chamado.data_finalizacao != null) {
    return error("Não é possível remover comentários de uma atividade já finalizada.", 403);
  }

  // Regra: Somente quem adicionou o comentário pode remover
  const ehDono = comentario.usuario_id === usuario.id;
  if (!ehDono && usuario.admin !== 1) {
    return error("Somente quem adicionou este comentário pode removê-lo.", 403);
  }

  await run(context.env.DB, "DELETE FROM comentarios WHERE id = ?", comentarioId);

  const raizId = chamado.chamado_mae_id || chamado.id;
  const etapa = chamado.etapa_id ? await first(context.env.DB, "SELECT nome FROM etapas WHERE id = ?", chamado.etapa_id) : null;
  const etapaNomeDel = etapa?.nome || (chamado.chamado_mae_id ? `Etapa #${chamado.id}` : "Solicitação Inicial");
  await registrarAuditoria(context.env.DB, {
    chamado_mae_id: raizId,
    chamado_id: chamado.id,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    acao: "exclusao_comentario",
    detalhes: `Removeu comentário #${comentarioId} da etapa "${etapaNomeDel}"`
  });

  return json({ ok: true });
}
