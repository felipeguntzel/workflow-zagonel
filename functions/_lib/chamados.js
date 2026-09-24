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
  const row = await first(db, "SELECT id FROM status WHERE LOWER(nome) = LOWER(?)", nome);
  if (row) return row.id;
  const fallback = await first(db, "SELECT id FROM status ORDER BY id ASC LIMIT 1");
  if (fallback) return fallback.id;
  throw new Error(`Status não encontrado no sistema: ${nome}`);
}

async function resolverSetorEPrazoPadrao(db, { etapa_id, acao_origem_id }) {
  if (etapa_id) {
    const row = await first(
      db,
      `SELECT s.id AS setor_id, s.prazo_padrao_dias
       FROM etapas e LEFT JOIN setores s ON s.id = e.setor_id
       WHERE e.id = ?`,
      etapa_id
    );
    if (!row) {
      return { setor_id: null, prazo_padrao_dias: 5 };
    }
    return {
      setor_id: row.setor_id || null,
      prazo_padrao_dias: row.prazo_padrao_dias != null ? Number(row.prazo_padrao_dias) : 5,
    };
  }
  if (acao_origem_id) {
    const row = await first(
      db,
      `SELECT s.id AS setor_id, s.prazo_padrao_dias
       FROM acoes a LEFT JOIN setores s ON s.id = a.setor_destino_id
       WHERE a.id = ?`,
      acao_origem_id
    );
    if (!row) {
      return { setor_id: null, prazo_padrao_dias: 5 };
    }
    return {
      setor_id: row.setor_id || null,
      prazo_padrao_dias: row.prazo_padrao_dias != null ? Number(row.prazo_padrao_dias) : 5,
    };
  }
  return { setor_id: null, prazo_padrao_dias: 5 };
}

let colunasChamadosGarantidas = false;
export async function garantirColunasChamados(db) {
  if (colunasChamadosGarantidas) return;
  try {
    const cols = await all(db, "PRAGMA table_info(chamados)");
    const nomes = new Set(cols.map((c) => c.name.toLowerCase()));
    if (!nomes.has("titulo")) {
      await run(db, "ALTER TABLE chamados ADD COLUMN titulo TEXT").catch(() => {});
    }
    if (!nomes.has("prioridade")) {
      await run(db, "ALTER TABLE chamados ADD COLUMN prioridade TEXT NOT NULL DEFAULT 'normal'").catch(() => {});
    }
    if (!nomes.has("observacao")) {
      await run(db, "ALTER TABLE chamados ADD COLUMN observacao TEXT").catch(() => {});
    }
    if (!nomes.has("empresa_id")) {
      await run(db, "ALTER TABLE chamados ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)").catch(() => {});
    }

    const statusCols = await all(db, "PRAGMA table_info(status)").catch(() => []);
    const statusNomes = new Set(statusCols.map((c) => c.name.toLowerCase()));
    if (!statusNomes.has("cor")) {
      await run(db, "ALTER TABLE status ADD COLUMN cor TEXT").catch(() => {});
    }

    const fluxoCols = await all(db, "PRAGMA table_info(fluxo_templates)").catch(() => []);
    const fluxoNomes = new Set(fluxoCols.map((c) => c.name.toLowerCase()));
    if (!fluxoNomes.has("descricao")) {
      await run(db, "ALTER TABLE fluxo_templates ADD COLUMN descricao TEXT").catch(() => {});
    }
    if (!fluxoNomes.has("ativo")) {
      await run(db, "ALTER TABLE fluxo_templates ADD COLUMN ativo INTEGER DEFAULT 1").catch(() => {});
      await run(db, "UPDATE fluxo_templates SET ativo = 1 WHERE ativo IS NULL").catch(() => {});
    }

    colunasChamadosGarantidas = true;
  } catch (err) {
    console.error("Aviso ao garantir colunas de chamados:", err);
  }
}

export async function criarChamado(db, spec) {
  await garantirColunasChamados(db);
  const { prazo_padrao_dias } = await resolverSetorEPrazoPadrao(db, spec);
  const hoje = hojeISO();
  const prazo = spec.prazo ?? calcularPrazoSugerido(hoje, prazo_padrao_dias, { apenasDiasUteis: true });
  const statusPrevisto = await statusIdPorNome(db, "previsto");
  const titulo = spec.titulo ?? null;
  const prioridade = spec.prioridade ?? "normal";
  const observacao = spec.observacao ?? null;

  const resultado = await run(
    db,
    `INSERT INTO chamados
       (fluxo_template_id, etapa_id, acao_origem_id, chamado_mae_id, chamado_pai_id,
        empresa_id, status_id, solicitante_id, data_abertura, prazo, titulo, prioridade, observacao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    spec.fluxo_template_id,
    spec.etapa_id ?? null,
    spec.acao_origem_id ?? null,
    spec.chamado_mae_id ?? null,
    spec.chamado_pai_id ?? null,
    spec.empresa_id,
    statusPrevisto,
    spec.solicitante_id,
    hoje,
    prazo,
    titulo,
    prioridade,
    observacao
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
      titulo: chamado.titulo,
      prioridade: chamado.prioridade,
      observacao: chamado.observacao,
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
  await garantirColunasChamados(db);
  const chamado = await first(
    db,
    `SELECT
       c.*,
       COALESCE(e.setor_id, a.setor_destino_id) AS setor_id,
       s.nome AS setor_nome,
       COALESCE(c.titulo, e.nome, a.rotulo) AS titulo,
       e.tipo AS etapa_tipo,
       st.nome AS status_nome,
       st.cor AS status_cor,
       resp.nome AS responsavel_nome,
       resp.telefone AS responsavel_telefone,
       sol.nome AS solicitante_nome,
       sol.telefone AS solicitante_telefone,
       ft.nome AS fluxo_nome,
       emp.nome AS empresa_nome
     FROM chamados c
     LEFT JOIN etapas e ON e.id = c.etapa_id
     LEFT JOIN acoes a ON a.id = c.acao_origem_id
     LEFT JOIN setores s ON s.id = COALESCE(e.setor_id, a.setor_destino_id)
     LEFT JOIN status st ON st.id = c.status_id
     LEFT JOIN usuarios resp ON resp.id = c.responsavel_id
     LEFT JOIN usuarios sol ON sol.id = c.solicitante_id
     LEFT JOIN fluxo_templates ft ON ft.id = c.fluxo_template_id
     LEFT JOIN empresas emp ON emp.id = c.empresa_id
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
