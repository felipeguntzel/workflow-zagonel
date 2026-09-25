import { all, first, run } from "./db.js";

export async function assegurarColunaObservacaoAcoes(db) {
  try {
    const info = await all(db, "PRAGMA table_info(acoes)");
    if (Array.isArray(info) && info.length > 0) {
      const existe = info.some((col) => col.name === "observacao");
      if (!existe) {
        await run(db, "ALTER TABLE acoes ADD COLUMN observacao TEXT").catch(() => {});
      }
    }
  } catch (_) {
    await run(db, "ALTER TABLE acoes ADD COLUMN observacao TEXT").catch(() => {});
  }
}

export async function carregarEtapaComAcoes(db, etapaId) {
  await assegurarColunaObservacaoAcoes(db);
  const etapa = await first(db, "SELECT * FROM etapas WHERE id = ?", etapaId);
  if (!etapa) return null;
  const acoes = await all(db, "SELECT * FROM acoes WHERE etapa_id = ? ORDER BY id", etapaId);
  return { ...etapa, acoes };
}
