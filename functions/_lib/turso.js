import { createClient } from "@libsql/client/web";

let cachedAdapter = null;
let cachedUrl = null;
let cachedToken = null;

/**
 * Cria um adaptador compatível com a API do Cloudflare D1 sobre o cliente Turso (@libsql/client/web).
 * Garante que qualquer chamada a .prepare(sql).bind(...params).all() / first() / run(),
 * bem como .batch() e .exec(), funcione de forma transparente em todo o projeto.
 */
export function createTursoD1Adapter(client) {
  function createStatement(sql, args = []) {
    return {
      _sql: sql,
      _args: args,
      bind(...params) {
        return createStatement(sql, params);
      },
      async all() {
        const start = Date.now();
        const res = await client.execute({ sql, args });
        const duration = Date.now() - start;
        return {
          results: res.rows || [],
          success: true,
          meta: {
            duration,
            changes: res.rowsAffected ?? 0,
            last_row_id: res.lastInsertRowid !== undefined && res.lastInsertRowid !== null ? Number(res.lastInsertRowid) : null,
          },
        };
      },
      async first(colName) {
        const res = await client.execute({ sql, args });
        const firstRow = res.rows && res.rows.length > 0 ? res.rows[0] : null;
        if (!firstRow) return null;
        if (colName) return firstRow[colName] ?? null;
        return firstRow;
      },
      async run() {
        const start = Date.now();
        const res = await client.execute({ sql, args });
        const duration = Date.now() - start;
        return {
          success: true,
          meta: {
            duration,
            changes: res.rowsAffected ?? 0,
            last_row_id: res.lastInsertRowid !== undefined && res.lastInsertRowid !== null ? Number(res.lastInsertRowid) : null,
          },
        };
      },
      async raw() {
        const res = await client.execute({ sql, args });
        return (res.rows || []).map((row) => Object.values(row));
      },
    };
  }

  return {
    _isTurso: true,
    _client: client,
    prepare(sql) {
      return createStatement(sql, []);
    },
    async batch(statements) {
      if (!statements || statements.length === 0) return [];
      const batchPayload = statements.map((s) => {
        if (typeof s === "string") return s;
        if (s._sql) return { sql: s._sql, args: s._args || [] };
        if (s.sql) return { sql: s.sql, args: s.params || s.args || [] };
        return s;
      });

      const start = Date.now();
      const results = await client.batch(batchPayload, "write");
      const duration = Date.now() - start;

      return results.map((r) => ({
        results: r.rows || [],
        success: true,
        meta: {
          duration,
          changes: r.rowsAffected ?? 0,
          last_row_id: r.lastInsertRowid !== undefined && r.lastInsertRowid !== null ? Number(r.lastInsertRowid) : null,
        },
      }));
    },
    async exec(sql) {
      const start = Date.now();
      await client.executeMultiple(sql);
      const duration = Date.now() - start;
      return { count: 1, duration };
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

  const client = createClient({
    url,
    authToken: token,
  });

  cachedUrl = url;
  cachedToken = token;
  cachedAdapter = createTursoD1Adapter(client);
  return cachedAdapter;
}
