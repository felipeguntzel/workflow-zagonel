import { all, first, run } from "./db.js";

const tabelaCamposCache = new WeakMap();
const colunasTabelaCache = new WeakMap();

export function normalizarTipoCampo(tipo) {
  const t = String(tipo || "texto").toLowerCase();
  if (t === "texto_longo" || t === "textarea") return "textarea";
  if (t === "selecao" || t === "select") return "select";
  if (t === "numero" || t === "number") return "numero";
  if (t === "data" || t === "date") return "data";
  if (t === "checkbox") return "checkbox";
  if (t === "sim_nao" || t === "sim-nao" || t === "boolean") return "sim_nao";
  return "texto";
}

/**
 * Identifica e garante a existência da tabela de campos de etapa no banco D1.
 * Suporta tanto 'campos_etapa' quanto 'etapa_campos'.
 */
export async function obterTabelaCampos(db) {
  if (db && typeof db === "object" && tabelaCamposCache.has(db)) {
    return tabelaCamposCache.get(db);
  }

  let tabela = "campos_etapa";
  try {
    await run(db, "SELECT 1 FROM campos_etapa LIMIT 1");
    tabela = "campos_etapa";
  } catch (_) {
    try {
      await run(db, "SELECT 1 FROM etapa_campos LIMIT 1");
      tabela = "etapa_campos";
    } catch (_) {
      try {
        await run(
          db,
          `CREATE TABLE IF NOT EXISTS campos_etapa (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            etapa_id INTEGER NOT NULL REFERENCES etapas(id) ON DELETE CASCADE,
            nome TEXT NOT NULL,
            rotulo TEXT NOT NULL,
            tipo TEXT NOT NULL,
            obrigatorio INTEGER NOT NULL DEFAULT 0,
            opcoes TEXT,
            ordem INTEGER NOT NULL DEFAULT 0,
            somente_leitura INTEGER NOT NULL DEFAULT 0,
            bloqueio_regra TEXT
          )`
        );
        tabela = "campos_etapa";
      } catch (e) {
        console.error("Falha ao criar tabela de campos:", e);
        tabela = "campos_etapa";
      }
    }
  }

  if (db && typeof db === "object") {
    tabelaCamposCache.set(db, tabela);
  }
  return tabela;
}

async function obterColunasTabela(db, tabela) {
  if (db && typeof db === "object" && colunasTabelaCache.has(db)) {
    const mapa = colunasTabelaCache.get(db);
    if (mapa.has(tabela)) return mapa.get(tabela);
  }
  try {
    const cols = await all(db, `PRAGMA table_info(${tabela})`);
    const nomes = new Set(cols.map((c) => c.name.toLowerCase()));
    if (db && typeof db === "object") {
      if (!colunasTabelaCache.has(db)) colunasTabelaCache.set(db, new Map());
      colunasTabelaCache.get(db).set(tabela, nomes);
    }
    return nomes;
  } catch (_) {
    return new Set();
  }
}

async function garantirTabelaValores(db) {
  try {
    await run(
      db,
      `CREATE TABLE IF NOT EXISTS chamado_campos_valores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chamado_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
        campo_id INTEGER NOT NULL,
        valor TEXT,
        UNIQUE(chamado_id, campo_id)
      )`
    );
  } catch (_) {}
}

/**
 * Retorna os campos personalizados configurados para uma etapa.
 */
export async function listarCamposDaEtapa(db, etapaId) {
  try {
    const tabela = await obterTabelaCampos(db);
    const campos = await all(
      db,
      `SELECT * FROM ${tabela} WHERE etapa_id = ? ORDER BY ordem ASC, id ASC`,
      etapaId
    );
    return campos.map((c) => ({
      ...c,
      opcoes_json: c.opcoes_json ?? c.opcoes ?? null,
      opcoes: c.opcoes ?? c.opcoes_json ?? null,
    }));
  } catch (e) {
    console.error("Erro ao listar campos da etapa:", e);
    return [];
  }
}

/**
 * Salva ou atualiza um campo dinâmico de uma etapa de forma auto-recuperável.
 */
