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
