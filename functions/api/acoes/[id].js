import { first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirPermissao } from "../../_lib/permissoes.js";
import { assegurarColunaObservacaoAcoes } from "../../_lib/etapas.js";

export async function onRequestPut(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "editar");
  if (erro) return erro;
  const body = await context.request.json();
  await assegurarColunaObservacaoAcoes(context.env.DB);

  let etapasDestinoIds = undefined;
  if (body.etapas_destino_ids !== undefined) {
    if (Array.isArray(body.etapas_destino_ids)) {
      etapasDestinoIds = body.etapas_destino_ids.map(Number).filter(Boolean);
    } else if (typeof body.etapas_destino_ids === "string" && body.etapas_destino_ids.trim()) {
      try {
        const parsed = JSON.parse(body.etapas_destino_ids);
        etapasDestinoIds = Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
      } catch (_) {
        etapasDestinoIds = body.etapas_destino_ids.split(",").map(Number).filter(Boolean);
      }
    } else {
      etapasDestinoIds = [];
    }
  }

  const campos = ["rotulo", "setor_destino_id", "vinculo", "prerequisito_acao_id", "observacao", "etapa_destino_id", "etapas_destino_ids"];
  const dados = { ...body };

  if (etapasDestinoIds !== undefined) {
    dados.etapas_destino_ids = etapasDestinoIds.length > 0 ? JSON.stringify(etapasDestinoIds) : null;
    dados.etapa_destino_id = etapasDestinoIds.length > 0 ? etapasDestinoIds[0] : null;
  } else if (body.etapa_destino_id !== undefined) {
    dados.etapa_destino_id = body.etapa_destino_id ? Number(body.etapa_destino_id) : null;
    dados.etapas_destino_ids = dados.etapa_destino_id ? JSON.stringify([dados.etapa_destino_id]) : null;
  }

  const colunas = campos.filter((c) => dados[c] !== undefined);
  if (colunas.length === 0) return error("Nenhum campo para atualizar");
  const set = colunas.map((c) => `${c} = ?`).join(", ");
  const valores = colunas.map((c) => dados[c]);
  await run(context.env.DB, `UPDATE acoes SET ${set} WHERE id = ?`, ...valores, context.params.id);
  const atualizada = await first(context.env.DB, "SELECT * FROM acoes WHERE id = ?", context.params.id);
  if (!atualizada) return error("Não encontrada", 404);
  if (atualizada.etapas_destino_ids) {
    try {
      atualizada.etapas_destino_ids = JSON.parse(atualizada.etapas_destino_ids);
    } catch (_) {
      atualizada.etapas_destino_ids = [];
    }
  } else if (atualizada.etapa_destino_id) {
    atualizada.etapas_destino_ids = [atualizada.etapa_destino_id];
  } else {
    atualizada.etapas_destino_ids = [];
  }
  return json(atualizada);
}

export async function onRequestDelete(context) {
  const { erro } = await exigirPermissao(context, "fluxos", "excluir");
  if (erro) return erro;
  await run(context.env.DB, "DELETE FROM acoes WHERE id = ?", context.params.id);
  return json({ ok: true });
}
