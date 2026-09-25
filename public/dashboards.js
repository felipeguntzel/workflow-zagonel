import { api } from "./api.js";
import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro, escaparHtml, exportarParaCsv } from "./ui.js";
import { tornarTabelaReordenavel } from "./tabela-colunas.js";

let relatorioAtual = null;

export function inicializar() {
  const usuario = exigirLogin();
  if (!usuario) return;
  aplicarLayout(usuario);

  const perm = permissaoDaTela("dashboards");
  if (!perm.visualizar) {
    const main = document.querySelector("main");
    if (main) {
      main.innerHTML = `
        <div class="pagina-cabecalho">
          <h2>Dashboards & Indicadores Operacionais</h2>
        </div>
        <p style="padding: 1.5rem; background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); border-radius: 8px;">
          Você não tem permissão para visualizar os relatórios e dashboards operacionais.
        </p>
      `;
    }
    return;
  }

  configurarFiltros();
  carregarEmpresas();
  carregarSetores();
  carregarStatusGeral();

  const tabelaSetores = document.querySelector("#tabela-desempenho-setores")?.closest("table");
  if (tabelaSetores) tornarTabelaReordenavel(tabelaSetores, "dashboards_setores");

  const tabelaStatus = document.querySelector("#tabela-distribuicao-status")?.closest("table");
  if (tabelaStatus) tornarTabelaReordenavel(tabelaStatus, "dashboards_status");

  carregarDashboard();
}

let listaStatusGeral = [];

async function carregarStatusGeral() {
  try {
    const res = await api("/status");
    listaStatusGeral = Array.isArray(res) ? res : [];
  } catch (_) {
    listaStatusGeral = [];
  }
}

let listaSetoresGeral = [];

async function carregarSetores() {
  const selectSetor = document.getElementById("filtro-setor");
  if (!selectSetor) return;

  try {
    const setores = await api("/setores");
    listaSetoresGeral = Array.isArray(setores) ? setores : [];
    const empId = document.getElementById("filtro-empresa")?.value || null;
    popularSelectSetores(empId);
  } catch (_) {
    listaSetoresGeral = [];
  }
}

function popularSelectSetores(empresaIdFiltro = null) {
  const selectSetor = document.getElementById("filtro-setor");
  if (!selectSetor) return;

  const valorAnterior = selectSetor.value;
  selectSetor.innerHTML = '<option value="">Todos os setores</option>';

  let filtrados = listaSetoresGeral;
  if (empresaIdFiltro) {
    const empIdNum = Number(empresaIdFiltro);
    filtrados = listaSetoresGeral.filter((s) => {
      if (Array.isArray(s.empresas) && s.empresas.length > 0) {
        return s.empresas.includes(empIdNum);
      }
      return s.empresa_id === empIdNum;
    });
  }

  // Desduplica por nome
  const setoresUnicos = [];
  const nomesVistos = new Set();
  for (const s of filtrados) {
    const nomeNorm = String(s.nome || "").trim().toLowerCase();
    if (!nomesVistos.has(nomeNorm)) {
      nomesVistos.add(nomeNorm);
      setoresUnicos.push(s);
    }
  }

  // Ordena alfabeticamente
  setoresUnicos.sort((a, b) => a.nome.localeCompare(b.nome));

  for (const s of setoresUnicos) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.nome;
    if (String(s.id) === String(valorAnterior)) {
      opt.selected = true;
    }
    selectSetor.appendChild(opt);
  }
}

async function carregarEmpresas() {
  const selectEmpresa = document.getElementById("filtro-empresa");
  if (!selectEmpresa) return;

  try {
    const empresas = await api("/empresas");
    selectEmpresa.innerHTML = '<option value="">Todas as empresas</option>';

    // Blindagem de deduplicação por nome e por id
    const empresasUnicas = [];
    const nomesVistos = new Set();
    const idsVistos = new Set();

    for (const emp of (empresas || [])) {
      const nomeChave = String(emp.nome || "").trim().toLowerCase();
      if (!nomesVistos.has(nomeChave) && !idsVistos.has(emp.id)) {
        nomesVistos.add(nomeChave);
        idsVistos.add(emp.id);
        empresasUnicas.push(emp);
      }
    }

    for (const emp of empresasUnicas) {
      const opt = document.createElement("option");
      opt.value = emp.id;
      opt.textContent = emp.nome;
      selectEmpresa.appendChild(opt);
    }
  } catch (_) {}
}

