let cachedAdapter = null;
let cachedUrl = null;
let cachedToken = null;

function normalizeUrl(url) {
  let clean = (url || "").trim();
  if (clean.startsWith("libsql://")) {
    clean = "https://" + clean.slice(9);
  }
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    clean = "https://" + clean;
  }
  return clean.replace(/\/+$/, "") + "/v2/pipeline";
}

function encodeArg(v) {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "number") {
    if (Number.isInteger(v)) return { type: "integer", value: String(v) };
    return { type: "float", value: v };
  }
  if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  return { type: "text", value: String(v) };
}

function decodeCell(cell) {
  if (!cell || cell.type === "null") return null;
  if (cell.type === "integer") {
    const num = Number(cell.value);
    return Number.isSafeInteger(num) ? num : cell.value;
  }
  if (cell.type === "float") return Number(cell.value);
  return cell.value;
}

function mapResult(executeResult, durationMs = 0) {
  const result = executeResult || {};
  const cols = Array.isArray(result.cols) ? result.cols.map((c) => c.name) : [];
  const rows = Array.isArray(result.rows)
    ? result.rows.map((rowCells) => {
        const obj = {};
        for (let i = 0; i < cols.length; i++) {
          obj[cols[i]] = decodeCell(rowCells[i]);
        }
        return obj;
      })
    : [];

  const changes = result.affected_row_count ?? 0;
  const lastRowId =
    result.last_insert_rowid !== undefined && result.last_insert_rowid !== null
      ? Number(result.last_insert_rowid)
      : null;

  return {
    results: rows,
    success: true,
    meta: {
      duration: durationMs || Math.round(result.query_duration_ms || 0),
      changes,
      last_row_id: lastRowId,
    },
  };
}

/**
 * Cria um adaptador D1 transparente para o Turso utilizando exclusivamente a API HTTP v2/pipeline nativa via fetch.
 * Não requer nenhuma dependência npm externa no bundle do Cloudflare Pages Functions.
 */
export function createTursoHttpAdapter({ url, authToken }) {
  const endpoint = normalizeUrl(url);

  async function callPipeline(stmts) {
    const start = Date.now();
    const requests = stmts.map((s) => ({
      type: "execute",
      stmt: {
        sql: s.sql,
        args: Array.isArray(s.args) ? s.args.map(encodeArg) : [],
      },
    }));
    requests.push({ type: "close" });

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Turso HTTP error ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const totalDuration = Date.now() - start;

    if (!data.results || !Array.isArray(data.results)) {
      throw new Error("Invalid response format from Turso pipeline.");
    }

    const mapped = [];
    for (let i = 0; i < stmts.length; i++) {
      const item = data.results[i];
      if (!item) break;
      if (item.type === "error") {
        const errMsg = item.error?.message || "Unknown Turso error";
        throw new Error(errMsg);
      }
      mapped.push(mapResult(item.response?.result, totalDuration));
    }

    return mapped;
  }

  function createStatement(sql, args = []) {
    return {
      _sql: sql,
      _args: args,
      bind(...params) {
        return createStatement(sql, params);
      },
      async all() {
        const resList = await callPipeline([{ sql, args }]);
        return resList[0];
      },
      async first(colName) {
        const resList = await callPipeline([{ sql, args }]);
        const firstRow = resList[0]?.results?.[0] || null;
        if (!firstRow) return null;
        if (colName) return firstRow[colName] ?? null;
        return firstRow;
      },
      async run() {
        const resList = await callPipeline([{ sql, args }]);
        return resList[0];
      },
      async raw() {
        const resList = await callPipeline([{ sql, args }]);
        return (resList[0]?.results || []).map((row) => Object.values(row));
      },
    };
  }

  return {
    _isTurso: true,
    prepare(sql) {
      return createStatement(sql, []);
    },
    async batch(statements) {
      if (!statements || statements.length === 0) return [];
      const batchPayload = statements.map((s) => {
        if (typeof s === "string") return { sql: s, args: [] };
        if (s._sql) return { sql: s._sql, args: s._args || [] };
        if (s.sql) return { sql: s.sql, args: s.params || s.args || [] };
        return { sql: String(s), args: [] };
      });

      return callPipeline(batchPayload);
    },
    async exec(sql) {
      const start = Date.now();
      await callPipeline([{ sql, args: [] }]);
      return { count: 1, duration: Date.now() - start };
    },
  };
}

/**
 * Obtém ou instancia a conexão Turso se as credenciais estiverem no ambiente (env).
 * Retorna null se TURSO_DATABASE_URL ou TURSO_AUTH_TOKEN não estiverem definidos.
 */
export function getTursoDb(env) {
  if (!env) return null;

  const url = env.TURSO_DATABASE_URL || env.TURSO_URL;
  const token = env.TURSO_AUTH_TOKEN || env.TURSO_TOKEN;

  if (!url || !token) {
    return null;
  }

  if (cachedAdapter && cachedUrl === url && cachedToken === token) {
    return cachedAdapter;
  }

  cachedUrl = url;
  cachedToken = token;
  cachedAdapter = createTursoHttpAdapter({ url, authToken: token });
  return cachedAdapter;
}
