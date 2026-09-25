import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro, escaparAtributo, escaparHtml, debounce, exportarParaCsv, anunciarA11y, formatarDataBR, traduzirTextoParaPtBr } from "./ui.js";
import { api } from "./api.js";
import { tornarTabelaReordenavel } from "./tabela-colunas.js";
import { confirmarAcao } from "./modal.js";

let usuarioLogado = null;
let listaChamados = [];
let consultasSalvas = [];
let consultaAtivaId = null;
let consultaPadraoId = null;
let ordemAtual = { campo: "id", direcao: "desc" };
let paginaAtual = 1;
let limitePorPagina = 25;
let totalFiltrados = 0;

export async function inicializar() {
  usuarioLogado = exigirLogin();
  if (!usuarioLogado) return;
  aplicarLayout(usuarioLogado);

  const linkNovo = document.getElementById("link-novo-chamado");
  if (linkNovo && !permissaoDaTela("chamados").inserir) {
    linkNovo.hidden = true;
  }

  configurarEventosFiltros();
  configurarOrdenacao();
  configurarEventosConsultas();
  configurarModalApontamentoRapido();

  const tabela = document.querySelector(".tabela-wrap table");
  if (tabela) {
    tornarTabelaReordenavel(tabela, "chamados", usuarioLogado.id);
  }

  try {
    await carregarChamados();
    await carregarConsultasSalvas(true);
    atualizarEstadoBotaoFiltros();
  } catch (e) {
    mostrarErro(document.getElementById("mensagem-erro"), e);
  }
}

function calcularSituacao(prazo, statusNome) {
  if (statusNome === "finalizado" || statusNome === "suspenso") return "";
  const hoje = new Date().toISOString().slice(0, 10);
  const diff = Math.round((new Date(prazo) - new Date(hoje)) / 86400000);
  if (diff < 0) return "Vencido";
  if (diff <= 2) return "Alerta";
  return "Ok";
}

function situacaoBadge(prazo, statusNome) {
  const sit = calcularSituacao(prazo, statusNome);
  if (!sit) return "";
  if (sit === "Vencido") return `<span class="badge badge-vencido">Vencido</span>`;
  if (sit === "Alerta") return `<span class="badge badge-alerta">Alerta</span>`;
  return `<span class="badge badge-ok">Ok</span>`;
}

function badgeStatusColorido(nome, cor) {
  if (!nome) return "-";
  if (!cor) return escaparHtml(nome);
  return `<span class="badge-status" style="background: ${cor}18; color: ${cor}; border: 1px solid ${cor}55; font-weight: 600; display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.55rem; border-radius: 4px;"><span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${cor};"></span>${escaparHtml(nome)}</span>`;
}

function badgeStatusGeral(texto) {
  if (!texto) return "-";
  return `<span style="color: var(--cor-texto); font-weight: 500;">${escaparHtml(texto)}</span>`;
}

function mostrarToast(mensagem, tipo = "sucesso") {
  const toast = document.getElementById("toast-chamados");
  if (!toast) return;
  toast.className = `toast-status-rapido toast-${tipo}`;
  toast.textContent = mensagem;
  toast.hidden = false;
  toast.style.display = "block";
  setTimeout(() => {
    toast.hidden = true;
    toast.style.display = "none";
  }, 4000);
}

// Preenche opções de selects superiores dinamicamente baseando-se nos chamados
function popularFiltrosSuperiores() {
  const selectEmpresa = document.getElementById("filtro-empresa-chamados");
  const selectResp = document.getElementById("filtro-responsavel-chamados");
  const selectSetor = document.getElementById("filtro-setor-chamados");

  const valorEmpresaAtual = selectEmpresa ? selectEmpresa.value : "";
  const valorRespAtual = selectResp ? selectResp.value : "";
  const valorSetorAtual = selectSetor ? selectSetor.value : "";

  // Empresas
  if (selectEmpresa) {
    const empresasSet = new Set();
    listaChamados.forEach((c) => {
      if (c.empresa_nome && c.empresa_nome !== "-") empresasSet.add(c.empresa_nome);
    });
    const empresas = Array.from(empresasSet).sort((a, b) => a.localeCompare(b, "pt-BR"));
    selectEmpresa.innerHTML = `
      <option value="">Todas as empresas</option>
      ${empresas.map((e) => `<option value="${escaparAtributo(e)}">${escaparHtml(e)}</option>`).join("")}
    `;
    if (valorEmpresaAtual) selectEmpresa.value = valorEmpresaAtual;
  }

  // Responsáveis
  if (selectResp) {
    const respMap = new Map();
    listaChamados.forEach((c) => {
      if (c.responsavel_nome && c.responsavel_nome !== "-") {
        respMap.set(c.responsavel_nome, c.responsavel_id || c.responsavel_nome);
      }
    });
    const nomesResp = Array.from(respMap.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));
    selectResp.innerHTML = `
      <option value="">Todos os responsáveis</option>
      <option value="__meus__">Atribuídos a mim (${escaparHtml(usuarioLogado.nome)})</option>
      <option value="__sem_responsavel__">Não atribuído</option>
      ${nomesResp.map((nome) => `<option value="${escaparAtributo(nome)}">${escaparHtml(nome)}</option>`).join("")}
    `;
    if (valorRespAtual) selectResp.value = valorRespAtual;
  }

  // Setores
  if (selectSetor) {
    const setoresSet = new Set();
    listaChamados.forEach((c) => {
      if (c.setor_nome && c.setor_nome !== "-") setoresSet.add(c.setor_nome);
    });
    const setores = Array.from(setoresSet).sort((a, b) => a.localeCompare(b, "pt-BR"));
    selectSetor.innerHTML = `
      <option value="">Todos os setores</option>
      ${setores.map((s) => `<option value="${escaparAtributo(s)}">${escaparHtml(s)}</option>`).join("")}
    `;
    if (valorSetorAtual) selectSetor.value = valorSetorAtual;
  }
}

