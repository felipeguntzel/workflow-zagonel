import { getTursoDb } from "./turso.js";

/**
 * Resolve a instância ativa do banco de dados a partir de um objeto DB ou do contexto env.
 * Prioriza Turso se as credenciais estiverem configuradas, mantendo compatibilidade com Cloudflare D1.
 */
export function resolveDb(dbOrEnv) {
  if (!dbOrEnv) return null;
  if (typeof dbOrEnv.prepare === "function") return dbOrEnv;
  return getTursoDb(dbOrEnv) || dbOrEnv.DB || dbOrEnv;
}

export function getDb(env) {
  return resolveDb(env);
}

export function all(db, sql, ...params) {
  const target = resolveDb(db);
  return target.prepare(sql).bind(...params).all().then((r) => r.results);
}

export function first(db, sql, ...params) {
  const target = resolveDb(db);
  return target.prepare(sql).bind(...params).first();
}

export function run(db, sql, ...params) {
  const target = resolveDb(db);
  return target.prepare(sql).bind(...params).run();
}

export function prepare(db, sql, ...params) {
  const target = resolveDb(db);
  return target.prepare(sql).bind(...params);
}

export async function batch(db, statements) {
  const target = resolveDb(db);
  if (!statements || statements.length === 0) return [];
  if (typeof target.batch === "function") {
    return target.batch(statements);
  }
  return Promise.all(statements.map((s) => (typeof s?.run === "function" ? s.run() : s)));
}