function configurarFiltros() {
  const filtroPeriodo = document.getElementById("filtro-periodo");
  const filtroEmpresa = document.getElementById("filtro-empresa");
  const filtroSetor = document.getElementById("filtro-setor");
  const btnAtualizar = document.getElementById("btn-atualizar-metricas");
  const btnExportarCsv = document.getElementById("btn-exportar-csv");
  const btnExportarPdf = document.getElementById("btn-exportar-pdf");
  const btnExportarPng = document.getElementById("btn-exportar-png");

  filtroPeriodo?.addEventListener("change", () => carregarDashboard());
  filtroEmpresa?.addEventListener("change", (e) => {
    popularSelectSetores(e.target.value);
    carregarDashboard();
  });
  filtroSetor?.addEventListener("change", () => carregarDashboard());
  btnAtualizar?.addEventListener("click", () => carregarDashboard());

  btnExportarPdf?.addEventListener("click", () => {
    window.print();
  });

  btnExportarPng?.addEventListener("click", () => {
    exportarDashboardParaPng();
  });

  btnExportarCsv?.addEventListener("click", async () => {
    if (!relatorioAtual || !relatorioAtual.setores || relatorioAtual.setores.length === 0) {
      const { mostrarAviso } = await import("./modal.js");
      await mostrarAviso("Não há dados de setores disponíveis para exportação.", "Exportação", "aviso");
      return;
    }

    const colunas = [
      { chave: "setor_nome", rotulo: "Setor" },
      { chave: "tarefas_mae", rotulo: "Tarefas-Mãe" },
      { chave: "ativos", rotulo: "Em Fila (Ativos)" },
      { chave: "finalizados", rotulo: "Finalizados" },
      { chave: "atrasados", rotulo: "Atrasados" },
      { chave: "tempo_medio_dias", rotulo: "Tempo Médio (dias)" },
      { chave: "taxa_pontualidade", rotulo: "Taxa de Pontualidade (%)" },
      { chave: "eh_gargalo", rotulo: "Gargalo Operacional" },
    ];

    const dados = relatorioAtual.setores.map((s) => ({
      ...s,
      taxa_pontualidade: `${s.taxa_pontualidade}%`,
      eh_gargalo: s.eh_gargalo ? "SIM" : "NÃO",
    }));

    exportarParaCsv(`relatorio_desempenho_setores_${new Date().toISOString().slice(0, 10)}`, colunas, dados);
  });
}

