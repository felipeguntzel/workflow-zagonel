import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as getFluxos } from "./index.js";
import { onRequestGet as getEtapas } from "./[id]/etapas.js";
import { gerarToken } from "../../_lib/sessao.js";

test("fluxos: onRequestGet retorna 401 para usuario nao autenticado", async () => {
  const context = {
    env: { DB: {}, SESSAO_SEGREDO: "segredo-teste" },
    request: new Request("http://localhost/api/fluxos"),
  };
  const res = await getFluxos(context);
  assert.equal(res.status, 401);
});

test("fluxos: onRequestGet permite acesso a usuario comum autenticado (ex: Comercial)", async () => {
  const token = await gerarToken(101, "segredo-teste");

  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          this.params = params;
          return this;
        },
        async first() {
          if (sql.includes("FROM usuarios WHERE id = ?")) {
            // Usuário comum (não admin, sem grupo de fluxos)
            return { id: 101, nome: "Usuario Comercial", admin: 0, deve_trocar_senha: 0 };
          }
          return null;
        },
        async all() {
          if (sql.includes("SELECT * FROM fluxo_templates")) {
            return {
              results: [
                { id: 1, nome: "Fluxo de Vendas", ativo: 1 },
                { id: 2, nome: "Desenvolvimento de Produtos", ativo: 1 },
              ],
            };
          }
          return { results: [] };
        },
        async run() {
          return { meta: {} };
        },
      };
    },
  };

  const context = {
    env: { DB: mockDb, SESSAO_SEGREDO: "segredo-teste" },
    request: new Request("http://localhost/api/fluxos", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  };

  const res = await getFluxos(context);
  assert.equal(res.status, 200);
  const dados = await res.json();
  assert.equal(Array.isArray(dados), true);
  assert.equal(dados.length, 2);
  assert.equal(dados[0].nome, "Fluxo de Vendas");
});

test("fluxos/[id]/etapas: onRequestGet permite acesso a usuario comum autenticado", async () => {
  const token = await gerarToken(101, "segredo-teste");

  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          this.params = params;
          return this;
        },
        async first() {
          if (sql.includes("FROM usuarios WHERE id = ?")) {
            return { id: 101, nome: "Usuario Comercial", admin: 0, deve_trocar_senha: 0 };
          }
          return null;
        },
        async all() {
          if (sql.includes("FROM etapas WHERE fluxo_template_id = ?")) {
            return {
              results: [
                { id: 10, fluxo_template_id: 1, nome: "Solicitação Inicial", eh_inicial: 1 },
                { id: 11, fluxo_template_id: 1, nome: "Aprovação Comercial", eh_inicial: 0 },
              ],
            };
          }
          return { results: [] };
        },
        async run() {
          return { meta: {} };
        },
      };
    },
  };

  const context = {
    env: { DB: mockDb, SESSAO_SEGREDO: "segredo-teste" },
    params: { id: "1" },
    request: new Request("http://localhost/api/fluxos/1/etapas", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  };

  const res = await getEtapas(context);
  assert.equal(res.status, 200);
  const dados = await res.json();
  assert.equal(Array.isArray(dados), true);
  assert.equal(dados.length, 2);
  assert.equal(dados[0].nome, "Solicitação Inicial");
});
