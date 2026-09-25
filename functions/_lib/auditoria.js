import { all, first, run } from "./db.js";

/**
 * Registra um evento de auditoria unificada no chamado mãe.
 */
export async function registrarAuditoria(db, { chamado_mae_id, chamado_id, usuario_id, usuario_nome, acao, detalhes }) {
  try {
    const raizId = chamado_mae_id || chamado_id;
    const agora = new Date().toISOString().replace("T", " ").slice(0, 19);
    await run(
      db,
      `INSERT INTO historico_auditoria
         (chamado_mae_id, chamado_id, usuario_id, usuario_nome, acao, detalhes, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      raizId,
      chamado_id,
      usuario_id ?? null,
      usuario_nome || "Sistema",
      acao,
      detalhes,
      agora
    );
  } catch (e) {
    console.error("Erro ao registrar auditoria:", e);
  }
}

/**
 * Lista todo o histórico de auditoria de um chamado mãe.
 */
export async function listarAuditoriaDoChamado(db, chamadoMaeId) {
  try {
    return await all(
      db,
      `SELECT h.*, u.nome AS usuario_nome_cadastrado
       FROM historico_auditoria h
       LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.chamado_mae_id = ?
       ORDER BY h.id ASC`,
      chamadoMaeId
    );
  } catch (e) {
    return [];
  }
}

let tabelaAuditoriaSistemaGarantida = false;

export async function ensureAuditoriaSistemaTabela(db) {
  if (tabelaAuditoriaSistemaGarantida) return;
  try {
    await run(
      db,
      `CREATE TABLE IF NOT EXISTS auditoria_sistema (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        usuario_nome TEXT NOT NULL,
        entidade TEXT NOT NULL,
        entidade_id INTEGER,
        acao TEXT NOT NULL,
        detalhes TEXT,
        dados_antigos TEXT,
        dados_novos TEXT,
        criado_em TEXT NOT NULL
      )`
    );
  } catch (_) {}
  tabelaAuditoriaSistemaGarantida = true;
}

/**
 * Registra uma acao administrativa no log de auditoria do sistema.
 */
export async function registrarAuditoriaSistema(
  db,
  { usuario_id, usuario_nome, entidade, entidade_id, acao, detalhes, dados_antigos, dados_novos }
) {
  try {
    await ensureAuditoriaSistemaTabela(db);
    const agora = new Date().toISOString().replace("T", " ").slice(0, 19);
    await run(
      db,
      `INSERT INTO auditoria_sistema
         (usuario_id, usuario_nome, entidade, entidade_id, acao, detalhes, dados_antigos, dados_novos, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      usuario_id ?? null,
      usuario_nome || "Sistema",
      entidade,
      entidade_id ?? null,
      acao,
      detalhes ?? null,
      typeof dados_antigos === "object" ? JSON.stringify(dados_antigos) : dados_antigos ?? null,
      typeof dados_novos === "object" ? JSON.stringify(dados_novos) : dados_novos ?? null,
      agora
    );
  } catch (e) {
    console.error("Erro ao registrar auditoria do sistema:", e);
  }
}

/**
 * Lista registros de auditoria administrativa com filtros opcionais e paginacao.
 */
export async function listarAuditoriaSistema(
  db,
  { entidade, usuario_id, acao, limite = 100, offset = 0 } = {}
) {
  try {
    await ensureAuditoriaSistemaTabela(db);
    const condicoes = [];
    const params = [];

    if (entidade) {
      condicoes.push("entidade = ?");
      params.push(entidade);
    }
    if (usuario_id) {
      condicoes.push("usuario_id = ?");
      params.push(usuario_id);
    }
    if (acao) {
      condicoes.push("acao = ?");
      params.push(acao);
    }

    const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
    const sql = `SELECT * FROM auditoria_sistema ${where} ORDER BY id DESC LIMIT ? OFFSET ?`;
    return await all(db, sql, ...params, Number(limite) || 100, Number(offset) || 0);
  } catch (e) {
    console.error("Erro ao listar auditoria do sistema:", e);
    return [];
  }
}

/**
 * Retorna o total de registros de auditoria administrativa que atendem aos filtros.
 */
export async function contarAuditoriaSistema(
  db,
  { entidade, usuario_id, acao } = {}
) {
  try {
    await ensureAuditoriaSistemaTabela(db);
    const condicoes = [];
    const params = [];

    if (entidade) {
      condicoes.push("entidade = ?");
      params.push(entidade);
    }
    if (usuario_id) {
      condicoes.push("usuario_id = ?");
      params.push(usuario_id);
    }
    if (acao) {
      condicoes.push("acao = ?");
      params.push(acao);
    }

    const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
    const res = await first(db, `SELECT COUNT(*) AS total FROM auditoria_sistema ${where}`, ...params);
    return Number(res?.total) || 0;
  } catch (e) {
    console.error("Erro ao contar auditoria do sistema:", e);
    return 0;
  }
}

/**
 * Exclui logs de auditoria administrativa para economizar espaço em disco/D1.
 */
export async function excluirLogsAuditoria(db, { dias, dataLimite, tudo = false } = {}) {
  try {
    await ensureAuditoriaSistemaTabela(db);
    let sql = "DELETE FROM auditoria_sistema";
    const params = [];
    if (!tudo) {
      if (dias && Number(dias) > 0) {
        sql += " WHERE criado_em < datetime('now', '-' || ? || ' days')";
        params.push(Math.floor(Number(dias)));
      } else if (dataLimite) {
        sql += " WHERE substr(criado_em, 1, 10) < ?";
        params.push(dataLimite);
      }
    }
    const res = await run(db, sql, ...params);
    return res?.meta?.changes ?? 0;
  } catch (e) {
    console.error("Erro ao excluir logs de auditoria do sistema:", e);
    return 0;
  }
}

