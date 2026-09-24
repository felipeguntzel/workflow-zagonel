import test from "node:test";
import assert from "node:assert/strict";
import { escaparHtml, botaoIconeEditar, botaoIconeExcluir } from "./ui.js";

test("escaparHtml escapes the characters that break out of an HTML text node", () => {
  assert.equal(
    escaparHtml(`<img src=x onerror=alert(document.cookie)>`),
    "&lt;img src=x onerror=alert(document.cookie)&gt;"
  );
});

test("escaparHtml escapes &, quotes and apostrophes too", () => {
  assert.equal(escaparHtml(`a & b "c" 'd'`), "a &amp; b &quot;c&quot; &#39;d&#39;");
});

test("escaparHtml passes plain text through unchanged", () => {
  assert.equal(escaparHtml("Etapa normal"), "Etapa normal");
});

test("escaparHtml coerces non-string input instead of throwing", () => {
  assert.equal(escaparHtml(null), "");
  assert.equal(escaparHtml(undefined), "");
  assert.equal(escaparHtml(42), "42");
});

test("botaoIconeEditar produces a button with the given class, id and Editar label", () => {
  const html = botaoIconeEditar("btn-editar", 42);
  assert.match(html, /class="btn-icone btn-icone--editar btn-editar"/);
  assert.match(html, /data-id="42"/);
  assert.match(html, /aria-label="Editar"/);
  assert.match(html, /title="Editar"/);
});

test("botaoIconeExcluir produces a button with the given class, id and Excluir label", () => {
  const html = botaoIconeExcluir("btn-excluir", 7);
  assert.match(html, /class="btn-icone btn-icone--excluir btn-excluir"/);
  assert.match(html, /data-id="7"/);
  assert.match(html, /aria-label="Excluir"/);
  assert.match(html, /title="Excluir"/);
});

test("normalizarRota converte URLs com e sem .html para rotas limpas padronizadas", async () => {
  const { normalizarRota } = await import("./layout.js");
  assert.equal(normalizarRota("/empresas"), "empresas");
  assert.equal(normalizarRota("setores.html"), "setores");
  assert.equal(normalizarRota("/chamados.html?id=5"), "chamados");
  assert.equal(normalizarRota("/fluxos"), "fluxo");
  assert.equal(normalizarRota("fluxo.html"), "fluxo");
  assert.equal(normalizarRota(""), "login");
  assert.equal(normalizarRota("/index.html"), "login");
});

test("api expõe métodos auxiliares get, post, put e delete", async () => {
  const { api } = await import("./api.js");
  assert.equal(typeof api, "function");
  assert.equal(typeof api.get, "function");
  assert.equal(typeof api.post, "function");
  assert.equal(typeof api.put, "function");
  assert.equal(typeof api.delete, "function");
});

test("debounce adia chamadas repetidas e executa apenas a última após o delay", async () => {
  const { debounce } = await import("./ui.js");
  let chamadas = 0;
  let ultimoValor = null;

  const fn = debounce((v) => {
    chamadas++;
    ultimoValor = v;
  }, 40);

  fn(1);
  fn(2);
  fn(3);

  assert.equal(chamadas, 0);
  await new Promise((r) => setTimeout(r, 60));

  assert.equal(chamadas, 1);
  assert.equal(ultimoValor, 3);
});

test("gerarConteudoCsv cria CSV com BOM UTF-8, delimitador correto e escape de aspas", async () => {
  const { gerarConteudoCsv } = await import("./ui.js");
  const colunas = [
    { chave: "id", rotulo: "Código" },
    { chave: "nome", rotulo: "Nome Completo" },
    { chave: "observacao", rotulo: "Obs" },
  ];
  const dados = [
    { id: 1, nome: "Ducha Zagonel", observacao: "Produto; topo de linha" },
    { id: 2, nome: 'Torneira "Eletrônica"', observacao: "Sem observações" },
  ];

  const csv = gerarConteudoCsv(colunas, dados, ";");

  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("Código;Nome Completo;Obs"));
  assert.ok(csv.includes('1;Ducha Zagonel;"Produto; topo de linha"'));
  assert.ok(csv.includes('2;"Torneira ""Eletrônica""";Sem observações'));
});

test("formatarRotuloFK formata com código e nome quando código está presente", async () => {
  const { formatarRotuloFK } = await import("./crud-ui.js");
  assert.equal(formatarRotuloFK({ id: 1, codigo: "001", nome: "Zagonel S.A" }), "001 - Zagonel S.A");
  assert.equal(formatarRotuloFK({ id: 2, nome: "Setor Geral" }), "Setor Geral");
  assert.equal(formatarRotuloFK(null), "");
});

test("modal.js exporta confirmarAcao, mostrarAviso e abrirModal", async () => {
  const { confirmarAcao, mostrarAviso, abrirModal } = await import("./modal.js");
  assert.equal(typeof confirmarAcao, "function");
  assert.equal(typeof mostrarAviso, "function");
  assert.equal(typeof abrirModal, "function");
});

test("formatarDataBR converte YYYY-MM-DD para DD/MM/AAAA", async () => {
  const { formatarDataBR } = await import("./ui.js");
  assert.equal(formatarDataBR("2026-10-01"), "01/10/2026");
  assert.equal(formatarDataBR("2026-09-24"), "24/09/2026");
  assert.equal(formatarDataBR("2026-09-24T12:00:00Z"), "24/09/2026");
  assert.equal(formatarDataBR(null), "-");
  assert.equal(formatarDataBR(""), "-");
});




