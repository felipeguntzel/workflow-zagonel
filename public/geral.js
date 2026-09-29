import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { escaparHtml, formatarDataBR, formatarDataHoraBR, mostrarErro } from "./ui.js";
import { api } from "./api.js";

let nosAtuais = [];
let modoVisualizacao = (typeof localStorage !== "undefined" && localStorage.getItem("workflow_visao_geral_orientacao")) || "horizontal";
let etapasExpandidas = false; // Por padrão, ao abrir, etapas vêm recolhidas (somente título, aprovação, status)

export function inicializar() {
  if (typeof window === "undefined") return;
  const usuario = exigirLogin();
  const id = new URLSearchParams(window.location.search).get("id");
  if (usuario && id) {
    aplicarLayout(usuario);

    const toastSalvo = sessionStorage.getItem("workflow_toast_sucesso");
    if (toastSalvo) {
      sessionStorage.removeItem("workflow_toast_sucesso");
      let msgTexto = toastSalvo;
      try {
        const obj = JSON.parse(toastSalvo);
        if (obj && obj.mensagem) msgTexto = obj.mensagem;
      } catch (_) {}

      const toastEl = document.getElementById("toast-geral-sucesso");
      if (toastEl) {
        toastEl.textContent = msgTexto;
        toastEl.hidden = false;
        toastEl.style.display = "block";
        setTimeout(() => {
          toastEl.hidden = true;
          toastEl.style.display = "none";
        }, 5000);
      }
    }

    const linkVoltar = document.getElementById("link-voltar-chamado");
    if (linkVoltar) {
      linkVoltar.href = `/chamado?id=${id}&modo=detalhes`;
      linkVoltar.textContent = `Solicitação #${id}`;
      linkVoltar.title = "Ver campos e detalhes da solicitação inicial";
    }

    configurarControlesTopo();
    carregarFluxoCompleto(id);
  }
}

export function situacaoPrazoBadge(prazo, dataFinalizacao, statusNome) {
  const nomeNorm = String(statusNome || "").toLowerCase();
  if (nomeNorm === "cancelado" || nomeNorm === "cancelada") {
    return `<span class="badge" style="background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; font-weight: 700;">✕ Cancelada</span>`;
  }
  if (dataFinalizacao || nomeNorm === "finalizado") {
    return `<span class="badge badge-ok" style="background: #eaf3ee; color: #1d4a35; border: 1px solid #bbf7d0;">✓ Concluído</span>`;
  }
  if (!prazo) return "";
  const hoje = new Date().toISOString().slice(0, 10);
  const diff = Math.round((new Date(prazo) - new Date(hoje)) / 86400000);
  if (diff < 0) {
    return `<span class="badge badge-vencido">⚠️ ${Math.abs(diff)}d atrasado</span>`;
  }
  if (diff <= 2) {
    return `<span class="badge badge-alerta">⏰ Vence em ${diff}d</span>`;
  }
  return `<span class="badge badge-ok">No prazo</span>`;
}

export function badgeStatus(nome, cor) {
  if (!nome) return "";
  const nomeLower = String(nome).toLowerCase();
  const nomeExibicao = nomeLower === "cancelado" ? "Cancelado" : nome;
  const corBase = nomeLower.includes("cancelad") ? (cor || "#dc2626") : (cor || "#64748b");
  return `
    <span class="badge-status" style="background: ${corBase}15; color: ${corBase}; border: 1px solid ${corBase}40; font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.55rem; border-radius: 4px; font-size: 0.8rem;">
      <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: ${corBase};"></span>
      ${escaparHtml(nomeExibicao)}
    </span>
  `;
}

export function badgeEtapaTipo(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t === "aprovacao") {
    return `<span class="bpmn-gateway-badge" title="Etapa de Decisão / Aprovação">⚖️ Aprovação</span>`;
  }
  return `<span class="badge-status badge-legenda" style="background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; font-weight: 600; font-size: 0.78rem; padding: 0.15rem 0.45rem;">📋 Tarefa</span>`;
}

