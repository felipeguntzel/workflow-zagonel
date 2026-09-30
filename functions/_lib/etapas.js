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
      if (!nomes.has("etapas_destino_ids")) {
        await run(db, "ALTER TABLE acoes ADD COLUMN etapas_destino_ids TEXT").catch(() => {});
      }
      if (!nomes.has("modo_execucao")) {
        await run(db, "ALTER TABLE acoes ADD COLUMN modo_execucao TEXT DEFAULT 'encadeado'").catch(() => {});
      }
    }
  } catch (_) {
    await run(db, "ALTER TABLE acoes ADD COLUMN observacao TEXT").catch(() => {});
    await run(db, "ALTER TABLE acoes ADD COLUMN etapa_destino_id INTEGER REFERENCES etapas(id)").catch(() => {});
    await run(db, "ALTER TABLE acoes ADD COLUMN etapas_destino_ids TEXT").catch(() => {});
    await run(db, "ALTER TABLE acoes ADD COLUMN modo_execucao TEXT DEFAULT 'encadeado'").catch(() => {});
  }
}

export const assegurarColunaObservacaoAcoes = assegurarColunasAcoes;

export async function carregarEtapaComAcoes(db, etapaId) {
  await assegurarColunasAcoes(db);
  const etapa = await first(db, "SELECT * FROM etapas WHERE id = ?", etapaId);
  if (!etapa) return null;
  const acoes = await all(db, "SELECT * FROM acoes WHERE etapa_id = ? ORDER BY id", etapaId);
  const acoesTratadas = acoes.map((a) => {
    let etapas_destino_ids = [];
    if (a.etapas_destino_ids) {
      try {
        const parsed = JSON.parse(a.etapas_destino_ids);
        if (Array.isArray(parsed)) etapas_destino_ids = parsed.map(Number).filter(Boolean);
      } catch (_) {
        etapas_destino_ids = String(a.etapas_destino_ids).split(",").map(Number).filter(Boolean);
      }
    }
    if (etapas_destino_ids.length === 0 && a.etapa_destino_id) {
      etapas_destino_ids = [Number(a.etapa_destino_id)];
    }
    return {
      ...a,
      etapas_destino_ids,
    };
  });
  return { ...etapa, acoes: acoesTratadas };
}
