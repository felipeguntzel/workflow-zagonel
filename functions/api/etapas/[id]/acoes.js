import { first, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { exigirPermissao } from "../../../_lib/permissoes.js";
import { assegurarColunaObservacaoAcoes } from "../../../_lib/etapas.js";
import { obterProximoIdDisponivel, atualizarContadorId } from "../../../_lib/dependencias.js";

export async function onRequestPost(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "inserir");
  if (erro) return erro;
  const body = await context.request.json();
  if (!body.rotulo || !body.setor_destino_id || !body.vinculo) {
    return error("Campos obrigatórios: rotulo, setor_destino_id, vinculo");
  }
  await assegurarColunaObservacaoAcoes(context.env.DB);

  let etapasDestinoIds = [];
  if (Array.isArray(body.etapas_destino_ids)) {
    etapasDestinoIds = body.etapas_destino_ids.map(Number).filter(Boolean);
  } else if (body.etapa_destino_id) {
    etapasDestinoIds = [Number(body.etapa_destino_id)];
  }

  const primeiraEtapaId = etapasDestinoIds.length > 0 ? etapasDestinoIds[0] : (body.etapa_destino_id ? Number(body.etapa_destino_id) : null);
  const etapasDestinoJson = etapasDestinoIds.length > 0 ? JSON.stringify(etapasDestinoIds) : null;

  const proximoId = await obterProximoIdDisponivel(context.env.DB, "acoes");
  const resultado = await run(
    context.env.DB,
    `INSERT INTO acoes (id, etapa_id, rotulo, setor_destino_id, vinculo, prerequisito_acao_id, observacao, etapa_destino_id, etapas_destino_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    proximoId,
    context.params.id,
    body.rotulo,
    body.setor_destino_id,
    body.vinculo,
    body.prerequisito_acao_id ?? null,
    body.observacao ? String(body.observacao).trim() : null,
    primeiraEtapaId,
    etapasDestinoJson
  );
  const novoId = proximoId || resultado?.meta?.last_row_id;
  await atualizarContadorId(context.env.DB, "acoes");
  const nova = await first(context.env.DB, "SELECT * FROM acoes WHERE id = ?", novoId);
  if (nova) {
    nova.etapas_destino_ids = etapasDestinoIds;
  }
  return json(nova, 201);
}