function filtrarDados() {
  const termo = (document.getElementById("filtro-busca-chamados")?.value || "").trim().toLowerCase();
  const statusFiltro = document.getElementById("filtro-status-chamados")?.value || "";
  const empresaFiltro = document.getElementById("filtro-empresa-chamados")?.value || "";
  const respFiltro = document.getElementById("filtro-responsavel-chamados")?.value || "";
  const setorFiltro = document.getElementById("filtro-setor-chamados")?.value || "";

  return listaChamados.filter((c) => {
    // Filtro de status
    const ehFinalizado = c.status_geral_tipo === "finalizado" || c.status_nome === "finalizado" || c.status_etapa_nome === "finalizado";
    if (statusFiltro === "ativos" && ehFinalizado) return false;
    if (statusFiltro === "finalizado" && !ehFinalizado) return false;

    // Filtro de empresa
    if (empresaFiltro && c.empresa_nome !== empresaFiltro) {
      return false;
    }

    // Filtro de setor
    if (setorFiltro && c.setor_nome !== setorFiltro) {
      return false;
    }

    // Filtro de responsável
    if (respFiltro) {
      if (respFiltro === "__meus__") {
        if (Number(c.responsavel_id) !== Number(usuarioLogado.id)) return false;
      } else if (respFiltro === "__sem_responsavel__") {
        if (c.responsavel_id || (c.responsavel_nome && c.responsavel_nome !== "-")) return false;
      } else {
        if (c.responsavel_nome !== respFiltro && String(c.responsavel_id) !== respFiltro) return false;
      }
    }

    // Filtro de busca textual
    if (termo) {
      const matchId = String(c.id).includes(termo.replace(/^#/, ""));
      const matchTitulo = String(c.titulo || "").toLowerCase().includes(termo);
      const matchEtapa = String(c.etapa_atual || "").toLowerCase().includes(termo);
      const matchSol = String(c.solicitante_nome || "").toLowerCase().includes(termo);
      const matchSetor = String(c.setor_nome || "").toLowerCase().includes(termo);
      const matchEmp = String(c.empresa_nome || "").toLowerCase().includes(termo);
      const matchStatus = String(c.status_etapa_nome || c.status_nome || "").toLowerCase().includes(termo);
      const matchStatusGeral = String(c.status_geral_texto || "").toLowerCase().includes(termo);
      const matchResp = String(c.responsavel_nome || "").toLowerCase().includes(termo);
      return matchId || matchTitulo || matchEtapa || matchSol || matchSetor || matchEmp || matchStatus || matchStatusGeral || matchResp;
    }

    return true;
  });
}

function renderizarTabela() {
  const filtrados = filtrarDados();
  totalFiltrados = filtrados.length;

  filtrados.sort((a, b) => {
    let valA = a[ordemAtual.campo];
    let valB = b[ordemAtual.campo];

    if (ordemAtual.campo === "situacao") {
      valA = calcularSituacao(a.prazo, a.status_nome);
      valB = calcularSituacao(b.prazo, b.status_nome);
    }

    if (ordemAtual.campo === "id") {
      return ordemAtual.direcao === "asc" ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
    }

    const comp = String(valA ?? "").localeCompare(String(valB ?? ""), "pt-BR", { numeric: true, sensitivity: "base" });
    return ordemAtual.direcao === "asc" ? comp : -comp;
  });

  document.querySelectorAll(".ordem-indicador").forEach((span) => {
    span.textContent = "";
  });
  const spanAtivo = document.getElementById(`ordem-${ordemAtual.campo}`);
  if (spanAtivo) {
    spanAtivo.textContent = ordemAtual.direcao === "asc" ? "▲" : "▼";
  }

  // Paginação
  const totalPaginas = Math.ceil(totalFiltrados / limitePorPagina) || 1;
  if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;
  if (paginaAtual < 1) paginaAtual = 1;

  const inicioIdx = (paginaAtual - 1) * limitePorPagina;
  const paginaDados = filtrados.slice(inicioIdx, inicioIdx + limitePorPagina);

  const tbody = document.getElementById("tabela-chamados");
  if (!tbody) return;

  const ehAdmin = usuarioLogado?.admin === 1 || usuarioLogado?.admin === true;

  tbody.innerHTML =
    paginaDados.length === 0
      ? `<tr><td colspan="12" style="text-align:center; padding: 2rem; color: var(--cor-texto-secundario);">Nenhum chamado encontrado para os filtros selecionados.</td></tr>`
      : paginaDados
          .map((c) => {
            // Regra: só permite apontamento se o usuário for administrador ou for o responsável pela atividade
            const podeApontar = ehAdmin || (c.responsavel_id && Number(c.responsavel_id) === Number(usuarioLogado.id));

            const btnApontarHtml = podeApontar
              ? `<button type="button" class="btn btn-secundario btn-apontar-tabela" data-chamado-id="${c.id}" data-chamado-titulo="${escaparAtributo(c.titulo || '')}" title="Lançar horas neste chamado">⏱️ Apontar</button>`
              : `<button type="button" class="btn btn-secundario btn-apontar-tabela" disabled style="opacity: 0.35; cursor: not-allowed;" title="Apenas o responsável pela atividade ou um administrador pode realizar apontamentos">⏱️ Apontar</button>`;

            return `
              <tr>
                <td class="td-id">#${c.id}</td>
                <td title="${escaparAtributo(c.titulo)}"><a href="/chamado?id=${c.id}" class="link-sem-sublinhado">${escaparHtml(c.titulo)}</a></td>
                <td>${escaparHtml(c.etapa_atual || "-")}</td>
                <td>${badgeStatusColorido(c.status_etapa_nome || c.status_nome, c.status_etapa_cor || c.status_cor)}</td>
                <td>${escaparHtml(c.responsavel_nome || "-")}</td>
                <td>${escaparHtml(c.solicitante_nome || "-")}</td>
                <td>${escaparHtml(c.setor_nome || "-")}</td>
                <td>${escaparHtml(c.empresa_nome || "-")}</td>
                <td>${badgeStatusGeral(c.status_geral_texto)}</td>
                <td>${c.prazo ? escaparHtml(formatarDataBR(c.prazo)) : "-"}</td>
                <td>${situacaoBadge(c.prazo, c.status_nome)}</td>
                <td style="text-align: center;">${btnApontarHtml}</td>
              </tr>`;
          })
          .join("");

  // Anexa ouvintes de clique nos botões de apontamento rápido da tabela
  tbody.querySelectorAll(".btn-apontar-tabela:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const chamadoId = btn.dataset.chamadoId;
      const chamadoTitulo = btn.dataset.chamadoTitulo;
      abrirModalApontamentoRapido(chamadoId, chamadoTitulo);
    });
  });

  renderizarPaginacaoChamados(totalPaginas);
}