export function construirArvore(nos) {
  const porId = new Map(nos.map((n) => [n.id, { ...n, filhos: [] }]));
  const raizes = [];
  for (const no of porId.values()) {
    if (no.chamado_pai_id && porId.has(no.chamado_pai_id)) {
      porId.get(no.chamado_pai_id).filhos.push(no);
    } else {
      raizes.push(no);
    }
  }
  return raizes;
}

export function calcularEstruturaBpmn(nos) {
  if (!nos || nos.length === 0) {
    return { setores: [], totalFases: 0, nosProcessados: [], raizId: null };
  }

  const porId = new Map(nos.map((n) => [n.id, { ...n, filhos: [] }]));
  for (const n of porId.values()) {
    if (n.chamado_pai_id && porId.has(n.chamado_pai_id)) {
      porId.get(n.chamado_pai_id).filhos.push(n);
    }
  }

  const raiz = nos.find((n) => !n.chamado_pai_id && !n.chamado_mae_id) || nos[0];

  function atribuirNivel(no, nivel) {
    no.nivel = nivel;
    for (const f of no.filhos) {
      atribuirNivel(f, nivel + 1);
    }
  }

  if (porId.has(raiz.id)) {
    atribuirNivel(porId.get(raiz.id), 0);
  } else {
    for (const n of porId.values()) {
      if (!n.chamado_pai_id) atribuirNivel(n, 0);
    }
  }

  const nosProcessados = Array.from(porId.values());
  const maxNivel = Math.max(0, ...nosProcessados.map((n) => n.nivel ?? 0));
  const totalFases = maxNivel + 1;

  const mapaSetores = new Map();
  const setorRaizId = raiz.setor_id || 0;
  const setorRaizNome = raiz.setor_nome || "Setor Solicitante";
  mapaSetores.set(setorRaizId, { id: setorRaizId, nome: setorRaizNome, icone: "🏢" });

  for (const n of nosProcessados) {
    const sId = n.setor_id || 0;
    const sNome = n.setor_nome || "Sem Setor";
    if (!mapaSetores.has(sId)) {
      mapaSetores.set(sId, { id: sId, nome: sNome, icone: "🏢" });
    }
  }

  return {
    setores: Array.from(mapaSetores.values()),
    totalFases,
    nosProcessados,
    raizId: raiz.id,
  };
}

export function formatarTituloEtapa(no) {
  const nomeEtapa = no.etapa_nome ? no.etapa_nome.trim() : "";
  const titulo = no.titulo ? no.titulo.trim() : "";

  if (nomeEtapa && titulo) {
    if (titulo.toLowerCase().includes(nomeEtapa.toLowerCase())) {
      return escaparHtml(titulo);
    }
    return `${escaparHtml(nomeEtapa)} <span style="font-weight: 500; opacity: 0.8; font-size: 0.88rem;">(${escaparHtml(titulo)})</span>`;
  }

  return escaparHtml(titulo || nomeEtapa || "Etapa");
}

