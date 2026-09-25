import { first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirPermissao } from "../../_lib/permissoes.js";
import { registrarAuditoria } from "../../_lib/auditoria.js";
import { validarPermissaoAlteracaoApontamento } from "../../_lib/apontamentos.js";

export async function onRequestGet(context) {
  let { erro } = await exigirPermissao(context, "apontamentos", "visualizar");
  if (erro) {
    ({ erro } = await exigirPermissao(context, "chamados", "visualizar"));
  }
  if (erro) return erro;

  const apontamento = await first(
    context.env.DB,
    `SELECT h.*, u.nome AS usuario_nome, c.titulo AS chamado_titulo
     FROM apontamentos_horas h
     JOIN usuarios u ON u.id = h.usuario_id
     LEFT JOIN chamados c ON c.id = h.chamado_id
     WHERE h.id = ?`,
    context.params.id
  );
  if (!apontamento) return error("Apontamento não encontrado", 404);
  return json(apontamento);
}

export async function onRequestPut(context) {
  let { usuario, erro } = await exigirPermissao(context, "apontamentos", "editar");
  if (erro) {
    ({ usuario, erro } = await exigirPermissao(context, "chamados", "editar"));
  }
  if (erro) return erro;

  const db = context.env.DB;
  const existente = await first(db, "SELECT * FROM apontamentos_horas WHERE id = ?", context.params.id);
  if (!existente) return error("Apontamento não encontrado", 404);

  // Apenas o próprio autor ou administrador pode editar
  if (existente.usuario_id !== usuario.id && !usuario.admin) {
    return error("Você só pode editar apontamentos registrados por você.", 403);
  }

  // 1. Valida se a data ORIGINAL está em mês fechado
  const validacaoOrig = await validarPermissaoAlteracaoApontamento(db, existente.data, usuario);
  if (!validacaoOrig.permitido) {
    return error(validacaoOrig.motivo, 403);
  }

  const body = await context.request.json().catch(() => ({}));
  const novaData = body.data || existente.data;
  const novasHoras = body.horas != null ? Number(body.horas) : existente.horas;
  const novaObservacao = body.observacao !== undefined ? body.observacao : existente.observacao;

  if (novasHoras <= 0) {
    return error("A quantidade de horas deve ser maior que zero.");
  }

  // 2. Valida se a NOVA data (se alterada) também está em mês permitido
  if (novaData !== existente.data) {
    const validacaoNova = await validarPermissaoAlteracaoApontamento(db, novaData, usuario);
    if (!validacaoNova.permitido) {
      return error(validacaoNova.motivo, 403);
    }
  }

  await run(
    db,
    `UPDATE apontamentos_horas
     SET data = ?, horas = ?, observacao = ?
     WHERE id = ?`,
    novaData,
    novasHoras,
    novaObservacao,
    context.params.id
  );

  const chamado = await first(db, "SELECT id, chamado_mae_id FROM chamados WHERE id = ?", existente.chamado_id);
  if (chamado) {
    const raizId = chamado.chamado_mae_id || chamado.id;
    await registrarAuditoria(db, {
      chamado_mae_id: raizId,
      chamado_id: existente.chamado_id,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      acao: "edicao_apontamento_horas",
      detalhes: `Editou apontamento #${existente.id}: de ${existente.horas}h (${existente.data}) para ${novasHoras}h (${novaData}) por ${usuario.nome}.`,
    }).catch(() => {});
  }

  const atualizado = await first(db, "SELECT * FROM apontamentos_horas WHERE id = ?", context.params.id);
  return json(atualizado);
}

export async function onRequestDelete(context) {
  let { usuario, erro } = await exigirPermissao(context, "apontamentos", "excluir");
  if (erro) {
    ({ usuario, erro } = await exigirPermissao(context, "chamados", "editar"));
  }
  if (erro) return erro;

  const db = context.env.DB;
  const existente = await first(db, "SELECT * FROM apontamentos_horas WHERE id = ?", context.params.id);
  if (!existente) return error("Apontamento não encontrado", 404);

  // Apenas o próprio autor ou administrador pode excluir
  if (existente.usuario_id !== usuario.id && !usuario.admin) {
    return error("Você só pode excluir apontamentos registrados por você.", 403);
  }

  // Valida se a data do apontamento está em mês fechado
  const validacao = await validarPermissaoAlteracaoApontamento(db, existente.data, usuario);
  if (!validacao.permitido) {
    return error(validacao.motivo, 403);
  }

  await run(db, "DELETE FROM apontamentos_horas WHERE id = ?", context.params.id);

  const chamado = await first(db, "SELECT id, chamado_mae_id FROM chamados WHERE id = ?", existente.chamado_id);
  if (chamado) {
    const raizId = chamado.chamado_mae_id || chamado.id;
    await registrarAuditoria(db, {
      chamado_mae_id: raizId,
      chamado_id: existente.chamado_id,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      acao: "exclusao_apontamento_horas",
      detalhes: `Excluiu apontamento #${existente.id} de ${existente.horas}h da data ${existente.data} por ${usuario.nome}.`,
    }).catch(() => {});
  }

  return json({ sucesso: true, mensagem: "Apontamento excluído com sucesso." });
}
