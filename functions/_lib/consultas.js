import { all, first, run } from "./db.js";
import { hojeISO } from "./chamados.js";

let tabelasConsultasGarantidas = false;

export async function ensureTabelaConsultas(db) {
  if (tabelasConsultasGarantidas) return;
  try {
    await run(
      db,
      `CREATE TABLE IF NOT EXISTS consultas_salvas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        tela TEXT NOT NULL DEFAULT 'chamados',
        nome TEXT NOT NULL,
        filtros_json TEXT NOT NULL,
        eh_publica INTEGER NOT NULL DEFAULT 0,
        criado_em TEXT NOT NULL,
        atualizado_em TEXT
      )`
    );

    await run(
      db,
      `CREATE TABLE IF NOT EXISTS consultas_padrao_usuario (
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        tela TEXT NOT NULL DEFAULT 'chamados',
        consulta_id INTEGER NOT NULL REFERENCES consultas_salvas(id) ON DELETE CASCADE,
        PRIMARY KEY (usuario_id, tela)
      )`
    );

    await run(
      db,
      `CREATE INDEX IF NOT EXISTS idx_consultas_salvas_tela_usr ON consultas_salvas(tela, usuario_id, eh_publica)`
    );

    tabelasConsultasGarantidas = true;
  } catch (err) {
    console.error("Erro ao garantir tabelas de consultas salvas:", err);
  }
}

/**
 * Retorna todas as consultas salvas acessíveis para o usuário na tela especificada
 * (consultas criadas pelo usuário ou consultas marcadas como públicas).
 */
export async function listarConsultas(db, tela = "chamados", usuarioId) {
  await ensureTabelaConsultas(db);

  const consultas = await all(
    db,
    `SELECT
       c.id,
       c.usuario_id,
       c.tela,
       c.nome,
       c.filtros_json,
       c.eh_publica,
       c.criado_em,
       c.atualizado_em,
       u.nome AS autor_nome,
       CASE WHEN c.usuario_id = ? THEN 1 ELSE 0 END AS eh_minha,
       CASE WHEN cp.consulta_id IS NOT NULL THEN 1 ELSE 0 END AS eh_padrao
     FROM consultas_salvas c
     JOIN usuarios u ON u.id = c.usuario_id
     LEFT JOIN consultas_padrao_usuario cp ON cp.consulta_id = c.id AND cp.usuario_id = ? AND cp.tela = c.tela
     WHERE c.tela = ? AND (c.eh_publica = 1 OR c.usuario_id = ?)
     ORDER BY eh_padrao DESC, c.eh_publica ASC, c.nome ASC`,
    usuarioId,
    usuarioId,
    tela,
    usuarioId
  );

  return consultas.map((c) => ({
    ...c,
    eh_publica: Boolean(c.eh_publica),
    eh_minha: Boolean(c.eh_minha),
    eh_padrao: Boolean(c.eh_padrao),
  }));
}

/**
 * Obtém o ID da consulta padrão salva para o usuário na tela
 */
export async function obterConsultaPadraoId(db, tela = "chamados", usuarioId) {
  await ensureTabelaConsultas(db);
  const row = await first(
    db,
    `SELECT consulta_id FROM consultas_padrao_usuario WHERE tela = ? AND usuario_id = ?`,
    tela,
    usuarioId
  );
  return row ? row.consulta_id : null;
}

/**
 * Define ou remove a consulta padrão do usuário na tela
 */
export async function definirConsultaPadrao(db, tela = "chamados", usuarioId, consultaId) {
  await ensureTabelaConsultas(db);
  if (!consultaId) {
    await run(
      db,
      `DELETE FROM consultas_padrao_usuario WHERE tela = ? AND usuario_id = ?`,
      tela,
      usuarioId
    );
    return;
  }

  // Verifica se o usuário tem acesso à consulta
  const consulta = await first(
    db,
    `SELECT id, eh_publica, usuario_id FROM consultas_salvas WHERE id = ? AND tela = ?`,
    consultaId,
    tela
  );
  if (!consulta) {
    throw new Error("Consulta não encontrada.");
  }
  if (!consulta.eh_publica && consulta.usuario_id !== usuarioId) {
    throw new Error("Você não tem acesso a esta consulta.");
  }

  await run(
    db,
    `INSERT INTO consultas_padrao_usuario (usuario_id, tela, consulta_id)
     VALUES (?, ?, ?)
     ON CONFLICT(usuario_id, tela) DO UPDATE SET consulta_id = excluded.consulta_id`,
    usuarioId,
    tela,
    consultaId
  );
}

/**
 * Cria ou atualiza uma consulta salva
 */
export async function salvarConsulta(db, { id = null, usuarioId, tela = "chamados", nome, filtros_json, eh_publica = 0, definir_como_padrao = false }) {
  await ensureTabelaConsultas(db);

  if (!nome || !nome.trim()) {
    throw new Error("O nome da consulta é obrigatório.");
  }

  const agora = new Date().toISOString();
  let consultaId = id;

  if (consultaId) {
    // Atualização: somente quem criou pode editar
    const existente = await first(db, `SELECT * FROM consultas_salvas WHERE id = ?`, consultaId);
    if (!existente) throw new Error("Consulta não encontrada.");
    if (existente.usuario_id !== usuarioId) {
      throw new Error("Você só pode editar consultas criadas por você.");
    }

    await run(
      db,
      `UPDATE consultas_salvas
       SET nome = ?, filtros_json = ?, eh_publica = ?, atualizado_em = ?
       WHERE id = ?`,
      nome.trim(),
      typeof filtros_json === "string" ? filtros_json : JSON.stringify(filtros_json || {}),
      eh_publica ? 1 : 0,
      agora,
      consultaId
    );
  } else {
    // Inserção
    const res = await run(
      db,
      `INSERT INTO consultas_salvas (usuario_id, tela, nome, filtros_json, eh_publica, criado_em)
       VALUES (?, ?, ?, ?, ?, ?)`,
      usuarioId,
      tela,
      nome.trim(),
      typeof filtros_json === "string" ? filtros_json : JSON.stringify(filtros_json || {}),
      eh_publica ? 1 : 0,
      agora
    );
    consultaId = res.meta.last_row_id;
  }

  if (definir_como_padrao) {
    await definirConsultaPadrao(db, tela, usuarioId, consultaId);
  }

  return await first(
    db,
    `SELECT c.*, u.nome AS autor_nome
     FROM consultas_salvas c
     JOIN usuarios u ON u.id = c.usuario_id
     WHERE c.id = ?`,
    consultaId
  );
}

/**
 * Exclui uma consulta salva (somente quem criou pode excluir)
 */
export async function excluirConsulta(db, id, usuario) {
  await ensureTabelaConsultas(db);

  const consulta = await first(db, `SELECT * FROM consultas_salvas WHERE id = ?`, id);
  if (!consulta) {
    throw new Error("Consulta não encontrada.");
  }

  if (consulta.usuario_id !== usuario.id) {
    throw new Error("Você só pode excluir consultas criadas por você.");
  }

  // Remove vínculo de padrão
  await run(db, `DELETE FROM consultas_padrao_usuario WHERE consulta_id = ?`, id);

  // Remove a consulta
  await run(db, `DELETE FROM consultas_salvas WHERE id = ?`, id);

  return true;
}