export function renderHtmlCardEtapa(no, options = {}) {
  const resNorm = String(no.resultado || "").toLowerCase();
  const statusNorm = String(no.status_nome || "").toLowerCase();
  const ehReprovadoOuCancelado = resNorm === "reprovado" || statusNorm === "cancelado" || statusNorm === "cancelada";

  const corBorda = ehReprovadoOuCancelado
    ? (no.status_cor || "#dc2626")
    : no.status_cor || (no.data_finalizacao ? "var(--cor-sucesso)" : "var(--cor-primaria)");
  const estaRecolhido = options.expandido !== undefined ? !options.expandido : !etapasExpandidas;

  let tagResultado = "";
  if (no.resultado) {
    const resNorm = String(no.resultado).toLowerCase();
    const ehAprovado = resNorm.includes("aprovad");
    tagResultado = `
      <span class="badge-status" style="background: ${ehAprovado ? "#dcfce7" : "#fee2e2"}; color: ${
      ehAprovado ? "#166534" : "#991b1b"
    }; border: 1px solid ${ehAprovado ? "#86efac" : "#fca5a5"}; font-weight: 700; font-size: 0.78rem; padding: 0.15rem 0.45rem; border-radius: 4px;">
        ${ehAprovado ? "✓" : "✕"} ${escaparHtml(no.resultado)}
      </span>
    `;
  }

  const ehBpmn = Boolean(options.bpmn);
  const statusExibicao = (!no.eh_mae && statusNorm === "cancelado") ? "Cancelada" : no.status_nome;

  return `
    <div class="card-etapa-geral ${ehBpmn ? "bpmn-card-etapa" : ""} ${estaRecolhido ? "card-etapa-geral--recolhido" : ""}" data-id="${no.id}" style="border-left-color: ${corBorda};">
      <div class="card-etapa-geral__cabecalho">
        <div class="card-etapa-geral__titulo">
          <span style="font-family: monospace; color: var(--cor-texto-secundario); font-size: 0.92rem; font-weight: 700;">#${no.id}</span>
          <span style="font-weight: 700;">${formatarTituloEtapa(no)}</span>
          ${badgeEtapaTipo(no.etapa_tipo)}
          ${badgeStatus(statusExibicao, no.status_cor || (ehReprovadoOuCancelado ? "#dc2626" : null))}
          ${tagResultado}
        </div>
        <div style="display: flex; align-items: center; gap: 0.35rem;">
          <button type="button" class="btn-toggle-card-etapa" title="Alternar detalhes">
            ${estaRecolhido ? "▼ Expandir" : "▲ Recolher"}
          </button>
          ${no.eh_mae || !no.chamado_mae_id ? `
            <a href="/chamado?id=${no.id}&modo=detalhes" class="btn btn-secundario" style="height: 28px; padding: 0 0.55rem; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 0.25rem; text-decoration: none;" title="Ver detalhes da solicitação inicial #${no.id}">
              Ver solicitação →
            </a>
          ` : `
            <a href="/chamado?id=${no.id}" class="btn btn-secundario" style="height: 28px; padding: 0 0.55rem; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 0.25rem; text-decoration: none;" title="Abrir chamado #${no.id}">
              Ver →
            </a>
          `}
        </div>
      </div>

      <div class="card-etapa-geral__conteudo-expandido">
        <div class="card-etapa-geral__detalhes">
          <div>
            <strong>🏢 Setor:</strong> ${escaparHtml(no.setor_nome || "Não definido")}
          </div>
          <div>
            <strong>👤 Responsável:</strong> ${no.eh_mae || !no.chamado_mae_id
              ? '<span style="color: var(--cor-texto-secundario); font-style: italic;">Não aplicável (solicitação inicial)</span>'
              : (no.responsavel_nome ? escaparHtml(no.responsavel_nome) : '<em style="color: var(--cor-texto-secundario);">Ninguém atribuído</em>')
            }
          </div>
          <div>
            <strong>📅 Prazo:</strong> ${formatarDataBR(no.prazo)}
          </div>
          <div>
            ${situacaoPrazoBadge(no.prazo, no.data_finalizacao, no.status_nome)}
          </div>
          ${
            ehReprovadoOuCancelado && no.data_finalizacao
              ? `<div><strong style="color: #dc2626;">✕ Cancelada em:</strong> ${formatarDataBR(no.data_finalizacao)}</div>`
              : no.data_finalizacao
              ? `<div><strong style="color: var(--cor-primaria);">✓ Concluído em:</strong> ${formatarDataBR(no.data_finalizacao)}</div>`
              : ""
          }
        </div>

        <!-- Comentários da Etapa -->
        <details class="comentarios-etapa-wrap" data-chamado-id="${no.id}">
          <summary style="cursor: pointer; font-size: 0.82rem; font-weight: 600; color: var(--cor-primaria); user-select: none;">
            💬 Comentários da etapa
          </summary>
          <div class="comentarios-conteudo" style="margin-top: 0.4rem; padding-left: 0.25rem;">
            <div style="font-size: 0.8rem; color: var(--cor-texto-secundario);">Carregando comentários...</div>
          </div>
        </details>
      </div>
    </div>
  `;
}

// Renderização na Visão Vertical (Árvore Hierárquica)
function renderItemArvoreVertical(no) {
  return `
    <li class="geral-arvore-item" data-id="${no.id}">
      ${renderHtmlCardEtapa(no, { bpmn: false })}
      ${
        no.filhos && no.filhos.length > 0
          ? `<ul class="geral-arvore-filhos">${no.filhos.map(renderItemArvoreVertical).join("")}</ul>`
          : ""
      }
    </li>
  `;
}

