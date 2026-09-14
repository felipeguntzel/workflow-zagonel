export function all(db, sql, ...params) {
  return db.prepare(sql).bind(...params).all().then((r) => r.results);
}

export function first(db, sql, ...params) {
  return db.prepare(sql).bind(...params).first();
}

export function run(db, sql, ...params) {
  return db.prepare(sql).bind(...params).run();
}
