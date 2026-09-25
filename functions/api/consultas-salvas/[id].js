import { json, error } from "../../_lib/http.js";
import { obterUsuarioDaRequisicao } from "../../_lib/permissoes.js";
import {
  salvarConsulta,
  excluirConsulta,
  definirConsultaPadrao,
} from "../../_lib/consultas.js";

export async function onRequestPut(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado.", 401);

  const id = Number(context.params.id);
  if (!id) return error("ID inválido.");

  const body = await context.request.json().catch(() => ({}));

  try {
    // Se a requisição for apenas para alternar o status de padrão
    if (body.definir_como_padrao !== undefined && body.nome === undefined) {
      const tela = body.tela || "chamados";
      await definirConsultaPadrao(
        context.env.DB,
        tela,
        usuario.id,
        body.definir_como_padrao ? id : null
      );
      return json({ ok: true, consulta_id: id, eh_padrao: Boolean(body.definir_como_padrao) });
    }

    if (!body.nome || !body.nome.trim()) {
      return error("O nome da consulta é obrigatório.");
    }

    const atualizada = await salvarConsulta(context.env.DB, {
      id,
      usuarioId: usuario.id,
      tela: body.tela || "chamados",
      nome: body.nome,
      filtros_json: body.filtros_json,
      eh_publica: Boolean(body.eh_publica),
      definir_como_padrao: Boolean(body.definir_como_padrao),
    });

    return json(atualizada);
  } catch (err) {
    console.error("[PUT /api/consultas-salvas/:id] Erro:", err);
    return error(err.message || "Erro ao atualizar consulta.", 400);
  }
}

export async function onRequestDelete(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado.", 401);

  const id = Number(context.params.id);
  if (!id) return error("ID inválido.");

  try {
    await excluirConsulta(context.env.DB, id, usuario);
    return json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/consultas-salvas/:id] Erro:", err);
    return error(err.message || "Erro ao excluir consulta.", 400);
  }
}