function renderizarPaginacaoChamados(totalPaginas) {
  const wrapPag = document.getElementById("paginacao-chamados-wrap");
  if (!wrapPag) return;

  const inicio = totalFiltrados === 0 ? 0 : (paginaAtual - 1) * limitePorPagina + 1;
  const fim = Math.min(paginaAtual * limitePorPagina, totalFiltrados);

  wrapPag.innerHTML = `
    <div class="paginacao-container">
      <div class="paginacao-info">
        Exibindo <strong>${inicio}</strong> a <strong>${fim}</strong> de <strong>${totalFiltrados}</strong> chamados
        <span style="margin: 0 0.4rem; color: var(--cor-borda);">|</span>
        Por página:
        <select id="seletor-limite-chamados" class="paginacao-seletor-limite">
          <option value="25" ${limitePorPagina === 25 ? "selected" : ""}>25</option>
          <option value="50" ${limitePorPagina === 50 ? "selected" : ""}>50</option>
          <option value="100" ${limitePorPagina === 100 ? "selected" : ""}>100</option>
        </select>
      </div>
      <div class="paginacao-acoes">
        <button type="button" class="btn-pagina" id="btn-chamados-primeira" ${paginaAtual <= 1 ? "disabled" : ""} title="Primeira página">«</button>
        <button type="button" class="btn-pagina" id="btn-chamados-anterior" ${paginaAtual <= 1 ? "disabled" : ""} title="Página anterior">‹ Anterior</button>
        <span style="font-size: 0.85rem; font-weight: 600; padding: 0 0.5rem;">Página ${paginaAtual} de ${totalPaginas}</span>
        <button type="button" class="btn-pagina" id="btn-chamados-proxima" ${paginaAtual >= totalPaginas ? "disabled" : ""} title="Próxima página">Próxima ›</button>
        <button type="button" class="btn-pagina" id="btn-chamados-ultima" ${paginaAtual >= totalPaginas ? "disabled" : ""} title="Última página">»</button>
      </div>
    </div>
  `;

  document.getElementById("seletor-limite-chamados")?.addEventListener("change", (e) => {
    limitePorPagina = Number(e.target.value) || 25;
    paginaAtual = 1;
    renderizarTabela();
  });

  document.getElementById("btn-chamados-primeira")?.addEventListener("click", () => {
    if (paginaAtual > 1) {
      paginaAtual = 1;
      renderizarTabela();
      anunciarA11y("Primeira página de chamados carregada.");
    }
  });

  document.getElementById("btn-chamados-anterior")?.addEventListener("click", () => {
    if (paginaAtual > 1) {
      paginaAtual--;
      renderizarTabela();
      anunciarA11y(`Página ${paginaAtual} de chamados carregada.`);
    }
  });

  document.getElementById("btn-chamados-proxima")?.addEventListener("click", () => {
    if (paginaAtual < totalPaginas) {
      paginaAtual++;
      renderizarTabela();
      anunciarA11y(`Página ${paginaAtual} de chamados carregada.`);
    }
  });

  document.getElementById("btn-chamados-ultima")?.addEventListener("click", () => {
    if (paginaAtual < totalPaginas) {
      paginaAtual = totalPaginas;
      renderizarTabela();
      anunciarA11y("Última página de chamados carregada.");
    }
  });
}

