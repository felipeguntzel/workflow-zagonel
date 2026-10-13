import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { escaparHtml, formatarDataBR, formatarDataHoraBR, mostrarErro } from "./ui.js";
import { api } from "./api.js";

let nosAtuais = [];
let modoVisualizacao = "c2"; // Padrão absoluto ao abrir tela: Fluxo Visual
let etapasExpandidas = false; // Por padrão, ao abrir, etapas vêm recolhidas (somente título, aprovação, status)
let resizeObserverC2 = null;

export function inicializar() {
  if (typeof window === "undefined") return;
  const usuario = exigirLogin();
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const visaoParam = params.get("visao");
  if (visaoParam === "horizontal" || visaoParam === "vertical") {
    modoVisualizacao = visaoParam;
  } else {
    modoVisualizacao = "c2";
  }

  if (usuario && id) {
    aplicarLayout(usuario);

    // Iniciar em tela cheia: recolhe a barra lateral principal do sistema para ampliar espaço
    const sidebar = document.querySelector(".sidebar");
    if (sidebar && !sidebar.classList.contains("recolhida")) {
      sidebar.classList.add("recolhida");
      const botaoColapsar = sidebar.querySelector("#btn-colapsar-sidebar");
      if (botaoColapsar) botaoColapsar.textContent = "»";
      try {
        localStorage.setItem("workflow_zagonel_sidebar_colapsada", "1");
      } catch (_) {}
    }

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

export function normalizarHierarquiaNos(nos) {
  if (!nos || nos.length === 0) return [];
  const raiz = nos.find((n) => !n.chamado_pai_id && !n.chamado_mae_id) || nos[0];
  if (!raiz) return nos;
  const raizId = raiz.id;

  const subchamadosRaiz = nos.filter((n) => n.id !== raizId && (!n.chamado_pai_id || n.chamado_pai_id === raizId));
  const temSubchamadosComPaiEspecifico = nos.some(
    (n) => n.id !== raizId && n.chamado_pai_id && n.chamado_pai_id !== raizId
  );

  // Se todos os subchamados apontavam diretamente para a raiz (legado do vinculo='mae')
  // encadeia-os na ordem sequencial de criação para que cada etapa se desloque para a direita
  if (subchamadosRaiz.length > 1 && !temSubchamadosComPaiEspecifico) {
    const ordenados = [...subchamadosRaiz].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    let anteriorId = raizId;
    const mapaPais = new Map();
    for (const sub of ordenados) {
      mapaPais.set(sub.id, anteriorId);
      anteriorId = sub.id;
    }
    return nos.map((n) => (mapaPais.has(n.id) ? { ...n, chamado_pai_id: mapaPais.get(n.id) } : n));
  }

  return nos;
}

export function construirArvore(nos) {
  const nosNormalizados = normalizarHierarquiaNos(nos);
  const porId = new Map(nosNormalizados.map((n) => [n.id, { ...n, filhos: [] }]));
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

  const nosNormalizados = normalizarHierarquiaNos(nos);
  const porId = new Map(nosNormalizados.map((n) => [n.id, { ...n, filhos: [] }]));
  for (const n of porId.values()) {
    if (n.chamado_pai_id && porId.has(n.chamado_pai_id)) {
      porId.get(n.chamado_pai_id).filhos.push(n);
    }
  }

  const raiz = nosNormalizados.find((n) => !n.chamado_pai_id && !n.chamado_mae_id) || nosNormalizados[0];

  function atribuirNivel(no, nivel) {
    no.nivel = Math.max(no.nivel ?? 0, nivel);
    for (const f of no.filhos) {
      atribuirNivel(f, (no.nivel ?? 0) + 1);
    }
  }

  if (porId.has(raiz.id)) {
    atribuirNivel(porId.get(raiz.id), 0);
  } else {
    for (const n of porId.values()) {
      if (!n.chamado_pai_id) atribuirNivel(n, 0);
    }
  }

  // Garantir que cada etapa subsequente no fluxo avance de fase (desloque para a direita na visão horizontal)
  const nosProcessados = Array.from(porId.values()).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  let nivelMinimo = 0;
  for (let i = 0; i < nosProcessados.length; i++) {
    const n = nosProcessados[i];
    if (n.id === raiz.id) {
      n.nivel = 0;
      continue;
    }

    const anterior = i > 0 ? nosProcessados[i - 1] : null;
    const saoIrmaosMesmoPai =
      anterior &&
      n.chamado_pai_id &&
      anterior.chamado_pai_id &&
      n.chamado_pai_id === anterior.chamado_pai_id &&
      n.chamado_pai_id !== raiz.id;

    if (saoIrmaosMesmoPai) {
      // Subetapas irmãs criadas em paralelo pelo mesmo chamado pai compartilham a mesma fase
      n.nivel = anterior.nivel;
    } else {
      // Etapas sequenciais avançam para a próxima fase (deslocando para a direita)
      if ((n.nivel ?? 0) <= nivelMinimo) {
        n.nivel = nivelMinimo + 1;
      }
    }
    nivelMinimo = Math.max(nivelMinimo, n.nivel);
  }

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

export function calcularEstruturaDiagramaC2(nos) {
  if (!nos || nos.length === 0) {
    return {
      nosProcessados: [],
      conexoes: [],
      totalColunas: 0,
      totalTrilhas: 1,
      temSync: false,
      etapaTravada: null,
      raizId: null,
    };
  }

  const nosNorm = normalizarHierarquiaNos(nos);
  const porId = new Map(nosNorm.map((n) => [n.id, { ...n, filhos: [], pais: [] }]));

  for (const n of porId.values()) {
    if (n.chamado_pai_id && porId.has(n.chamado_pai_id)) {
      porId.get(n.chamado_pai_id).filhos.push(n);
      n.pais.push(porId.get(n.chamado_pai_id));
    }
  }

  const raiz = nosNorm.find((n) => !n.chamado_pai_id && !n.chamado_mae_id) || nosNorm[0];
  const noRaiz = porId.get(raiz.id) || Array.from(porId.values())[0];

  // Atribuir colunas (níveis horizontais da esquerda para a direita)
  function atribuirNivel(no, nivel) {
    no.coluna = Math.max(no.coluna ?? 0, nivel);
    for (const f of no.filhos) {
      atribuirNivel(f, no.coluna + 1);
    }
  }
  atribuirNivel(noRaiz, 0);

  const listaNos = Array.from(porId.values());
  for (const n of listaNos) {
    if (n.coluna === undefined) n.coluna = 0;
  }

  // Atribuir trilhas verticais (linhas da grade para fluxos paralelos)
  let proximaTrilha = 0;
  function atribuirTrilhas(no, trilhaAtual) {
    if (no.trilha !== undefined) return;
    no.trilha = trilhaAtual;

    if (no.filhos.length === 0) return;
    if (no.filhos.length === 1) {
      atribuirTrilhas(no.filhos[0], trilhaAtual);
    } else {
      for (let i = 0; i < no.filhos.length; i++) {
        const t = (i === 0) ? trilhaAtual : ++proximaTrilha;
        atribuirTrilhas(no.filhos[i], t);
      }
    }
  }
  atribuirTrilhas(noRaiz, 0);

  const totalTrilhas = Math.max(1, proximaTrilha + 1);
  const maxColuna = Math.max(0, ...listaNos.map((n) => n.coluna));

  // Identificar nós únicos por coluna para centralização vertical
  const contagemPorColuna = new Map();
  for (const n of listaNos) {
    contagemPorColuna.set(n.coluna, (contagemPorColuna.get(n.coluna) || 0) + 1);
  }

  for (const n of listaNos) {
    const unicoNaColuna = contagemPorColuna.get(n.coluna) === 1;
    if (unicoNaColuna && totalTrilhas > 1 && n.filhos.length > 1) {
      n.spanTrilhas = totalTrilhas;
      n.trilha = 0;
      n.centralizado = true;
    } else if (unicoNaColuna && n.coluna < maxColuna && !listaNos.some((outro) => outro.coluna < n.coluna && contagemPorColuna.get(outro.coluna) > 1)) {
      n.spanTrilhas = totalTrilhas;
      n.trilha = 0;
      n.centralizado = true;
    } else {
      n.spanTrilhas = 1;
      n.centralizado = false;
    }
  }

  // Identificar status individual de cada nó (concluído, travado/pendente, cancelado, futuro)
  const hoje = new Date().toISOString().slice(0, 10);
  let etapaTravada = null;
  let maiorInatividadeDias = -1;

  for (const n of listaNos) {
    const statusNorm = String(n.status_nome || "").toLowerCase();
    const resNorm = String(n.resultado || "").toLowerCase();
    const ehFinalizado = Boolean(n.data_finalizacao || statusNorm === "finalizado" || resNorm === "aprovado");
    const ehCancelado = statusNorm.includes("cancelad") || resNorm === "reprovado";

    const dataRef = n.data_abertura || n.atualizado_em || n.criado_em || hoje;
    const diffDias = Math.max(0, Math.round((new Date(hoje) - new Date(dataRef)) / 86400000));
    n.diasInativo = diffDias;

    if (ehCancelado) {
      n.estadoC2 = "cancelado";
      n.iconeC2 = "✕";
      n.subtextoC2 = "Cancelada";
    } else if (n.id === noRaiz.id || (!n.chamado_pai_id && !n.chamado_mae_id) || Boolean(n.eh_mae)) {
      // Solicitação inicial representa a abertura do fluxo: não possui ação pendente nem fica parada/travada
      n.estadoC2 = "concluido";
      n.iconeC2 = "✓";
      n.subtextoC2 = "Iniciada";
    } else if (ehFinalizado) {
      n.estadoC2 = "concluido";
      n.iconeC2 = "✓";
      n.subtextoC2 = resNorm === "aprovado" ? "Aprovado" : "Concluído";
    } else {
      const paisConcluidos = n.pais.length === 0 || n.pais.every((p) => p.estadoC2 === "concluido");
      if (paisConcluidos) {
        n.estadoC2 = "travado";
        n.iconeC2 = "!";
        n.subtextoC2 = diffDias > 0 ? `Parado há ${diffDias} dia${diffDias > 1 ? "s" : ""}` : "Em andamento";
        if (diffDias > maiorInatividadeDias) {
          maiorInatividadeDias = diffDias;
          etapaTravada = n;
        }
      } else {
        n.estadoC2 = "futuro";
        n.iconeC2 = "○";
        n.subtextoC2 = "Aguardando";
      }
    }
  }

  if (!etapaTravada) {
    etapaTravada =
      listaNos.find((n) => n.id !== noRaiz.id && !n.eh_mae && n.estadoC2 === "travado") ||
      listaNos.find((n) => n.id !== noRaiz.id && !n.eh_mae && n.estadoC2 === "futuro") ||
      null;
  }

  // Conexões (arestas) entre etapas
  const conexoes = [];
  for (const p of listaNos) {
    for (const c of p.filhos) {
      let estiloConexao = "cinza";
      if (p.estadoC2 === "concluido" && c.estadoC2 === "concluido") {
        estiloConexao = "verde";
      } else if (c.estadoC2 === "travado") {
        estiloConexao = "vermelho";
      }

      conexoes.push({
        origemId: p.id,
        destinoId: c.id,
        estilo: estiloConexao,
      });
    }
  }

  // Verificar se há ramificações paralelas convergindo em sincronização final
  const temRamificacao = totalTrilhas > 1;
  const nosFolhas = listaNos.filter((n) => n.filhos.length === 0);
  const temSync = temRamificacao && nosFolhas.length > 1;

  let totalColunas = maxColuna + 1;
  if (temSync) {
    totalColunas += 1;
    for (const folha of nosFolhas) {
      conexoes.push({
        origemId: folha.id,
        destinoId: "sync",
        estilo: folha.estadoC2 === "concluido" ? "verde" : "cinza",
        isSync: true,
      });
    }
  }

  return {
    nosProcessados: listaNos,
    conexoes,
    totalColunas,
    totalTrilhas,
    temSync,
    etapaTravada,
    raizId: noRaiz.id,
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
    <div style="margin-bottom: 0.45rem; font-size: 0.82rem; color: var(--cor-texto-secundario); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.4rem;">
      <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
        <span><strong>Fluxo Horizontal (BPMN):</strong> Tarefas encadeadas da esquerda para a direita por setor</span>
        <span style="font-size: 0.78rem; display: inline-flex; align-items: center; gap: 0.4rem;">
          <span>🟢 Início</span>
          <span>•</span>
          <span>⚖️ Decisão / Aprovação</span>
          <span>•</span>
          <span>🔴 Fim</span>
        </span>
      </div>
      <span style="font-size: 0.78rem; background: var(--cor-fundo); border: 1px solid var(--cor-borda); padding: 0.15rem 0.45rem; border-radius: 4px;" title="Clique e segure com o botão direito do mouse para arrastar para os lados">
        🖱️ Arraste com o botão direito para navegar no fluxo
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
          <div style="height: 100%; min-height: 24px; display: flex; align-items: center; justify-content: center; opacity: 0.35;">
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

export function atualizarLinhasSvgC2(canvasInner, svgEl, conexoes) {
  if (typeof document === "undefined" || !canvasInner || !svgEl || !conexoes || conexoes.length === 0) return;

  const pathsAntigos = svgEl.querySelectorAll("path");
  pathsAntigos.forEach((p) => p.remove());

  const innerRect = canvasInner.getBoundingClientRect();
  const width = Math.max(innerRect.width, canvasInner.scrollWidth || 0);
  const height = Math.max(innerRect.height, canvasInner.scrollHeight || 0);

  svgEl.setAttribute("width", String(width));
  svgEl.setAttribute("height", String(height));
  svgEl.style.width = `${width}px`;
  svgEl.style.height = `${height}px`;

  for (const c of conexoes) {
    const elOrigem = document.getElementById(`c2-card-${c.origemId}`);
    const elDestino = document.getElementById(`c2-card-${c.destinoId}`);
    if (!elOrigem || !elDestino) continue;

    const rectOrigem = elOrigem.getBoundingClientRect();
    const rectDestino = elDestino.getBoundingClientRect();

    const x1 = rectOrigem.right - innerRect.left;
    const y1 = rectOrigem.top + rectOrigem.height / 2 - innerRect.top;
    const x2 = rectDestino.left - innerRect.left;
    const y2 = rectDestino.top + rectDestino.height / 2 - innerRect.top;

    const dx = Math.max(25, (x2 - x1) * 0.5);
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");

    if (c.estilo === "verde") {
      path.setAttribute("stroke", "#16a34a");
      path.setAttribute("stroke-width", "2.5");
      path.setAttribute("marker-end", "url(#c2-arrow-green)");
    } else if (c.estilo === "vermelho") {
      path.setAttribute("stroke", "#ef4444");
      path.setAttribute("stroke-width", "2.5");
      path.setAttribute("marker-end", "url(#c2-arrow-red)");
    } else {
      path.setAttribute("stroke", "#94a3b8");
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("marker-end", "url(#c2-arrow-gray)");
    }

    if (c.isSync) {
      path.setAttribute("stroke-dasharray", "4 4");
    }

    svgEl.appendChild(path);
  }
}

export function renderizarVisaoC2(nos) {
  if (typeof document === "undefined") return;

  const gridEl = document.getElementById("c2-grid-etapas");
  const canvasInner = document.getElementById("c2-canvas-inner");
  const svgEl = document.getElementById("c2-conexoes-svg");
  const tituloEl = document.getElementById("c2-diagrama-titulo");
  const subtituloEl = document.getElementById("c2-diagrama-subtitulo");
  const conteudoTempoEl = document.getElementById("c2-conteudo-tempo");
  const conteudoStatusEl = document.getElementById("c2-conteudo-status");
  const listaHistoricoEl = document.getElementById("c2-lista-historico");
  const blocoDetalhesEl = document.getElementById("c2-bloco-detalhes-card");
  const conteudoDetalhesEl = document.getElementById("c2-conteudo-detalhes-card");
  const btnFecharDetalhes = document.getElementById("c2-btn-fechar-detalhes");

  if (!gridEl || !canvasInner || !svgEl || !nos || nos.length === 0) return;

  const estrutura = calcularEstruturaDiagramaC2(nos);
  const raiz = nos.find((n) => !n.chamado_pai_id && !n.chamado_mae_id) || nos[0];

  if (tituloEl) {
    tituloEl.textContent = raiz?.titulo ? raiz.titulo : "Fluxo de Atendimento";
  }
  if (subtituloEl) {
    subtituloEl.textContent = raiz?.fluxo_nome ? raiz.fluxo_nome : "Zagonel";
  }

  // 1. Configurar Grade do Canvas
  gridEl.style.gridTemplateColumns = `repeat(${estrutura.totalColunas}, minmax(160px, 195px))`;
  gridEl.style.gridTemplateRows = `repeat(${estrutura.totalTrilhas}, minmax(68px, auto))`;

  // 2. Renderizar Cards Limpos no Estilo C.2
  let cardsHtml = "";
  for (const no of estrutura.nosProcessados) {
    const colStyle = `${no.coluna + 1} / span 1`;
    const rowStyle = no.centralizado ? `1 / span ${estrutura.totalTrilhas}` : `${no.trilha + 1} / span 1`;
    const alignSelf = no.centralizado ? "align-self: center;" : "";

    cardsHtml += `
      <div id="c2-card-${no.id}" class="c2-card c2-card--${no.estadoC2}" data-id="${no.id}" style="grid-column: ${colStyle}; grid-row: ${rowStyle}; ${alignSelf}">
        <div class="c2-card__topo">
          <span class="c2-card__icone c2-card__icone--${no.estadoC2}">${no.iconeC2}</span>
          <span class="c2-card__id">#${no.id}</span>
        </div>
        <div class="c2-card__nome" title="${escaparHtml(no.titulo || no.etapa_nome || '')}">
          ${escaparHtml(no.etapa_nome || no.titulo || "Etapa")}
        </div>
        <div class="c2-card__subtexto c2-card__subtexto--${no.estadoC2}">
          ${escaparHtml(no.subtextoC2)}
        </div>
      </div>
    `;
  }

  // Card de Sincronização / Conclusão de Etapas Paralelas
  if (estrutura.temSync) {
    const folhas = estrutura.nosProcessados.filter((n) => n.filhos.length === 0);
    const todasFinalizadas = folhas.every((f) => f.estadoC2 === "concluido");
    const pendentesCount = folhas.filter((f) => f.estadoC2 !== "concluido").length;

    cardsHtml += `
      <div id="c2-card-sync" class="c2-card c2-card--sync ${todasFinalizadas ? "c2-card--concluido" : ""}" style="grid-column: ${estrutura.totalColunas} / span 1; grid-row: 1 / span ${estrutura.totalTrilhas}; align-self: center;">
        <div class="c2-card__topo">
          <span class="c2-card__icone c2-card__icone--sync">${todasFinalizadas ? "✓" : "🔄"}</span>
        </div>
        <div class="c2-card__nome">
          Sincronização / Conclusão
        </div>
        <div class="c2-card__subtexto">
          ${todasFinalizadas ? "Todas as frentes concluídas" : `Aguarda ${pendentesCount} frente${pendentesCount > 1 ? "s" : ""} para finalizar`}
        </div>
      </div>
    `;
  }

  gridEl.innerHTML = cardsHtml;

  // 3. Preencher Painel Lateral: Tempo por Etapa
  if (conteudoTempoEl) {
    if (estrutura.etapaTravada) {
      const etapaTravadaNome = estrutura.etapaTravada.etapa_nome || estrutura.etapaTravada.titulo || "Etapa";
      const dias = estrutura.etapaTravada.diasInativo || 0;
      const horas = dias * 24;
      const textoInativo = dias > 0 ? `Parado há ${dias} dia${dias > 1 ? "s" : ""} (${horas}h)` : "Em andamento";
      const pctPrazo = Math.min(100, Math.max(15, dias * 15));

      conteudoTempoEl.innerHTML = `
        <div style="font-weight: 600; color: var(--cor-texto);">
          Em andamento na <strong>${escaparHtml(etapaTravadaNome)}</strong>
        </div>
        <div class="c2-tempo-barra-fundo">
          <div class="c2-tempo-barra-progresso" style="width: ${pctPrazo}%;"></div>
        </div>
        <div class="c2-tempo-alerta">
          <span>⏱️</span>
          <span>Tempo de inatividade: <strong>${textoInativo}</strong></span>
        </div>
      `;
    } else {
      conteudoTempoEl.innerHTML = `
        <div style="color: var(--cor-texto-secundario); font-size: 0.84rem;">
          ✓ Todas as etapas foram finalizadas com sucesso.
        </div>
      `;
    }
  }

  // 4. Preencher Painel Lateral: Detalhes do Status
  if (conteudoStatusEl) {
    const totalEtapas = nos.length;
    const finalizadas = nos.filter((n) => {
      const ehRaiz = n.id === raiz?.id || (!n.chamado_pai_id && !n.chamado_mae_id) || Boolean(n.eh_mae);
      return ehRaiz || n.data_finalizacao || String(n.status_nome || "").toLowerCase() === "finalizado" || String(n.resultado || "").toLowerCase() === "aprovado";
    }).length;
    const pctGeral = Math.round((finalizadas / totalEtapas) * 100);

    conteudoStatusEl.innerHTML = `
      <div class="c2-detalhes-linha">
        <span class="c2-detalhes-rotulo">Início:</span>
        <span class="c2-detalhes-valor">${formatarDataBR(raiz?.data_abertura)}</span>
        <span class="c2-detalhes-divisor">-</span>
        <span class="c2-detalhes-rotulo">Fim Estimado:</span>
        <span class="c2-detalhes-valor">${formatarDataBR(raiz?.prazo)}</span>
      </div>
      <div class="c2-detalhes-etapa-contagem">
        Etapa ${finalizadas} de ${totalEtapas} (${pctGeral}%)
      </div>
      <div class="c2-detalhes-progresso-barra">
        <div class="c2-detalhes-progresso-preenchimento" style="width: ${pctGeral}%;"></div>
      </div>
    `;
  }

  // 5. Preencher Painel Lateral: Histórico
  if (listaHistoricoEl) {
    const ordenados = [...nos].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    listaHistoricoEl.innerHTML = ordenados
      .map((item) => {
        const ehRaiz = item.id === raiz?.id || (!item.chamado_pai_id && !item.chamado_mae_id) || Boolean(item.eh_mae);
        const resNorm = String(item.resultado || "").toLowerCase();
        const statNorm = String(item.status_nome || "").toLowerCase();
        const ehConcluido = ehRaiz || Boolean(item.data_finalizacao || statNorm === "finalizado" || resNorm === "aprovado");
        const ehCancelado = statNorm.includes("cancelad") || resNorm === "reprovado";
        const pontoClasse = ehCancelado
          ? "c2-historico-ponto--vermelho"
          : ehConcluido
          ? "c2-historico-ponto--verde"
          : item.id === estrutura.etapaTravada?.id
          ? "c2-historico-ponto--vermelho"
          : "c2-historico-ponto--cinza";

        const dataExibicao = formatarDataBR(item.data_finalizacao || item.data_abertura);
        const nomeEtapa = item.etapa_nome || (ehRaiz ? "Solicitação Inicial" : (item.titulo || `Etapa #${item.id}`));

        return `
          <li class="c2-historico-item" data-id="${item.id}" style="cursor: pointer;" title="Clique para ver detalhes desta etapa">
            <div class="c2-historico-item__esquerda">
              <span class="c2-historico-ponto ${pontoClasse}"></span>
              <span class="c2-historico-nome">${escaparHtml(nomeEtapa)}</span>
            </div>
            <span class="c2-historico-data">${dataExibicao}</span>
          </li>
        `;
      })
      .join("");
  }

  // 6. Eventos interativos de clique em cards e itens do histórico
  const selecionarNo = (id) => {
    const no = nos.find((n) => String(n.id) === String(id));
    if (!no) return;

    gridEl.querySelectorAll(".c2-card").forEach((c) => c.classList.remove("c2-card--selecionado"));
    const cardEl = document.getElementById(`c2-card-${no.id}`);
    if (cardEl) cardEl.classList.add("c2-card--selecionado");

    if (blocoDetalhesEl && conteudoDetalhesEl) {
      blocoDetalhesEl.hidden = false;
      const resNorm = String(no.resultado || "").toLowerCase();
      const tagResultado = no.resultado
        ? `<span class="badge" style="background: ${resNorm.includes("aprovad") ? "#dcfce7" : "#fee2e2"}; color: ${resNorm.includes("aprovad") ? "#166534" : "#991b1b"}; font-size: 0.76rem; font-weight: 700; padding: 0.15rem 0.4rem; border-radius: 4px;">${escaparHtml(no.resultado)}</span>`
        : "";

      conteudoDetalhesEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.82rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.35rem;">
            <strong style="color: var(--cor-texto); font-size: 0.9rem;">#${no.id} ${escaparHtml(no.etapa_nome || no.titulo || "Etapa")}</strong>
            ${tagResultado}
          </div>
          <div><strong>🏢 Setor:</strong> ${escaparHtml(no.setor_nome || "Não definido")}</div>
          <div><strong>👤 Responsável:</strong> ${escaparHtml(no.responsavel_nome || "Não atribuído")}</div>
          <div><strong>📅 Prazo:</strong> ${formatarDataBR(no.prazo)}</div>
          <div><strong>Status:</strong> ${badgeStatus(no.status_nome, no.status_cor)}</div>
          ${
            no.diasInativo !== undefined && no.diasInativo > 0
              ? `<div style="color: #dc2626; font-weight: 600;">⏱️ Inatividade: ${no.diasInativo} dia(s)</div>`
              : ""
          }
          <div style="margin-top: 0.35rem;">
            <a href="/chamado?id=${no.id}${no.eh_mae || !no.chamado_mae_id ? '&modo=detalhes' : ''}" class="btn btn-primario" style="text-decoration: none; width: 100%; display: flex; align-items: center; justify-content: center; height: 30px; font-size: 0.8rem; box-sizing: border-box;">
              Abrir chamado #${no.id} →
            </a>
          </div>
        </div>
      `;
    }
  };

  gridEl.querySelectorAll(".c2-card").forEach((c) => {
    c.addEventListener("click", () => {
      const id = c.dataset.id;
      if (id) selecionarNo(id);
    });
  });

  listaHistoricoEl?.querySelectorAll(".c2-historico-item").forEach((item) => {
    item.addEventListener("click", () => {
      const id = item.dataset.id;
      if (id) selecionarNo(id);
    });
  });

  btnFecharDetalhes?.addEventListener("click", () => {
    if (blocoDetalhesEl) blocoDetalhesEl.hidden = true;
    gridEl.querySelectorAll(".c2-card").forEach((c) => c.classList.remove("c2-card--selecionado"));
  });

  // 7. Atualizar conexões SVG
  const desenhar = () => {
    atualizarLinhasSvgC2(canvasInner, svgEl, estrutura.conexoes);
  };

  desenhar();
  if (typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(desenhar);
    setTimeout(desenhar, 60);
  }

  // 8. Observador de redimensionamento para manter setas precisas
  if (typeof ResizeObserver !== "undefined") {
    if (resizeObserverC2) {
      try { resizeObserverC2.disconnect(); } catch (_) {}
    }
    resizeObserverC2 = new ResizeObserver(() => {
      desenhar();
    });
    resizeObserverC2.observe(canvasInner);
  }
}

function renderizarFluxoAtivo() {
  const c2Layout = document.getElementById("c2-visao-layout");
  const container = document.getElementById("arvore");
  const cardResumo = document.getElementById("card-resumo-fluxo");
  const wrapControlesLegados = document.getElementById("controles-expansao-legado");

  if (nosAtuais.length === 0) return;

  if (modoVisualizacao === "c2") {
    if (c2Layout) c2Layout.style.display = "grid";
    if (container) container.hidden = true;
    if (cardResumo) cardResumo.hidden = true;
    if (wrapControlesLegados) wrapControlesLegados.hidden = true;
    renderizarVisaoC2(nosAtuais);
  } else if (modoVisualizacao === "horizontal") {
    if (c2Layout) c2Layout.style.display = "none";
    if (container) {
      container.hidden = false;
      renderizarVisaoHorizontal(container, nosAtuais);
      vincularEventosInterativos(container);
    }
    if (cardResumo) cardResumo.hidden = false;
    if (wrapControlesLegados) wrapControlesLegados.hidden = false;
  } else {
    if (c2Layout) c2Layout.style.display = "none";
    if (container) {
      container.hidden = false;
      renderizarVisaoVertical(container, nosAtuais);
      vincularEventosInterativos(container);
    }
    if (cardResumo) cardResumo.hidden = false;
    if (wrapControlesLegados) wrapControlesLegados.hidden = false;
  }
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

  // 3. Navegação lateral arrastando com o botão direito do mouse
  habilitarNavegacaoArrastoLateral(container);
}

export function habilitarNavegacaoArrastoLateral(container) {
  if (!container) return () => {};

  const wrap = container.classList?.contains("geral-bpmn-wrap")
    ? container
    : container.querySelector?.(".geral-bpmn-wrap");

  if (!wrap) return () => {};

  if (container._dragAbortController) {
    try {
      container._dragAbortController.abort();
    } catch (_) {}
  }

  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  const signal = ac ? ac.signal : undefined;
  container._dragAbortController = ac;

  let isDragging = false;
  let startX = 0;
  let scrollStartLeft = 0;

  const onMouseDown = (e) => {
    // Permite arrastar com o botão direito (2) ou botão central (1)
    if (e.button !== 2 && e.button !== 1) return;

    isDragging = true;
    startX = e.clientX;
    scrollStartLeft = wrap.scrollLeft || 0;

    wrap.classList.add("bpmn-arrastando");
    if (typeof document !== "undefined" && document.body) {
      document.body.classList.add("bpmn-arrastando-global");
    }

    if (e.preventDefault) e.preventDefault();
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    wrap.scrollLeft = scrollStartLeft - dx;
  };

  const onMouseUp = (e) => {
    if ((e.button === 2 || e.button === 1) && isDragging) {
      isDragging = false;
      wrap.classList.remove("bpmn-arrastando");
      if (typeof document !== "undefined" && document.body) {
        document.body.classList.remove("bpmn-arrastando-global");
      }
    }
  };

  const onContextMenu = (e) => {
    // Previne menu de contexto ao arrastar ou interagir com botão direito no fluxo
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    return false;
  };

  const onBlur = () => {
    if (isDragging) {
      isDragging = false;
      wrap.classList.remove("bpmn-arrastando");
      if (typeof document !== "undefined" && document.body) {
        document.body.classList.remove("bpmn-arrastando-global");
      }
    }
  };

  container.addEventListener("mousedown", onMouseDown, signal ? { capture: true, signal } : { capture: true });
  container.addEventListener("contextmenu", onContextMenu, signal ? { capture: true, signal } : { capture: true });

  const win = typeof window !== "undefined" ? window : null;
  if (win) {
    win.addEventListener("mousemove", onMouseMove, signal ? { signal } : false);
    win.addEventListener("mouseup", onMouseUp, signal ? { signal } : false);
    win.addEventListener("blur", onBlur, signal ? { signal } : false);
  }

  return () => {
    if (ac) ac.abort();
    wrap.classList.remove("bpmn-arrastando");
    if (typeof document !== "undefined" && document.body) {
      document.body.classList.remove("bpmn-arrastando-global");
    }
  };
}

function configurarControlesTopo() {
  const btnC2 = document.getElementById("btn-visao-c2");
  const btnHorizontal = document.getElementById("btn-visao-horizontal");
  const btnVertical = document.getElementById("btn-visao-vertical");
  const btnExpandir = document.getElementById("btn-expandir-tudo");
  const btnRecolher = document.getElementById("btn-recolher-tudo");
  const wrapControlesLegados = document.getElementById("controles-expansao-legado");

  const atualizarBotoesOrientacao = () => {
    if (btnC2) btnC2.classList.toggle("ativo", modoVisualizacao === "c2");
    if (btnHorizontal) btnHorizontal.classList.toggle("ativo", modoVisualizacao === "horizontal");
    if (btnVertical) btnVertical.classList.toggle("ativo", modoVisualizacao === "vertical");
    if (wrapControlesLegados) {
      wrapControlesLegados.hidden = modoVisualizacao === "c2";
    }
  };

  btnC2?.addEventListener("click", () => {
    if (modoVisualizacao === "c2") return;
    modoVisualizacao = "c2";
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("workflow_visao_geral_orientacao_v2", "c2");
    }
    atualizarBotoesOrientacao();
    renderizarFluxoAtivo();
  });

  btnHorizontal?.addEventListener("click", () => {
    if (modoVisualizacao === "horizontal") return;
    modoVisualizacao = "horizontal";
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("workflow_visao_geral_orientacao_v2", "horizontal");
    }
    atualizarBotoesOrientacao();
    renderizarFluxoAtivo();
  });

  btnVertical?.addEventListener("click", () => {
    if (modoVisualizacao === "vertical") return;
    modoVisualizacao = "vertical";
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("workflow_visao_geral_orientacao_v2", "vertical");
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

  // Alternador de Tela Cheia do Fluxo Visual
  const btnTelaCheia = document.getElementById("btn-tela-cheia-fluxo");
  const layoutContainer = document.querySelector(".geral-fluxo-container");
  if (btnTelaCheia && layoutContainer) {
    btnTelaCheia.addEventListener("click", () => {
      const ativa = layoutContainer.classList.toggle("geral-fluxo-container--tela-cheia");
      const icone = btnTelaCheia.querySelector(".icone-tela-cheia");
      const texto = btnTelaCheia.querySelector(".texto-tela-cheia");
      if (icone) icone.textContent = ativa ? "🗗" : "⛶";
      if (texto) texto.textContent = ativa ? "Restaurar" : "Tela cheia";
      if (document.fullscreenEnabled) {
        if (ativa && !document.fullscreenElement) {
          layoutContainer.requestFullscreen?.().catch(() => {});
        } else if (!ativa && document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
      }
      setTimeout(() => {
        const svg = document.getElementById("c2-conexoes-svg");
        const inner = document.getElementById("c2-canvas-inner");
        if (svg && inner && nosAtuais.length > 0) {
          const est = calcularEstruturaDiagramaC2(nosAtuais);
          atualizarLinhasSvgC2(inner, svg, est.conexoes);
        }
      }, 150);
    });

    document.addEventListener("fullscreenchange", () => {
      const estaFs = Boolean(document.fullscreenElement);
      layoutContainer.classList.toggle("geral-fluxo-container--tela-cheia", estaFs);
      const icone = btnTelaCheia.querySelector(".icone-tela-cheia");
      const texto = btnTelaCheia.querySelector(".texto-tela-cheia");
      if (icone) icone.textContent = estaFs ? "🗗" : "⛶";
      if (texto) texto.textContent = estaFs ? "Restaurar" : "Tela cheia";
    });
  }

  // Alternador do bloco Tempo por Etapa (inicia recolhido)
  const blocoTempo = document.getElementById("c2-bloco-tempo");
  const tituloTempo = document.getElementById("c2-titulo-tempo");
  const conteudoTempo = document.getElementById("c2-conteudo-tempo");
  const btnToggleTempo = document.getElementById("btn-toggle-tempo");

  const alternarTempo = () => {
    if (!blocoTempo || !conteudoTempo) return;
    const estaOculto = conteudoTempo.style.display === "none";
    conteudoTempo.style.display = estaOculto ? "" : "none";
    blocoTempo.classList.toggle("c2-painel-bloco--recolhido", !estaOculto);
    if (btnToggleTempo) btnToggleTempo.textContent = estaOculto ? "▲ Recolher" : "▼ Expandir";
  };

  tituloTempo?.addEventListener("click", alternarTempo);

  // Alternador do bloco Histórico (inicia recolhido)
  const blocoHist = document.getElementById("c2-bloco-historico");
  const tituloHist = document.getElementById("c2-titulo-historico");
  const listaHist = document.getElementById("c2-lista-historico");
  const btnToggleHist = document.getElementById("btn-toggle-historico");

  const alternarHist = () => {
    if (!blocoHist || !listaHist) return;
    const estaOculto = listaHist.style.display === "none";
    listaHist.style.display = estaOculto ? "" : "none";
    blocoHist.classList.toggle("c2-painel-bloco--recolhido", !estaOculto);
    if (btnToggleHist) btnToggleHist.textContent = estaOculto ? "▲ Recolher" : "▼ Expandir";
  };

  tituloHist?.addEventListener("click", alternarHist);

  // Histórico Unificado de Ações no rodapé (inicia recolhido)
  const btnRecolherHistorico = document.getElementById("btn-recolher-historico");
  const cabecalhoHistorico = document.getElementById("cabecalho-historico");
  const wrapHistorico = document.getElementById("historico-auditoria-wrap");
  if (btnRecolherHistorico) {
    let historicoRecolhido = true; // Inicia recolhido por padrão
    if (wrapHistorico) wrapHistorico.style.display = "none";
    if (cabecalhoHistorico) cabecalhoHistorico.classList.add("painel-chamado-cabecalho--recolhido");
    btnRecolherHistorico.textContent = "▼ Expandir";

    btnRecolherHistorico.addEventListener("click", () => {
      historicoRecolhido = !historicoRecolhido;
      if (wrapHistorico) {
        wrapHistorico.style.display = historicoRecolhido ? "none" : "";
      }
      if (cabecalhoHistorico) {
        cabecalhoHistorico.classList.toggle("painel-chamado-cabecalho--recolhido", historicoRecolhido);
      }
      btnRecolherHistorico.textContent = historicoRecolhido ? "▼ Expandir" : "▲ Recolher";
    });
  }

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
