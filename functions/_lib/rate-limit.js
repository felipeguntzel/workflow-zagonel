import { first, run } from "./db.js";

export const MAX_TENTATIVAS_LOGIN = 5;
export const JANELA_BLOQUEIO_MS = 15 * 60 * 1000; // 15 minutos

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
 * Verifica se a chave (login ou IP) esta temporariamente bloqueada por excesso de tentativas.
 */
export async function verificarRateLimit(db, chave, agora = Date.now()) {
  await ensureTentativasLoginTabela(db);
  const registro = await first(db, "SELECT * FROM tentativas_login WHERE chave = ?", chave);
  if (!registro) return { bloqueado: false };

  if (registro.bloqueado_ate > agora) {
    const minutosRestantes = Math.max(1, Math.ceil((registro.bloqueado_ate - agora) / 60000));
    return {
      bloqueado: true,
      minutosRestantes,
      mensagem: `Acesso temporariamente bloqueado por excesso de tentativas incorretas. Tente novamente em ${minutosRestantes} minuto(s).`,
    };
  }

  return { bloqueado: false };
}

/**
 * Registra uma tentativa incorreta de login e bloqueia se atingir o limite.
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

  // Se o bloqueio anterior ja expirou, reinicia a contagem
  let novasTentativas = Number(registro.tentativas || 0) + 1;
  if (registro.bloqueado_ate > 0 && registro.bloqueado_ate <= agora) {
    novasTentativas = 1;
  }

  let bloqueadoAte = 0;
  let bloqueado = false;
  let minutosRestantes = 0;

  if (novasTentativas >= MAX_TENTATIVAS_LOGIN) {
    bloqueadoAte = agora + JANELA_BLOQUEIO_MS;
    bloqueado = true;
    minutosRestantes = Math.ceil(JANELA_BLOQUEIO_MS / 60000);
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
    minutosRestantes,
    tentativasRestantes: Math.max(0, MAX_TENTATIVAS_LOGIN - novasTentativas),
  };
}

/**
 * Remove o historico de tentativas incorretas apos um login bem-sucedido.
 */
export async function limparTentativasLogin(db, chave) {
  await ensureTentativasLoginTabela(db);
  try {
    await run(db, "DELETE FROM tentativas_login WHERE chave = ?", chave);
  } catch (_) {}
}