function configurarEventosFiltros() {
  const inputBusca = document.getElementById("filtro-busca-chamados");
  if (inputBusca) {
    const buscaDebounced = debounce(() => {
      paginaAtual = 1;
      renderizarTabela();
    }, 300);
    inputBusca.addEventListener("input", buscaDebounced);
  }

  const selects = [
    "filtro-status-chamados",
    "filtro-empresa-chamados",
    "filtro-responsavel-chamados",
    "filtro-setor-chamados",
  ];

  selects.forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      paginaAtual = 1;
      renderizarTabela();
    });
  });

  const btnToggleFiltros = document.getElementById("btn-toggle-filtros");
  const painelFiltros = document.getElementById("painel-filtros-chamados");

  if (btnToggleFiltros && painelFiltros) {
    btnToggleFiltros.addEventListener("click", () => {
      const estaOculto = painelFiltros.hidden || painelFiltros.style.display === "none";
      if (estaOculto) {
        painelFiltros.hidden = false;
        painelFiltros.style.display = "block";
      } else {
        painelFiltros.hidden = true;
        painelFiltros.style.display = "none";
      }
      atualizarEstadoBotaoFiltros();
    });
  }

  const btnLimpar = document.getElementById("btn-limpar-filtros-chamados");
  if (btnLimpar) {
    btnLimpar.addEventListener("click", () => {
      if (inputBusca) inputBusca.value = "";
      const selectStatus = document.getElementById("filtro-status-chamados");
      if (selectStatus) selectStatus.value = "ativos";
      const selectEmp = document.getElementById("filtro-empresa-chamados");
      if (selectEmp) selectEmp.value = "";
      const selectResp = document.getElementById("filtro-responsavel-chamados");
      if (selectResp) selectResp.value = "";
      const selectSetor = document.getElementById("filtro-setor-chamados");
      if (selectSetor) selectSetor.value = "";

      const seletorConsulta = document.getElementById("seletor-consulta-personalizada");
      if (seletorConsulta) seletorConsulta.value = "";
      atualizarEstadoBotoesConsulta(null);
      atualizarEstadoBotaoFiltros();

      paginaAtual = 1;
      renderizarTabela();
    });
  }

  const btnExportar = document.getElementById("btn-exportar-chamados");
  if (btnExportar) {
    btnExportar.addEventListener("click", () => {
      const dadosFiltrados = filtrarDados();
      const colunas = [
        { chave: "id", rotulo: "Protocolo" },
        { chave: "titulo", rotulo: "Chamado" },
        { chave: "etapa_atual", rotulo: "Etapa Atual" },
        { chave: "responsavel_nome", rotulo: "Responsável" },
        { chave: "solicitante_nome", rotulo: "Solicitante" },
        { chave: "setor_nome", rotulo: "Setor" },
        { chave: "empresa_nome", rotulo: "Empresa" },
        { chave: "status_etapa_nome", rotulo: "Status Etapa" },
        { chave: "status_geral_texto", rotulo: "Status Geral" },
        { chave: "prazo", rotulo: "Prazo" },
      ];
      const dataHoje = new Date().toISOString().slice(0, 10);
      exportarParaCsv(`meus_chamados_${dataHoje}`, colunas, dadosFiltrados);
      anunciarA11y(`Exportação de ${dadosFiltrados.length} chamados concluída.`);
    });
  }
}

