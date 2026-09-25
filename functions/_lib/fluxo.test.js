import test from "node:test";
import assert from "node:assert/strict";
import { resolverProximosChamados, estaBloqueado } from "./fluxo.js";

test("resolverProximosChamados creates one chamado for etapa_proxima_id, linked per etapa_proxima_vinculo=mae", () => {
  const etapa = { id: 2, etapa_proxima_id: 3, etapa_proxima_vinculo: "mae", acoes: [] };
  const triggering = { id: 20, chamado_mae_id: 10 };
  const resultado = resolverProximosChamados(etapa, triggering, {});
  assert.deepEqual(resultado, [
    { etapa_id: 3, acao_origem_id: null, setor_id: null, chamado_pai_id: 10, chamado_mae_id: 10 },
  ]);
});

test("resolverProximosChamados links to the immediate parent when etapa_proxima_vinculo=pai", () => {
  const etapa = { id: 1, etapa_proxima_id: 2, etapa_proxima_vinculo: "pai", acoes: [] };
  const triggering = { id: 10, chamado_mae_id: null };
  const resultado = resolverProximosChamados(etapa, triggering, {});
  assert.deepEqual(resultado, [
    { etapa_id: 2, acao_origem_id: null, setor_id: null, chamado_pai_id: 10, chamado_mae_id: 10 },
  ]);
});

test("resolverProximosChamados only creates chamados for ações marked true", () => {
  const etapa = {
    id: 3,
    etapa_proxima_id: null,
    etapa_proxima_vinculo: null,
    acoes: [
      { id: 1, setor_destino_id: 4, vinculo: "mae" },
      { id: 2, setor_destino_id: 4, vinculo: "mae" },
      { id: 3, setor_destino_id: 5, vinculo: "mae" },
    ],
  };
  const triggering = { id: 30, chamado_mae_id: 10 };
  const resultado = resolverProximosChamados(etapa, triggering, { 1: true, 2: false, 3: true });
  assert.deepEqual(resultado, [
    { etapa_id: null, acao_origem_id: 1, setor_id: 4, chamado_pai_id: 10, chamado_mae_id: 10 },
    { etapa_id: null, acao_origem_id: 3, setor_id: 5, chamado_pai_id: 10, chamado_mae_id: 10 },
  ]);
});

test("resolverProximosChamados uses chamado_pai_id=triggering.id for acao vinculo=pai", () => {
  const etapa = {
    id: 3,
    etapa_proxima_id: null,
    etapa_proxima_vinculo: null,
    acoes: [{ id: 1, setor_destino_id: 4, vinculo: "pai" }],
  };
  const triggering = { id: 30, chamado_mae_id: 10 };
  const resultado = resolverProximosChamados(etapa, triggering, { 1: true });
  assert.equal(resultado[0].chamado_pai_id, 30);
  assert.equal(resultado[0].chamado_mae_id, 10);
});

test("resolverProximosChamados returns [] when there is no next etapa and no ações", () => {
  const etapa = { id: 9, etapa_proxima_id: null, etapa_proxima_vinculo: null, acoes: [] };
  const resultado = resolverProximosChamados(etapa, { id: 90, chamado_mae_id: 10 }, {});
  assert.deepEqual(resultado, []);
});

test("estaBloqueado is false when the ação has no prerequisito", () => {
  assert.equal(estaBloqueado({ id: 1, prerequisito_acao_id: null }, []), false);
});

test("estaBloqueado is true when the prerequisite sibling chamado is not finalizado", () => {
  const acaoOrigem = { id: 2, prerequisito_acao_id: 1 };
  const irmaos = [{ acao_origem_id: 1, data_finalizacao: null }];
  assert.equal(estaBloqueado(acaoOrigem, irmaos), true);
});

test("estaBloqueado is false when the prerequisite sibling chamado is finalizado", () => {
  const acaoOrigem = { id: 2, prerequisito_acao_id: 1 };
  const irmaos = [{ acao_origem_id: 1, data_finalizacao: "2026-01-05" }];
  assert.equal(estaBloqueado(acaoOrigem, irmaos), false);
});

test("resolverProximosChamados creates chamados when acao is passed as object with marcado/selecionado", () => {
  const etapa = {
    id: 3,
    etapa_proxima_id: null,
    etapa_proxima_vinculo: null,
    acoes: [
      { id: 1, setor_destino_id: 4, vinculo: "mae" },
      { id: 2, setor_destino_id: 4, vinculo: "mae" },
    ],
  };
  const triggering = { id: 30, chamado_mae_id: 10 };
  const resultado = resolverProximosChamados(etapa, triggering, {
    1: { marcado: true, observacao: "Fazer com prioridade" },
    2: { marcado: false },
  });
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].acao_origem_id, 1);
});

