import test from "node:test";
import assert from "node:assert/strict";
import { obterPermissoesDoUsuario } from "./permissoes.js";

function criarDbMockPermissoes({ admin = 0, gruposUsuario = [], grupos = {}, permissoesPorGrupo = {} }) {
  return {
    prepare(query) {
      return {
        bind(...args) {
          return {
            async first() {
              if (query.includes("SELECT admin FROM usuarios WHERE id = ?")) {
                return { admin };
              }
              if (query.includes("SELECT grupo_pai_id FROM grupos_permissao WHERE id = ?")) {
                const id = args[0];
                return grupos[id] ? { grupo_pai_id: grupos[id].grupo_pai_id } : null;
              }
              return null;
            },
            async all() {
              if (query.includes("SELECT grupo_id FROM usuario_grupos WHERE usuario_id = ?")) {
                return { results: gruposUsuario.map((id) => ({ grupo_id: id })) };
              }
              if (query.includes("permissoes p") && query.includes("grupo_id IN")) {
                const linhas = [];
                for (const gId of args) {
                  const perms = permissoesPorGrupo[gId] || [];
                  linhas.push(...perms);
                }
                return { results: linhas };
              }
              return { results: [] };
            },
            async run() {
              return { meta: {} };
            },
          };
        },
      };
    },
  };
}

test("obterPermissoesDoUsuario libera todas as telas para administrador", async () => {
  const db = criarDbMockPermissoes({ admin: 1 });
  const p = await obterPermissoesDoUsuario(db, 1);
  assert.equal(p.empresas.visualizar, true);
  assert.equal(p.chamados.ver_todos_setores, true);
  assert.equal(p.fluxos.excluir, true);
});

test("obterPermissoesDoUsuario herda permissoes do grupo pai", async () => {
  // Grupo 1 (Filho) tem apenas visualizar em chamados
  // Grupo 2 (Pai) tem visualizar e editar em empresas
  const db = criarDbMockPermissoes({
    admin: 0,
    gruposUsuario: [1],
    grupos: {
      1: { grupo_pai_id: 2 },
      2: { grupo_pai_id: null },
    },
    permissoesPorGrupo: {
      1: [{ tela: "chamados", visualizar: 1, inserir: 0, editar: 0, excluir: 0, ver_todos_setores: 0 }],
      2: [{ tela: "empresas", visualizar: 1, inserir: 0, editar: 1, excluir: 0, ver_todos_setores: 0 }],
    },
  });

  const p = await obterPermissoesDoUsuario(db, 10);
  assert.equal(p.chamados.visualizar, true);
  assert.equal(p.empresas.visualizar, true);
  assert.equal(p.empresas.editar, true);
  assert.equal(p.empresas.excluir, false);
});

test("obterPermissoesDoUsuario lida com ciclos de heranca sem loop infinito", async () => {
  // Grupo 1 aponta para Grupo 2, e Grupo 2 aponta para Grupo 1
  const db = criarDbMockPermissoes({
    admin: 0,
    gruposUsuario: [1],
    grupos: {
      1: { grupo_pai_id: 2 },
      2: { grupo_pai_id: 1 },
    },
    permissoesPorGrupo: {
      1: [{ tela: "status", visualizar: 1, inserir: 0, editar: 0, excluir: 0, ver_todos_setores: 0 }],
      2: [{ tela: "setores", visualizar: 1, inserir: 0, editar: 0, excluir: 0, ver_todos_setores: 0 }],
    },
  });

  const p = await obterPermissoesDoUsuario(db, 20);
  assert.equal(p.status.visualizar, true);
  assert.equal(p.setores.visualizar, true);
});
