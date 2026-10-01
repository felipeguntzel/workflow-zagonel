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
  habilitarNavegacaoArrastoLateral,
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

test("construirArvore encadeia etapas sequenciais deslocando cada etapa para a direita quando filhas apontavam para a raiz", () => {
  const nos = [
    { id: 22, chamado_pai_id: null, titulo: "Solicitação Inicial" },
    { id: 23, chamado_pai_id: 22, titulo: "Aprovação - Projetos" },
    { id: 24, chamado_pai_id: 22, titulo: "Aprovação - Desenvolvimento" },
    { id: 25, chamado_pai_id: 22, titulo: "Criar Produto/ Ficha" },
    { id: 26, chamado_pai_id: 22, titulo: "Desenvolver Roteiro" },
  ];

  const raizes = construirArvore(nos);
  assert.equal(raizes.length, 1);
  assert.equal(raizes[0].id, 22);

  // Nível 1: etapa 23 (filho de 22)
  assert.equal(raizes[0].filhos.length, 1);
  const etapa23 = raizes[0].filhos[0];
  assert.equal(etapa23.id, 23);

  // Nível 2: etapa 24 (filho de 23, deslocado à direita)
  assert.equal(etapa23.filhos.length, 1);
  const etapa24 = etapa23.filhos[0];
  assert.equal(etapa24.id, 24);

  // Nível 3: etapa 25 (filho de 24, deslocado à direita)
  assert.equal(etapa24.filhos.length, 1);
  const etapa25 = etapa24.filhos[0];
  assert.equal(etapa25.id, 25);

  // Nível 4: etapa 26 (filho de 25, deslocado à direita)
  assert.equal(etapa25.filhos.length, 1);
  const etapa26 = etapa25.filhos[0];
  assert.equal(etapa26.id, 26);
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

test("calcularEstruturaBpmn desloca cada etapa para a direita na visão horizontal (fase 1, 2, 3, 4)", () => {
  const nos = [
    { id: 22, chamado_pai_id: null, setor_id: 1, setor_nome: "Comercial Aquecimento", titulo: "Solicitação Inicial" },
    { id: 23, chamado_pai_id: 22, setor_id: 2, setor_nome: "Gestão de Projetos", titulo: "Aprovação - Projetos" },
    { id: 24, chamado_pai_id: 22, setor_id: 3, setor_nome: "Desenvolvimento Produto", titulo: "Aprovação - Desenvolvimento" },
    { id: 25, chamado_pai_id: 22, setor_id: 4, setor_nome: "Engenharia de Produto", titulo: "Criar Produto/ Ficha" },
    { id: 26, chamado_pai_id: 22, setor_id: 5, setor_nome: "Engenharia de Processos", titulo: "Roteiro de Produção" },
  ];

  const { totalFases, nosProcessados } = calcularEstruturaBpmn(nos);

  assert.equal(totalFases, 5);

  const no22 = nosProcessados.find((n) => n.id === 22);
  const no23 = nosProcessados.find((n) => n.id === 23);
  const no24 = nosProcessados.find((n) => n.id === 24);
  const no25 = nosProcessados.find((n) => n.id === 25);
  const no26 = nosProcessados.find((n) => n.id === 26);

  // Fase 1: solicitação inicial
  assert.equal(no22.nivel, 0);
  // Fase 2: aprovação projetos
  assert.equal(no23.nivel, 1);
  // Fase 3: aprovação desenvolvimento
  assert.equal(no24.nivel, 2);
  // Fase 4: criar produto/ ficha
  assert.equal(no25.nivel, 3);
  // Fase 5: roteiro de produção
  assert.equal(no26.nivel, 4);
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

test("renderHtmlCardEtapa com etapa reprovada renderiza status Cancelada, borda de perigo e data de cancelamento", () => {
  const no = {
    id: 18,
    titulo: "Aprovação Engenharia",
    etapa_tipo: "aprovacao",
    resultado: "reprovado",
    status_nome: "cancelado",
    chamado_mae_id: 1,
    eh_mae: false,
    prazo: "2026-10-01",
    data_finalizacao: "2026-09-29",
  };

  const html = renderHtmlCardEtapa(no, { expandido: true });

  assert.match(html, /Cancelada/);
  assert.match(html, /✕ reprovado/);
  assert.match(html, /border-left-color:\s*#dc2626/);
  assert.match(html, /Cancelada em:/);
});

test("situacaoPrazoBadge exibe Cancelada quando status for cancelado ou cancelada", () => {
  assert.match(situacaoPrazoBadge("2026-09-20", "2026-09-29", "cancelado"), /✕ Cancelada/);
  assert.match(situacaoPrazoBadge("2026-09-20", "2026-09-29", "cancelada"), /✕ Cancelada/);
});

test("habilitarNavegacaoArrastoLateral permite arrastar horizontalmente com o botão direito", () => {
  const listeners = new Map();
  const wrap = {
    classList: {
      classes: new Set(["geral-bpmn-wrap"]),
      contains(c) { return this.classes.has(c); },
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
    },
    scrollLeft: 100,
  };

  const container = {
    classList: {
      contains() { return false; },
    },
    querySelector(sel) {
      if (sel === ".geral-bpmn-wrap") return wrap;
      return null;
    },
    addEventListener(evt, fn) {
      listeners.set(evt, fn);
    },
  };

  const originalWindow = globalThis.window;
  const winListeners = new Map();
  globalThis.window = {
    addEventListener(evt, fn) {
      winListeners.set(evt, fn);
    },
    removeEventListener() {},
  };

  try {
    const cleanup = habilitarNavegacaoArrastoLateral(container);
    assert.equal(typeof cleanup, "function");

    const onMouseDown = listeners.get("mousedown");
    const onContextMenu = listeners.get("contextmenu");
    const onMouseMove = winListeners.get("mousemove");
    const onMouseUp = winListeners.get("mouseup");

    assert.equal(typeof onMouseDown, "function");
    assert.equal(typeof onContextMenu, "function");
    assert.equal(typeof onMouseMove, "function");
    assert.equal(typeof onMouseUp, "function");

    // 1. Botão esquerdo (button 0) NÃO deve iniciar arrasto
    let prevented = false;
    onMouseDown({ button: 0, clientX: 200, preventDefault() { prevented = true; } });
    assert.equal(wrap.classList.contains("bpmn-arrastando"), false);

    // 2. Botão direito (button 2) deve iniciar arrasto
    onMouseDown({ button: 2, clientX: 200, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(wrap.classList.contains("bpmn-arrastando"), true);

    // 3. Mover mouse para a esquerda (clientX 150 -> deltaX -50) deve rolar para a direita (scrollLeft = 100 - (-50) = 150)
    onMouseMove({ clientX: 150 });
    assert.equal(wrap.scrollLeft, 150);

    // 4. Mover mouse para a direita (clientX 250 -> deltaX +50) deve rolar para a esquerda (scrollLeft = 100 - 50 = 50)
    onMouseMove({ clientX: 250 });
    assert.equal(wrap.scrollLeft, 50);

    // 5. Contextmenu é prevenido
    let cmPrevented = false;
    let cmStopped = false;
    onContextMenu({ preventDefault() { cmPrevented = true; }, stopPropagation() { cmStopped = true; } });
    assert.equal(cmPrevented, true);
    assert.equal(cmStopped, true);

    // 6. Soltar botão direito encerra arrasto
    onMouseUp({ button: 2 });
    assert.equal(wrap.classList.contains("bpmn-arrastando"), false);

    cleanup();
  } finally {
    globalThis.window = originalWindow;
  }
});