function renderizarVisaoVertical(container, nos) {
  const raizes = construirArvore(nos);
  container.innerHTML = `
    <div style="margin-bottom: 0.85rem; font-size: 0.85rem; color: var(--cor-texto-secundario); display: flex; align-items: center; justify-content: space-between;">
      <span>Visualização Hierárquica em Árvore (${nos.length} etapa${nos.length > 1 ? "s" : ""})</span>
      <span style="font-size: 0.8rem;">Modo: ↕️ Vertical</span>
    </div>
    <ul class="geral-arvore-lista">${raizes.map(renderItemArvoreVertical).join("")}</ul>
  `;
}

// Renderização na Visão Horizontal (BPMN / Swimlanes por Setor)
function renderizarVisaoHorizontal(container, nos) {
  const { setores, totalFases, nosProcessados, raizId } = calcularEstruturaBpmn(nos);

  let html = `
    <div style="margin-bottom: 0.85rem; font-size: 0.85rem; color: var(--cor-texto-secundario); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
      <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
        <span><strong>Fluxo Horizontal (BPMN):</strong> Tarefas encadeadas da esquerda para a direita por raia de setor</span>
        <span style="font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.5rem;">
          <span>🟢 Início</span>
          <span>•</span>
          <span>⚖️ Decisão / Aprovação</span>
          <span>•</span>
          <span>🔴 Fim</span>
        </span>
      </div>
      <span style="font-size: 0.8rem; background: var(--cor-fundo); border: 1px solid var(--cor-borda); padding: 0.2rem 0.5rem; border-radius: 4px;">
        ↔️ Arraste para o lado para navegar no fluxo
      </span>
    </div>

    <div class="geral-bpmn-wrap">
      <table class="geral-bpmn-tabela">
        <thead class="bpmn-fases-cabecalho">
          <tr>
            <th class="bpmn-fase-th">Setor</th>
            ${Array.from({ length: totalFases })
              .map((_, i) => `<th class="bpmn-fase-th">${i === 0 ? "Fase 1 (Início)" : `Fase ${i + 1}`}</th>`)
              .join("")}
          </tr>
        </thead>
        <tbody>
  `;

  for (const setor of setores) {
    html += `
      <tr class="bpmn-raia-linha">
        <td class="bpmn-raia-setor">
          <div class="bpmn-raia-setor-conteudo">
            <span class="bpmn-raia-setor-icone">${setor.icone}</span>
            <span class="bpmn-raia-setor-nome">${escaparHtml(setor.nome)}</span>
          </div>
        </td>
    `;

    for (let fase = 0; fase < totalFases; fase++) {
      const etapasNaCelula = nosProcessados.filter(
        (n) => (n.setor_id || 0) === setor.id && (n.nivel ?? 0) === fase
      );

      html += `<td class="bpmn-celula-fase">`;

      if (etapasNaCelula.length > 0) {
        html += `<div class="bpmn-celula-etapas">`;
        for (const no of etapasNaCelula) {
          // Se for o início do processo (raiz na fase 0)
          if (fase === 0 && no.id === raizId) {
            html += `<div class="bpmn-marcador-inicio">🟢 Início da Solicitação</div>`;
          }

          html += renderHtmlCardEtapa(no, { bpmn: true });

          // Se for uma folha finalizada
          const finalizado = Boolean(no.data_finalizacao || String(no.status_nome || "").toLowerCase() === "finalizado");
          if (finalizado && (!no.filhos || no.filhos.length === 0)) {
            html += `<div class="bpmn-marcador-fim">🔴 Conclusão da Etapa</div>`;
          } else if (no.filhos && no.filhos.length > 0) {
            html += `
              <div class="bpmn-conector-linha" title="Gera ${no.filhos.length} subchamado(s)">
                <span>➔ Desdobra em ${no.filhos.length} subetapa${no.filhos.length > 1 ? "s" : ""}</span>
              </div>
            `;
          }
        }
        html += `</div>`;
      } else {
        html += `
          <div style="height: 100%; min-height: 50px; display: flex; align-items: center; justify-content: center; opacity: 0.35;">
            <div style="width: 100%; border-top: 1px dashed var(--cor-borda);"></div>
          </div>
        `;
      }

      html += `</td>`;
    }

    html += `</tr>`;
  }

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

function renderizarFluxoAtivo() {
  const container = document.getElementById("arvore");
  if (!container || nosAtuais.length === 0) return;

  if (modoVisualizacao === "horizontal") {
    renderizarVisaoHorizontal(container, nosAtuais);
  } else {
    renderizarVisaoVertical(container, nosAtuais);
  }

  vincularEventosInterativos(container);
}

function vincularEventosInterativos(container) {
  // 1. Alternar expansão individual do card de etapa
  container.querySelectorAll(".btn-toggle-card-etapa").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = btn.closest(".card-etapa-geral");
      if (!card) return;
      const estaRecolhido = card.classList.toggle("card-etapa-geral--recolhido");
      btn.textContent = estaRecolhido ? "▼ Expandir" : "▲ Recolher";
    });
  });

  // 2. Carregar comentários assincronamente sob demanda
  container.querySelectorAll("details.comentarios-etapa-wrap").forEach((detalhe) => {
    detalhe.addEventListener(
      "toggle",
      async () => {
        if (!detalhe.open) return;
        const cid = detalhe.dataset.chamadoId;
        const conteudo = detalhe.querySelector(".comentarios-conteudo");
        if (!conteudo) return;

        try {
          const comentarios = await api(`/chamados/${cid}/comentarios`).catch(() => []);
          if (comentarios.length === 0) {
            conteudo.innerHTML = `<div style="font-size: 0.8rem; color: var(--cor-texto-secundario); font-style: italic;">Nenhum comentário registrado nesta etapa.</div>`;
            return;
          }

          conteudo.innerHTML = comentarios
            .map(
              (c) => `
              <div class="comentario-balao">
                <div class="comentario-balao__topo">
                  <strong style="color: var(--cor-primaria); font-size: 0.82rem;">${escaparHtml(c.usuario_nome || "Sistema")}</strong>
                  <span>${formatarDataBR(c.data)}</span>
                </div>
                <div style="line-height: 1.4; color: var(--cor-texto); font-size: 0.84rem; white-space: pre-wrap;">${escaparHtml(c.texto)}</div>
              </div>
            `
            )
            .join("");
        } catch (_) {
          conteudo.innerHTML = `<div style="font-size: 0.8rem; color: var(--cor-texto-secundario);">Não foi possível carregar os comentários.</div>`;
        }
      },
      { once: true }
    );
  });
}

