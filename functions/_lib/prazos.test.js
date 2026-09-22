import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularPrazoSugerido,
  situacaoPrazo,
  calcularDiasAtraso,
  empurrarPrazo,
  obterFeriadosNacionais,
  ehDiaUtil,
  proximoDiaUtil,
  adicionarDiasUteis,
  calcularDiasUteisEntre,
} from "./prazos.js";

test("calcularPrazoSugerido adds N days to the opening date", () => {
  assert.equal(calcularPrazoSugerido("2026-01-01", 5), "2026-01-06");
});

test("situacaoPrazo returns 'ok' when finalizado is true, regardless of date", () => {
  assert.equal(situacaoPrazo("2020-01-01", "2026-01-01", true), "ok");
});

test("situacaoPrazo returns 'vencido' when today is past the deadline", () => {
  assert.equal(situacaoPrazo("2026-01-01", "2026-01-05", false), "vencido");
});

test("situacaoPrazo returns 'alerta' within 2 days of the deadline", () => {
  assert.equal(situacaoPrazo("2026-01-05", "2026-01-03", false), "alerta");
  assert.equal(situacaoPrazo("2026-01-05", "2026-01-04", false), "alerta");
});

test("situacaoPrazo returns 'ok' when more than 2 days remain", () => {
  assert.equal(situacaoPrazo("2026-01-10", "2026-01-01", false), "ok");
});

test("calcularDiasAtraso returns 0 when finished on or before the deadline", () => {
  assert.equal(calcularDiasAtraso("2026-01-10", "2026-01-10"), 0);
  assert.equal(calcularDiasAtraso("2026-01-10", "2026-01-05"), 0);
});

test("calcularDiasAtraso returns the number of late days", () => {
  assert.equal(calcularDiasAtraso("2026-01-10", "2026-01-13"), 3);
});

test("empurrarPrazo pushes the deadline forward by N days", () => {
  assert.equal(empurrarPrazo("2026-01-10", 3), "2026-01-13");
});

test("obterFeriadosNacionais inclui feriados fixos e móveis do Brasil", () => {
  const feriados2026 = obterFeriadosNacionais(2026);
  assert.equal(feriados2026.has("2026-01-01"), true, "Ano novo");
  assert.equal(feriados2026.has("2026-04-21"), true, "Tiradentes");
  assert.equal(feriados2026.has("2026-05-01"), true, "Dia do trabalho");
  assert.equal(feriados2026.has("2026-09-07"), true, "Independência");
  assert.equal(feriados2026.has("2026-10-12"), true, "Nossa Senhora Aparecida");
  assert.equal(feriados2026.has("2026-11-02"), true, "Finados");
  assert.equal(feriados2026.has("2026-11-15"), true, "Proclamação da República");
  assert.equal(feriados2026.has("2026-11-20"), true, "Consciência Negra");
  assert.equal(feriados2026.has("2026-12-25"), true, "Natal");
  // Sexta-feira santa em 2026 é 2026-04-03 (Páscoa 05/04/2026)
  assert.equal(feriados2026.has("2026-04-03"), true, "Sexta-feira Santa 2026");
});

test("ehDiaUtil identifica sábados, domingos e feriados", () => {
  // 2026-01-01 é feriado (quinta)
  assert.equal(ehDiaUtil("2026-01-01"), false);
  // 2026-01-02 é sexta-feira normal
  assert.equal(ehDiaUtil("2026-01-02"), true);
  // 2026-01-03 é sábado
  assert.equal(ehDiaUtil("2026-01-03"), false);
  // 2026-01-04 é domingo
  assert.equal(ehDiaUtil("2026-01-04"), false);
  // Suporte a feriado customizado corporativo
  assert.equal(ehDiaUtil("2026-01-02", ["2026-01-02"]), false);
});

test("proximoDiaUtil avança fins de semana e feriados", () => {
  // 2026-01-01 (feriado) -> pula para 2026-01-02 (sexta)
  assert.equal(proximoDiaUtil("2026-01-01"), "2026-01-02");
  // 2026-01-03 (sábado) -> pula para 2026-01-05 (segunda)
  assert.equal(proximoDiaUtil("2026-01-03"), "2026-01-05");
  // 2026-01-05 (segunda útil) -> mantém 2026-01-05
  assert.equal(proximoDiaUtil("2026-01-05"), "2026-01-05");
});

test("adicionarDiasUteis pula finais de semana e feriados", () => {
  // Sexta-feira 2026-01-02 + 1 dia útil -> Segunda-feira 2026-01-05
  assert.equal(adicionarDiasUteis("2026-01-02", 1), "2026-01-05");
  // Sexta-feira 2026-01-02 + 5 dias úteis -> 2026-01-09 (sexta seguinte)
  assert.equal(adicionarDiasUteis("2026-01-02", 5), "2026-01-09");
  // Se começar em feriado 2026-01-01 + 1 dia útil -> 2026-01-02 (sexta-feira útil)
  assert.equal(adicionarDiasUteis("2026-01-01", 1), "2026-01-02");
  // Se começar em feriado 2026-01-01 + 2 dias úteis -> 2026-01-05 (segunda-feira)
  assert.equal(adicionarDiasUteis("2026-01-01", 2), "2026-01-05");
});

test("calcularDiasUteisEntre conta apenas dias laborais", () => {
  // De sexta 2026-01-02 a segunda 2026-01-05 (2 dias úteis: dia 2 e dia 5)
  assert.equal(calcularDiasUteisEntre("2026-01-02", "2026-01-05"), 2);
});

test("calcularPrazoSugerido e empurrarPrazo com apenasDiasUteis", () => {
  // Sexta-feira 2026-01-02 + 2 dias úteis -> Terça-feira 2026-01-06
  assert.equal(calcularPrazoSugerido("2026-01-02", 2, { apenasDiasUteis: true }), "2026-01-06");
  // Empurrar prazo de sexta 2026-01-02 em 3 dias úteis -> Quarta 2026-01-07
  assert.equal(empurrarPrazo("2026-01-02", 3, { apenasDiasUteis: true }), "2026-01-07");
});

