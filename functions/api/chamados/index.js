import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { carregarEtapaComAcoes } from "../../_lib/etapas.js";
import { criarChamado, avancarFluxo, hojeISO } from "../../_lib/chamados.js";

export async function onRequestGet(context) {
  const setorId = new URL(context.request.url).searchParams.get("setor_id");
  if (!setorId) return error("Parâmetro obrigatório: setor_id");
  const chamados = await all(
    context.env.DB,
    `SELECT
       c.*,
       COALESCE(e.setor_id, a.setor_destino_id) AS setor_id,
       COALESCE(e.nome, a.rotulo) AS titulo,
       st.nome AS status_nome
     FROM chamados c
     LEFT JOIN etapas e ON e.id = c.etapa_id
     LEFT JOIN acoes a ON a.id = c.acao_origem_id
     LEFT JOIN status st ON st.id = c.status_id
     WHERE COALESCE(e.setor_id, a.setor_destino_id) = ?
     ORDER BY c.prazo`,
    setorId
  );
  return json(chamados);
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.fluxo_template_id || !body.etapa_inicial_id || !body.solicitante_id) {
    return error("Campos obrigatórios: fluxo_template_id, etapa_inicial_id, solicitante_id");
  }
  const etapa = await carregarEtapaComAcoes(context.env.DB, body.etapa_inicial_id);
  if (!etapa || !etapa.eh_inicial || etapa.fluxo_template_id !== body.fluxo_template_id) {
    return error("etapa_inicial_id inválido para este fluxo_template_id");
  }
  const solicitante = await first(
    context.env.DB,
    "SELECT u.id, s.empresa_id FROM usuarios u JOIN setores s ON s.id = u.setor_id WHERE u.id = ?",
    body.solicitante_id
  );
  if (!solicitante) return error("solicitante_id inválido");

  const mae = await criarChamado(context.env.DB, {
    fluxo_template_id: body.fluxo_template_id,
    etapa_id: etapa.id,
    chamado_mae_id: null,
    chamado_pai_id: null,
    empresa_id: solicitante.empresa_id,
    solicitante_id: body.solicitante_id,
    prazo: body.prazo ?? null,
  });

  const hoje = hojeISO();
  await run(
    context.env.DB,
    "UPDATE chamados SET status_id = (SELECT id FROM status WHERE nome = 'finalizado'), data_finalizacao = ? WHERE id = ?",
    hoje,
    mae.id
  );
  const maeFinalizada = { ...mae, data_finalizacao: hoje };

  const criados = await avancarFluxo(context.env.DB, maeFinalizada, etapa, {});
  return json({ chamado: maeFinalizada, criados }, 201);
}
