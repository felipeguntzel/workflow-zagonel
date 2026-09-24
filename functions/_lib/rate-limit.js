import { first, run } from "./db.js";

export const MAX_TENTATIVAS_LOGIN = 3;

let tabelaGarantida = false;

export async function ensureTentativasLoginTabela(db) {
  if (tabelaGarantida) return;
  try {
    await run(
      db,
      `CREATE TABLE IF NOT EXISTS tentativas_login (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chave TEXT NOT NULL UNIQUE,
        tentativas INTEGER NOT NULL DEFAULT 1,
        bloqueado_ate INTEGER NOT NULL DEFAULT 0,
        atualizado_em TEXT NOT NULL
      )`
    );
  } catch (_) {}
  tabelaGarantida = true;
}

/**
 * Verifica se a chave (login ou usuario) esta bloqueada por excesso de tentativas.
 */
export async function verificarRateLimit(db, chave, agora = Date.now()) {
  await ensureTentativasLoginTabela(db);
  const registro = await first(db, "SELECT * FROM tentativas_login WHERE chave = ?", chave);
  if (!registro) return { bloqueado: false };

  if (registro.bloqueado_ate === -1 || registro.bloqueado_ate > agora) {
    return {
      bloqueado: true,
      mensagem: "Acesso bloqueado por 3 tentativas incorretas. Redefina sua senha pelo e-mail ou solicite a um administrador para alterá-la.",
    };
  }

  return { bloqueado: false };
}

/**
 * Registra uma tentativa incorreta de login e bloqueia definitivamente ao atingir o limite.
 */
export async function registrarFalhaLogin(db, chave, agora = Date.now()) {
  await ensureTentativasLoginTabela(db);
  const dataIso = new Date(agora).toISOString();
  const registro = await first(db, "SELECT * FROM tentativas_login WHERE chave = ?", chave);

  if (!registro) {
    await run(
      db,
      "INSERT INTO tentativas_login (chave, tentativas, bloqueado_ate, atualizado_em) VALUES (?, ?, ?, ?)",
      chave,
      1,
      0,
      dataIso
    );
    return { tentativas: 1, bloqueado: false, tentativasRestantes: MAX_TENTATIVAS_LOGIN - 1 };
  }

  // Se o registro anterior existia, incrementa
  let novasTentativas = Number(registro.tentativas || 0) + 1;
  let bloqueadoAte = 0;
  let bloqueado = false;

  if (novasTentativas >= MAX_TENTATIVAS_LOGIN) {
    bloqueadoAte = -1; // Bloqueio permanente até redefinição por e-mail ou admin
    bloqueado = true;
  }

  await run(
    db,
    "UPDATE tentativas_login SET tentativas = ?, bloqueado_ate = ?, atualizado_em = ? WHERE chave = ?",
    novasTentativas,
    bloqueadoAte,
    dataIso,
    chave
  );

  return {
    tentativas: novasTentativas,
    bloqueado,
    tentativasRestantes: Math.max(0, MAX_TENTATIVAS_LOGIN - novasTentativas),
  };
}

/**
 * Remove o histórico de tentativas incorretas após um login bem-sucedido.
 */
export async function limparTentativasLogin(db, chave) {
  await ensureTentativasLoginTabela(db);
  try {
    await run(db, "DELETE FROM tentativas_login WHERE chave = ? OR chave LIKE ?", chave, `${chave}:%`);
  } catch (_) {}
}

/**
 * Desbloqueia um usuário completamente por seu login.
 */
export async function desbloquearUsuario(db, login) {
  await ensureTentativasLoginTabela(db);
  try {
    const l = String(login).toLowerCase();
    await run(db, "DELETE FROM tentativas_login WHERE chave = ? OR chave LIKE ?", l, `${l}:%`);
  } catch (_) {}
}
