import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "./index.js";

function criarMockDbRelatorios() {
  const setores = [
    { id: 1, nome: "Engenharia", empresa_id: 1, prazo_padrao_dias: 5 },
    { id: 2, nome: "Qualidade", empresa_id: 1, prazo_padrao_dias: 3 },
  ];

  const chamados = [
    {
      id: 1,
      chamado_mae_id: null,
      chamado_pai_id: null,
      empresa_id: 1,
      status_id: 2,
      status_nome: "em andamento",
      data_abertura: "2026-01-01",
      prazo: "2026-01-05", // vencido em relação a hoje
      data_finalizacao: null,
      setor_id: 1,
      setor_nome: "Engenharia",
    },
    {
      id: 2,
      chamado_mae_id: 1,
      chamado_pai_id: 1,
      empresa_id: 1,
      status_id: 2,
      status_nome: "em andamento",
      data_abertura: "2026-01-02",
      prazo: "2026-01-06", // vencido
      data_finalizacao: null,
      setor_id: 1,
      setor_nome: "Engenharia",
    },
    {
      id: 3,
      chamado_mae_id: null,
      chamado_pai_id: null,
      empresa_id: 1,
      status_id: 4,
      status_nome: "finalizado",
      data_abertura: "2026-01-10",
      prazo: "2026-01-15",
      data_finalizacao: "2026-01-14", // no prazo, 4 dias
      setor_id: 2,
      setor_nome: "Qualidade",
    },
  ];

  return {
    prepare(query) {
      return {
        bind(...args) {
          return {
            async all() {
              if (query.includes("FROM setores")) {
                return { results: setores };
              }
              if (query.includes("FROM chamados")) {
                let res = [...chamados];
                if (query.includes("c.empresa_id = ?")) {
                  const empId = args[0];
                  res = res.filter((c) => c.empresa_id === empId);
                }
                return { results: res };
              }
              return { results: [] };
            },
            async first() {
              return null;
            },
          };
        },
      };
    },
  };
}

test("onRequestGet retorna relatórios agregados por setor e identifica gargalos", async () => {
  const db = criarMockDbRelatorios();
  const context = {
    request: new Request("https://workflow.teste/api/relatorios"),
    env: {
      DB: db,
      SESSAO_SEGREDO: "segredo-teste",
    },
  };

  // Mock de usuário admin autenticado
  const { gerarToken } = await import("../../_lib/sessao.js");
  const token = await gerarToken(999, "segredo-teste");

  // Injeta usuário admin no mock de first para obterPermissoesDoUsuario
  const originalPrepare = db.prepare.bind(db);
  db.prepare = (query) => {
    const prep = originalPrepare(query);
    return {
      bind(...args) {
        const bound = prep.bind(...args);
        return {
          ...bound,
          async first() {
            if (query.includes("FROM usuarios WHERE id = ?")) {
              return { id: 999, nome: "Admin Teste", admin: 1, setor_id: 1 };
            }
            return null;
          },
        };
      },
    };
  };

  context.request.headers.set("Authorization", `Bearer ${token}`);

  const resposta = await onRequestGet(context);
  assert.equal(resposta.status, 200);

  const dados = await resposta.json();
  assert.ok(dados.metricas_gerais);
  assert.equal(dados.metricas_gerais.total_chamados, 3);
  assert.equal(dados.metricas_gerais.tarefas_mae, 2);
  assert.equal(dados.metricas_gerais.finalizados, 1);
  assert.equal(dados.metricas_gerais.em_andamento, 2);

  // Engenharia tem 2 chamados vencidos -> detectado como gargalo
  const engenharia = dados.setores.find((s) => s.setor_id === 1);
  assert.ok(engenharia);
  assert.equal(engenharia.eh_gargalo, true);
  assert.equal(engenharia.atrasados, 2);

  // Qualidade tem 1 finalizado em 4 dias
  const qualidade = dados.setores.find((s) => s.setor_id === 2);
  assert.ok(qualidade);
  assert.equal(qualidade.finalizados, 1);
  assert.equal(qualidade.tempo_medio_dias, 4);
  assert.equal(qualidade.taxa_pontualidade, 100);
});
