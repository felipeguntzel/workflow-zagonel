import test from "node:test";
import assert from "node:assert/strict";
import {
  salvarConsulta,
  excluirConsulta,
  definirConsultaPadrao,
  obterConsultaPadraoId,
  listarConsultas,
} from "./consultas.js";

test("salvarConsulta valida nome obrigatório", async () => {
  const mockDb = {
    prepare() {
      return {
        bind() {
          return {
            async run() { return { meta: {} }; },
            async first() { return null; },
            async all() { return { results: [] }; }
          };
        }
      };
    }
  };

  await assert.rejects(
    () => salvarConsulta(mockDb, { usuarioId: 1, nome: "" }),
    /nome da consulta é obrigatório/
  );
  await assert.rejects(
    () => salvarConsulta(mockDb, { usuarioId: 1, nome: "   " }),
    /nome da consulta é obrigatório/
  );
});

test("salvarConsulta insere nova consulta e permite definir como padrão", async () => {
  let consultaSalva = null;
  let padraoSalvo = null;

  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async run() {
              if (sql.includes("INSERT INTO consultas_salvas")) {
                consultaSalva = {
                  id: 10,
                  usuario_id: params[0],
                  tela: params[1],
                  nome: params[2],
                  filtros_json: params[3],
                  eh_publica: params[4],
                };
                return { meta: { last_row_id: 10 } };
              }
              if (sql.includes("INSERT INTO consultas_padrao_usuario")) {
                padraoSalvo = { usuario_id: params[0], tela: params[1], consulta_id: params[2] };
                return { meta: { changes: 1 } };
              }
              return { meta: {} };
            },
            async first() {
              if (sql.includes("SELECT id, eh_publica, usuario_id FROM consultas_salvas")) {
                return { id: 10, eh_publica: 1, usuario_id: 1 };
              }
              if (sql.includes("SELECT c.*, u.nome AS autor_nome")) {
                return { ...consultaSalva, autor_nome: "Admin Teste" };
              }
              return null;
            },
            async all() { return { results: [] }; },
          };
        },
      };
    },
  };

  const res = await salvarConsulta(mockDb, {
    usuarioId: 1,
    tela: "chamados",
    nome: "Chamados Urgentes",
    filtros_json: { status: "ativos", setor: "Engenharia" },
    eh_publica: 1,
    definir_como_padrao: true,
  });

  assert.equal(res.id, 10);
  assert.equal(res.nome, "Chamados Urgentes");
  assert.equal(padraoSalvo.consulta_id, 10);
});

test("definirConsultaPadrao impede definir consulta privada de outro usuário", async () => {
  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes("SELECT id, eh_publica, usuario_id FROM consultas_salvas")) {
                // Consulta privada criada pelo usuário 99
                return { id: 20, eh_publica: 0, usuario_id: 99 };
              }
              return null;
            },
            async run() { return { meta: {} }; },
          };
        },
      };
    },
  };

  await assert.rejects(
    () => definirConsultaPadrao(mockDb, "chamados", 15, 20),
    /Você não tem acesso a esta consulta/
  );
});

test("obterConsultaPadraoId retorna id salvo ou null", async () => {
  const mockDb = {
    prepare() {
      return {
        bind(tela, usuarioId) {
          return {
            async first() {
              if (usuarioId === 1) return { consulta_id: 42 };
              return null;
            },
          };
        },
      };
    },
  };

  const padrao1 = await obterConsultaPadraoId(mockDb, "chamados", 1);
  assert.equal(padrao1, 42);

  const padrao2 = await obterConsultaPadraoId(mockDb, "chamados", 2);
  assert.equal(padrao2, null);
});

test("salvarConsulta atualiza consulta existente apenas se for o autor", async () => {
  let consultaAtualizada = null;
  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes("SELECT * FROM consultas_salvas WHERE id = ?")) {
                return { id: 10, usuario_id: 1, nome: "Antigo", filtros_json: "{}", eh_publica: 0 };
              }
              if (sql.includes("SELECT c.*, u.nome AS autor_nome")) {
                return { ...consultaAtualizada, autor_nome: "Autor" };
              }
              return null;
            },
            async run() {
              if (sql.includes("UPDATE consultas_salvas")) {
                consultaAtualizada = {
                  id: params[4],
                  nome: params[0],
                  filtros_json: params[1],
                  eh_publica: params[2],
                };
                return { meta: { changes: 1 } };
              }
              return { meta: {} };
            },
            async all() { return { results: [] }; },
          };
        },
      };
    },
  };

  // Usuário diferente tentando editar
  await assert.rejects(
    () => salvarConsulta(mockDb, { id: 10, usuarioId: 2, nome: "Novo Nome" }),
    /Você só pode editar consultas criadas por você/
  );

  // Autor editando
  const res = await salvarConsulta(mockDb, { id: 10, usuarioId: 1, nome: "Novo Nome", eh_publica: 1 });
  assert.equal(res.nome, "Novo Nome");
  assert.equal(res.eh_publica, 1);
});

test("excluirConsulta permite somente o autor excluir (nem admin de outro ID pode)", async () => {
  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes("SELECT * FROM consultas_salvas")) {
                return { id: 5, usuario_id: 99, nome: "Consulta do Usuário 99" };
              }
              return null;
            },
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };

  const usuarioOutro = { id: 10, admin: 0 };
  await assert.rejects(
    () => excluirConsulta(mockDb, 5, usuarioOutro),
    /Você só pode excluir consultas criadas por você/
  );

  const usuarioAdminNaoAutor = { id: 1, admin: 1 };
  await assert.rejects(
    () => excluirConsulta(mockDb, 5, usuarioAdminNaoAutor),
    /Você só pode excluir consultas criadas por você/
  );

  const usuarioAutor = { id: 99, admin: 0 };
  const okAutor = await excluirConsulta(mockDb, 5, usuarioAutor);
  assert.equal(okAutor, true);
});
