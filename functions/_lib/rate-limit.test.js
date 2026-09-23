import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_TENTATIVAS_LOGIN,
  verificarRateLimit,
  registrarFalhaLogin,
  limparTentativasLogin,
  desbloquearUsuario,
} from "./rate-limit.js";

function criarDbMock(dadosIniciais = {}) {
  let tabela = { ...dadosIniciais };
  return {
    prepare(query) {
      return {
        bind(...args) {
          return {
            async first() {
              if (query.includes("SELECT * FROM tentativas_login WHERE chave = ?")) {
                const chave = args[0];
                return tabela[chave] || null;
              }
              return null;
            },
            async run() {
              if (query.includes("INSERT INTO tentativas_login")) {
                const [chave, tentativas, bloqueado_ate, atualizado_em] = args;
                tabela[chave] = { chave, tentativas, bloqueado_ate, atualizado_em };
              } else if (query.includes("UPDATE tentativas_login")) {
                const [tentativas, bloqueado_ate, atualizado_em, chave] = args;
                if (tabela[chave]) {
                  tabela[chave] = { ...tabela[chave], tentativas, bloqueado_ate, atualizado_em };
                }
              } else if (query.includes("DELETE FROM tentativas_login")) {
                const chave = args[0];
                delete tabela[chave];
              }
              return { meta: { changes: 1 } };
            },
            async all() {
              return { results: Object.values(tabela) };
            },
          };
        },
      };
    },
  };
}

test("verificarRateLimit retorna nao bloqueado quando nao ha historico de falha", async () => {
  const db = criarDbMock();
  const res = await verificarRateLimit(db, "usuario_teste");
  assert.equal(res.bloqueado, false);
});

test("registrarFalhaLogin incrementa tentativas sem bloquear antes do limite maximo", async () => {
  const db = criarDbMock();
  assert.equal(MAX_TENTATIVAS_LOGIN, 3);
  const res1 = await registrarFalhaLogin(db, "usuario_teste");
  assert.equal(res1.tentativas, 1);
  assert.equal(res1.bloqueado, false);
  assert.equal(res1.tentativasRestantes, 2);

  const res2 = await registrarFalhaLogin(db, "usuario_teste");
  assert.equal(res2.tentativas, 2);
  assert.equal(res2.bloqueado, false);
  assert.equal(res2.tentativasRestantes, 1);
});

test("registrarFalhaLogin bloqueia o acesso quando atinge o limite maximo de tentativas", async () => {
  const db = criarDbMock();
  const agora = 1000000;

  for (let i = 1; i < MAX_TENTATIVAS_LOGIN; i++) {
    await registrarFalhaLogin(db, "usuario_alvo", agora);
  }

  const resFinal = await registrarFalhaLogin(db, "usuario_alvo", agora);
  assert.equal(resFinal.tentativas, MAX_TENTATIVAS_LOGIN);
  assert.equal(resFinal.bloqueado, true);
  assert.equal(resFinal.tentativasRestantes, 0);

  const checagem = await verificarRateLimit(db, "usuario_alvo", agora + 1000);
  assert.equal(checagem.bloqueado, true);
  assert.match(checagem.mensagem, /Acesso bloqueado por 3 tentativas incorretas/);
});

test("desbloquearUsuario libera o acesso bloqueado permanentemente", async () => {
  const db = criarDbMock();
  const agora = 1000000;

  for (let i = 1; i <= MAX_TENTATIVAS_LOGIN; i++) {
    await registrarFalhaLogin(db, "usuario_alvo", agora);
  }

  const checagemBloqueado = await verificarRateLimit(db, "usuario_alvo", agora + 99999999);
  assert.equal(checagemBloqueado.bloqueado, true);

  await desbloquearUsuario(db, "usuario_alvo");
  const checagemLiberado = await verificarRateLimit(db, "usuario_alvo", agora + 99999999);
  assert.equal(checagemLiberado.bloqueado, false);
});

test("limparTentativasLogin remove o historico da chave", async () => {
  const db = criarDbMock();
  await registrarFalhaLogin(db, "usuario_limpar");
  await limparTentativasLogin(db, "usuario_limpar");
  const checagem = await verificarRateLimit(db, "usuario_limpar");
  assert.equal(checagem.bloqueado, false);
});
