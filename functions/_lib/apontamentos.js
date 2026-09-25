import { all, first, run } from "./db.js";
import { hojeISO } from "./chamados.js";

let tabelaMesesLiberadosGarantida = false;
export async function ensureTabelaMesesLiberados(db) {
  if (tabelaMesesLiberadosGarantida) return;
  try {
    await run(
      db,
      `CREATE TABLE IF NOT EXISTS meses_liberados_apontamento (
         ano_mes TEXT PRIMARY KEY,
         liberado_em TEXT NOT NULL,
         liberado_por INTEGER REFERENCES usuarios(id),
         liberado_por_nome TEXT
       )`
    );
    tabelaMesesLiberadosGarantida = true;
  } catch (_) {}
}

/**
 * Retorna o primeiro dia do mês seguinte no formato YYYY-MM-01.
 * Exemplo: '2026-09' -> '2026-10-01', '2026-12' -> '2027-01-01'
 */
export function calcularDataFechamentoMes(anoMes) {
  if (!anoMes || !anoMes.includes("-")) return null;
  const [anoStr, mesStr] = anoMes.split("-");
  let ano = parseInt(anoStr, 10);
  let mes = parseInt(mesStr, 10);

  if (mes === 12) {
    ano += 1;
    mes = 1;
  } else {
    mes += 1;
  }

  const mesFormatado = String(mes).padStart(2, "0");
  return `${ano}-${mesFormatado}-01`;
}

/**
 * Extrai o ano-mês (YYYY-MM) de uma data no formato YYYY-MM-DD.
 */
export function extrairAnoMes(data) {
  if (!data) return hojeISO().slice(0, 7);
  return String(data).slice(0, 7);
}

/**
 * Verifica se um mês de competência (YYYY-MM) está fechado com base na data de hoje.
 * "o apontamento do mês anterior fecha no primeiro dia do mês seguinte, dia 01"
 */
export function verificarMesFechado(anoMes, dataReferencia = null) {
  const dataHoje = dataReferencia || hojeISO();
  const dataFechamento = calcularDataFechamentoMes(anoMes);
  if (!dataFechamento) return false;
  // Se a data de hoje for maior ou igual ao dia 01 do mês seguinte, está fechado
  return dataHoje >= dataFechamento;
}

/**
 * Verifica se o mês foi excepcionalmente liberado pelo Administrador.
 */
export async function verificarMesLiberadoPorAdmin(db, anoMes) {
  await ensureTabelaMesesLiberados(db);
  const row = await first(
    db,
    "SELECT * FROM meses_liberados_apontamento WHERE ano_mes = ?",
    anoMes
  );
  return Boolean(row);
}

/**
 * Valida se um apontamento na data informada pode ser alterado pelo usuário.
 * Retorna { permitido: boolean, motivo?: string }
 */
export async function validarPermissaoAlteracaoApontamento(db, dataApontamento, usuario) {
  if (!usuario) {
    return { permitido: false, motivo: "Usuário não autenticado." };
  }

  // Administrador sempre tem permissão para alterar mesmo em mês fechado
  if (usuario.admin === 1 || usuario.admin === true) {
    return { permitido: true };
  }

  const anoMes = extrairAnoMes(dataApontamento);
  const fechado = verificarMesFechado(anoMes);

  if (!fechado) {
    return { permitido: true };
  }

  // O mês fechou no dia 01; verifica se o administrador liberou este mês
  const liberado = await verificarMesLiberadoPorAdmin(db, anoMes);
  if (liberado) {
    return { permitido: true, liberadoPorAdmin: true };
  }

  const dataFechamento = calcularDataFechamentoMes(anoMes);
  const [anoF, mesF, diaF] = dataFechamento.split("-");
  const dataFormatada = `${diaF}/${mesF}/${anoF}`;

  return {
    permitido: false,
    motivo: `O período de ${anoMes} foi fechado em ${dataFormatada}. Apenas administradores podem liberar ou efetuar alterações neste mês.`,
  };
}
