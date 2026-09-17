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
