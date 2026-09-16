import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { chamadoComDetalhes, hojeISO, aplicarCascataAtraso, computarBloqueado } from "../../_lib/chamados.js";
import { exigirPermissao } from "../../_lib/permissoes.js";

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "chamados", "visualizar");
  if (erro) return erro;
  const chamado = await chamadoComDetalhes(context.env.DB, context.params.id);
  if (!chamado) return error("Não encontrado", 404);
  return json(chamado);
}

export async function onRequestPut(context) {
  const { erro } = await exigirPermissao(context, "chamados", "editar");
  if (erro) return erro;
  const body = await context.request.json();
  const camposPermitidos = ["status_id", "responsavel_id", "prazo"];
  const colunas = camposPermitidos.filter((c) => body[c] !== undefined);
  if (colunas.length === 0) return error("Nenhum campo para atualizar");

  const set = colunas.map((c) => `${c} = ?`).join(", ");
  const valores = colunas.map((c) => body[c]);
  const hoje = hojeISO();

  if (body.status_id !== undefined) {
    const statusRow = await first(context.env.DB, "SELECT nome FROM status WHERE id = ?", body.status_id);
    if (statusRow && statusRow.nome === "finalizado") {
      const chamadoAtual = await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", context.params.id);
      if (!chamadoAtual) return error("Não encontrado", 404);
      if (await computarBloqueado(context.env.DB, chamadoAtual)) {
        return error("Não é possível finalizar: chamado bloqueado aguardando pré-requisito.", 409);
      }
      await run(
        context.env.DB,
        `UPDATE chamados SET ${set}, data_finalizacao = COALESCE(data_finalizacao, ?) WHERE id = ?`,
        ...valores,
        hoje,
        context.params.id
      );
    } else {
      await run(
        context.env.DB,
        `UPDATE chamados SET ${set}, data_finalizacao = NULL WHERE id = ?`,
        ...valores,
        context.params.id
      );
    }
  } else {
    await run(context.env.DB, `UPDATE chamados SET ${set} WHERE id = ?`, ...valores, context.params.id);
  }

  const atualizado = await chamadoComDetalhes(context.env.DB, context.params.id);
  if (!atualizado) return error("Não encontrado", 404);

  if (atualizado.status_nome === "finalizado" && atualizado.data_finalizacao === hoje) {
    await aplicarCascataAtraso(context.env.DB, atualizado, hoje);
  }

  return json(atualizado);
}

async function coletarSubarvore(db, chamadoId) {
  const ids = [Number(chamadoId)];
  const filhos = await all(db, "SELECT id FROM chamados WHERE chamado_pai_id = ?", chamadoId);
  for (const filho of filhos) {
    ids.push(...(await coletarSubarvore(db, filho.id)));
  }
  return ids;
}

export async function onRequestDelete(context) {
  const { erro } = await exigirPermissao(context, "chamados", "excluir");
  if (erro) return erro;
  const ids = await coletarSubarvore(context.env.DB, context.params.id);
  // ponytail: coletarSubarvore returns ids parent-first (preorder); chamados.chamado_mae_id
  // and chamado_pai_id are self-referencing FKs enforced by D1, so a parent row can't be
  // deleted while a descendant still points at it. Deleting in reverse order guarantees every
  // descendant is gone before its ancestor's row is removed (reverse of a preorder walk always
  // puts descendants before ancestors), with no other change to the collection logic.
  for (const chamadoId of [...ids].reverse()) {
    await run(context.env.DB, "DELETE FROM apontamentos_horas WHERE chamado_id = ?", chamadoId);
    await run(context.env.DB, "DELETE FROM comentarios WHERE chamado_id = ?", chamadoId);
    await run(context.env.DB, "DELETE FROM chamados WHERE id = ?", chamadoId);
  }
  return json({ ok: true, excluidos: ids });
}
