import { all, first, run } from "./db.js";
import {
  calcularPrazoSugerido,
  calcularDiasAtraso,
  empurrarPrazo,
  situacaoPrazo,
} from "./prazos.js";
import { resolverProximosChamados, estaBloqueado } from "./fluxo.js";

export function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

async function statusIdPorNome(db, nome) {
  const row = await first(db, "SELECT id FROM status WHERE nome = ?", nome);
  if (!row) throw new Error(`Status não encontrado: ${nome}`);
  return row.id;
}

async function resolverSetorEPrazoPadrao(db, { etapa_id, acao_origem_id }) {
  if (etapa_id) {
    const row = await first(
      db,
      `SELECT s.id AS setor_id, s.prazo_padrao_dias
       FROM etapas e JOIN setores s ON s.id = e.setor_id
       WHERE e.id = ?`,
      etapa_id
    );
    if (!row) throw new Error(`Etapa não encontrada ou sem setor: ${etapa_id}`);
    return row;
  }
  const row = await first(
    db,
    `SELECT s.id AS setor_id, s.prazo_padrao_dias
     FROM acoes a JOIN setores s ON s.id = a.setor_destino_id
     WHERE a.id = ?`,
    acao_origem_id
  );
  if (!row) throw new Error(`Ação não encontrada ou sem setor destino: ${acao_origem_id}`);
  return row;
}

export async function criarChamado(db, spec) {
  const { prazo_padrao_dias } = await resolverSetorEPrazoPadrao(db, spec);
  const hoje = hojeISO();
  const prazo = spec.prazo ?? calcularPrazoSugerido(hoje, prazo_padrao_dias, { apenasDiasUteis: true });
  const statusPrevisto = await statusIdPorNome(db, "previsto");
  const resultado = await run(
    db,
    `INSERT INTO chamados
       (fluxo_template_id, etapa_id, acao_origem_id, chamado_mae_id, chamado_pai_id,
        empresa_id, status_id, solicitante_id, data_abertura, prazo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    spec.fluxo_template_id,
    spec.etapa_id ?? null,
    spec.acao_origem_id ?? null,
    spec.chamado_mae_id ?? null,
    spec.chamado_pai_id ?? null,
    spec.empresa_id,
    statusPrevisto,
    spec.solicitante_id,
    hoje,
    prazo
  );
  return first(db, "SELECT * FROM chamados WHERE id = ?", resultado.meta.last_row_id);
}

export async function avancarFluxo(db, chamado, etapa, decisoesAcoes = {}) {
  const especificacoes = resolverProximosChamados(
    etapa,
    { id: chamado.id, chamado_mae_id: chamado.chamado_mae_id },
    decisoesAcoes
  );
  const criados = [];
  for (const spec of especificacoes) {
    const criado = await criarChamado(db, {
      fluxo_template_id: chamado.fluxo_template_id,
      etapa_id: spec.etapa_id,
      acao_origem_id: spec.acao_origem_id,
      chamado_mae_id: spec.chamado_mae_id,
      chamado_pai_id: spec.chamado_pai_id,
      empresa_id: chamado.empresa_id,
      solicitante_id: chamado.solicitante_id,
    });
    criados.push(criado);
  }
  return criados;
}

export async function finalizarComCascata(db, chamadoId, { hoje, resultadoOrigem = null }) {
  const statusFinalizado = await statusIdPorNome(db, "finalizado");
  let atual = await first(db, "SELECT * FROM chamados WHERE id = ?", chamadoId);
  let primeira = true;
  while (atual) {
    const resultado = primeira ? resultadoOrigem : atual.resultado;
    await run(
      db,
      `UPDATE chamados
       SET status_id = ?, data_finalizacao = COALESCE(data_finalizacao, ?), resultado = ?
       WHERE id = ?`,
      statusFinalizado,
      hoje,
      resultado,
      atual.id
    );
    if (atual.chamado_pai_id == null) break;
    atual = await first(db, "SELECT * FROM chamados WHERE id = ?", atual.chamado_pai_id);
    primeira = false;
  }
}

export async function aplicarCascataAtraso(db, chamado, hoje) {
  const diasAtraso = calcularDiasAtraso(chamado.prazo, hoje);
  if (diasAtraso <= 0) return;
  const raizId = chamado.chamado_mae_id ?? chamado.id;
  const statusPrevisto = await statusIdPorNome(db, "previsto");
  const dependentes = await all(
    db,
    `SELECT * FROM chamados
     WHERE status_id = ? AND id != ? AND (id = ? OR chamado_mae_id = ?)`,
    statusPrevisto,
    chamado.id,
    raizId,
    raizId
  );
  for (const dep of dependentes) {
    const novoPrazo = empurrarPrazo(dep.prazo, diasAtraso, { apenasDiasUteis: true });
    await run(db, "UPDATE chamados SET prazo = ? WHERE id = ?", novoPrazo, dep.id);
    await run(
      db,
      `INSERT INTO comentarios (chamado_id, usuario_id, data, texto, eh_justificativa)
       VALUES (?, NULL, ?, ?, 0)`,
      dep.id,
      hoje,
      `Prazo reajustado em dias úteis de ${dep.prazo} para ${novoPrazo} devido a atraso de ${diasAtraso} dia(s) no chamado #${chamado.id}.`
    );
  }
}

export async function computarBloqueado(db, chamado) {
  if (!chamado.acao_origem_id) return false;
  const acao = await first(db, "SELECT * FROM acoes WHERE id = ?", chamado.acao_origem_id);
  if (!acao || !acao.prerequisito_acao_id) return false;
  const irmaos = await all(
    db,
    "SELECT acao_origem_id, data_finalizacao FROM chamados WHERE chamado_mae_id = ?",
    chamado.chamado_mae_id
  );
  return estaBloqueado(acao, irmaos);
}

export async function chamadoComDetalhes(db, id) {
  const chamado = await first(
    db,
    `SELECT
       c.*,
       COALESCE(e.setor_id, a.setor_destino_id) AS setor_id,
       s.nome AS setor_nome,
       COALESCE(e.nome, a.rotulo) AS titulo,
       e.tipo AS etapa_tipo,
       st.nome AS status_nome,
       resp.nome AS responsavel_nome,
       resp.telefone AS responsavel_telefone,
       sol.nome AS solicitante_nome,
       sol.telefone AS solicitante_telefone,
       ft.nome AS fluxo_nome
     FROM chamados c
     LEFT JOIN etapas e ON e.id = c.etapa_id
     LEFT JOIN acoes a ON a.id = c.acao_origem_id
     LEFT JOIN setores s ON s.id = COALESCE(e.setor_id, a.setor_destino_id)
     LEFT JOIN status st ON st.id = c.status_id
     LEFT JOIN usuarios resp ON resp.id = c.responsavel_id
     LEFT JOIN usuarios sol ON sol.id = c.solicitante_id
     LEFT JOIN fluxos_template ft ON ft.id = c.fluxo_template_id
     WHERE c.id = ?`,
    id
  );
  if (!chamado) return null;
  const bloqueado = await computarBloqueado(db, chamado);
  const situacao = situacaoPrazo(
    chamado.prazo,
    hojeISO(),
    chamado.data_finalizacao != null || chamado.status_nome === "suspenso"
  );
  return { ...chamado, bloqueado, situacao_prazo: situacao };
}