function configurarOrdenacao() {
  document.querySelectorAll(".th-ordenavel").forEach((th) => {
    th.addEventListener("click", () => {
      const campo = th.dataset.col;
      if (!campo) return;
      if (ordemAtual.campo === campo) {
        ordemAtual.direcao = ordemAtual.direcao === "asc" ? "desc" : "asc";
      } else {
        ordemAtual.campo = campo;
        ordemAtual.direcao = campo === "id" ? "desc" : "asc";
      }
      renderizarTabela();
    });
  });
}

// ==========================================
// Apontamento Rápido na Linha do Chamado
// ==========================================
function configurarModalApontamentoRapido() {
  const modal = document.getElementById("modal-apontamento-rapido");
  const form = document.getElementById("form-apontamento-rapido");
  const btnFechar = document.getElementById("btn-fechar-modal-apontar");
  const btnCancelar = document.getElementById("btn-cancelar-apontamento-rapido");

  const fechar = () => {
    if (modal) {
      modal.hidden = true;
      modal.style.display = "none";
    }
  };

  btnFechar?.addEventListener("click", fechar);
  btnCancelar?.addEventListener("click", fechar);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) fechar();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgErro = document.getElementById("msg-erro-apontamento-rapido");
    const btnSalvar = document.getElementById("btn-salvar-apontamento-rapido");
    if (msgErro) msgErro.hidden = true;

    const chamadoId = Number(document.getElementById("apontamento-rapido-chamado-id").value);
    const data = document.getElementById("apontamento-rapido-data").value;
    const horas = Number(document.getElementById("apontamento-rapido-horas").value);
    const observacao = document.getElementById("apontamento-rapido-obs").value.trim();

    if (!data || !horas || horas <= 0) {
      mostrarErro(msgErro, "Preencha a data e uma quantidade válida de horas.");
      return;
    }

    if (btnSalvar) {
      btnSalvar.disabled = true;
      btnSalvar.textContent = "Salvando...";
    }

    try {
      await api(`/chamados/${chamadoId}/horas`, {
        method: "POST",
        body: { data, horas, observacao },
      });

      fechar();
      mostrarToast(`⏱️ Horas (${horas}h) lançadas com sucesso no chamado #${chamadoId}!`);
    } catch (err) {
      mostrarErro(msgErro, err);
    } finally {
      if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Lançar horas";
      }
    }
  });
}

function abrirModalApontamentoRapido(chamadoId, chamadoTitulo) {
  const modal = document.getElementById("modal-apontamento-rapido");
  const inputId = document.getElementById("apontamento-rapido-chamado-id");
  const spanInfo = document.getElementById("apontamento-chamado-info");
  const inputData = document.getElementById("apontamento-rapido-data");
  const inputHoras = document.getElementById("apontamento-rapido-horas");
  const inputObs = document.getElementById("apontamento-rapido-obs");
  const msgErro = document.getElementById("msg-erro-apontamento-rapido");

  if (!modal) return;
  if (msgErro) msgErro.hidden = true;

  if (inputId) inputId.value = String(chamadoId);
  if (spanInfo) spanInfo.textContent = `#${chamadoId} - ${chamadoTitulo || "Sem título"}`;
  if (inputData) inputData.value = new Date().toISOString().slice(0, 10);
  if (inputHoras) inputHoras.value = "";
  if (inputObs) inputObs.value = "";

  modal.hidden = false;
  modal.style.display = "flex";
  setTimeout(() => inputHoras?.focus(), 100);
}

