import { first, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { obterUsuarioDaRequisicao } from "../../../_lib/permissoes.js";
import { validarLimiteAnexo, salvarAnexo, listarAnexosDoChamado, obterAnexoPorId } from "../../../_lib/anexos.js";
import { registrarAuditoria } from "../../../_lib/auditoria.js";

export async function onRequestGet(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);

  const url = new URL(context.request.url);
  const downloadId = url.searchParams.get("download") || url.searchParams.get("anexo_id");

  if (downloadId) {
    const anexo = await obterAnexoPorId(context.env.DB, downloadId);
    if (!anexo || String(anexo.chamado_id) !== String(context.params.id)) {
      return error("Anexo não encontrado", 404);
    }
    return json(anexo);
  }

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

  const anexos = await listarAnexosDoChamado(context.env.DB, context.params.id, podeVerPrivados);
  return json(anexos);
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
  const { nome_arquivo, tipo_mime, tamanho_bytes, conteudo_base64, eh_privado = 0 } = body;

  if (!nome_arquivo || !conteudo_base64 || !tamanho_bytes) {
    return error("Arquivo inválido ou incompleto.");
  }

  const raizId = chamado.chamado_mae_id || chamado.id;
  const erroValidacao = await validarLimiteAnexo(context.env.DB, raizId, tamanho_bytes);
  if (erroValidacao) {
    return error(erroValidacao, 400);
  }

  const anexoSalvo = await salvarAnexo(context.env.DB, {
    chamado_id: chamado.id,
    usuario_id: usuario.id,
    nome_arquivo,
    tipo_mime: tipo_mime || "application/octet-stream",
    tamanho_bytes,
    conteudo_base64,
    eh_privado: eh_privado ? 1 : 0
  });

  await registrarAuditoria(context.env.DB, {
    chamado_mae_id: raizId,
    chamado_id: chamado.id,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    acao: "anexo",
    detalhes: `Anexou arquivo "${nome_arquivo}" (${(tamanho_bytes / 1024).toFixed(1)} KB)${eh_privado ? " (privado)" : ""}`
  });

  return json(anexoSalvo, 201);
}

export async function onRequestDelete(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);

  const url = new URL(context.request.url);
  const anexoId = url.searchParams.get("anexo_id");
  if (!anexoId) return error("Parâmetro anexo_id obrigatório");

  const anexo = await obterAnexoPorId(context.env.DB, anexoId);
  if (!anexo || String(anexo.chamado_id) !== String(context.params.id)) {
    return error("Anexo não encontrado", 404);
  }

  const ehDono = anexo.usuario_id === usuario.id;
  const ehAdmin = usuario.admin === 1;
  if (!ehDono && !ehAdmin) {
    return error("Sem permissão para excluir este anexo", 403);
  }

  await run(context.env.DB, "DELETE FROM chamado_anexos WHERE id = ?", anexoId);

  const chamado = await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", context.params.id);
  const raizId = chamado ? (chamado.chamado_mae_id || chamado.id) : context.params.id;

  await registrarAuditoria(context.env.DB, {
    chamado_mae_id: raizId,
    chamado_id: context.params.id,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    acao: "exclusao_anexo",
    detalhes: `Removeu anexo "${anexo.nome_arquivo}"`
  });

  return json({ ok: true });
}
