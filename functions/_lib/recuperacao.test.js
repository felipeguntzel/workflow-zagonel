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

test("gerarSolicitacaoRecuperacao lança erro claro se RESEND_API_KEY não estiver configurada", async () => {
  const dbMock = {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: [] }),
        first: async () => ({ id: 2, nome: "Felipe", login: "felipe", email: "felipe@zagonel.com.br" }),
        run: async () => ({ meta: {} }),
      }),
    }),
  };

  await assert.rejects(
    async () => {
      await gerarSolicitacaoRecuperacao(dbMock, "felipe", "https://app.zagonel.com.br", {});
    },
    (err) => err.message.includes("RESEND_API_KEY")
  );
});

test("gerarSolicitacaoRecuperacao gera token e dispara e-mail com sucesso quando serviço configurado", async () => {
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

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true });

  try {
    const res = await gerarSolicitacaoRecuperacao(
      dbMock,
      "felipe",
      "https://app.zagonel.com.br",
      { RESEND_API_KEY: "re_test_123" }
    );
    assert.equal(res.sucesso, true);
    assert.match(res.email_mascarado, /f\*\*\*e@zagonel\.com\.br/);
    assert.equal(res.link_recuperacao, undefined);
    assert.equal(res.email_enviado, true);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
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
      await redefinirSenhaComToken(dbMock, "tokenteste", "12345");
    },
    (err) => /mínimo 6|sequência de 1 em 1|repetidos/.test(err.message)
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

  const res = await redefinirSenhaComToken(dbMock, "tokenteste", "Nova@2026");
  assert.equal(res.sucesso, true);
  assert.ok(updates.length >= 2);
  assert.match(updates[0].sql, /token_valido_apos/);
});
