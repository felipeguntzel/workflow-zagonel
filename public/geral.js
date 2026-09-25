import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { escaparHtml, formatarDataBR, mostrarErro } from "./ui.js";
import { api } from "./api.js";

export function inicializar() {
  const usuario = exigirLogin();
  const id = new URLSearchParams(window.location.search).get("id");
  if (usuario && id) {
    aplicarLayout(usuario);
    const linkVoltar = document.getElementById("link-voltar-chamado");
    if (linkVoltar) {
      linkVoltar.href = `/chamado?id=${id}`;
      linkVoltar.textContent = `Chamado #${id}`;
    }
    carregarFluxoCompleto(id);
  }
}

function situacaoPrazoBadge(prazo, dataFinalizacao, statusNome) {
  const nomeNorm = String(statusNome || "").toLowerCase();
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

function badgeStatus(nome, cor) {
  if (!nome) return "";
  const corBase = cor || "#64748b";
  return `
    <span class="badge-status" style="background: ${corBase}15; color: ${corBase}; border: 1px solid ${corBase}40; font-weight: 700; display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.65rem; border-radius: 4px; font-size: 0.82rem;">
      <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: ${corBase};"></span>
      ${escaparHtml(nome)}
    </span>
  `;
}

function badgeEtapaTipo(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t === "aprovacao") {
    return `<span class="badge-status badge-legenda" style="background: #fdf4ff; color: #a21caf; border: 1px solid #f0abfc; font-weight: 700; font-size: 0.78rem; height: 26px; line-height: 26px; padding: 0 0.5rem;">⚖️ Aprovação</span>`;
  }
  return `<span class="badge-status badge-legenda" style="background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; font-weight: 600; font-size: 0.78rem; height: 26px; line-height: 26px; padding: 0 0.5rem;">📋 Tarefa</span>`;
}

