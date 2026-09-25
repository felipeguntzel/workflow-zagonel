import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularEstruturaBpmn,
  construirArvore,
  renderHtmlCardEtapa,
  formatarTituloEtapa,
  badgeEtapaTipo,
  badgeStatus,
  situacaoPrazoBadge,
} from "./geral.js";

test("formatarTituloEtapa combina etapa e chamado quando diferem", () => {
  assert.equal(
    formatarTituloEtapa({ etapa_nome: "Engenharia de Produto", titulo: "DUCHA MOMENT 9000W" }),
    `Engenharia de Produto <span style="font-weight: 500; opacity: 0.8; font-size: 0.88rem;">(DUCHA MOMENT 9000W)</span>`
  );
  assert.equal(
    formatarTituloEtapa({ etapa_nome: "Desenvolvimento", titulo: "Desenvolvimento" }),
    "Desenvolvimento"
  );
});

test("construirArvore organiza chamados em hierarquia de pais e filhos", () => {
  const nos = [
    { id: 1, chamado_pai_id: null, titulo: "Chamado Raiz" },
    { id: 2, chamado_pai_id: 1, titulo: "Etapa 1" },
    { id: 3, chamado_pai_id: 2, titulo: "Subetapa de 2" },
    { id: 4, chamado_pai_id: 1, titulo: "Etapa 2" },
  ];

  const raizes = construirArvore(nos);
  assert.equal(raizes.length, 1);
  assert.equal(raizes[0].id, 1);
  assert.equal(raizes[0].filhos.length, 2);
  assert.equal(raizes[0].filhos[0].id, 2);
  assert.equal(raizes[0].filhos[0].filhos.length, 1);
  assert.equal(raizes[0].filhos[0].filhos[0].id, 3);
});

test("calcularEstruturaBpmn organiza setores e fases da esquerda para a direita", () => {
  const nos = [
    { id: 10, chamado_pai_id: null, setor_id: 1, setor_nome: "Comercial", titulo: "Pedido Inicial" },
    { id: 20, chamado_pai_id: 10, setor_id: 2, setor_nome: "Desenvolvimento", titulo: "Criar Ficha" },
    { id: 30, chamado_pai_id: 20, setor_id: 3, setor_nome: "Engenharia de Processos", titulo: "Roteiro" },
  ];

  const { setores, totalFases, nosProcessados, raizId } = calcularEstruturaBpmn(nos);

  assert.equal(raizId, 10);
  assert.equal(totalFases, 3);
  assert.equal(setores.length, 3);
  assert.equal(setores[0].nome, "Comercial");
  assert.equal(setores[1].nome, "Desenvolvimento");
  assert.equal(setores[2].nome, "Engenharia de Processos");

  const no10 = nosProcessados.find((n) => n.id === 10);
  const no20 = nosProcessados.find((n) => n.id === 20);
  const no30 = nosProcessados.find((n) => n.id === 30);

  assert.equal(no10.nivel, 0);
  assert.equal(no20.nivel, 1);
  assert.equal(no30.nivel, 2);
});

test("renderHtmlCardEtapa gera card recolhido por padrão com título, aprovação e status", () => {
  const no = {
    id: 15,
    titulo: "Aprovação Técnica",
    etapa_tipo: "aprovacao",
    resultado: "Aprovado",
    status_nome: "Finalizado",
    status_cor: "#10b981",
    setor_nome: "Qualidade",
    responsavel_nome: "Carlos",
    prazo: "2026-10-01",
    data_finalizacao: "2026-09-25",
  };

  const html = renderHtmlCardEtapa(no, { expandido: false });

  // Contém classe de recolhido
  assert.match(html, /card-etapa-geral--recolhido/);
  // Contém título e ID
  assert.match(html, /#15/);
  assert.match(html, /Aprovação Técnica/);
  // Contém badge de aprovação e resultado
  assert.match(html, /⚖️ Aprovação/);
  assert.match(html, /✓ Aprovado/);
  // Contém badge de status
  assert.match(html, /Finalizado/);
  // Botão com texto de expandir
  assert.match(html, /▼ Expandir/);
});

test("renderHtmlCardEtapa expandido não possui classe de recolhido e mostra botão de recolher", () => {
  const no = {
    id: 16,
    titulo: "Execução da Tarefa",
    etapa_tipo: "tarefa",
    status_nome: "Em Andamento",
    status_cor: "#3b82f6",
  };

  const html = renderHtmlCardEtapa(no, { expandido: true });

  assert.doesNotMatch(html, /card-etapa-geral--recolhido/);
  assert.match(html, /▲ Recolher/);
  assert.match(html, /📋 Tarefa/);
  assert.match(html, /Em Andamento/);
});

test("badgeEtapaTipo diferencia aprovação e tarefa", () => {
  assert.match(badgeEtapaTipo("aprovacao"), /⚖️ Aprovação/);
  assert.match(badgeEtapaTipo("tarefa"), /📋 Tarefa/);
  assert.match(badgeEtapaTipo(""), /📋 Tarefa/);
});