function configurarControlesTopo() {
  const btnHorizontal = document.getElementById("btn-visao-horizontal");
  const btnVertical = document.getElementById("btn-visao-vertical");
  const btnExpandir = document.getElementById("btn-expandir-tudo");
  const btnRecolher = document.getElementById("btn-recolher-tudo");

  const atualizarBotoesOrientacao = () => {
    if (btnHorizontal) btnHorizontal.classList.toggle("ativo", modoVisualizacao === "horizontal");
    if (btnVertical) btnVertical.classList.toggle("ativo", modoVisualizacao === "vertical");
  };

  btnHorizontal?.addEventListener("click", () => {
    if (modoVisualizacao === "horizontal") return;
    modoVisualizacao = "horizontal";
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("workflow_visao_geral_orientacao", "horizontal");
    }
    atualizarBotoesOrientacao();
    renderizarFluxoAtivo();
  });

  btnVertical?.addEventListener("click", () => {
    if (modoVisualizacao === "vertical") return;
    modoVisualizacao = "vertical";
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("workflow_visao_geral_orientacao", "vertical");
    }
    atualizarBotoesOrientacao();
    renderizarFluxoAtivo();
  });

  // Botão Expandir Tudo (abre todas as etapas e comentários)
  btnExpandir?.addEventListener("click", () => {
    etapasExpandidas = true;
    const container = document.getElementById("arvore");
    if (!container) return;

    container.querySelectorAll(".card-etapa-geral").forEach((c) => {
      c.classList.remove("card-etapa-geral--recolhido");
    });
    container.querySelectorAll(".btn-toggle-card-etapa").forEach((b) => {
      b.textContent = "▲ Recolher";
    });
    container.querySelectorAll("details.comentarios-etapa-wrap").forEach((d) => {
      d.open = true;
    });
  });

  // Botão Recolher Tudo (deixa recolhido: somente título, aprovação, status)
  btnRecolher?.addEventListener("click", () => {
    etapasExpandidas = false;
    const container = document.getElementById("arvore");
    if (!container) return;

    container.querySelectorAll(".card-etapa-geral").forEach((c) => {
      c.classList.add("card-etapa-geral--recolhido");
    });
    container.querySelectorAll(".btn-toggle-card-etapa").forEach((b) => {
      b.textContent = "▼ Expandir";
    });
    container.querySelectorAll("details.comentarios-etapa-wrap").forEach((d) => {
      d.open = false;
    });
  });

  atualizarBotoesOrientacao();
}

