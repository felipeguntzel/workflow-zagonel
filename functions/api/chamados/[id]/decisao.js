import { run, first } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { carregarEtapaComAcoes } from "../../../_lib/etapas.js";
import { exigirUsuarioLogado, obterPermissoesDoUsuario } from "../../../_lib/permissoes.js";
import {
  chamadoComDetalhes,
  finalizarComCascata,
  avancarFluxo,
  criarChamado,
  aplicarCascataAtraso,
  hojeISO,
  sincronizarProgressoChamadoMae,
  statusIdPorNome,
} from "../../../_lib/chamados.js";

import { registrarAuditoria } from "../../../_lib/auditoria.js";

export async function onRequestPost(context) {
  try {
    const { usuario, erro } = await exigirUsuarioLogado(context);
    if (erro) return erro;
    const body = await context.request.json().catch(() => ({}));
    if (body.decisao !== "aprovado" && body.decisao !== "reprovado") {
      return error("Campo 'decisao' deve ser 'aprovado' ou 'reprovado'");
    }
    const chamado = await chamadoComDetalhes(context.env.DB, context.params.id);
    if (!chamado) return error("Não encontrado", 404);

    const permissoes = await obterPermissoesDoUsuario(context.env.DB, usuario.id);
    const temPermissaoEditar = usuario.admin === 1 || Boolean(permissoes?.chamados?.editar);
    const ehResponsavel = chamado.responsavel_id != null && Number(chamado.responsavel_id) === Number(usuario.id);
    const ehMesmoSetor = chamado.setor_id != null && usuario.setor_id != null && Number(chamado.setor_id) === Number(usuario.setor_id);
    const ehSolicitante = Number(chamado.solicitante_id) === Number(usuario.id);
    const ehChamadoMae = !chamado.chamado_mae_id || chamado.chamado_mae_id === 0;

    // Regra: bloquear campos de aprovação e reprovação caso o chamado não esteja atribuído para ele
    if (!ehChamadoMae && !ehResponsavel && usuario.admin !== 1) {
      return error("Para aprovar ou reprovar esta etapa, o chamado deve estar atribuído para você.", 403);
    }

    if (!temPermissaoEditar && !ehResponsavel && !ehMesmoSetor) {
      return error("Você não tem permissão para registrar decisões neste chamado.", 403);
    }

    const ehAprovacao = chamado.etapa_tipo === "aprovacao" ||
                        chamado.acao_origem_id != null ||
                        String(chamado.titulo || "").toLowerCase().includes("aprova") ||
                        String(chamado.etapa_nome || "").toLowerCase().includes("aprova");
    if (!ehAprovacao) {
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

    const statusFinalizado = await statusIdPorNome(context.env.DB, "finalizado");

    await Promise.all([
      run(
        context.env.DB,
        `UPDATE chamados
         SET status_id = ?,
             resultado = 'aprovado',
             data_finalizacao = COALESCE(data_finalizacao, ?)
         WHERE id = ?`,
        statusFinalizado,
        hoje,
        chamado.id
      ),
      registrarAuditoria(context.env.DB, {
        chamado_mae_id: raizId,
        chamado_id: chamado.id,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        acao: "decisao_aprovada",
        detalhes: `Etapa "${etapaNome}" APROVADA por ${usuario.nome}.`
      })
    ]);

    const atualizado = await chamadoComDetalhes(context.env.DB, chamado.id);

    let criados = [];
    if (chamado.etapa_id) {
      const etapa = await carregarEtapaComAcoes(context.env.DB, chamado.etapa_id);
      if (etapa) {
        criados = await avancarFluxo(
          context.env.DB,
          atualizado,
          etapa,
          body.acoes ?? {},
          body.observacoes_acoes ?? {}
        );
      }
    } else if (chamado.acao_origem_id) {
      const acaoOrigem = await first(
        context.env.DB,
        "SELECT id, rotulo, setor_destino_id, vinculo, etapa_destino_id, etapas_destino_ids, observacao FROM acoes WHERE id = ?",
        chamado.acao_origem_id
      );
      if (acaoOrigem) {
        let idsEtapas = [];
        if (acaoOrigem.etapas_destino_ids) {
          try {
            idsEtapas = JSON.parse(acaoOrigem.etapas_destino_ids).map(Number).filter(Boolean);
          } catch (_) {
            idsEtapas = String(acaoOrigem.etapas_destino_ids).split(",").map(Number).filter(Boolean);
          }
        } else if (acaoOrigem.etapa_destino_id) {
          idsEtapas = [Number(acaoOrigem.etapa_destino_id)];
        }

        const decisoes = body.acoes ?? {};

        for (const destinoId of idsEtapas) {
          const val = decisoes[destinoId];
          const marcado = val === true || (val && typeof val === "object" && (val.marcado === true || val.selecionado === true));
          if (!marcado) continue;

          const etapaDestino = await first(context.env.DB, "SELECT * FROM etapas WHERE id = ?", destinoId);
          const obsCustom = (body.observacoes_acoes && body.observacoes_acoes[destinoId]) ||
                            (typeof val === "object" ? val?.observacao : null) ||
                            acaoOrigem?.observacao ||
                            chamado.observacao;

          const tituloDestino = `${etapaDestino?.nome || "Etapa"} - Ref Chamado ${raizId}`;
          const criado = await criarChamado(context.env.DB, {
            fluxo_template_id: chamado.fluxo_template_id,
            etapa_id: destinoId,
            acao_origem_id: acaoOrigem.id,
            chamado_mae_id: raizId,
            chamado_pai_id: acaoOrigem.vinculo === "mae" ? raizId : chamado.id,
            empresa_id: chamado.empresa_id,
            solicitante_id: chamado.solicitante_id,
            titulo: tituloDestino,
            prioridade: chamado.prioridade,
            observacao: obsCustom,
          });

          if (obsCustom && String(obsCustom).trim()) {
            await run(
              context.env.DB,
              `INSERT INTO comentarios (chamado_id, usuario_id, data, texto, eh_justificativa, eh_privado)
               VALUES (?, ?, ?, ?, 0, 0)`,
              criado.id,
              usuario.id,
              hoje,
              `📌 Observação/Orientação da Ação:\n${String(obsCustom).trim()}`
            ).catch(() => {});
          }

          criados.push(criado);
        }
      }
    }

    if (criados.length > 0) {
      await Promise.all(
        criados.map(async (filho) => {
          const etapaFilho = filho.etapa_id ? await first(context.env.DB, "SELECT nome FROM etapas WHERE id = ?", filho.etapa_id) : null;
          const nomeFilho = etapaFilho?.nome || filho.titulo || `#${filho.id}`;
          return registrarAuditoria(context.env.DB, {
            chamado_mae_id: raizId,
            chamado_id: filho.id,
            usuario_id: usuario.id,
            usuario_nome: usuario.nome,
            acao: "criacao_subchamado",
            detalhes: `Atividade "${nomeFilho}" criada pela aprovação da etapa "${etapaNome}".`
          });
        })
      );
    }

    await Promise.all([
      aplicarCascataAtraso(context.env.DB, atualizado, hoje),
      sincronizarProgressoChamadoMae(context.env.DB, chamado.id, hoje)
    ]);
    return json({ chamado: atualizado, criados });

  } catch (err) {
    console.error("Erro ao processar decisão de aprovação:", err);
    return error(err?.message || "Erro ao processar decisão de aprovação.", 400);
  }
}
