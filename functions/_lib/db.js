export function all(db, sql, ...params) {
  return db.prepare(sql).bind(...params).all().then((r) => r.results);
}

export function first(db, sql, ...params) {
  return db.prepare(sql).bind(...params).first();
}

export function run(db, sql, ...params) {
  return db.prepare(sql).bind(...params).run();
}

export function prepare(db, sql, ...params) {
  return db.prepare(sql).bind(...params);
}

export async function batch(db, statements) {
  if (!statements || statements.length === 0) return [];
  if (typeof db.batch === "function") {
    return db.batch(statements);
  }
  return Promise.all(statements.map((s) => (typeof s?.run === "function" ? s.run() : s)));
}