// ==========================================
// Consultas Personalizadas Salvas
// ==========================================
function obterFiltrosAtuais() {
  return {
    busca: document.getElementById("filtro-busca-chamados")?.value.trim() || "",
    status: document.getElementById("filtro-status-chamados")?.value || "",
    empresa: document.getElementById("filtro-empresa-chamados")?.value || "",
    responsavel: document.getElementById("filtro-responsavel-chamados")?.value || "",
    setor: document.getElementById("filtro-setor-chamados")?.value || "",
  };
}

function atualizarEstadoBotaoFiltros() {
  const painelFiltros = document.getElementById("painel-filtros-chamados");
  const iconeToggle = document.getElementById("icone-toggle-filtros");
  const textoToggle = document.getElementById("texto-toggle-filtros");
  const btnToggleFiltros = document.getElementById("btn-toggle-filtros");

  const estaAberto = painelFiltros && !painelFiltros.hidden && painelFiltros.style.display !== "none";
  if (iconeToggle) iconeToggle.textContent = estaAberto ? "▴" : "▾";

  const filtros = obterFiltrosAtuais();
  const temFiltroAtivo = Boolean(
    filtros.busca ||
    (filtros.status && filtros.status !== "ativos") ||
    filtros.empresa ||
    filtros.responsavel ||
    filtros.setor
  );

  if (textoToggle) {
    if (estaAberto) {
      textoToggle.textContent = "Ocultar filtros";
    } else {
      textoToggle.textContent = temFiltroAtivo ? "Filtros (ativos)" : "Filtros";
    }
  }

  if (btnToggleFiltros) {
    if (estaAberto) {
      btnToggleFiltros.classList.add("btn-ativo");
    } else {
      btnToggleFiltros.classList.remove("btn-ativo");
    }
  }
}

function aplicarFiltros(filtros) {
  if (!filtros) return;
  const inputBusca = document.getElementById("filtro-busca-chamados");
  const selectStatus = document.getElementById("filtro-status-chamados");
  const selectEmpresa = document.getElementById("filtro-empresa-chamados");
  const selectResp = document.getElementById("filtro-responsavel-chamados");
  const selectSetor = document.getElementById("filtro-setor-chamados");

  if (inputBusca) inputBusca.value = filtros.busca || "";
  if (selectStatus) selectStatus.value = filtros.status !== undefined ? filtros.status : "ativos";
  if (selectEmpresa) selectEmpresa.value = filtros.empresa || "";
  if (selectResp) selectResp.value = filtros.responsavel || "";
  if (selectSetor) selectSetor.value = filtros.setor || "";

  atualizarEstadoBotaoFiltros();
  paginaAtual = 1;
  renderizarTabela();
}

function atualizarEstadoBotoesConsulta(consulta) {
  const btnPadrao = document.getElementById("btn-definir-padrao-consulta");
  const btnExcluir = document.getElementById("btn-excluir-consulta");
  const badgePadrao = document.getElementById("badge-consulta-ativa-padrao");

  if (!consulta) {
    if (btnPadrao) {
      btnPadrao.disabled = true;
      btnPadrao.innerHTML = `<span>⭐</span> Tornar padrão`;
    }
    if (btnExcluir) btnExcluir.disabled = true;
    if (badgePadrao) badgePadrao.style.display = "none";
    consultaAtivaId = null;
    return;
  }

  consultaAtivaId = consulta.id;
  const ehPadrao = consultaPadraoId === consulta.id || consulta.eh_padrao;

  if (badgePadrao) {
    badgePadrao.style.display = ehPadrao ? "inline-flex" : "none";
  }

  if (btnPadrao) {
    btnPadrao.disabled = false;
    btnPadrao.innerHTML = ehPadrao
      ? `<span>⭐</span> Padrão ativo`
      : `<span>⭐</span> Tornar padrão`;
    btnPadrao.title = ehPadrao
      ? "Clique para remover esta consulta como padrão ao abrir a tela"
      : "Definir esta consulta como sua preferência padrão ao abrir a tela";
  }

  if (btnExcluir) {
    const podeExcluir = usuarioLogado?.admin === 1 || consulta.eh_minha;
    btnExcluir.disabled = !podeExcluir;
    btnExcluir.title = podeExcluir ? "Excluir esta consulta" : "Apenas o criador ou administrador pode excluir";
  }
}

