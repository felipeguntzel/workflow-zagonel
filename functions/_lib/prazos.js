const DIA_MS = 24 * 60 * 60 * 1000;

function paraISO(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Calcula a data do Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher
 */
export function calcularDomingoPascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = Março, 4 = Abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const cacheFeriadosPorAno = new Map();

/**
 * Retorna uma lista de strings ISO (YYYY-MM-DD) de feriados nacionais do Brasil (fixos e móveis)
 */
export function obterFeriadosNacionais(ano) {
  if (cacheFeriadosPorAno.has(ano)) {
    return cacheFeriadosPorAno.get(ano);
  }

  const pascoa = calcularDomingoPascoa(ano);
  const pascoaMs = pascoa.getTime();

  // Feriados móveis relativos à Páscoa
  const carnavalSegunda = paraISO(new Date(pascoaMs - 48 * DIA_MS));
  const carnavalTerca = paraISO(new Date(pascoaMs - 47 * DIA_MS));
  const sextaFeiraSanta = paraISO(new Date(pascoaMs - 2 * DIA_MS));
  const corpusChristi = paraISO(new Date(pascoaMs + 60 * DIA_MS));

  // Feriados nacionais fixos
  const fixos = [
    `${ano}-01-01`, // Confraternização Universal
    `${ano}-04-21`, // Tiradentes
    `${ano}-05-01`, // Dia do Trabalho
    `${ano}-09-07`, // Independência do Brasil
    `${ano}-10-12`, // Nossa Senhora Aparecida
    `${ano}-11-02`, // Finados
    `${ano}-11-15`, // Proclamação da República
    `${ano}-11-20`, // Dia da Consciência Negra (Lei 14.759/23)
    `${ano}-12-25`, // Natal
  ];

  const todos = new Set([...fixos, carnavalSegunda, carnavalTerca, sextaFeiraSanta, corpusChristi]);
  cacheFeriadosPorAno.set(ano, todos);
  return todos;
}

/**
 * Determina se uma data é dia útil (segunda a sexta e fora de feriados)
 */
export function ehDiaUtil(dataISO, feriadosCustom = []) {
  const d = new Date(`${dataISO}T00:00:00Z`);
  const diaSemana = d.getUTCDay();
  if (diaSemana === 0 || diaSemana === 6) return false; // Domingo ou Sábado

  const ano = d.getUTCFullYear();
  const feriadosNacionais = obterFeriadosNacionais(ano);
  if (feriadosNacionais.has(dataISO)) return false;

  if (Array.isArray(feriadosCustom) && feriadosCustom.includes(dataISO)) return false;

  return true;
}

/**
 * Se a data for fim de semana ou feriado, retorna o próximo dia útil. Caso contrário, retorna a própria data.
 */
export function proximoDiaUtil(dataISO, feriadosCustom = []) {
  let atual = new Date(`${dataISO}T00:00:00Z`);
  while (!ehDiaUtil(paraISO(atual), feriadosCustom)) {
    atual = new Date(atual.getTime() + DIA_MS);
  }
  return paraISO(atual);
}

/**
 * Adiciona N dias úteis a partir de uma data inicial.
 * Se a data inicial não for dia útil, avança primeiro para o próximo dia útil.
 */
export function adicionarDiasUteis(dataInicioISO, quantidadeDiasUteis, feriadosCustom = []) {
  let atual = new Date(`${dataInicioISO}T00:00:00Z`);
  let restantes = Number(quantidadeDiasUteis) || 0;

  if (restantes <= 0) {
    return proximoDiaUtil(dataInicioISO, feriadosCustom);
  }

  while (restantes > 0) {
    atual = new Date(atual.getTime() + DIA_MS);
    if (ehDiaUtil(paraISO(atual), feriadosCustom)) {
      restantes--;
    }
  }

  return paraISO(atual);
}

/**
 * Conta quantos dias úteis existem no intervalo fechado [inicioISO, fimISO].
 */
export function calcularDiasUteisEntre(inicioISO, fimISO, feriadosCustom = []) {
  const inicio = new Date(`${inicioISO}T00:00:00Z`);
  const fim = new Date(`${fimISO}T00:00:00Z`);
  if (inicio > fim) return 0;

  let contagem = 0;
  let cursor = new Date(inicio.getTime());
  while (cursor <= fim) {
    if (ehDiaUtil(paraISO(cursor), feriadosCustom)) {
      contagem++;
    }
    cursor = new Date(cursor.getTime() + DIA_MS);
  }
  return contagem;
}

/**
 * Calcula o prazo sugerido. Suporta tanto dias corridos (padrão) quanto dias úteis (opção apenasDiasUteis).
 */
export function calcularPrazoSugerido(dataAberturaISO, prazoPadraoDias, opcoes = {}) {
  const { apenasDiasUteis = false, feriados = [] } = typeof opcoes === "object" ? opcoes : {};

  if (apenasDiasUteis) {
    return adicionarDiasUteis(dataAberturaISO, prazoPadraoDias, feriados);
  }

  const abertura = new Date(`${dataAberturaISO}T00:00:00Z`);
  return paraISO(new Date(abertura.getTime() + prazoPadraoDias * DIA_MS));
}

export function situacaoPrazo(prazoISO, hojeISO, finalizado) {
  if (finalizado) return "ok";
  const prazo = new Date(`${prazoISO}T00:00:00Z`);
  const hoje = new Date(`${hojeISO}T00:00:00Z`);
  const diffDias = Math.round((prazo.getTime() - hoje.getTime()) / DIA_MS);
  if (diffDias < 0) return "vencido";
  if (diffDias <= 2) return "alerta";
  return "ok";
}

export function calcularDiasAtraso(prazoISO, dataFinalizacaoISO) {
  const prazo = new Date(`${prazoISO}T00:00:00Z`);
  const fim = new Date(`${dataFinalizacaoISO}T00:00:00Z`);
  const dias = Math.round((fim.getTime() - prazo.getTime()) / DIA_MS);
  return dias > 0 ? dias : 0;
}

/**
 * Empurra o prazo diante de um atraso. Suporta dias úteis ou dias corridos.
 */
export function empurrarPrazo(prazoISO, diasAtraso, opcoes = {}) {
  const { apenasDiasUteis = false, feriados = [] } = typeof opcoes === "object" ? opcoes : {};

  if (apenasDiasUteis) {
    return adicionarDiasUteis(prazoISO, diasAtraso, feriados);
  }

  const prazo = new Date(`${prazoISO}T00:00:00Z`);
  return paraISO(new Date(prazo.getTime() + diasAtraso * DIA_MS));
}
