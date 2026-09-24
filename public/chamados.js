import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro, escaparAtributo, escaparHtml, debounce, exportarParaCsv, anunciarA11y } from "./ui.js";
import { api } from "./api.js";

export function inicializar() {
  const usuario = exigirLogin();
  if (!usuario) return;
  aplicarLayout(usuario);
  const linkNovo = document.getElementById("link-novo-chamado");
  if (linkNovo && !permissaoDaTela("chamados").inserir) {
    linkNovo.hidden = true;
  }
  configurarEventosFiltros();
  configurarOrdenacao();
  carregarChamados().catch((e) => mostrarErro(document.getElementById("mensagem-erro"), e));
}

let listaChamados = [];
let ordemAtual = { campo: "id", direcao: "desc" };
let paginaAtual = 1;
let limitePorPagina = 25;
let totalFiltrados = 0;

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

function filtrarDados() {
  const termo = (document.getElementById("filtro-busca-chamados")?.value || "").trim().toLowerCase();
  const statusFiltro = document.getElementById("filtro-status-chamados")?.value || "";

  return listaChamados.filter((c) => {
    // Filtro de status
    if (statusFiltro === "ativos" && c.status_nome === "finalizado") return false;
    if (statusFiltro === "finalizado" && c.status_nome !== "finalizado") return false;

    // Filtro de busca textual
    if (termo) {
      const matchId = String(c.id).includes(termo.replace(/^#/, ""));
      const matchTitulo = String(c.titulo || "").toLowerCase().includes(termo);
      const matchEtapa = String(c.etapa_atual || "").toLowerCase().includes(termo);
      const matchSol = String(c.solicitante_nome || "").toLowerCase().includes(termo);
      const matchSetor = String(c.setor_nome || "").toLowerCase().includes(termo);
      const matchEmp = String(c.empresa_nome || "").toLowerCase().includes(termo);
      const matchStatus = String(c.status_nome || "").toLowerCase().includes(termo);
      const matchResp = String(c.responsavel_nome || "").toLowerCase().includes(termo);
      return matchId || matchTitulo || matchEtapa || matchSol || matchSetor || matchEmp || matchStatus || matchResp;
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
  tbody.innerHTML =
    paginaDados.length === 0
      ? `<tr><td colspan="9" style="text-align:center; padding: 2rem; color: var(--cor-texto-secundario);">Nenhum chamado encontrado para os filtros selecionados.</td></tr>`
      : paginaDados
          .map(
            (c) => `
              <tr>
                <td class="td-id">#${c.id}</td>
                <td title="${escaparAtributo(c.titulo)}"><a href="/chamado?id=${c.id}" class="link-sem-sublinhado">${escaparHtml(c.titulo)}</a></td>
                <td>${escaparHtml(c.etapa_atual || "-")}</td>
                <td>${escaparHtml(c.solicitante_nome || "-")}</td>
                <td>${escaparHtml(c.setor_nome || "-")}</td>
                <td>${escaparHtml(c.empresa_nome || "-")}</td>
                <td>${badgeStatusColorido(c.status_nome, c.status_cor)}</td>
                <td>${c.prazo ? escaparHtml(c.prazo) : "-"}</td>
                <td>${situacaoBadge(c.prazo, c.status_nome)}</td>
              </tr>`
          )
          .join("");

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

  const selectStatus = document.getElementById("filtro-status-chamados");
  if (selectStatus) {
    selectStatus.addEventListener("change", () => {
      paginaAtual = 1;
      renderizarTabela();
    });
  }

  const btnLimpar = document.getElementById("btn-limpar-filtros-chamados");
  if (btnLimpar) {
    btnLimpar.addEventListener("click", () => {
      if (inputBusca) inputBusca.value = "";
      if (selectStatus) selectStatus.value = "";
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
        { chave: "solicitante_nome", rotulo: "Solicitante" },
        { chave: "setor_nome", rotulo: "Setor" },
        { chave: "empresa_nome", rotulo: "Empresa" },
        { chave: "status_nome", rotulo: "Status" },
        { chave: "responsavel_nome", rotulo: "Responsável" },
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

async function carregarChamados() {
  listaChamados = await api("/chamados");
  renderizarTabela();
}

inicializar();
