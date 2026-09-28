import test from "node:test";
import assert from "node:assert/strict";
import { registrarAuditoriaSistema, listarAuditoriaSistema } from "./auditoria.js";

function criarDbMockAuditoria() {
  const registros = [];
  return {
    registros,
    prepare(query) {
      return {
        bind(...args) {
          return {
            async run() {
              if (query.includes("INSERT INTO auditoria_sistema")) {
                const [usuario_id, usuario_nome, entidade, entidade_id, acao, detalhes, dados_antigos, dados_novos, criado_em] = args;
                const novo = {
                  id: registros.length + 1,
                  usuario_id,
                  usuario_nome,
                  entidade,
                  entidade_id,
                  acao,
                  detalhes,
                  dados_antigos,
                  dados_novos,
                  criado_em,
                };
                registros.push(novo);
              }
              return { meta: { changes: 1 } };
            },
            async all() {
              let resultado = [...registros];
              if (query.includes("WHERE")) {
                let argIdx = 0;
                if (query.includes("entidade = ?")) {
                  const ent = args[argIdx++];
                  resultado = resultado.filter((r) => r.entidade === ent);
                }
                if (query.includes("usuario_id = ?")) {
                  const uId = args[argIdx++];
                  resultado = resultado.filter((r) => r.usuario_id === uId);
                }
                if (query.includes("acao = ?")) {
                  const ac = args[argIdx++];
                  resultado = resultado.filter((r) => r.acao === ac);
                }
              }
              return { results: resultado };
            },
          };
        },
      };
    },
  };
}

test("registrarAuditoriaSistema armazena acao administrativa com dados antigos e novos", async () => {
  const db = criarDbMockAuditoria();
  await registrarAuditoriaSistema(db, {
    usuario_id: 5,
    usuario_nome: "Administrador",
    entidade: "setores",
    entidade_id: 12,
    acao: "edicao",
    detalhes: "Setor renomeado",
    dados_antigos: { id: 12, nome: "Antigo" },
    dados_novos: { id: 12, nome: "Novo" },
  });

  assert.equal(db.registros.length, 1);
  const reg = db.registros[0];
  assert.equal(reg.entidade, "setores");
  assert.equal(reg.entidade_id, 12);
  assert.equal(reg.acao, "edicao");
  assert.equal(reg.usuario_id, 5);
  assert.match(reg.dados_antigos, /Antigo/);
  assert.match(reg.dados_novos, /Novo/);
});

test("listarAuditoriaSistema filtra por entidade e acao", async () => {
  const db = criarDbMockAuditoria();
  await registrarAuditoriaSistema(db, {
    usuario_id: 1,
    usuario_nome: "Admin",
    entidade: "usuarios",
    entidade_id: 2,
    acao: "insercao",
    detalhes: "Novo usuario",
  });
  await registrarAuditoriaSistema(db, {
    usuario_id: 1,
    usuario_nome: "Admin",
    entidade: "empresas",
    entidade_id: 3,
    acao: "exclusao",
    detalhes: "Empresa excluida",
  });

  const logsUsuarios = await listarAuditoriaSistema(db, { entidade: "usuarios" });
  assert.equal(logsUsuarios.length, 1);
  assert.equal(logsUsuarios[0].entidade, "usuarios");

  const logsExclusao = await listarAuditoriaSistema(db, { acao: "exclusao" });
  assert.equal(logsExclusao.length, 1);
  assert.equal(logsExclusao[0].entidade, "empresas");
});

