import { all, first, run } from "./db.js";

/**
 * Retorna os campos personalizados configurados para uma etapa.
 */
export async function listarCamposDaEtapa(db, etapaId) {
  try {
    return await all(
      db,
      "SELECT * FROM campos_etapa WHERE etapa_id = ? ORDER BY ordem ASC, id ASC",
      etapaId
    );
  } catch (e) {
    return [];
  }
}

/**
 * Salva ou atualiza um campo dinâmico de uma etapa.
 */
export async function salvarCampoEtapa(db, etapaId, dados) {
  const { nome, rotulo, tipo, obrigatorio = 0, opcoes = null, ordem = 0, somente_leitura = 0, bloqueio_regra = null } = dados;
  const opcoesJson = Array.isArray(opcoes) ? JSON.stringify(opcoes) : (typeof opcoes === "string" ? opcoes : null);
  
  if (dados.id) {
    await run(
      db,
      `UPDATE campos_etapa
       SET nome = ?, rotulo = ?, tipo = ?, obrigatorio = ?, opcoes = ?, ordem = ?, somente_leitura = ?, bloqueio_regra = ?
       WHERE id = ? AND etapa_id = ?`,
      nome, rotulo, tipo, obrigatorio ? 1 : 0, opcoesJson, ordem, somente_leitura ? 1 : 0, bloqueio_regra,
      dados.id, etapaId
    );
    return first(db, "SELECT * FROM campos_etapa WHERE id = ?", dados.id);
  }

  const res = await run(
    db,
    `INSERT INTO campos_etapa
       (etapa_id, nome, rotulo, tipo, obrigatorio, opcoes, ordem, somente_leitura, bloqueio_regra)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    etapaId, nome, rotulo, tipo, obrigatorio ? 1 : 0, opcoesJson, ordem, somente_leitura ? 1 : 0, bloqueio_regra
  );
  return first(db, "SELECT * FROM campos_etapa WHERE id = ?", res.meta.last_row_id);
}

/**
 * Carrega os valores dos campos de um chamado, combinados com as definições dos campos da etapa.
 */
export async function carregarCamposEValoresDoChamado(db, chamadoId, etapaId) {
  if (!etapaId) return [];
  const campos = await listarCamposDaEtapa(db, etapaId);
  if (!campos || campos.length === 0) return [];

  const valores = await all(
    db,
    "SELECT campo_id, valor FROM chamado_campos_valores WHERE chamado_id = ?",
    chamadoId
  );
  const mapaValores = new Map(valores.map((v) => [v.campo_id, v.valor]));

  return campos.map((c) => ({
    ...c,
    valor: mapaValores.has(c.id) ? mapaValores.get(c.id) : null,
    opcoes_parsed: c.opcoes ? (() => { try { return JSON.parse(c.opcoes); } catch { return []; } })() : []
  }));
}

/**
 * Salva múltiplos valores de campos para um chamado.
 */
export async function salvarValoresCamposChamado(db, chamadoId, valoresObjeto) {
  // valoresObjeto é um dicionário { campo_id: valor, ... } ou [{ campo_id, valor }, ...]
  const entradas = Array.isArray(valoresObjeto)
    ? valoresObjeto
    : Object.entries(valoresObjeto).map(([campo_id, valor]) => ({ campo_id: Number(campo_id), valor: String(valor ?? "") }));

  for (const item of entradas) {
    if (!item.campo_id) continue;
    await run(
      db,
      `INSERT INTO chamado_campos_valores (chamado_id, campo_id, valor)
       VALUES (?, ?, ?)
       ON CONFLICT(chamado_id, campo_id) DO UPDATE SET valor = excluded.valor`,
      chamadoId,
      item.campo_id,
      item.valor != null ? String(item.valor) : null
    );
  }
}
