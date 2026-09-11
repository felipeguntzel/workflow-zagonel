import { run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { carregarEtapaComAcoes } from "../../../_lib/etapas.js";
import {
  chamadoComDetalhes,
  finalizarComCascata,
  avancarFluxo,
  aplicarCascataAtraso,
  hojeISO,
} from "../../../_lib/chamados.js";

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (body.decisao !== "aprovado" && body.decisao !== "reprovado") {
    return error("Campo 'decisao' deve ser 'aprovado' ou 'reprovado'");
  }
  const chamado = await chamadoComDetalhes(context.env.DB, context.params.id);
  if (!chamado) return error("Não encontrado", 404);
  if (!chamado.etapa_id || chamado.etapa_tipo !== "aprovacao") {
    return error("Este chamado não é uma etapa de aprovação");
  }

  const hoje = hojeISO();

  if (body.decisao === "reprovado") {
    if (!body.justificativa) return error("Justificativa é obrigatória ao reprovar");
    await run(
      context.env.DB,
      `INSERT INTO comentarios (chamado_id, usuario_id, data, texto, eh_justificativa)
       VALUES (?, ?, ?, ?, 1)`,
      chamado.id,
      body.usuario_id ?? null,
      hoje,
      body.justificativa
    );
    await finalizarComCascata(context.env.DB, chamado.id, { hoje, resultadoOrigem: "reprovado" });
    const atualizado = await chamadoComDetalhes(context.env.DB, chamado.id);
    await aplicarCascataAtraso(context.env.DB, atualizado, hoje);
    return json({ chamado: atualizado, criados: [] });
  }

  await run(
    context.env.DB,
    `UPDATE chamados
     SET status_id = (SELECT id FROM status WHERE nome = 'finalizado'),
         resultado = 'aprovado',
         data_finalizacao = COALESCE(data_finalizacao, ?)
     WHERE id = ?`,
    hoje,
    chamado.id
  );
  const atualizado = await chamadoComDetalhes(context.env.DB, chamado.id);
  const etapa = await carregarEtapaComAcoes(context.env.DB, chamado.etapa_id);
  const criados = await avancarFluxo(context.env.DB, atualizado, etapa, body.acoes ?? {});
  await aplicarCascataAtraso(context.env.DB, atualizado, hoje);
  return json({ chamado: atualizado, criados });
}