function exportarDashboardParaPng() {
  if (!relatorioAtual) {
    alert("Aguarde o carregamento do dashboard para exportar.");
    return;
  }

  const { metricas_gerais, setores, gargalos } = relatorioAtual;
  const listaSetores = Array.isArray(setores) ? setores : [];

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const largura = 1200;
  const altura = Math.max(800, 360 + (listaSetores.length * 40) + 120);
  canvas.width = largura;
  canvas.height = altura;

  // Fundo geral
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, largura, altura);

  // Faixa de destaque superior
  ctx.fillStyle = "#2f6f4f";
  ctx.fillRect(0, 0, largura, 8);

  // Cabeçalho
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("WorkFlow Zagonel - Dashboards & Indicadores Operacionais", 40, 50);

  ctx.fillStyle = "#64748b";
  ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const dataEmissao = new Date().toLocaleString("pt-BR");
  ctx.fillText(`Relatório consolidado de produtividade e desempenho • Gerado em: ${dataEmissao}`, 40, 75);

  // Linha divisória
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 95);
  ctx.lineTo(largura - 40, 95);
  ctx.stroke();

  // 5 Cards de Métricas
  const cards = [
    { rotulo: "TOTAL DE CHAMADOS", valor: String(metricas_gerais?.total_chamados ?? 0), sub: `${metricas_gerais?.tarefas_mae ?? 0} tarefas-mãe`, cor: "#1e293b" },
    { rotulo: "EM ANDAMENTO", valor: String(metricas_gerais?.em_andamento ?? 0), sub: "Fila ativa", cor: "#2f6f4f" },
    { rotulo: "FINALIZADOS", valor: String(metricas_gerais?.finalizados ?? 0), sub: `${metricas_gerais?.taxa_pontualidade_geral ?? 100}% no prazo`, cor: "#059669" },
    { rotulo: "VENCIDOS / ALERTA", valor: String((metricas_gerais?.atrasados || 0) + (metricas_gerais?.em_alerta || 0)), sub: `${metricas_gerais?.atrasados ?? 0} vencidos`, cor: "#dc2626" },
    { rotulo: "TEMPO MÉDIO", valor: `${metricas_gerais?.tempo_medio_geral_dias ?? 0} dias`, sub: "Por resolução", cor: "#0284c7" }
  ];

  const cardLargura = (largura - 80 - (cards.length - 1) * 16) / cards.length;
  let cardX = 40;
  const cardY = 115;
  const cardAltura = 100;

  cards.forEach((c) => {
    // Fundo do card
    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardLargura, cardAltura, 8);
    ctx.fill();
    ctx.stroke();

    // Rótulo
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(c.rotulo, cardX + 14, cardY + 24);

    // Valor
    ctx.fillStyle = c.cor;
    ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(c.valor, cardX + 14, cardY + 60);

    // Subtítulo
    ctx.fillStyle = "#64748b";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(c.sub, cardX + 14, cardY + 84);

    cardX += cardLargura + 16;
  });

  // Título da Tabela
  let yTabela = 245;
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("Desempenho e Tempos Médios por Setor", 40, yTabela);

  // Cabeçalho da Tabela
  yTabela += 15;
  const colunas = [
    { x: 40, w: 320, nome: "Setor Responsável", align: "left" },
    { x: 360, w: 130, nome: "Tarefas-Mãe", align: "right" },
    { x: 490, w: 120, nome: "Em Fila", align: "right" },
    { x: 610, w: 130, nome: "Finalizados", align: "right" },
    { x: 740, w: 120, nome: "Atrasados", align: "right" },
    { x: 860, w: 140, nome: "Tempo Médio", align: "right" },
    { x: 1000, w: 160, nome: "Pontualidade", align: "right" },
  ];

  ctx.fillStyle = "#2f6f4f";
  ctx.beginPath();
  ctx.roundRect(40, yTabela, largura - 80, 36, [6, 6, 0, 0]);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  colunas.forEach((col) => {
    const textoX = col.align === "right" ? col.x + col.w - 15 : col.x + 15;
    ctx.textAlign = col.align;
    ctx.fillText(col.nome, textoX, yTabela + 23);
  });
  ctx.textAlign = "left";

  // Linhas da Tabela
  let linhaY = yTabela + 36;
  listaSetores.forEach((s, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
    ctx.fillRect(40, linhaY, largura - 80, 34);

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.strokeRect(40, linhaY, largura - 80, 34);

    ctx.fillStyle = "#1e293b";
    ctx.font = "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    colunas.forEach((col) => {
      let val = "";
      if (col.nome === "Setor Responsável") val = s.setor_nome || "-";
      else if (col.nome === "Tarefas-Mãe") val = String(s.tarefas_mae ?? 0);
      else if (col.nome === "Em Fila") val = String(s.ativos ?? 0);
      else if (col.nome === "Finalizados") val = String(s.finalizados ?? 0);
      else if (col.nome === "Atrasados") val = String(s.atrasados ?? 0);
      else if (col.nome === "Tempo Médio") val = `${s.tempo_medio_dias ?? 0} dias`;
      else if (col.nome === "Pontualidade") val = `${s.taxa_pontualidade ?? 100}%`;

      const textoX = col.align === "right" ? col.x + col.w - 15 : col.x + 15;
      ctx.textAlign = col.align;

      if (col.nome === "Atrasados" && Number(s.atrasados) > 0) {
        ctx.fillStyle = "#dc2626";
        ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      } else {
        ctx.fillStyle = "#1e293b";
        ctx.font = "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      }

      ctx.fillText(val, textoX, linhaY + 22);
    });
    ctx.textAlign = "left";
    linhaY += 34;
  });

  // Rodapé do documento
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("WorkFlow Zagonel • Documento e métricas geradas eletronicamente.", 40, linhaY + 30);

  // Baixar arquivo PNG
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dashboard_workflow_zagonel_${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

async function carregarDashboard() {
  const mensagemErro = document.getElementById("mensagem-erro");
  if (mensagemErro) mensagemErro.hidden = true;

  const filtroPeriodo = document.getElementById("filtro-periodo");
  const filtroEmpresa = document.getElementById("filtro-empresa");
  const filtroSetor = document.getElementById("filtro-setor");

  const queryParams = new URLSearchParams();
  if (filtroPeriodo?.value) queryParams.set("dias", filtroPeriodo.value);
  if (filtroEmpresa?.value) queryParams.set("empresa_id", filtroEmpresa.value);
  if (filtroSetor?.value) queryParams.set("setor_id", filtroSetor.value);

  const qs = queryParams.toString() ? `?${queryParams.toString()}` : "";

  try {
    const dados = await api(`/relatorios${qs}`);
    relatorioAtual = dados;

    const { metricas_gerais, setores, distribuicao_status, gargalos } = dados;

    // Atualiza cards de métricas
    const elTotal = document.getElementById("metrica-total");
    const elTarefasMae = document.getElementById("metrica-tarefas-mae");
    const elAndamento = document.getElementById("metrica-andamento");
    const elFinalizados = document.getElementById("metrica-finalizados");
    const elTaxaPontualidade = document.getElementById("metrica-taxa-pontualidade");
    const elAtencao = document.getElementById("metrica-atencao");
    const elVencidosInfo = document.getElementById("metrica-vencidos-info");
    const elTempoMedio = document.getElementById("metrica-tempo-medio");

    if (elTotal) elTotal.textContent = String(metricas_gerais.total_chamados);
    if (elTarefasMae) elTarefasMae.textContent = `${metricas_gerais.tarefas_mae} tarefas-mãe`;
    if (elAndamento) elAndamento.textContent = String(metricas_gerais.em_andamento);
    if (elFinalizados) elFinalizados.textContent = String(metricas_gerais.finalizados);
    if (elTaxaPontualidade) elTaxaPontualidade.textContent = `${metricas_gerais.taxa_pontualidade_geral}% no prazo`;

    const totalProblemas = (metricas_gerais.atrasados || 0) + (metricas_gerais.em_alerta || 0);
    if (elAtencao) elAtencao.textContent = String(totalProblemas);
    if (elVencidosInfo) {
      elVencidosInfo.textContent = `${metricas_gerais.atrasados} vencidos, ${metricas_gerais.em_alerta} em alerta`;
    }

    if (elTempoMedio) {
      elTempoMedio.innerHTML = `${metricas_gerais.tempo_medio_geral_dias} <span style="font-size: 0.9rem; font-weight: normal;">dias</span>`;
    }

    // Renderiza seção de gargalos
    renderizarGargalos(gargalos);

    // Renderiza tabela de desempenho por setor
    renderizarTabelaSetores(setores);

    // Renderiza tabela de status
    renderizarTabelaStatus(distribuicao_status, metricas_gerais.total_chamados);
  } catch (e) {
    if (mensagemErro) mostrarErro(mensagemErro, e);
  }
}

function renderizarGargalos(gargalos) {
  const container = document.getElementById("container-gargalos");
  if (!container) return;

  if (!gargalos || gargalos.length === 0) {
    container.innerHTML = `
      <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); border-left: 5px solid var(--cor-ok, #10b981); padding: 0.85rem 1.25rem; border-radius: 0.4rem; display: flex; align-items: center; gap: 0.75rem;">
        <span style="font-size: 1.25rem;">✅</span>
        <div>
          <strong style="color: var(--cor-ok, #10b981); font-size: 0.95rem;">Nenhum gargalo crítico identificado</strong>
          <p style="margin: 0.15rem 0 0; font-size: 0.82rem; color: var(--cor-texto-secundario);">Todos os setores estão atendendo as demandas dentro dos prazos e com volume controlado.</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = gargalos
    .map(
      (g) => `
      <div class="card-gargalo">
        <span style="font-size: 1.5rem;">⚠️</span>
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
            <strong style="font-size: 1rem; color: #be123c;">Gargalo Detectado: Setor ${escaparHtml(g.setor_nome)}</strong>
            <span class="badge-gargalo">Alta Retenção</span>
          </div>
          <p style="margin: 0.35rem 0 0.5rem; font-size: 0.85rem; color: var(--cor-texto); line-height: 1.5;">
            O setor possui <strong>${g.atrasados} chamado(s) com prazo vencido</strong> e <strong>${g.ativos} em fila de espera</strong>.
            O tempo médio atual de resolução é de <strong>${g.tempo_medio_dias} dias</strong> com <strong>${g.taxa_pontualidade}% de pontualidade</strong>.
          </p>
          <div style="font-size: 0.8rem; color: var(--cor-texto-secundario);">
            Recomendação: priorizar a triagem dos chamados vencidos ou redistribuir a carga com setores de apoio.
          </div>
        </div>
      </div>
    `
    )
    .join("");
}

function renderizarTabelaSetores(setores) {
  const tbody = document.getElementById("tabela-desempenho-setores");
  if (!tbody) return;

  if (!setores || setores.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="vazio">Nenhum setor cadastrado ou sem dados no período.</td></tr>';
    return;
  }

  tbody.innerHTML = setores
    .map((s) => {
      const classeBarra =
        s.taxa_pontualidade >= 80
          ? "barra-progresso-fill--otimo"
          : s.taxa_pontualidade >= 60
          ? "barra-progresso-fill--medio"
          : "barra-progresso-fill--critico";

      const badgeGargalo = s.eh_gargalo
        ? `<span class="badge-gargalo" style="margin-left: 0.4rem;">⚠️ Gargalo</span>`
        : "";

      const atrasadosEstilo =
        s.atrasados > 0
          ? `color: var(--cor-vencido, #ef4444); font-weight: 700;`
          : `color: var(--cor-texto-secundario);`;

      return `
        <tr>
          <td>
            <strong>${escaparHtml(s.setor_nome)}</strong>
            ${badgeGargalo}
          </td>
          <td style="text-align: right; font-weight: 600;">${s.tarefas_mae}</td>
          <td style="text-align: right; font-weight: 600;">${s.ativos}</td>
          <td style="text-align: right; font-weight: 600; color: var(--cor-ok, #10b981);">${s.finalizados}</td>
          <td style="text-align: right; ${atrasadosEstilo}">${s.atrasados}</td>
          <td style="text-align: right; font-weight: 600;">${s.tempo_medio_dias} d</td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div class="barra-progresso-wrap" style="flex: 1;">
                <div class="barra-progresso-fill ${classeBarra}" style="width: ${s.taxa_pontualidade}%;"></div>
              </div>
              <span style="font-size: 0.8rem; font-weight: 700; min-width: 38px; text-align: right;">${s.taxa_pontualidade}%</span>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderizarTabelaStatus(distribuicaoStatus, totalGeral) {
  const tbody = document.getElementById("tabela-distribuicao-status");
  if (!tbody) return;

  const total = totalGeral > 0 ? totalGeral : 0;
  const mapaItens = new Map();

  // 1. Inicializa com todos os status cadastrados conhecidos
  for (const st of listaStatusGeral) {
    if (!st || !st.nome) continue;
    const chave = st.nome.trim();
    mapaItens.set(chave.toLowerCase(), {
      status: chave,
      cor: st.cor || null,
      quantidade: 0,
      ordem: st.id || 999,
    });
  }

  // 2. Preenche com os dados vindos do relatório
  for (const item of (distribuicaoStatus || [])) {
    const nome = String(item.status || "Sem status").trim();
    const chave = nome.toLowerCase();
    if (!mapaItens.has(chave)) {
      mapaItens.set(chave, {
        status: nome,
        cor: item.cor || null,
        quantidade: Number(item.quantidade) || 0,
        ordem: item.ordem || 999,
      });
    } else {
      const existente = mapaItens.get(chave);
      existente.quantidade = Number(item.quantidade) || 0;
      if (item.cor) existente.cor = item.cor;
      if (item.ordem) existente.ordem = item.ordem;
    }
  }

  const listaFinal = Array.from(mapaItens.values());
  if (listaFinal.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="vazio">Nenhum status cadastrado no sistema.</td></tr>';
    return;
  }

  // Ordena: status com chamados primeiro (decrescente); status com 0 ordenados pela ordem cadastrada
  listaFinal.sort((a, b) => {
    if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
    return (a.ordem || 0) - (b.ordem || 0) || a.status.localeCompare(b.status);
  });

  tbody.innerHTML = listaFinal
    .map((item) => {
      const pct = total > 0 ? Math.round((item.quantidade / total) * 100) : 0;
      const bolinhaCor = item.cor
        ? `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${item.cor}; margin-right: 0.45rem; flex-shrink: 0;"></span>`
        : "";

      return `
        <tr>
          <td>
            <div style="display: inline-flex; align-items: center;">
              ${bolinhaCor}
              <strong>${escaparHtml(item.status)}</strong>
            </div>
          </td>
          <td style="text-align: right; font-weight: 700; ${item.quantidade === 0 ? 'color: var(--cor-texto-secundario); font-weight: normal;' : ''}">
            ${item.quantidade}
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div class="barra-progresso-wrap" style="flex: 1;">
                <div class="barra-progresso-fill ${pct > 0 ? 'barra-progresso-fill--medio' : ''}" style="width: ${pct}%; background: ${item.cor || 'var(--cor-primaria)'};"></div>
              </div>
              <span style="font-size: 0.8rem; font-weight: 600; min-width: 35px; text-align: right; ${pct === 0 ? 'color: var(--cor-texto-secundario); font-weight: normal;' : ''}">
                ${pct}%
              </span>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

inicializar();

