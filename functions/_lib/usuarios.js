import { run } from "./db.js";

let colunasGarantidas = true;

/**
 * Colunas 'email', 'telefone', 'token_valido_apos' e 'ativo' já estão consolidadas nas migrações oficiais (0011, 0014, 0028).
 */
export async function ensureColunasUsuario(db, forcar = false) {
  if (colunasGarantidas && !forcar) return;

  try {
    await run(db, "ALTER TABLE usuarios ADD COLUMN email TEXT");
  } catch (_) {
    // Já existe
  }
  try {
    await run(db, "ALTER TABLE usuarios ADD COLUMN telefone TEXT");
  } catch (_) {
    // Já existe
  }
  try {
    await run(db, "ALTER TABLE usuarios ADD COLUMN token_valido_apos INTEGER DEFAULT 0");
  } catch (_) {
    // Já existe
  }
  try {
    await run(db, "ALTER TABLE usuarios ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1");
  } catch (_) {
    // Já existe
  }
  colunasGarantidas = true;
}
