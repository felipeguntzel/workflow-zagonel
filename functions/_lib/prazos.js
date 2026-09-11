const DIA_MS = 24 * 60 * 60 * 1000;

function paraISO(date) {
  return date.toISOString().slice(0, 10);
}

export function calcularPrazoSugerido(dataAberturaISO, prazoPadraoDias) {
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

export function empurrarPrazo(prazoISO, diasAtraso) {
  const prazo = new Date(`${prazoISO}T00:00:00Z`);
  return paraISO(new Date(prazo.getTime() + diasAtraso * DIA_MS));
}
