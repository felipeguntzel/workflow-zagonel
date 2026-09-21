import { run } from "./db.js";

let colunasGarantidas = false;

/**
 * Garante que as colunas 'email', 'telefone' e 'token_valido_apos' existam na tabela 'usuarios'
 */
export async function ensureColunasUsuario(db) {
  if (colunasGarantidas) return;
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
  colunasGarantidas = true;
}
