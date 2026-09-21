import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureRecuperacaoTabela,
  gerarSolicitacaoRecuperacao,
  validarTokenRecuperacao,
  redefinirSenhaComToken,
} from "./recuperacao.js";

test("gerarSolicitacaoRecuperacao lança erro se identificador for vazio", async () => {
  const dbMock = {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ meta: {} }),
      }),
    }),
  };
  await assert.rejects(
    async () => {
      await gerarSolicitacaoRecuperacao(dbMock, "", "http://localhost");
    },
    { message: "Informe seu login ou e-mail cadastrado." }
  );
});

test("gerarSolicitacaoRecuperacao lança erro se usuário não for encontrado", async () => {
  const dbMock = {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ meta: {} }),
      }),
    }),
  };
  await assert.rejects(
    async () => {
      await gerarSolicitacaoRecuperacao(dbMock, "naoexiste", "http://localhost");
    },
    { message: "Usuário ou e-mail não encontrado no sistema." }
  );
});

test("gerarSolicitacaoRecuperacao lança erro se usuário não tiver e-mail", async () => {
  const dbMock = {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: [] }),
        first: async () => ({ id: 1, nome: "Carlos", login: "carlos", email: null }),
        run: async () => ({ meta: {} }),
      }),
    }),
  };
  await assert.rejects(
    async () => {
      await gerarSolicitacaoRecuperacao(dbMock, "carlos", "http://localhost");
    },
    (err) => err.message.includes("não possui um e-mail cadastrado")
  );
});

test("gerarSolicitacaoRecuperacao gera token e mascara e-mail quando usuário possui e-mail", async () => {
  const queries = [];
  const dbMock = {
    prepare: (sql) => ({
      bind: (...args) => ({
        all: async () => ({ results: [] }),
        first: async () => ({ id: 2, nome: "Felipe", login: "felipe", email: "felipe@zagonel.com.br" }),
        run: async () => {
          queries.push({ sql, args });
          return { meta: {} };
        },
      }),
    }),
  };

  const res = await gerarSolicitacaoRecuperacao(dbMock, "felipe", "https://app.zagonel.com.br");
  assert.equal(res.sucesso, true);
  assert.match(res.email_mascarado, /f\*\*\*e@zagonel\.com\.br/);
  assert.match(res.link_recuperacao, /https:\/\/app\.zagonel\.com\.br\/redefinir-senha\.html\?token=[0-9a-f]{48}/);
});

test("redefinirSenhaComToken rejeita senha que nao cumpre politica de complexidade", async () => {
  const dbMock = {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: [] }),
        first: async () => ({
          id: 1,
          usuario_id: 10,
          token: "tokenteste",
          expira_em: new Date(Date.now() + 60000).toISOString(),
          usado: 0,
          usuario_nome: "Admin",
          usuario_login: "admin",
        }),
        run: async () => ({ meta: {} }),
      }),
    }),
  };

  await assert.rejects(
    async () => {
      await redefinirSenhaComToken(dbMock, "tokenteste", "fraca123");
    },
    (err) => /maiúscula|especial/.test(err.message)
  );
});

test("redefinirSenhaComToken aceita senha forte valida", async () => {
  const updates = [];
  const dbMock = {
    prepare: (sql) => ({
      bind: (...args) => ({
        all: async () => ({ results: [] }),
        first: async () => ({
          id: 1,
          usuario_id: 10,
          token: "tokenteste",
          expira_em: new Date(Date.now() + 60000).toISOString(),
          usado: 0,
          usuario_nome: "Admin",
          usuario_login: "admin",
        }),
        run: async () => {
          updates.push({ sql, args });
          return { meta: {} };
        },
      }),
    }),
  };

  const res = await redefinirSenhaComToken(dbMock, "tokenteste", "SenhaForte@2026");
  assert.equal(res.sucesso, true);
  assert.equal(updates.length, 2);
  assert.match(updates[0].sql, /token_valido_apos/);
});
