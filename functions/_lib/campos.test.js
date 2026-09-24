import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizarTipoCampo,
  obterTabelaCampos,
  salvarCampoEtapa,
  validarCamposObrigatorios,
  salvarValoresCamposChamado,
  carregarCamposEValoresDoChamado
} from "./campos.js";

test("normalizarTipoCampo converte tipos para os nomes aceitos pelo SQLite D1", () => {
  assert.equal(normalizarTipoCampo("texto"), "texto");
  assert.equal(normalizarTipoCampo("texto_longo"), "textarea");
  assert.equal(normalizarTipoCampo("textarea"), "textarea");
  assert.equal(normalizarTipoCampo("selecao"), "select");
  assert.equal(normalizarTipoCampo("select"), "select");
  assert.equal(normalizarTipoCampo("numero"), "numero");
  assert.equal(normalizarTipoCampo("data"), "data");
  assert.equal(normalizarTipoCampo("checkbox"), "checkbox");
  assert.equal(normalizarTipoCampo("sim_nao"), "sim_nao");
});

test("obterTabelaCampos resolve campos_etapa ou etapa_campos de forma transparente", async () => {
  let executedSql = [];
  const mockDb = {
    prepare(sql) {
      return {
        bind() { return this; },
        async run() {
          executedSql.push(sql);
          if (sql.includes("SELECT 1 FROM campos_etapa")) {
            throw new Error("no such table: campos_etapa");
          }
          if (sql.includes("SELECT 1 FROM etapa_campos")) {
            return { meta: {} };
          }
          return { meta: {} };
        },
        async all() { return { results: [] }; }
      };
    }
  };

  const tabela = await obterTabelaCampos(mockDb);
  assert.ok(tabela === "campos_etapa" || tabela === "etapa_campos");
});

test("salvarCampoEtapa normaliza e insere campo de etapa de forma segura", async () => {
  let insertSql = "";
  let insertParams = [];
  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          insertSql = sql;
          insertParams = params;
          return this;
        },
        async run() {
          return { meta: { last_row_id: 10 } };
        },
        async all() {
          return {
            results: [
              { name: "id", type: "INTEGER", pk: 1 },
              { name: "etapa_id", type: "INTEGER" },
              { name: "nome", type: "TEXT" },
              { name: "rotulo", type: "TEXT" },
              { name: "tipo", type: "TEXT" },
              { name: "obrigatorio", type: "INTEGER" },
              { name: "opcoes", type: "TEXT" }
            ]
          };
        },
        async first() {
          return {
            id: 10,
            etapa_id: 2,
            nome: "produto_referencia",
            rotulo: "Produto de Referência",
            tipo: "texto",
            obrigatorio: 1,
            opcoes: null
          };
        }
      };
    }
  };

  const salvo = await salvarCampoEtapa(mockDb, 2, {
    nome: "Produto Referencia",
    rotulo: "Produto de Referência",
    tipo: "texto",
    obrigatorio: true
  });

  assert.equal(salvo.id, 10);
  assert.equal(salvo.etapa_id, 2);
  assert.equal(salvo.tipo, "texto");
});

test("validarCamposObrigatorios identifica campos faltando e aceita por nome ou ID", () => {
  const campos = [
    { id: 1, nome: "modelo", rotulo: "Modelo do Produto", obrigatorio: 1 },
    { id: 2, nome: "observacoes", rotulo: "Observações", obrigatorio: 0 },
    { id: 3, nome: "voltagem", rotulo: "Voltagem", obrigatorio: 1 },
  ];

  // Caso 1: faltando todos
  const r1 = validarCamposObrigatorios(campos, {});
  assert.equal(r1.valido, false);
  assert.match(r1.erro, /Modelo do Produto/);

  // Caso 2: preenchido apenas um obrigatório por nome
  const r2 = validarCamposObrigatorios(campos, { modelo: "Ducha Eletrônica" });
  assert.equal(r2.valido, false);
  assert.match(r2.erro, /Voltagem/);

  // Caso 3: preenchido por nome
  const r3 = validarCamposObrigatorios(campos, { modelo: "Ducha Eletrônica", voltagem: "220V" });
  assert.equal(r3.valido, true);

  // Caso 4: preenchido por ID numérico
  const r4 = validarCamposObrigatorios(campos, { 1: "Ducha", 3: "127V" });
  assert.equal(r4.valido, true);

  // Caso 5: valor apenas com espaços é considerado vazio
  const r5 = validarCamposObrigatorios(campos, { modelo: "   ", voltagem: "220V" });
  assert.equal(r5.valido, false);
});

