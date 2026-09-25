import { all, first, run } from "./db.js";

export async function assegurarColunasAcoes(db) {
  try {
    const info = await all(db, "PRAGMA table_info(acoes)");
    if (Array.isArray(info) && info.length > 0) {
      const nomes = new Set(info.map((col) => col.name.toLowerCase()));
      if (!nomes.has("observacao")) {
        await run(db, "ALTER TABLE acoes ADD COLUMN observacao TEXT").catch(() => {});
      }
      if (!nomes.has("etapa_destino_id")) {
        await run(db, "ALTER TABLE acoes ADD COLUMN etapa_destino_id INTEGER REFERENCES etapas(id)").catch(() => {});
      }
    }
  } catch (_) {
    await run(db, "ALTER TABLE acoes ADD COLUMN observacao TEXT").catch(() => {});
    await run(db, "ALTER TABLE acoes ADD COLUMN etapa_destino_id INTEGER REFERENCES etapas(id)").catch(() => {});
  }
}

export const assegurarColunaObservacaoAcoes = assegurarColunasAcoes;

export async function carregarEtapaComAcoes(db, etapaId) {
  await assegurarColunasAcoes(db);
  const etapa = await first(db, "SELECT * FROM etapas WHERE id = ?", etapaId);
  if (!etapa) return null;
  const acoes = await all(db, "SELECT * FROM acoes WHERE etapa_id = ? ORDER BY id", etapaId);
  return { ...etapa, acoes };
}
