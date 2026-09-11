import { all, first } from "./db.js";

export async function carregarEtapaComAcoes(db, etapaId) {
  const etapa = await first(db, "SELECT * FROM etapas WHERE id = ?", etapaId);
  if (!etapa) return null;
  const acoes = await all(db, "SELECT * FROM acoes WHERE etapa_id = ? ORDER BY id", etapaId);
  return { ...etapa, acoes };
}