async function carregarConsultasSalvas(primeiroCarregamento = false) {
  try {
    const res = await api("/consultas-salvas?tela=chamados");
    consultasSalvas = res.consultas || [];
    consultaPadraoId = res.consulta_padrao_id || null;

    const optMinhas = document.getElementById("optgroup-minhas-consultas");
    const optPublicas = document.getElementById("optgroup-consultas-publicas");
    const seletor = document.getElementById("seletor-consulta-personalizada");

    if (optMinhas) optMinhas.innerHTML = "";
    if (optPublicas) optPublicas.innerHTML = "";

    const minhas = consultasSalvas.filter((c) => c.eh_minha);
    const publicas = consultasSalvas.filter((c) => !c.eh_minha && c.eh_publica);

    if (optMinhas) {
      if (minhas.length === 0) {
        optMinhas.innerHTML = `<option disabled value="">Nenhuma consulta privada</option>`;
      } else {
        optMinhas.innerHTML = minhas
          .map(
            (c) =>
              `<option value="${c.id}">${escaparHtml(c.nome)}${c.id === consultaPadraoId ? " ⭐ (Padrão)" : ""}</option>`
          )
          .join("");
      }
    }

    if (optPublicas) {
      if (publicas.length === 0) {
        optPublicas.innerHTML = `<option disabled value="">Nenhuma consulta pública</option>`;
      } else {
        optPublicas.innerHTML = publicas
          .map(
            (c) =>
              `<option value="${c.id}">${escaparHtml(c.nome)} (por ${escaparHtml(c.autor_nome)})${c.id === consultaPadraoId ? " ⭐ (Padrão)" : ""}</option>`
          )
          .join("");
      }
    }

    // Se for o carregamento inicial e houver consulta padrão salva pelo usuário, aplica-a automaticamente!
    if (primeiroCarregamento && consultaPadraoId) {
      const consultaPadrao = consultasSalvas.find((c) => c.id === consultaPadraoId);
      if (consultaPadrao && seletor) {
        seletor.value = String(consultaPadrao.id);
        const filtros = typeof consultaPadrao.filtros_json === "string"
          ? JSON.parse(consultaPadrao.filtros_json || "{}")
          : consultaPadrao.filtros_json;
        aplicarFiltros(filtros);
        atualizarEstadoBotoesConsulta(consultaPadrao);
      }
    } else if (consultaAtivaId && seletor) {
      seletor.value = String(consultaAtivaId);
      const c = consultasSalvas.find((item) => item.id === consultaAtivaId);
      atualizarEstadoBotoesConsulta(c || null);
    }
  } catch (err) {
    console.error("Erro ao carregar consultas personalizadas:", err);
  }
}

