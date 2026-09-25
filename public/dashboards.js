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

  const tabelaSetores = document.querySelector("#tabela-desempenho-setores")?.closest("table");
  if (tabelaSetores) tornarTabelaReordenavel(tabelaSetores, "dashboards_setores");

  const tabelaStatus = document.querySelector("#tabela-distribuicao-status")?.closest("table");
  if (tabelaStatus) tornarTabelaReordenavel(tabelaStatus, "dashboards_status");

  carregarDashboard();
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
  const btnExportar = document.getElementById("btn-exportar-csv");

  filtroPeriodo?.addEventListener("change", () => carregarDashboard());
  filtroEmpresa?.addEventListener("change", (e) => {
    popularSelectSetores(e.target.value);
    carregarDashboard();
  });
  filtroSetor?.addEventListener("change", () => carregarDashboard());
  btnAtualizar?.addEventListener("click", () => carregarDashboard());

  btnExportar?.addEventListener("click", async () => {
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

  if (!distribuicaoStatus || distribuicaoStatus.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="vazio">Nenhum chamado encontrado no período.</td></tr>';
    return;
  }

  const total = totalGeral > 0 ? totalGeral : 1;

  tbody.innerHTML = distribuicaoStatus
    .sort((a, b) => b.quantidade - a.quantidade)
    .map((item) => {
      const pct = Math.round((item.quantidade / total) * 100);
      return `
        <tr>
          <td><strong>${escaparHtml(item.status)}</strong></td>
          <td style="text-align: right; font-weight: 700;">${item.quantidade}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div class="barra-progresso-wrap" style="flex: 1;">
                <div class="barra-progresso-fill barra-progresso-fill--medio" style="width: ${pct}%; background: var(--cor-primaria);"></div>
              </div>
              <span style="font-size: 0.8rem; font-weight: 600; min-width: 35px; text-align: right;">${pct}%</span>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

inicializar();

