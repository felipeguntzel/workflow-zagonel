import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import {
  chamadoComDetalhes,
  hojeISO,
  aplicarCascataAtraso,
  computarBloqueado,
  avancarFluxo,
} from "../../_lib/chamados.js";
import { carregarEtapaComAcoes } from "../../_lib/etapas.js";
import { exigirPermissao } from "../../_lib/permissoes.js";
import { registrarAuditoria } from "../../_lib/auditoria.js";

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "chamados", "visualizar");
  if (erro) return erro;
  const chamado = await chamadoComDetalhes(context.env.DB, context.params.id);
  if (!chamado) return error("Não encontrado", 404);
  return json(chamado);
}

export async function onRequestPut(context) {
  const { usuario, erro } = await exigirPermissao(context, "chamados", "editar");
  if (erro) return erro;
  const body = await context.request.json();
  const camposPermitidos = ["status_id", "responsavel_id", "prazo"];
  const colunas = camposPermitidos.filter((c) => body[c] !== undefined);
  if (colunas.length === 0) return error("Nenhum campo para atualizar");

  const chamadoAntes = await chamadoComDetalhes(context.env.DB, context.params.id);
  if (!chamadoAntes) return error("Não encontrado", 404);

  // Validação de atribuição de responsável:
  // "somente usuários que são do setor daquela etapa, o chamado pode ser trocado de responsável dentro do mesmo setor"
  if (body.responsavel_id !== undefined && body.responsavel_id !== null) {
    const usuarioDestino = await first(context.env.DB, "SELECT id, nome, setor_id FROM usuarios WHERE id = ?", body.responsavel_id);
    if (!usuarioDestino) {
      return error("Usuário responsável não encontrado", 404);
    }
    if (chamadoAntes.setor_id && usuarioDestino.setor_id !== chamadoAntes.setor_id && usuario.admin !== 1) {
      return error("O responsável deve pertencer ao setor da etapa deste chamado.", 403);
    }

    // Regra de transição automática de status:
    // Se o chamado estiver em 'não iniciado', ao atribuir responsável ele vai para 'previsto'
    if (chamadoAntes.status_nome === "não iniciado" && body.status_id === undefined) {
      const statusPrevisto = await first(context.env.DB, "SELECT id FROM status WHERE nome = 'previsto'");
      if (statusPrevisto) {
        body.status_id = statusPrevisto.id;
        if (!colunas.includes("status_id")) {
          colunas.push("status_id");
        }
      }
    }
  }

  const set = colunas.map((c) => `${c} = ?`).join(", ");
  const valores = colunas.map((c) => body[c]);
  const hoje = hojeISO();

  if (body.status_id !== undefined) {
    const statusRow = await first(context.env.DB, "SELECT nome FROM status WHERE id = ?", body.status_id);
    if (statusRow && statusRow.nome === "finalizado") {
      if (await computarBloqueado(context.env.DB, chamadoAntes)) {
        return error("Não é possível finalizar: chamado bloqueado aguardando pré-requisito.", 409);
      }
      const jaFinalizado = chamadoAntes.status_id === body.status_id;
      await run(
        context.env.DB,
        `UPDATE chamados SET ${set}, data_finalizacao = COALESCE(data_finalizacao, ?) WHERE id = ?`,
        ...valores,
        hoje,
        context.params.id
      );
      if (!jaFinalizado && chamadoAntes.etapa_id) {
        const etapa = await carregarEtapaComAcoes(context.env.DB, chamadoAntes.etapa_id);
        if (etapa && etapa.tipo === "tarefa") {
          await avancarFluxo(context.env.DB, chamadoAntes, etapa, {});
        }
      }
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

  // Registrar auditoria para cada alteração efetuada
  const raizId = atualizado.chamado_mae_id || atualizado.id;
  if (body.status_id !== undefined && body.status_id !== chamadoAntes.status_id) {
    await registrarAuditoria(context.env.DB, {
      chamado_mae_id: raizId,
      chamado_id: atualizado.id,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      acao: "mudanca_status",
      detalhes: `Status do chamado #${atualizado.id} alterado de "${chamadoAntes.status_nome}" para "${atualizado.status_nome}".`
    });
  }

  if (body.responsavel_id !== undefined && body.responsavel_id !== chamadoAntes.responsavel_id) {
    const nomeNovo = atualizado.responsavel_nome ? `atribuído para "${atualizado.responsavel_nome}"` : "responsável liberado";
    await registrarAuditoria(context.env.DB, {
      chamado_mae_id: raizId,
      chamado_id: atualizado.id,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      acao: "atribuicao",
      detalhes: `Chamado #${atualizado.id}: ${nomeNovo} por ${usuario.nome}.`
    });
  }

  if (body.prazo !== undefined && body.prazo !== chamadoAntes.prazo) {
    await registrarAuditoria(context.env.DB, {
      chamado_mae_id: raizId,
      chamado_id: atualizado.id,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      acao: "alteracao_prazo",
      detalhes: `Prazo do chamado #${atualizado.id} alterado de ${chamadoAntes.prazo} para ${atualizado.prazo}.`
    });
  }

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
  const { usuario, erro } = await exigirPermissao(context, "chamados", "excluir");
  if (erro) return erro;
  const ids = await coletarSubarvore(context.env.DB, context.params.id);

  const chamado = await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", context.params.id);
  const raizId = chamado ? (chamado.chamado_mae_id || chamado.id) : context.params.id;

  await registrarAuditoria(context.env.DB, {
    chamado_mae_id: raizId,
    chamado_id: context.params.id,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    acao: "exclusao_chamado",
    detalhes: `Exclusão do chamado #${context.params.id} e sua subárvore (${ids.length} nós).`
  });

  for (const chamadoId of [...ids].reverse()) {
    await run(context.env.DB, "DELETE FROM apontamentos_horas WHERE chamado_id = ?", chamadoId);
    await run(context.env.DB, "DELETE FROM comentarios WHERE chamado_id = ?", chamadoId);
    await run(context.env.DB, "DELETE FROM chamado_anexos WHERE chamado_id = ?", chamadoId);
    await run(context.env.DB, "DELETE FROM chamado_campos_valores WHERE chamado_id = ?", chamadoId);
    await run(context.env.DB, "DELETE FROM chamados WHERE id = ?", chamadoId);
  }
  return json({ ok: true, excluidos: ids });
}