function construirArvore(nos) {
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

function renderCardEtapa(no) {
  const corBorda = no.status_cor || "var(--cor-primaria)";
  const finalizado = Boolean(no.data_finalizacao || String(no.status_nome || "").toLowerCase() === "finalizado");

  let tagResultado = "";
  if (no.resultado) {
    const resNorm = String(no.resultado).toLowerCase();
    const ehAprovado = resNorm.includes("aprovad");
    tagResultado = `
      <span class="badge-status" style="background: ${ehAprovado ? '#dcfce7' : '#fee2e2'}; color: ${ehAprovado ? '#166534' : '#991b1b'}; border: 1px solid ${ehAprovado ? '#86efac' : '#fca5a5'}; font-weight: 700; font-size: 0.8rem; padding: 0.2rem 0.5rem; border-radius: 4px;">
        ${ehAprovado ? '✓' : '✕'} ${escaparHtml(no.resultado)}
      </span>
    `;
  }

  return `
    <li class="geral-arvore-item" data-id="${no.id}">
      <div class="card-etapa-geral" style="border-left-color: ${corBorda};">
        <div class="card-etapa-geral__cabecalho">
          <div class="card-etapa-geral__titulo">
            <span style="font-family: monospace; color: var(--cor-texto-secundario); font-size: 0.95rem;">#${no.id}</span>
            <span>${escaparHtml(no.titulo || no.etapa_nome || "Etapa")}</span>
            ${badgeEtapaTipo(no.etapa_tipo)}
            ${badgeStatus(no.status_nome, no.status_cor)}
            ${tagResultado}
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <a href="/chamado?id=${no.id}" class="btn btn-secundario" style="height: 32px; padding: 0 0.75rem; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 0.35rem; text-decoration: none;" title="Abrir detalhes deste chamado">
              Ver chamado →
            </a>
          </div>
        </div>

        <div class="card-etapa-geral__detalhes">
          <div>
            <strong>🏢 Setor:</strong> ${escaparHtml(no.setor_nome || "Não definido")}
          </div>
          <div>
            <strong>👤 Responsável:</strong> ${no.responsavel_nome ? escaparHtml(no.responsavel_nome) : '<em style="color: var(--cor-texto-secundario);">Ninguém atribuído</em>'}
          </div>
          <div>
            <strong>📅 Prazo:</strong> ${formatarDataBR(no.prazo)}
          </div>
          <div>
            ${situacaoPrazoBadge(no.prazo, no.data_finalizacao, no.status_nome)}
          </div>
          ${
            no.data_finalizacao
              ? `<div><strong style="color: var(--cor-primaria);">✓ Concluído em:</strong> ${formatarDataBR(no.data_finalizacao)}</div>`
              : ""
          }
        </div>

        <!-- Comentários da Etapa -->
        <details class="comentarios-etapa-wrap" data-chamado-id="${no.id}" style="margin-top: 0.65rem; border-top: 1px dashed var(--cor-borda); padding-top: 0.5rem;">
          <summary style="cursor: pointer; font-size: 0.84rem; font-weight: 600; color: var(--cor-primaria); user-select: none;">
            💬 Ver comentários da etapa
          </summary>
          <div class="comentarios-conteudo" style="margin-top: 0.65rem; padding-left: 0.25rem;">
            <div style="font-size: 0.82rem; color: var(--cor-texto-secundario);">Carregando comentários...</div>
          </div>
        </details>
      </div>

      ${
        no.filhos && no.filhos.length > 0
          ? `<ul class="geral-arvore-filhos">${no.filhos.map(renderCardEtapa).join("")}</ul>`
          : ""
      }
    </li>
  `;
}

async function carregarFluxoCompleto(chamadoId) {
  const container = document.getElementById("arvore");
  const cardResumo = document.getElementById("card-resumo-fluxo");
  const erroEl = document.getElementById("mensagem-erro");
  if (!container) return;

  try {
    const nos = await api(`/chamados/${chamadoId}/arvore`);
    if (!nos || nos.length === 0) {
      container.innerHTML = `<p style="padding: 2rem; text-align: center; color: var(--cor-texto-secundario);">Nenhuma etapa encontrada para este chamado.</p>`;
      return;
    }

    // Identificar o chamado raiz da solicitação
    const raiz = nos.find((n) => !n.chamado_pai_id && !n.chamado_mae_id) || nos[0];
    const totalEtapas = nos.length;
    const finalizadas = nos.filter((n) => n.data_finalizacao || String(n.status_nome || "").toLowerCase() === "finalizado").length;
    const pct = Math.round((finalizadas / totalEtapas) * 100);

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
            ${badgeStatus(raiz.status_nome, raiz.status_cor)}
            <span class="badge-status badge-legenda badge-legenda-secundaria">
              Progresso Geral: ${finalizadas}/${totalEtapas} etapas (${pct}%)
            </span>
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
            <span>${pct}% concluído</span>
          </div>
          <div class="geral-progresso-barra-fundo">
            <div class="geral-progresso-barra-preenchimento" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
      cardResumo.hidden = false;
    }

    // Renderizar Árvore Hierárquica
    const raizes = construirArvore(nos);
    container.innerHTML = `<ul class="geral-arvore-lista">${raizes.map(renderCardEtapa).join("")}</ul>`;

    // Carregar comentários quando expandir o <details>
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
              conteudo.innerHTML = `<div style="font-size: 0.82rem; color: var(--cor-texto-secundario); font-style: italic;">Nenhum comentário registrado nesta etapa.</div>`;
              return;
            }

            conteudo.innerHTML = comentarios
              .map(
                (c) => `
                <div class="comentario-balao">
                  <div class="comentario-balao__topo">
                    <strong style="color: var(--cor-primaria); font-size: 0.84rem;">${escaparHtml(c.usuario_nome || "Sistema")}</strong>
                    <span>${formatarDataBR(c.data)}</span>
                  </div>
                  <div style="line-height: 1.45; color: var(--cor-texto); font-size: 0.86rem; white-space: pre-wrap;">${escaparHtml(c.texto)}</div>
                </div>
              `
              )
              .join("");
          } catch (_) {
            conteudo.innerHTML = `<div style="font-size: 0.82rem; color: var(--cor-texto-secundario);">Não foi possível carregar os comentários.</div>`;
          }
        },
        { once: true }
      );
    });

    // Configurar botões de Expandir e Recolher todas as etapas
    const btnExpandir = document.getElementById("btn-expandir-tudo");
    const btnRecolher = document.getElementById("btn-recolher-tudo");

    btnExpandir?.addEventListener("click", () => {
      container.querySelectorAll("details.comentarios-etapa-wrap").forEach((d) => {
        d.open = true;
      });
    });

    btnRecolher?.addEventListener("click", () => {
      container.querySelectorAll("details.comentarios-etapa-wrap").forEach((d) => {
        d.open = false;
      });
    });
  } catch (e) {
    if (erroEl) mostrarErro(erroEl, e);
  }
}

inicializar();