export async function salvarCampoEtapa(db, etapaId, dados) {
  const tabela = await obterTabelaCampos(db);
  const colunas = await obterColunasTabela(db, tabela);

  const {
    nome,
    rotulo,
    tipo,
    obrigatorio = 0,
    opcoes = null,
    opcoes_json = null,
    ordem = 0,
    somente_leitura = 0,
    bloqueio_regra = null,
  } = dados;

  const rawOpcoes = opcoes ?? opcoes_json;
  const opcoesTexto = Array.isArray(rawOpcoes)
    ? JSON.stringify(rawOpcoes)
    : typeof rawOpcoes === "string"
    ? rawOpcoes
    : null;

  const tipoSalvo = normalizarTipoCampo(tipo);

  const registro = {
    etapa_id: Number(etapaId),
    nome: String(nome).trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"),
    rotulo: String(rotulo).trim(),
    tipo: tipoSalvo,
    obrigatorio: obrigatorio ? 1 : 0,
    ordem: Number(ordem) || 0,
    somente_leitura: somente_leitura ? 1 : 0,
    bloqueio_regra: bloqueio_regra ?? null,
  };

  if (colunas.size === 0 || colunas.has("opcoes")) {
    registro.opcoes = opcoesTexto;
  }
  if (colunas.has("opcoes_json")) {
    registro.opcoes_json = opcoesTexto;
  }

  const colunasParaGravar = colunas.size > 0
    ? Object.keys(registro).filter((c) => colunas.has(c))
    : Object.keys(registro);

  if (dados.id) {
    const colunasUpdate = colunasParaGravar.filter((c) => c !== "etapa_id" && c !== "id");
    const setClause = colunasUpdate.map((c) => `${c} = ?`).join(", ");
    const valoresUpdate = colunasUpdate.map((c) => registro[c]);
    await run(
      db,
      `UPDATE ${tabela} SET ${setClause} WHERE id = ? AND etapa_id = ?`,
      ...valoresUpdate,
      dados.id,
      etapaId
    );
    const atualizado = await first(db, `SELECT * FROM ${tabela} WHERE id = ?`, dados.id);
    return {
      ...atualizado,
      opcoes_json: atualizado?.opcoes_json ?? atualizado?.opcoes ?? null,
    };
  }

  const placeholders = colunasParaGravar.map(() => "?").join(", ");
  const valores = colunasParaGravar.map((c) => registro[c]);
  const res = await run(
    db,
    `INSERT INTO ${tabela} (${colunasParaGravar.join(", ")}) VALUES (${placeholders})`,
    ...valores
  );

  const novo = await first(db, `SELECT * FROM ${tabela} WHERE id = ?`, res.meta.last_row_id);
  return {
    ...novo,
    opcoes_json: novo?.opcoes_json ?? novo?.opcoes ?? null,
  };
}

/**
 * Valida se todos os campos obrigatórios possuem valores informados.
 */
export function validarCamposObrigatorios(campos, valoresObjeto) {
  if (!Array.isArray(campos) || campos.length === 0) {
    return { valido: true };
  }

  const mapaValores = new Map();
  if (Array.isArray(valoresObjeto)) {
    for (const item of valoresObjeto) {
      if (!item) continue;
      if (item.campo_id != null) mapaValores.set(String(item.campo_id), item.valor);
      if (item.nome) mapaValores.set(String(item.nome).toLowerCase().trim(), item.valor);
    }
  } else if (valoresObjeto && typeof valoresObjeto === "object") {
    for (const [chave, valor] of Object.entries(valoresObjeto)) {
      mapaValores.set(String(chave).toLowerCase().trim(), valor);
    }
  }

  for (const c of campos) {
    if (c.obrigatorio) {
      const valPorId = mapaValores.get(String(c.id));
      const valPorNome = mapaValores.get(String(c.nome).toLowerCase().trim());
      const valor = valPorId !== undefined ? valPorId : valPorNome;

      if (valor === undefined || valor === null || String(valor).trim() === "") {
        return {
          valido: false,
          erro: `O campo "${c.rotulo}" é de preenchimento obrigatório.`,
        };
      }
    }
  }

  return { valido: true };
}

/**
 * Carrega os valores dos campos de um chamado, combinados com as definições dos campos da etapa.
 */
export async function carregarCamposEValoresDoChamado(db, chamadoId, etapaId = null) {
  await garantirTabelaValores(db);

  let idEtapa = etapaId;
  if (!idEtapa) {
    const chamado = await first(db, "SELECT etapa_id FROM chamados WHERE id = ?", chamadoId);
    idEtapa = chamado?.etapa_id;
  }
  if (!idEtapa) return [];

  const campos = await listarCamposDaEtapa(db, idEtapa);
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
    opcoes_parsed: (c.opcoes || c.opcoes_json) ? (() => {
      try {
        const parsed = JSON.parse(c.opcoes || c.opcoes_json);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })() : []
  }));
}

/**
 * Salva múltiplos valores de campos para um chamado.
 * Suporta chaves numéricas por ID de campo, nomes de campo ou array de objetos.
 */
export async function salvarValoresCamposChamado(db, chamadoId, valoresObjeto, etapaId = null) {
  if (!valoresObjeto) return;
  await garantirTabelaValores(db);

  let idEtapa = etapaId;
  if (!idEtapa) {
    const chamado = await first(db, "SELECT etapa_id FROM chamados WHERE id = ?", chamadoId);
    idEtapa = chamado?.etapa_id;
  }

  let camposDaEtapa = [];
  if (idEtapa) {
    try {
      camposDaEtapa = await listarCamposDaEtapa(db, idEtapa);
    } catch (_) {}
  }
  const mapaNomeParaId = new Map(
    camposDaEtapa.map((c) => [String(c.nome).toLowerCase().trim(), c.id])
  );

  let entradas = [];
  if (Array.isArray(valoresObjeto)) {
    entradas = valoresObjeto.map((it) => {
      let id = it?.campo_id ? Number(it.campo_id) : null;
      if (!id && it?.nome) {
        id = mapaNomeParaId.get(String(it.nome).toLowerCase().trim()) || null;
      }
      return {
        campo_id: id,
        valor: it?.valor != null ? String(it.valor) : null,
      };
    });
  } else if (typeof valoresObjeto === "object") {
    entradas = Object.entries(valoresObjeto).map(([chave, valor]) => {
      let id = Number(chave);
      if (isNaN(id) || id <= 0) {
        id = mapaNomeParaId.get(String(chave).toLowerCase().trim()) || null;
      }
      return {
        campo_id: id,
        valor: valor != null ? String(valor) : null,
      };
    });
  }

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