async function carregarFluxoCompleto(chamadoId) {
  const container = document.getElementById("arvore");
  const cardResumo = document.getElementById("card-resumo-fluxo");
  const erroEl = document.getElementById("mensagem-erro");
  if (!container) return;

  try {
    const nos = await api(`/chamados/${chamadoId}/arvore`);
    if (!nos || nos.length === 0) {
      container.innerHTML = `<p style="padding: 2.5rem; text-align: center; color: var(--cor-texto-secundario);">Nenhuma etapa encontrada para este chamado.</p>`;
      return;
    }

    nosAtuais = nos;

    // Identificar o chamado raiz da solicitação
    const raiz = nos.find((n) => !n.chamado_pai_id && !n.chamado_mae_id) || nos[0];
    const totalEtapas = nos.length;
    const finalizadas = nos.filter(
      (n) => n.data_finalizacao || String(n.status_nome || "").toLowerCase() === "finalizado" || String(n.status_nome || "").toLowerCase() === "cancelado" || String(n.status_nome || "").toLowerCase() === "cancelada"
    ).length;
    const temCancelamento = nos.some(
      (n) => String(n.status_nome || "").toLowerCase().includes("cancelad") || String(n.resultado || "").toLowerCase() === "reprovado"
    ) || String(raiz.status_nome || "").toLowerCase().includes("cancelad") || String(raiz.resultado || "").toLowerCase() === "reprovado";

    const pct = Math.round((finalizadas / totalEtapas) * 100);

    const badgeProgressoGeral = temCancelamento
      ? `<span class="badge-status" style="background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; font-weight: 700; font-size: 0.8rem; padding: 0.2rem 0.55rem; border-radius: 4px;">✕ Fluxo Cancelado por Reprovação (${finalizadas}/${totalEtapas})</span>`
      : `<span class="badge-status badge-legenda badge-legenda-secundaria">Progresso Geral: ${finalizadas}/${totalEtapas} etapas (${pct}%)</span>`;

    const estiloBarraPreenchimento = temCancelamento
      ? `width: ${pct}%; background: #dc2626;`
      : `width: ${pct}%;`;

    const textoProgressoBarra = temCancelamento
      ? `Fluxo cancelado na etapa de reprovação (${pct}% percorrido)`
      : `${pct}% concluído`;

    // Renderizar Card de Resumo do Fluxo no Padrão do App
    if (cardResumo) {
      cardResumo.innerHTML = `
        <div class="geral-resumo-topo">
          <div>
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--cor-primaria); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">
              Solicitação Original #${raiz.id}
            </div>
            <h3 style="margin: 0; font-size: 1.3rem; font-weight: 800; color: var(--cor-texto);">
              ${escaparHtml(raiz.titulo || "Chamado sem título")}
            </h3>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            ${badgeStatus(raiz.status_nome, raiz.status_cor || (temCancelamento ? "#dc2626" : null))}
            ${badgeProgressoGeral}
          </div>
        </div>

        <div class="geral-resumo-grid">
          <div class="geral-resumo-item">
            <span class="geral-resumo-rotulo">Fluxo</span>
            <span class="geral-resumo-valor">${escaparHtml(raiz.fluxo_nome || "Fluxo padrão")}</span>
          </div>
          <div class="geral-resumo-item">
            <span class="geral-resumo-rotulo">Solicitante</span>
            <span class="geral-resumo-valor">${escaparHtml(raiz.solicitante_nome || "-")}</span>
          </div>
          <div class="geral-resumo-item">
            <span class="geral-resumo-rotulo">Setor de Abertura</span>
            <span class="geral-resumo-valor">${escaparHtml(raiz.setor_nome || "-")}</span>
          </div>
          <div class="geral-resumo-item">
            <span class="geral-resumo-rotulo">Empresa</span>
            <span class="geral-resumo-valor">${escaparHtml(raiz.empresa_nome || "Zagonel S.A")}</span>
          </div>
          <div class="geral-resumo-item">
            <span class="geral-resumo-rotulo">Data de Abertura</span>
            <span class="geral-resumo-valor">${formatarDataBR(raiz.data_abertura)}</span>
          </div>
          <div class="geral-resumo-item">
            <span class="geral-resumo-rotulo">Prazo Estimado</span>
            <span class="geral-resumo-valor">${formatarDataBR(raiz.prazo)}</span>
          </div>
        </div>

        <div class="geral-progresso-wrap">
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600; color: var(--cor-texto-secundario);">
            <span>Andamento do Fluxo</span>
            <span>${textoProgressoBarra}</span>
          </div>
          <div class="geral-progresso-barra-fundo">
            <div class="geral-progresso-barra-preenchimento" style="${estiloBarraPreenchimento}"></div>
          </div>
        </div>
      `;
      cardResumo.hidden = false;
    }

    renderizarFluxoAtivo();
    carregarAuditoria(raiz ? raiz.id : id);
  } catch (e) {
    if (erroEl) mostrarErro(erroEl, e);
  }
}