test("salvarValoresCamposChamado grava valores usando chave por nome ou ID numérico", async () => {
  const gravacoes = [];
  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          this.params = params;
          return this;
        },
        async run() {
          if (sql.includes("INSERT INTO chamado_campos_valores")) {
            gravacoes.push({ sql, params: this.params });
          }
          return { meta: {} };
        },
        async all() {
          if (sql.includes("SELECT * FROM campos_etapa WHERE etapa_id = ?")) {
            return {
              results: [
                { id: 101, etapa_id: 5, nome: "codigo_peca", rotulo: "Código", tipo: "texto", obrigatorio: 0 },
                { id: 102, etapa_id: 5, nome: "quantidade", rotulo: "Qtd", tipo: "numero", obrigatorio: 1 },
              ]
            };
          }
          return { results: [] };
        },
        async first() {
          return null;
        }
      };
    }
  };

  // Enviar valores usando o nome do campo
  await salvarValoresCamposChamado(
    mockDb,
    10,
    { codigo_peca: "ABC-123", quantidade: "50" },
    5
  );

  assert.equal(gravacoes.length, 2);
  const gravadosIds = gravacoes.map((g) => g.params[1]); // params: [chamadoId, campoId, valor]
  assert.ok(gravadosIds.includes(101));
  assert.ok(gravadosIds.includes(102));
});

test("carregarCamposEValoresDoChamado combina campos e valores com parsing de opções", async () => {
  const mockDb = {
    prepare(sql) {
      return {
        bind() { return this; },
        async run() { return { meta: {} }; },
        async all() {
          if (sql.includes("SELECT * FROM campos_etapa WHERE etapa_id = ?")) {
            return {
              results: [
                { id: 20, etapa_id: 1, nome: "cor", rotulo: "Cor", tipo: "select", opcoes: '["Branco","Preto"]', obrigatorio: 1 }
              ]
            };
          }
          if (sql.includes("SELECT campo_id, valor FROM chamado_campos_valores WHERE chamado_id = ?")) {
            return {
              results: [
                { campo_id: 20, valor: "Preto" }
              ]
            };
          }
          return { results: [] };
        },
        async first() { return null; }
      };
    }
  };

  const resultado = await carregarCamposEValoresDoChamado(mockDb, 99, 1);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].nome, "cor");
  assert.equal(resultado[0].valor, "Preto");
  assert.deepEqual(resultado[0].opcoes_parsed, ["Branco", "Preto"]);
});

test("validarCamposObrigatorios valida regra de dias_minimos para campos do tipo data", () => {
  const campos = [
    { id: 10, nome: "data_faturamento", rotulo: "Data de Faturamento", tipo: "data", obrigatorio: 1, dias_minimos: 7 }
  ];

  const hoje = new Date();
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1).toISOString().slice(0, 10);
  const daqui3Dias = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 3).toISOString().slice(0, 10);
  const daqui8Dias = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 8).toISOString().slice(0, 10);

  // Caso 1: Data de ontem (passado) deve ser rejeitada
  const rPassado = validarCamposObrigatorios(campos, { data_faturamento: ontem });
  assert.equal(rPassado.valido, false);
  assert.match(rPassado.erro, /não pode ser anterior a/);

  // Caso 2: Data de daqui a 3 dias (menor que o mínimo de 7) deve ser rejeitada
  const rInsuficiente = validarCamposObrigatorios(campos, { data_faturamento: daqui3Dias });
  assert.equal(rInsuficiente.valido, false);
  assert.match(rInsuficiente.erro, /antecedência mínima de 7 dia\(s\)/);

  // Caso 3: Data de daqui a 8 dias deve ser aceita com sucesso
  const rValido = validarCamposObrigatorios(campos, { data_faturamento: daqui8Dias });
  assert.equal(rValido.valido, true);
});

test("garantirTabelaValores adiciona coluna campo_id e cria indice caso faltem", async () => {
  const comandosExecutados = [];
  const mockDb = {
    prepare(sql) {
      return {
        bind() { return this; },
        async run() {
          comandosExecutados.push(sql);
          return { meta: {} };
        },
        async all() {
          if (sql.includes("PRAGMA table_info(chamado_campos_valores)")) {
            // Simula tabela existente que só tinha id, chamado_id e valor (sem campo_id)
            return {
              results: [
                { name: "id" },
                { name: "chamado_id" },
                { name: "valor" }
              ]
            };
          }
          return { results: [] };
        },
        async first() { return null; }
      };
    }
  };

  const { garantirTabelaValores } = await import("./campos.js");
  await garantirTabelaValores(mockDb);

  const alterAddCampoId = comandosExecutados.find((cmd) => cmd.includes("ALTER TABLE chamado_campos_valores ADD COLUMN campo_id"));
  assert.ok(alterAddCampoId, "Deveria ter executado ALTER TABLE para adicionar campo_id");

  const createIndex = comandosExecutados.find((cmd) => cmd.includes("CREATE UNIQUE INDEX IF NOT EXISTS"));
  assert.ok(createIndex, "Deveria ter criado índice único para chamado_id e campo_id");
});

