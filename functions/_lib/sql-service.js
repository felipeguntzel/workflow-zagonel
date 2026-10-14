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

  // Pré-comando para Restaurar Contador de IDs (AUTOINCREMENT) para recomeçar do 1
  const cmdResetId = `-- Restaura a numeração dos IDs (AUTOINCREMENT) para recomeçar do 1 (ou MAX(id)+1 caso haja registros restantes)\nDELETE FROM sqlite_sequence WHERE name = '${nomeTabela}';`;

  return {
    select: cmdSelect,
    insert: cmdInsert,
    update: cmdUpdate,
    delete: cmdDelete,
    reset_id: cmdResetId,
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
 * Remove prefixos técnicos de mensagens de erro do SQLite/Cloudflare D1
 */
export function limparMensagemErroSql(msg) {
  return String(msg || "")
    .replace(/^D1_ERROR:\s*/i, "")
    .replace(/^SQLite error:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
}

/**
 * Traduz mensagens técnicas de erro do SQLite para português claro e amigável
 */
export function traduzirMensagemErroSql(mensagemOriginal) {
  const msgLimpa = limparMensagemErroSql(mensagemOriginal);

  // 1. Foreign Key
  if (/FOREIGN KEY constraint failed/i.test(msgLimpa)) {
    return "Falha na restrição de chave estrangeira (FOREIGN KEY constraint failed). Existem registros dependentes vinculados ou a chave referenciada não existe.";
  }

  // 2. UNIQUE
  const uniqueColMatch = msgLimpa.match(/UNIQUE constraint failed:\s*([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/i);
  if (uniqueColMatch) {
    return `Violação de valor único (UNIQUE): o campo "${uniqueColMatch[2]}" da tabela "${uniqueColMatch[1]}" já possui um registro com este valor.`;
  }
  const uniqueGenMatch = msgLimpa.match(/UNIQUE constraint failed:\s*(.+)/i);
  if (uniqueGenMatch) {
    return `Violação de valor único (UNIQUE): já existe um registro idêntico para (${uniqueGenMatch[1]}).`;
  }

  // 3. NOT NULL
  const notNullColMatch = msgLimpa.match(/NOT NULL constraint failed:\s*([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/i);
  if (notNullColMatch) {
    return `Campo obrigatório não preenchido (NOT NULL): a coluna "${notNullColMatch[2]}" da tabela "${notNullColMatch[1]}" não pode ser nula.`;
  }
  const notNullGenMatch = msgLimpa.match(/NOT NULL constraint failed:\s*(.+)/i);
  if (notNullGenMatch) {
    return `Campo obrigatório não preenchido (NOT NULL): o campo (${notNullGenMatch[1]}) é obrigatório e não aceita valor nulo.`;
  }

  // 4. CHECK
  const checkMatch = msgLimpa.match(/CHECK constraint failed:\s*(.+)/i);
  if (checkMatch) {
    return `Falha na validação de regra (CHECK): o valor informado viola a regra definida para a tabela (${checkMatch[1]}).`;
  }

  // 5. no such table
  const noTableMatch = msgLimpa.match(/no such table:\s*([a-zA-Z0-9_]+)/i);
  if (noTableMatch) {
    return `Tabela não encontrada: a tabela "${noTableMatch[1]}" não existe no banco de dados. Verifique a ortografia ou consulte o esquema de tabelas.`;
  }

  // 6. no such column
  const noColMatch = msgLimpa.match(/no such column:\s*([a-zA-Z0-9_.]+)/i);
  if (noColMatch) {
    return `Coluna não encontrada: a coluna "${noColMatch[1]}" não existe na tabela informada.`;
  }

  // 7. syntax error
  const syntaxNearMatch = msgLimpa.match(/near\s+"([^"]+)":\s*syntax error/i);
  if (syntaxNearMatch) {
    return `Erro de sintaxe SQL próximo a "${syntaxNearMatch[1]}". Verifique se há erros de digitação, pontuação ou palavras-chave incorretas.`;
  }
  if (/syntax error/i.test(msgLimpa)) {
    return "Erro de sintaxe no comando SQL. Verifique a estrutura da instrução, parênteses e vírgulas.";
  }
  if (/incomplete input/i.test(msgLimpa)) {
    return "Instrução SQL incompleta. Verifique se faltou fechar parênteses, aspas ou finalizar o comando com ponto e vírgula.";
  }

  // 8. table already exists
  const tableExistsMatch = msgLimpa.match(/table\s+([a-zA-Z0-9_]+)\s+already exists/i);
  if (tableExistsMatch) {
    return `A tabela "${tableExistsMatch[1]}" já existe no banco de dados.`;
  }

  // 9. columns mismatch in INSERT
  const colsMismatch = msgLimpa.match(/table\s+([a-zA-Z0-9_]+)\s+has\s+(\d+)\s+columns\s+but\s+(\d+)\s+values\s+were\s+supplied/i);
  if (colsMismatch) {
    return `Incompatibilidade na quantidade de colunas: a tabela "${colsMismatch[1]}" possui ${colsMismatch[2]} colunas, mas foram fornecidos ${colsMismatch[3]} valores no INSERT.`;
  }

  // 10. datatype mismatch
  if (/datatype mismatch/i.test(msgLimpa)) {
    return "Incompatibilidade de tipos de dados: o tipo de dado informado não é compatível com o esperado pela coluna correspondente.";
  }

  // 11. database is locked
  if (/database is locked|database table is locked/i.test(msgLimpa)) {
    return "O banco de dados está ocupado no momento por outra operação simultânea. Aguarde alguns instantes e tente novamente.";
  }

  // 12. primary key must be unique
  if (/PRIMARY KEY must be unique/i.test(msgLimpa)) {
    return "A chave primária (PRIMARY KEY) deve ser única. Já existe um registro com este mesmo identificador.";
  }

  // 13. ambiguous column
  const ambiguousMatch = msgLimpa.match(/ambiguous column name:\s*([a-zA-Z0-9_.]+)/i);
  if (ambiguousMatch) {
    return `Nome de coluna ambíguo: a coluna "${ambiguousMatch[1]}" existe em mais de uma tabela. Especifique a tabela antes do nome da coluna (ex: tabela.${ambiguousMatch[1]}).`;
  }

  // 14. read-only
  if (/attempt to write a readonly database/i.test(msgLimpa)) {
    return "Não é possível realizar gravações: o banco de dados está configurado em modo somente leitura.";
  }

  // 15. authorization denied
  if (/authorization denied/i.test(msgLimpa)) {
    return "Permissão negada para executar esta operação no banco de dados.";
  }

  return msgLimpa;
}

/**
 * Diagnostica um erro SQL, com especial atenção a falhas de Foreign Key (chave estrangeira),
 * identificando as tabelas e campos dependentes que impedem a exclusão e sugerindo comandos corretivos.
 */
export async function diagnosticarErroSql(db, sql, err) {
  const mensagemOriginal = err?.message || String(err || "");
  const ehForeignKey = /FOREIGN KEY constraint failed/i.test(mensagemOriginal);

  if (!ehForeignKey) {
    const traducao = traduzirMensagemErroSql(mensagemOriginal);
    return {
      ehForeignKey: false,
      tipoErro: "SQL_ERROR",
      tabela: null,
      mensagemAmigavel: traducao,
      erroOriginal: mensagemOriginal,
      dependencias: [],
      comandosSugeridos: [],
    };
  }

  const classificacao = classificarSql(sql);
  const sqlLimpo = classificacao.sqlLimpo || String(sql || "").trim();

  // 1. Diagnosticar DELETE
  const deleteMatch = sqlLimpo.match(/^DELETE\s+FROM\s+["`\[]?([a-zA-Z0-9_]+)["`\]]?(?:\s+WHERE\s+([\s\S]+?))?(?:;|\s*$)/i);
  if (deleteMatch) {
    const tabelaAlvo = deleteMatch[1];
    const whereClause = deleteMatch[2]?.trim() || null;

    const dependenciasEncontradas = [];
    let tabelasMaster = [];
    try {
      tabelasMaster = await all(
        db,
        `SELECT name FROM sqlite_master 
         WHERE type='table' 
           AND name NOT LIKE 'sqlite_%' 
           AND name NOT LIKE '_cf_%' 
           AND name NOT LIKE 'd1_%'
         ORDER BY name`
      );
    } catch (_) {}

    for (const t of (tabelasMaster || [])) {
      const nomeTabelaFilha = t.name;
      let fks = [];
      try {
        fks = await all(db, `PRAGMA foreign_key_list("${nomeTabelaFilha}")`);
      } catch (_) {}

      for (const fk of (fks || [])) {
        if (!fk.table || fk.table.toLowerCase() !== tabelaAlvo.toLowerCase()) {
          continue;
        }

        const colFilha = fk.from;
        const colPai = fk.to || "id";
        const onDelete = (fk.on_delete || "NO ACTION").toUpperCase();

        let total = 0;
        try {
          if (whereClause) {
            const res = await first(
              db,
              `SELECT COUNT(*) AS total FROM "${nomeTabelaFilha}" WHERE "${colFilha}" IN (SELECT "${colPai}" FROM "${tabelaAlvo}" WHERE ${whereClause})`
            );
            total = res?.total ?? 0;
          } else {
            const res = await first(
              db,
              `SELECT COUNT(*) AS total FROM "${nomeTabelaFilha}" WHERE "${colFilha}" IS NOT NULL AND "${colFilha}" IN (SELECT "${colPai}" FROM "${tabelaAlvo}")`
            );
            total = res?.total ?? 0;
          }
        } catch (_) {
          try {
            const res = await first(
              db,
              `SELECT COUNT(*) AS total FROM "${nomeTabelaFilha}" WHERE "${colFilha}" IS NOT NULL`
            );
            total = res?.total ?? 0;
          } catch (_) {}
        }

        if (total > 0) {
          let comandoExclusao = "";
          if (nomeTabelaFilha.toLowerCase() === tabelaAlvo.toLowerCase()) {
            comandoExclusao = `UPDATE ${tabelaAlvo} SET ${colFilha} = NULL WHERE ${colFilha} IS NOT NULL;`;
          } else if (whereClause) {
            comandoExclusao = `DELETE FROM ${nomeTabelaFilha} WHERE ${colFilha} IN (SELECT ${colPai} FROM ${tabelaAlvo} WHERE ${whereClause});`;
          } else {
            comandoExclusao = `DELETE FROM ${nomeTabelaFilha};`;
          }

          dependenciasEncontradas.push({
            tabela: nomeTabelaFilha,
            campo: colFilha,
            campoPai: colPai,
            onDelete,
            totalRegistros: total,
            ehAutorreferencia: nomeTabelaFilha.toLowerCase() === tabelaAlvo.toLowerCase(),
            comandoExclusao,
          });
        }
      }
    }

    if (dependenciasEncontradas.length > 0) {
      const listaFormatada = dependenciasEncontradas
        .map(
          (d) =>
            `• Tabela "${d.tabela}" → Campo dependente "${d.campo}" (${d.totalRegistros} registro(s) vinculado(s))`
        )
        .join("\n");

      const comandosSugeridos = dependenciasEncontradas.map((d) => d.comandoExclusao);

      const mensagemAmigavel =
        `Falha na restrição de integridade referencial (FOREIGN KEY constraint failed):\n` +
        `Não é possível excluir registros da tabela "${tabelaAlvo}" porque existem registros dependentes vinculados que precisam ser excluídos primeiro:\n\n` +
        `${listaFormatada}\n\n` +
        `Para conseguir excluir de "${tabelaAlvo}", execute primeiro a exclusão ou desvinculação dos registros das tabelas e campos dependentes listados acima.`;

      return {
        ehForeignKey: true,
        tipoErro: "FOREIGN_KEY_DELETE_BLOCKED",
        tabela: tabelaAlvo,
        mensagemAmigavel,
        erroOriginal: mensagemOriginal,
        dependencias: dependenciasEncontradas,
        comandosSugeridos,
      };
    }
  }

  // 2. Diagnosticar INSERT ou UPDATE
  const insertMatch = sqlLimpo.match(/^INSERT\s+INTO\s+["`\[]?([a-zA-Z0-9_]+)["`\]]?/i);
  const updateMatch = sqlLimpo.match(/^UPDATE\s+["`\[]?([a-zA-Z0-9_]+)["`\]]?/i);
  const tabelaMutacao = insertMatch?.[1] || updateMatch?.[1];

  if (tabelaMutacao) {
    let fks = [];
    try {
      fks = await all(db, `PRAGMA foreign_key_list("${tabelaMutacao}")`);
    } catch (_) {}

    const dependencias = (fks || []).map((fk) => ({
      tabelaPai: fk.table,
      campoFilho: fk.from,
      campoPai: fk.to || "id",
    }));

    const listaFks = dependencias
      .map((d) => `• Campo "${d.campoFilho}" deve corresponder a um registro existente na tabela pai "${d.tabelaPai}" ("${d.campoPai}")`)
      .join("\n");

    const mensagemAmigavel =
      `Falha na restrição de integridade referencial (FOREIGN KEY constraint failed):\n` +
      `O comando na tabela "${tabelaMutacao}" tentou referenciar uma chave estrangeira que não existe na tabela pai correspondente.\n\n` +
      `Campos de chave estrangeira desta tabela que devem ser verificados:\n` +
      `${listaFks || "• Verifique se os IDs informados existem nas tabelas de referência."}`;

    return {
      ehForeignKey: true,
      tipoErro: insertMatch ? "FOREIGN_KEY_INSERT_INVALID" : "FOREIGN_KEY_UPDATE_INVALID",
      tabela: tabelaMutacao,
      mensagemAmigavel,
      erroOriginal: mensagemOriginal,
      dependencias,
      comandosSugeridos: [],
    };
  }

  // Caso genérico de Foreign Key
  return {
    ehForeignKey: true,
    tipoErro: "FOREIGN_KEY_GENERIC",
    tabela: null,
    mensagemAmigavel: "Falha na restrição de integridade referencial (chave estrangeira / FOREIGN KEY constraint failed). Existem registros dependentes que impedem a operação ou a chave referenciada não existe na tabela pai correspondente.",
    erroOriginal: mensagemOriginal,
    dependencias: [],
    comandosSugeridos: [],
  };
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

  try {
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
  } catch (err) {
    const originalMsg = err.message || String(err);
    try {
      const diag = await diagnosticarErroSql(db, sql, err);
      if (diag && diag.mensagemAmigavel) {
        err.diagnostico = diag;
        err.message = diag.mensagemAmigavel;
      } else {
        err.message = traduzirMensagemErroSql(originalMsg);
      }
    } catch (_) {
      err.message = traduzirMensagemErroSql(originalMsg);
    }
    err.erroOriginal = originalMsg;
    throw err;
  }
}

/**
 * Restaura o contador AUTOINCREMENT de uma ou todas as tabelas em sqlite_sequence.
 * Tabelas que estão vazias recomeçarão a numeração a partir do ID 1.
 */
export async function restaurarSequenciasIds(db, nomeTabela = null) {
  try {
    if (nomeTabela) {
      const res = await db.prepare("DELETE FROM sqlite_sequence WHERE name = ?").bind(nomeTabela).run();
      const changes = res.meta?.changes ?? 0;
      return {
        sucesso: true,
        tipo: "execucao",
        linhasAfetadas: changes,
        tabela: nomeTabela,
        mensagem: `Contador de IDs (AUTOINCREMENT) da tabela "${nomeTabela}" restaurado com sucesso. Se a tabela estiver vazia, o próximo registro receberá ID 1.`,
      };
    } else {
      const res = await db.prepare("DELETE FROM sqlite_sequence").run();
      const changes = res.meta?.changes ?? 0;
      return {
        sucesso: true,
        tipo: "execucao",
        linhasAfetadas: changes,
        tabela: "todas",
        mensagem: "Contadores de IDs (AUTOINCREMENT) de todas as tabelas restaurados com sucesso. Tabelas vazias recomeçarão do ID 1.",
      };
    }
  } catch (err) {
    throw new Error(`Erro ao restaurar contadores de IDs: ${err.message}`);
  }
}