async function carregarAuditoria(chamadoId) {
  const listaEl = document.getElementById("lista-historico-auditoria");
  if (!listaEl) return;
  try {
    const historico = await api(`/chamados/${chamadoId}/historico`);
    if (!Array.isArray(historico) || historico.length === 0) {
      listaEl.innerHTML = `<li style="color: var(--cor-texto-secundario); font-size: 0.9rem; padding: 0.5rem 0;">Nenhum registro de auditoria disponível para este fluxo.</li>`;
      return;
    }

    const historicoOrdenado = [...historico].sort((a, b) => {
      const dataA = new Date(a.criado_em || 0).getTime();
      const dataB = new Date(b.criado_em || 0).getTime();
      if (dataB !== dataA) return dataB - dataA;
      return (b.id || 0) - (a.id || 0);
    });

    listaEl.innerHTML = historicoOrdenado
      .map((item) => {
        const dataFormatada = formatarDataHoraBR(item.criado_em);
        const nomeEtapa = item.etapa_nome || (item.eh_chamado_mae ? "Solicitação Inicial" : `Etapa #${item.chamado_id}`);
        return `
          <li style="font-size: 0.88rem; border-left: 3px solid var(--cor-primaria); padding: 0.4rem 0.65rem; background: var(--cor-fundo); border-radius: 0 4px 4px 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;">
                <strong style="color: var(--cor-primaria);">${escaparHtml(item.usuario_nome || "Sistema")}</strong>
                <span style="font-size: 0.73rem; font-weight: 600; background: var(--cor-fundo-elevado); color: var(--cor-texto-secundario); border: 1px solid var(--cor-borda); border-radius: 3px; padding: 0.1rem 0.45rem;">
                  📍 ${escaparHtml(nomeEtapa)}
                </span>
              </div>
              <span style="color: var(--cor-texto-secundario); font-size: 0.8rem;">${dataFormatada}</span>
            </div>
            <div style="color: var(--cor-texto); line-height: 1.4;">${escaparHtml(item.detalhes)}</div>
          </li>
        `;
      })
      .join("");
  } catch (err) {
    listaEl.innerHTML = `<li style="color: var(--cor-texto-secundario); font-size: 0.88rem;">Não foi possível carregar o histórico de auditoria.</li>`;
  }
}

if (typeof window !== "undefined") {
  inicializar();
}
