import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import {
  chamadoComDetalhes,
  hojeISO,
  aplicarCascataAtraso,
  computarBloqueado,
  avancarFluxo,
  sincronizarProgressoChamadoMae,
  repararFksOrfasChamados,
} from "../../_lib/chamados.js";
import { carregarEtapaComAcoes } from "../../_lib/etapas.js";
import { exigirPermissao, exigirUsuarioLogado, obterPermissoesDoUsuario } from "../../_lib/permissoes.js";
import { registrarAuditoria, registrarAuditoriaSistema } from "../../_lib/auditoria.js";
import { atualizarContadorId } from "../../_lib/dependencias.js";

export async function onRequestGet(context) {
  try {
    const { erro } = await exigirPermissao(context, "chamados", "visualizar");
    if (erro) return erro;
    const chamado = await chamadoComDetalhes(context.env.DB, context.params.id);
    if (!chamado) return error("Não encontrado", 404);
    return json(chamado);
  } catch (err) {
    console.error(`[GET /api/chamados/${context.params.id}] Falha:`, err);
    return error(err.message || "Erro interno do servidor.", 500);
  }
}

export async function onRequestPut(context) {
  const { usuario, erro } = await exigirUsuarioLogado(context);
  if (erro) return erro;
  const body = await context.request.json();
  const camposPermitidos = ["status_id", "responsavel_id", "prazo"];
  const colunas = camposPermitidos.filter((c) => body[c] !== undefined);
  if (colunas.length === 0) return error("Nenhum campo para atualizar");

  const chamadoAntes = await chamadoComDetalhes(context.env.DB, context.params.id);
  if (!chamadoAntes) return error("Não encontrado", 404);

  // Usuário pode editar se for admin, tiver permissão de edição em chamados,
  // for o responsável atual, ou pertencer ao mesmo setor da etapa/tarefa
  const permissoes = await obterPermissoesDoUsuario(context.env.DB, usuario.id);
  const temPermissaoEditar = usuario.admin === 1 || Boolean(permissoes?.chamados?.editar);
  const ehResponsavel = chamadoAntes.responsavel_id != null && Number(chamadoAntes.responsavel_id) === Number(usuario.id);
  const ehMesmoSetor = chamadoAntes.setor_id != null && usuario.setor_id != null && Number(chamadoAntes.setor_id) === Number(usuario.setor_id);
  const ehSolicitante = Number(chamadoAntes.solicitante_id) === Number(usuario.id);
  const ehChamadoMae = !chamadoAntes.chamado_mae_id || chamadoAntes.chamado_mae_id === 0;

  // Regra: o usuário que abriu o chamado só vai conseguir trocar o status caso assuma a tarefa
  if (body.status_id !== undefined && ehSolicitante && !ehChamadoMae && !ehResponsavel) {
    return error("O usuário que abriu o chamado só pode alterar o status caso assuma a tarefa.", 403);
  }

  // O solicitante pode assumir a tarefa diretamente
  const ehAutoAtribuicao = body.responsavel_id !== undefined && Number(body.responsavel_id) === Number(usuario.id);

  if (!temPermissaoEditar && !ehResponsavel && !ehMesmoSetor && !(ehSolicitante && ehAutoAtribuicao)) {
    return error("Você não tem permissão para editar este chamado.", 403);
  }

  // Validação de atribuição de responsável:
  // "somente usuários que são do setor daquela etapa, o chamado pode ser trocado de responsável dentro do mesmo setor"
  if (body.responsavel_id !== undefined && body.responsavel_id !== null) {
    const usuarioDestino = await first(context.env.DB, "SELECT id, nome, setor_id FROM usuarios WHERE id = ?", body.responsavel_id);
    if (!usuarioDestino) {
      return error("Usuário responsável não encontrado", 404);
    }
    const ehAutoAtribuicaoSolicitante = ehSolicitante && Number(body.responsavel_id) === Number(usuario.id);
    if (chamadoAntes.setor_id && usuarioDestino.setor_id !== chamadoAntes.setor_id && usuario.admin !== 1 && !ehAutoAtribuicaoSolicitante) {
      return error("O responsável deve pertencer ao setor da etapa deste chamado.", 403);
    }

    // Regra de transição automática de status:
    // Se o chamado estiver em 'não iniciado', ao atribuir responsável ele vai para 'previsto'
    if (chamadoAntes.status_nome === "não iniciado" && body.status_id === undefined) {
      const statusPrevisto = await first(context.env.DB, "SELECT id FROM status WHERE LOWER(nome) = 'previsto' LIMIT 1");
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
    if (statusRow && String(statusRow.nome).toLowerCase() === "finalizado") {
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
  const etapaNome = atualizado.etapa_nome || (atualizado.chamado_mae_id ? `Etapa #${atualizado.id}` : "Solicitação Inicial");

  if (body.status_id !== undefined && body.status_id !== chamadoAntes.status_id) {
    await registrarAuditoria(context.env.DB, {
      chamado_mae_id: raizId,
      chamado_id: atualizado.id,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      acao: "mudanca_status",
      detalhes: `Status da etapa "${etapaNome}" alterado de "${chamadoAntes.status_nome}" para "${atualizado.status_nome}".`
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
      detalhes: `Etapa "${etapaNome}": ${nomeNovo} por ${usuario.nome}.`
    });
  }

  if (body.prazo !== undefined && body.prazo !== chamadoAntes.prazo) {
    await registrarAuditoria(context.env.DB, {
      chamado_mae_id: raizId,
      chamado_id: atualizado.id,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      acao: "alteracao_prazo",
      detalhes: `Prazo da etapa "${etapaNome}" alterado de ${chamadoAntes.prazo} para ${atualizado.prazo}.`
    });
  }

  if (atualizado.status_nome && String(atualizado.status_nome).toLowerCase() === "finalizado" && atualizado.data_finalizacao === hoje) {
    await aplicarCascataAtraso(context.env.DB, atualizado, hoje);
  }

  // Sincroniza o chamado mãe caso o chamado atual faça parte de um fluxo
  await sincronizarProgressoChamadoMae(context.env.DB, atualizado.id, hoje);

  return json(atualizado);
}

async function coletarSubarvore(db, chamadoId) {
  const visitados = new Set();
  const resultado = [];

  // Se o chamado for o chamado mãe raiz, busca todos os registros vinculados a essa família
  const ch = await first(db, "SELECT id, chamado_mae_id FROM chamados WHERE id = ?", chamadoId).catch(() => null);
  if (ch && (!ch.chamado_mae_id || Number(ch.chamado_mae_id) === Number(chamadoId))) {
    const rawFamilia = await all(db, "SELECT id FROM chamados WHERE chamado_mae_id = ? OR id = ?", chamadoId, chamadoId).catch(() => []);
    const todosFamilia = Array.isArray(rawFamilia) ? rawFamilia : (rawFamilia?.results || []);
    for (const f of todosFamilia) {
      const fId = Number(f.id);
      if (!visitados.has(fId)) {
        visitados.add(fId);
        resultado.push(fId);
      }
    }
    return resultado;
  }

  // Caso seja um subchamado, percorre os descendentes em largura
  const fila = [Number(chamadoId)];
  while (fila.length > 0) {
    const atual = fila.shift();
    if (visitados.has(atual)) continue;
    visitados.add(atual);
    resultado.push(atual);

    const rawFilhos = await all(db, "SELECT id FROM chamados WHERE chamado_pai_id = ?", atual).catch(() => []);
    const filhos = Array.isArray(rawFilhos) ? rawFilhos : (rawFilhos?.results || []);
    for (const filho of filhos) {
      const filhoId = Number(filho.id);
      if (!visitados.has(filhoId)) {
        fila.push(filhoId);
      }
    }
  }

  return resultado;
}

export async function onRequestDelete(context) {
  try {
    const { usuario, erro } = await exigirPermissao(context, "chamados", "excluir");
    if (erro) return erro;

    await repararFksOrfasChamados(context.env.DB);

    const chamado = await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", context.params.id);
    if (!chamado) {
      return error("Chamado não encontrado.", 404);
    }

    const raizId = chamado.chamado_mae_id || chamado.id;
    const ids = await coletarSubarvore(context.env.DB, context.params.id);

    // Registra na auditoria do sistema (tabela independente sem chaves estrangeiras restritivas)
    await registrarAuditoriaSistema(context.env.DB, {
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      entidade: "chamados",
      entidade_id: Number(context.params.id),
      acao: "exclusao_chamado",
      detalhes: `Exclusão do chamado #${context.params.id} e seus registros vinculados (${ids.length} chamados).`,
    });

    // Se estiver excluindo apenas um subchamado e a raiz continuar existindo, anota no histórico da raiz
    if (raizId && !ids.includes(Number(raizId))) {
      await registrarAuditoria(context.env.DB, {
        chamado_mae_id: raizId,
        chamado_id: raizId,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        acao: "exclusao_subchamado",
        detalhes: `Exclusão da etapa/subchamado #${context.params.id}.`,
      }).catch(() => {});
    }

    // 1. Desvincula auto-relacionamento de FKs em chamados (chamado_pai_id e chamado_mae_id) para evitar violação de integridade referencial
    for (const chamadoId of ids) {
      await run(
        context.env.DB,
        "UPDATE chamados SET chamado_pai_id = NULL, chamado_mae_id = NULL WHERE id = ? OR chamado_pai_id = ? OR chamado_mae_id = ?",
        chamadoId,
        chamadoId,
        chamadoId
      ).catch(() => {});
    }

    // 2. Remove registros em tabelas dependentes
    for (const chamadoId of ids) {
      await run(context.env.DB, "DELETE FROM historico_auditoria WHERE chamado_id = ? OR chamado_mae_id = ?", chamadoId, chamadoId).catch(() => {});
      await run(context.env.DB, "DELETE FROM apontamentos_horas WHERE chamado_id = ?", chamadoId).catch(() => {});
      await run(context.env.DB, "DELETE FROM comentarios WHERE chamado_id = ?", chamadoId).catch(() => {});
      await run(context.env.DB, "DELETE FROM chamado_anexos WHERE chamado_id = ?", chamadoId).catch(() => {});
      await run(context.env.DB, "DELETE FROM chamado_campos_valores WHERE chamado_id = ?", chamadoId).catch(() => {});
    }

    // 3. Remove os chamados
    for (const chamadoId of [...ids].reverse()) {
      await run(context.env.DB, "DELETE FROM chamados WHERE id = ?", chamadoId);
    }
    await atualizarContadorId(context.env.DB, "chamados");

    // 4. Se a raiz ainda existir, sincroniza seu progresso
    if (raizId && !ids.includes(Number(raizId))) {
      await sincronizarProgressoChamadoMae(context.env.DB, raizId, hojeISO()).catch(() => {});
    }

    return json({ ok: true, excluidos: ids });
  } catch (err) {
    console.error(`[DELETE /api/chamados/${context.params.id}] Falha:`, err);
    return error(err.message || "Erro interno do servidor ao excluir chamado.", 500);
  }
}
