import { run, first } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { carregarEtapaComAcoes } from "../../../_lib/etapas.js";
import { exigirPermissao } from "../../../_lib/permissoes.js";
import {
  chamadoComDetalhes,
  finalizarComCascata,
  avancarFluxo,
  aplicarCascataAtraso,
  hojeISO,
  sincronizarProgressoChamadoMae,
} from "../../../_lib/chamados.js";
import { registrarAuditoria } from "../../../_lib/auditoria.js";

export async function onRequestPost(context) {
  try {
    const { usuario, erro } = await exigirPermissao(context, "chamados", "editar");
    if (erro) return erro;
    const body = await context.request.json().catch(() => ({}));
    if (body.decisao !== "aprovado" && body.decisao !== "reprovado") {
      return error("Campo 'decisao' deve ser 'aprovado' ou 'reprovado'");
    }
    const chamado = await chamadoComDetalhes(context.env.DB, context.params.id);
    if (!chamado) return error("Não encontrado", 404);
    if (!chamado.etapa_id || chamado.etapa_tipo !== "aprovacao") {
      return error("Este chamado não é uma etapa de aprovação");
    }

    const hoje = hojeISO();
    const raizId = chamado.chamado_mae_id || chamado.id;
    const etapaNome = chamado.etapa_nome || chamado.titulo || `Etapa #${chamado.id}`;

    if (body.decisao === "reprovado") {
      if (!body.justificativa) return error("Justificativa é obrigatória ao reprovar");
      await run(
        context.env.DB,
        `INSERT INTO comentarios (chamado_id, usuario_id, data, texto, eh_justificativa, eh_privado)
         VALUES (?, ?, ?, ?, 1, 0)`,
        chamado.id,
        usuario.id,
        hoje,
        body.justificativa
      );

      await registrarAuditoria(context.env.DB, {
        chamado_mae_id: raizId,
        chamado_id: chamado.id,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        acao: "decisao_reprovada",
        detalhes: `Etapa "${etapaNome}" REPROVADA por ${usuario.nome}. Justificativa: "${body.justificativa}"`
      });

      await finalizarComCascata(context.env.DB, chamado.id, { hoje, resultadoOrigem: "reprovado" });
      const atualizado = await chamadoComDetalhes(context.env.DB, chamado.id);
      await aplicarCascataAtraso(context.env.DB, atualizado, hoje);
      await sincronizarProgressoChamadoMae(context.env.DB, chamado.id, hoje);
      return json({ chamado: atualizado, criados: [] });
    }

    await run(
      context.env.DB,
      `UPDATE chamados
       SET status_id = (SELECT id FROM status WHERE LOWER(nome) = 'finalizado' LIMIT 1),
           resultado = 'aprovado',
           data_finalizacao = COALESCE(data_finalizacao, ?)
       WHERE id = ?`,
      hoje,
      chamado.id
    );

    await registrarAuditoria(context.env.DB, {
      chamado_mae_id: raizId,
      chamado_id: chamado.id,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      acao: "decisao_aprovada",
      detalhes: `Etapa "${etapaNome}" APROVADA por ${usuario.nome}.`
    });

    const atualizado = await chamadoComDetalhes(context.env.DB, chamado.id);
    const etapa = await carregarEtapaComAcoes(context.env.DB, chamado.etapa_id);
    const criados = await avancarFluxo(
      context.env.DB,
      atualizado,
      etapa,
      body.acoes ?? {},
      body.observacoes_acoes ?? {}
    );

    for (const filho of criados) {
      const etapaFilho = filho.etapa_id ? await first(context.env.DB, "SELECT nome FROM etapas WHERE id = ?", filho.etapa_id) : null;
      const nomeFilho = etapaFilho?.nome || filho.titulo || `#${filho.id}`;
      await registrarAuditoria(context.env.DB, {
        chamado_mae_id: raizId,
        chamado_id: filho.id,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        acao: "criacao_subchamado",
        detalhes: `Etapa "${nomeFilho}" iniciada pela aprovação da etapa "${etapaNome}".`
      });
    }

    await aplicarCascataAtraso(context.env.DB, atualizado, hoje);
    await sincronizarProgressoChamadoMae(context.env.DB, chamado.id, hoje);
    return json({ chamado: atualizado, criados });
  } catch (err) {
    console.error("Erro ao processar decisão de aprovação:", err);
    return error(err?.message || "Erro ao processar decisão de aprovação.", 400);
  }
}
