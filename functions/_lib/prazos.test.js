import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularPrazoSugerido,
  situacaoPrazo,
  calcularDiasAtraso,
  empurrarPrazo,
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
