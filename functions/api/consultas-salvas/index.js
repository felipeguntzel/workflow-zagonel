import { json, error } from "../../_lib/http.js";
import { obterUsuarioDaRequisicao } from "../../_lib/permissoes.js";
import {
  listarConsultas,
  obterConsultaPadraoId,
  salvarConsulta,
} from "../../_lib/consultas.js";

export async function onRequestGet(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado.", 401);

  const url = new URL(context.request.url);
  const tela = url.searchParams.get("tela") || "chamados";

  try {
    const consultas = await listarConsultas(context.env.DB, tela, usuario.id);
    const consultaPadraoId = await obterConsultaPadraoId(context.env.DB, tela, usuario.id);

    return json({
      consultas,
      consulta_padrao_id: consultaPadraoId,
    });
  } catch (err) {
    console.error("[GET /api/consultas-salvas] Erro:", err);
    return error(err.message || "Erro ao listar consultas salvas.", 500);
  }
}

export async function onRequestPost(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado.", 401);

  const body = await context.request.json().catch(() => ({}));
  if (!body.nome || !body.nome.trim()) {
    return error("O nome da consulta é obrigatório.");
  }

  const tela = body.tela || "chamados";

  try {
    const salva = await salvarConsulta(context.env.DB, {
      usuarioId: usuario.id,
      tela,
      nome: body.nome,
      filtros_json: body.filtros_json || {},
      eh_publica: Boolean(body.eh_publica),
      definir_como_padrao: Boolean(body.definir_como_padrao),
    });

    return json(salva, 201);
  } catch (err) {
    console.error("[POST /api/consultas-salvas] Erro:", err);
    return error(err.message || "Erro ao salvar consulta.", 400);
  }
}