test("registrarAuditoria espelha eventos de chamados em auditoria_sistema", async () => {
  const { registrarAuditoria } = await import("./auditoria.js");
  const sqls = [];
  const db = {
    prepare(query) {
      return {
        bind(...args) {
          sqls.push({ query, args });
          return {
            async run() {
              return { meta: { changes: 1 } };
            },
            async all() {
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

  await registrarAuditoria(db, {
    chamado_mae_id: 10,
    chamado_id: 11,
    usuario_id: 2,
    usuario_nome: "Maria",
    acao: "decisao_aprovada",
    detalhes: 'Etapa "Aprovação" APROVADA por Maria.',
  });

  const temHistorico = sqls.some((s) => s.query.includes("INSERT INTO historico_auditoria"));
  const temSistema = sqls.some((s) => s.query.includes("INSERT INTO auditoria_sistema"));
  assert.ok(temHistorico, "Deve registrar em historico_auditoria");
  assert.ok(temSistema, "Deve espelhar em auditoria_sistema");

  const regSistema = sqls.find((s) => s.query.includes("INSERT INTO auditoria_sistema"));
  assert.equal(regSistema.args[2], "chamados"); // entidade
  assert.equal(regSistema.args[3], 11);         // entidade_id
  assert.equal(regSistema.args[4], "decisao_aprovada"); // acao
});

test("excluirLogsAuditoria apaga registros de auditoria_sistema e historico_auditoria", async () => {
  const { excluirLogsAuditoria } = await import("./auditoria.js");
  const sqls = [];
  const db = {
    prepare(query) {
      return {
        bind(...args) {
          sqls.push({ query, args });
          return {
            async run() {
              return { meta: { changes: 5 } };
            },
          };
        },
      };
    },
  };

  const removidos = await excluirLogsAuditoria(db, { tudo: true });
  assert.ok(removidos >= 5);
  const deletouSistema = sqls.some((s) => s.query.includes("DELETE FROM auditoria_sistema"));
  const deletouHistorico = sqls.some((s) => s.query.includes("DELETE FROM historico_auditoria"));
  assert.ok(deletouSistema, "Deve deletar de auditoria_sistema");
  assert.ok(deletouHistorico, "Deve deletar de historico_auditoria quando tudo=true");
});

test("listarAuditoriaDoChamado normaliza nomes de fluxo e etapas legados no historico unificado", async () => {
  const { listarAuditoriaDoChamado } = await import("./auditoria.js");
  let sqlHistoricoCapturado = "";
  const db = {
    prepare(query) {
      return {
        bind(...args) {
          return {
            async first() {
              if (query.includes("ft.nome AS fluxo_nome")) {
                return { id: 10, fluxo_template_id: 1, fluxo_nome: "Produto Derivado", etapa_nome: "Solicitação Inicial" };
              }
              return null;
            },
            async all() {
              if (query.includes("c.acao_origem_id")) {
                return {
                  results: [
                    { id: 10, etapa_id: 1, etapa_nome: "Solicitação Inicial", acao_rotulo: null, titulo: "Solicitação Inicial", eh_mae: 1 },
                    { id: 11, etapa_id: 2, etapa_nome: "Aprovação Projetos", acao_rotulo: null, titulo: "Aprovação Projetos", eh_mae: 0 },
                    { id: 12, etapa_id: 3, etapa_nome: "Aprovação Desenvolvimento de Produto", acao_rotulo: null, titulo: "Aprovação Desenvolvimento de Produto", eh_mae: 0 },
                  ],
                };
              }
              if (query.includes("FROM historico_auditoria")) {
                sqlHistoricoCapturado = query;
                return {
                  results: [
                    { id: 1, chamado_id: 10, usuario_id: 2, usuario_nome: "Felipe", acao: "criacao", detalhes: 'Chamado mãe criado por Felipe com base no fluxo "Solicitação Inicial".' },
                    { id: 2, chamado_id: 11, usuario_id: null, usuario_nome: "Sistema", acao: "criacao_subchamado", detalhes: "Subchamado #11 gerado pela aprovação da etapa #10." },
                    { id: 3, chamado_id: 11, usuario_id: 3, usuario_nome: "Carlos", acao: "decisao_aprovada", detalhes: "Etapa #11 APROVADA por Carlos." },
                    { id: 4, chamado_id: 12, usuario_id: null, usuario_nome: "Sistema", acao: "criacao_subchamado", detalhes: "Subchamado #12 gerado automaticamente pelo fluxo." },
                  ],
                };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };

  const lista = await listarAuditoriaDoChamado(db, 10);
  assert.equal(lista.length, 4);

  // 1. Abertura do chamado deve exibir fluxo "Produto Derivado" e etapa inicial "Solicitação Inicial"
  assert.equal(lista[0].detalhes, 'Chamado aberto por Felipe no fluxo "Produto Derivado" (Etapa: "Solicitação Inicial").');

  // 2. Subchamado gerado por aprovação deve exibir etapa destino e etapa origem
  assert.equal(lista[1].detalhes, 'Etapa "Aprovação Projetos" iniciada pela aprovação da etapa "Solicitação Inicial".');

  // 3. Decisão aprovada deve exibir o nome da etapa e não o ID cru
  assert.equal(lista[2].detalhes, 'Etapa "Aprovação Projetos" APROVADA por Carlos.');

  // 4. Subchamado automático deve exibir o nome da etapa
  assert.equal(lista[3].detalhes, 'Etapa "Aprovação Desenvolvimento de Produto" iniciada automaticamente pelo fluxo.');
  assert.ok(sqlHistoricoCapturado.includes("ORDER BY h.criado_em DESC, h.id DESC"), "Deve ordenar do mais recente para o menos recente");
});

