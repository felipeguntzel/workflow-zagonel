import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularDataFechamentoMes,
  extrairAnoMes,
  verificarMesFechado,
  validarPermissaoAlteracaoApontamento,
} from "./apontamentos.js";

test("calcularDataFechamentoMes retorna o dia 01 do mês subsequente", () => {
  assert.equal(calcularDataFechamentoMes("2026-08"), "2026-09-01");
  assert.equal(calcularDataFechamentoMes("2026-09"), "2026-10-01");
  assert.equal(calcularDataFechamentoMes("2026-12"), "2027-01-01");
});

test("extrairAnoMes obtém YYYY-MM corretamente", () => {
  assert.equal(extrairAnoMes("2026-09-25"), "2026-09");
  assert.equal(extrairAnoMes("2026-01-01"), "2026-01");
});

test("verificarMesFechado fecha no dia 01 do mês seguinte", () => {
  // Competência 2026-08 fecha em 2026-09-01
  assert.equal(verificarMesFechado("2026-08", "2026-08-31"), false);
  assert.equal(verificarMesFechado("2026-08", "2026-09-01"), true);
  assert.equal(verificarMesFechado("2026-08", "2026-09-25"), true);

  // Competência 2026-09 ainda não fechou em 2026-09-25
  assert.equal(verificarMesFechado("2026-09", "2026-09-25"), false);
  assert.equal(verificarMesFechado("2026-09", "2026-10-01"), true);
});

test("validarPermissaoAlteracaoApontamento bloqueia usuário comum em mês fechado e libera admin", async () => {
  const mockDb = {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              return null; // Não liberado no banco
            },
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };

  const usuarioComum = { id: 10, nome: "João Operador", admin: 0 };
  const usuarioAdmin = { id: 1, nome: "Admin Chefe", admin: 1 };

  // Data de mês já fechado (2026-08)
  const checagemComum = await validarPermissaoAlteracaoApontamento(mockDb, "2026-08-15", usuarioComum);
  assert.equal(checagemComum.permitido, false);
  assert.match(checagemComum.motivo, /fechado em 01\/09\/2026/);

  // Admin sempre tem permissão mesmo em mês fechado
  const checagemAdmin = await validarPermissaoAlteracaoApontamento(mockDb, "2026-08-15", usuarioAdmin);
  assert.equal(checagemAdmin.permitido, true);

  // Mês aberto (2026-09 com data de hoje) é permitido para usuário comum
  const checagemAberto = await validarPermissaoAlteracaoApontamento(mockDb, "2026-09-25", usuarioComum);
  assert.equal(checagemAberto.permitido, true);
});
