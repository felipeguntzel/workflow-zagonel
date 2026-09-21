import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro, escaparAtributo, escaparHtml } from "./ui.js";
import { api } from "./api.js";

export function inicializar() {
  const usuario = exigirLogin();
  if (!usuario) return;
  aplicarLayout(usuario);
  const linkNovo = document.getElementById("link-novo-chamado");
  if (linkNovo && !permissaoDaTela("chamados").inserir) {
    linkNovo.hidden = true;
  }
  carregarChamados().catch((e) => mostrarErro(document.getElementById("mensagem-erro"), e));
}

let listaChamados = [];
let ordemAtual = { campo: "id", direcao: "desc" };

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

function renderizarTabela() {
  const dados = [...listaChamados];
  dados.sort((a, b) => {
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

  const tbody = document.getElementById("tabela-chamados");
  if (!tbody) return;
  tbody.innerHTML =
    dados.length === 0
      ? `<tr><td colspan="5" style="text-align:center; padding: 1.5rem; color: var(--cor-texto-secundario);">Nenhum chamado encontrado.</td></tr>`
      : dados
          .map(
            (c) => `
              <tr>
                <td class="td-id">#${c.id}</td>
                <td title="${escaparAtributo(c.titulo)}"><a href="/chamado?id=${c.id}">${escaparHtml(c.titulo)}</a></td>
                <td>${escaparHtml(c.status_nome)}</td>
                <td>${c.prazo}</td>
                <td>${situacaoBadge(c.prazo, c.status_nome)}</td>
              </tr>`
          )
          .join("");
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
  configurarOrdenacao();
  renderizarTabela();
}

inicializar();