function configurarEventosConsultas() {
  const seletor = document.getElementById("seletor-consulta-personalizada");
  seletor?.addEventListener("change", (e) => {
    const id = Number(e.target.value);
    if (!id) {
      atualizarEstadoBotoesConsulta(null);
      return;
    }

    const consulta = consultasSalvas.find((c) => c.id === id);
    if (consulta) {
      const filtros = typeof consulta.filtros_json === "string"
        ? JSON.parse(consulta.filtros_json || "{}")
        : consulta.filtros_json;
      aplicarFiltros(filtros);
      atualizarEstadoBotoesConsulta(consulta);
      anunciarA11y(`Consulta "${consulta.nome}" aplicada.`);
    }
  });

  // Botão Tornar Padrão
  document.getElementById("btn-definir-padrao-consulta")?.addEventListener("click", async () => {
    if (!consultaAtivaId) return;
    const ehPadrao = consultaPadraoId === consultaAtivaId;
    try {
      await api(`/consultas-salvas/${consultaAtivaId}/padrao`, {
        method: "POST",
        body: { tela: "chamados", remover: ehPadrao },
      });
      consultaPadraoId = ehPadrao ? null : consultaAtivaId;
      const consulta = consultasSalvas.find((c) => c.id === consultaAtivaId);
      atualizarEstadoBotoesConsulta(consulta);
      await carregarConsultasSalvas(false);
      mostrarToast(
        ehPadrao
          ? "Consulta padrão removida. A tela agora abrirá com os filtros padrão."
          : `Consulta definida como sua preferência padrão ao abrir Meus Chamados!`
      );
    } catch (err) {
      alert(err.message || "Erro ao atualizar consulta padrão.");
    }
  });

  // Botão Excluir Consulta
  document.getElementById("btn-excluir-consulta")?.addEventListener("click", async () => {
    if (!consultaAtivaId) return;
    const consulta = consultasSalvas.find((c) => c.id === consultaAtivaId);
    if (!consulta) return;

    const confirmou = await confirmarAcao(
      "Excluir Consulta Personalizada",
      `Deseja realmente excluir a consulta "${consulta.nome}"?`,
      { textoConfirmar: "Excluir", tipo: "perigo" }
    );
    if (!confirmou) return;

    try {
      await api(`/consultas-salvas/${consultaAtivaId}`, { method: "DELETE" });
      mostrarToast(`Consulta "${consulta.nome}" excluída com sucesso.`);
      consultaAtivaId = null;
      seletor.value = "";
      atualizarEstadoBotoesConsulta(null);
      await carregarConsultasSalvas(false);
    } catch (err) {
      alert(err.message || "Erro ao excluir consulta.");
    }
  });

  // Modal Salvar Consulta
  const modalSalvar = document.getElementById("modal-salvar-consulta");
  const formSalvar = document.getElementById("form-salvar-consulta");
  const btnFecharModal = document.getElementById("btn-fechar-modal-consulta");
  const btnCancelarModal = document.getElementById("btn-cancelar-modal-consulta");

  const fecharModalSalvar = () => {
    if (modalSalvar) {
      modalSalvar.hidden = true;
      modalSalvar.style.display = "none";
    }
  };

  btnFecharModal?.addEventListener("click", fecharModalSalvar);
  btnCancelarModal?.addEventListener("click", fecharModalSalvar);
  modalSalvar?.addEventListener("click", (e) => {
    if (e.target === modalSalvar) fecharModalSalvar();
  });

  document.getElementById("btn-salvar-consulta-abrir")?.addEventListener("click", () => {
    const inputNome = document.getElementById("consulta-nome");
    const checkPublica = document.getElementById("consulta-publica");
    const checkPadrao = document.getElementById("consulta-padrao");
    const divResumo = document.getElementById("resumo-filtros-consulta");
    const msgErro = document.getElementById("msg-erro-modal-consulta");

    if (msgErro) msgErro.hidden = true;
    if (inputNome) inputNome.value = "";
    if (checkPublica) checkPublica.checked = false;
    if (checkPadrao) checkPadrao.checked = false;

    // Monta resumo dos filtros ativos
    const filtros = obterFiltrosAtuais();
    const partes = [];
    if (filtros.busca) partes.push(`<strong>Busca:</strong> "${escaparHtml(filtros.busca)}"`);
    if (filtros.status) partes.push(`<strong>Status:</strong> ${filtros.status === "ativos" ? "Em aberto" : filtros.status === "finalizado" ? "Finalizados" : "Todos"}`);
    if (filtros.empresa) partes.push(`<strong>Empresa:</strong> ${escaparHtml(filtros.empresa)}`);
    if (filtros.responsavel) {
      const respTxt = filtros.responsavel === "__meus__" ? "Atribuídos a mim" : filtros.responsavel === "__sem_responsavel__" ? "Não atribuído" : filtros.responsavel;
      partes.push(`<strong>Responsável:</strong> ${escaparHtml(respTxt)}`);
    }
    if (filtros.setor) partes.push(`<strong>Setor:</strong> ${escaparHtml(filtros.setor)}`);

    if (divResumo) {
      divResumo.innerHTML = partes.length > 0
        ? `<strong>Filtros ativos a serem salvos:</strong><br>${partes.join(" &bull; ")}`
        : `<em>Nenhum filtro específico aplicado (todos os registros).</em>`;
    }

    if (modalSalvar) {
      modalSalvar.hidden = false;
      modalSalvar.style.display = "flex";
      setTimeout(() => inputNome?.focus(), 100);
    }
  });

  formSalvar?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgErro = document.getElementById("msg-erro-modal-consulta");
    const btnSalvar = document.getElementById("btn-salvar-modal-consulta");
    const nome = document.getElementById("consulta-nome")?.value.trim();
    const ehPublica = Boolean(document.getElementById("consulta-publica")?.checked);
    const ehPadrao = Boolean(document.getElementById("consulta-padrao")?.checked);

    if (!nome) {
      mostrarErro(msgErro, "O nome da consulta é obrigatório.");
      return;
    }

    if (btnSalvar) {
      btnSalvar.disabled = true;
      btnSalvar.textContent = "Salvando...";
    }

    try {
      const filtros = obterFiltrosAtuais();
      const nova = await api("/consultas-salvas", {
        method: "POST",
        body: {
          tela: "chamados",
          nome,
          filtros_json: filtros,
          eh_publica: ehPublica,
          definir_como_padrao: ehPadrao,
        },
      });

      fecharModalSalvar();
      mostrarToast(`Consulta "${nome}" salva com sucesso!`);
      consultaAtivaId = nova.id;
      if (ehPadrao) consultaPadraoId = nova.id;
      await carregarConsultasSalvas(false);
      seletor.value = String(nova.id);
      atualizarEstadoBotoesConsulta(nova);
    } catch (err) {
      mostrarErro(msgErro, err);
    } finally {
      if (btnSalvar) {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar consulta";
      }
    }
  });
}

async function carregarChamados() {
  listaChamados = await api("/chamados");
  popularFiltrosSuperiores();
  renderizarTabela();
}

inicializar();
