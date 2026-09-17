import { all, first } from "./db.js";

/**
 * Remove comentários SQL e classifica a consulta
 */
export function classificarSql(sql) {
  const sqlLimpo = String(sql || "")
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();

  if (!sqlLimpo) {
    return { vazio: true, ehLeitura: false, primeiraPalavra: "" };
  }

  const primeiraPalavra = sqlLimpo.split(/\s+/)[0]?.toUpperCase() || "";
  const ehLeitura = ["SELECT", "PRAGMA", "EXPLAIN", "WITH"].includes(primeiraPalavra);

  return {
    vazio: false,
    ehLeitura,
    primeiraPalavra,
    sqlLimpo,
  };
}

/**
 * Gera comandos SQL prontos (SELECT, INSERT, UPDATE com WHERE, DELETE com WHERE)
 */
export function gerarPreComandos(tabela) {
  const nomeTabela = tabela.nome;
  const colunas = tabela.colunas || [];
  
  // Coluna chave primária (PK) ou 'id' como padrão para WHERE
  const colPk = colunas.find((c) => c.pk) || colunas.find((c) => c.nome.toLowerCase() === "id") || colunas[0];
  const nomePk = colPk ? colPk.nome : "id";

  // Pré-comando SELECT
  const cmdSelect = `SELECT * FROM ${nomeTabela} LIMIT 100;`;

  // Pré-comando INSERT
  const colsParaInsert = colunas.filter((c) => !c.pk || c.tipo.toUpperCase() !== "INTEGER");
  const listaCols = colsParaInsert.length > 0 ? colsParaInsert.map((c) => c.nome) : colunas.map((c) => c.nome);
  
  const valoresExemplo = (colsParaInsert.length > 0 ? colsParaInsert : colunas).map((c) => {
    const t = (c.tipo || "").toUpperCase();
    if (t.includes("INT")) return "1";
    if (t.includes("REAL") || t.includes("FLOAT") || t.includes("NUM") || t.includes("DEC")) return "10.5";
    if (t.includes("DATE") || t.includes("TIME")) return "'2026-09-17'";
    return `'exemplo_${c.nome}'`;
  });

  const cmdInsert = `INSERT INTO ${nomeTabela} (${listaCols.join(", ")})\nVALUES (${valoresExemplo.join(", ")});`;

  // Pré-comando UPDATE com WHERE
  const colsParaUpdate = colunas.filter((c) => c.nome !== nomePk);
  const setsExemplo = (colsParaUpdate.length > 0 ? colsParaUpdate : colunas).slice(0, 3).map((c) => {
    const t = (c.tipo || "").toUpperCase();
    if (t.includes("INT")) return `${c.nome} = 2`;
    return `${c.nome} = 'novo_valor'`;
  });

  const cmdUpdate = `UPDATE ${nomeTabela}\nSET ${setsExemplo.join(", ")}\nWHERE ${nomePk} = 1;`;

  // Pré-comando DELETE com WHERE
  const cmdDelete = `DELETE FROM ${nomeTabela}\nWHERE ${nomePk} = 1;`;

  return {
    select: cmdSelect,
    insert: cmdInsert,
    update: cmdUpdate,
    delete: cmdDelete,
  };
}

/**
 * Lista tabelas e colunas do banco SQLite (D1)
 */
export async function listarEstruturaTabelas(db) {
  const tabelasRaw = await all(
    db,
    `SELECT name FROM sqlite_master 
     WHERE type='table' 
       AND name NOT LIKE 'sqlite_%' 
       AND name NOT LIKE '_cf_%' 
       AND name NOT LIKE 'd1_%'
     ORDER BY name`
  );

  const tabelas = [];
  for (const t of tabelasRaw) {
    const nomeTabela = t.name;
    let colunas = [];
    try {
      colunas = await all(db, `PRAGMA table_info(${nomeTabela})`);
    } catch (_) {}

    let totalRegistros = 0;
    try {
      const c = await first(db, `SELECT COUNT(*) AS total FROM ${nomeTabela}`);
      totalRegistros = c?.total ?? 0;
    } catch (_) {}

    const colunasFormatadas = colunas.map((c) => ({
      nome: c.name,
      tipo: c.type || "TEXT",
      pk: Boolean(c.pk),
      notnull: Boolean(c.notnull),
      dflt_value: c.dflt_value,
    }));

    const tabelaObj = {
      nome: nomeTabela,
      totalRegistros,
      colunas: colunasFormatadas,
    };

    tabelaObj.comandos = gerarPreComandos(tabelaObj);
    tabelas.push(tabelaObj);
  }

  return tabelas;
}

/**
 * Executa uma consulta SQL (leitura ou mutação)
 */
export async function executarSql(db, sql) {
  const classificacao = classificarSql(sql);
  if (classificacao.vazio) {
    throw new Error("Informe uma instrução SQL para execução.");
  }

  const inicio = Date.now();

  if (classificacao.ehLeitura) {
    const resultado = await db.prepare(sql).all();
    const duracao = Date.now() - inicio;
    const linhas = resultado.results || [];
    const colunas = linhas.length > 0 ? Object.keys(linhas[0]) : [];

    return {
      sucesso: true,
      tipo: "consulta",
      colunas,
      linhas,
      totalLinhas: linhas.length,
      tempoMs: Math.max(1, Math.round(resultado.meta?.duration || duracao)),
    };
  } else {
    const resultado = await db.prepare(sql).run();
    const duracao = Date.now() - inicio;
    const changes = resultado.meta?.changes ?? 0;
    const lastRowId = resultado.meta?.last_row_id ?? null;

    return {
      sucesso: true,
      tipo: "execucao",
      linhasAfetadas: changes,
      lastRowId,
      tempoMs: Math.max(1, Math.round(resultado.meta?.duration || duracao)),
      mensagem: `Comando executado com sucesso: ${changes} linha(s) afetada(s).`,
    };
  }
}
