import { logout, permissaoDaTela } from "./auth.js";
import { escaparHtml } from "./ui.js";
import { api } from "./api.js";

const CHAVE_COLAPSADA = "workflow_zagonel_sidebar_colapsada";

export const TELAS_SISTEMA = [
  // Cadastros (em ordem alfabética)
  { numero: "01", codigo: "1", id: "empresas", titulo: "Empresas", grupo: "Cadastros", href: "/empresas", telaPerm: "empresas" },
  { numero: "02", codigo: "2", id: "fluxos", titulo: "Fluxos", grupo: "Cadastros", href: "/fluxo", telaPerm: "fluxos" },
  { numero: "03", codigo: "3", id: "grupos", titulo: "Grupos de Permissão", grupo: "Cadastros", href: "/grupos", adminApenas: true },
  { numero: "04", codigo: "4", id: "setores", titulo: "Setores", grupo: "Cadastros", href: "/setores", telaPerm: "setores" },
  { numero: "05", codigo: "5", id: "status", titulo: "Status", grupo: "Cadastros", href: "/status", telaPerm: "status" },
  { numero: "06", codigo: "6", id: "usuarios", titulo: "Usuários", grupo: "Cadastros", href: "/usuarios", telaPerm: "usuarios" },
  // Chamados (em ordem alfabética)
  { numero: "07", codigo: "7", id: "chamados", titulo: "Meus chamados", grupo: "Chamados", href: "/chamados", telaPerm: "chamados" },
  { numero: "08", codigo: "8", id: "novo-chamado", titulo: "Abrir novo chamado", grupo: "Chamados", href: "/novo-chamado", telaPerm: "chamados", acaoPerm: "inserir" },
  // Dashboards
  { numero: "09", codigo: "9", id: "dashboards", titulo: "Dashboards", grupo: "Dashboards", href: "/dashboards", telaPerm: "dashboards" },
  // Administração (apenas admin)
  { numero: "10", codigo: "10", id: "sql", titulo: "Editor SQL", grupo: "Administração", href: "/sql", adminApenas: true },
  { numero: "11", codigo: "11", id: "auditoria", titulo: "Auditoria do Sistema", grupo: "Administração", href: "/auditoria", adminApenas: true },
];

export function normalizarRota(url) {
  if (url === undefined || url === null) return "empresas";
  let u = String(url).trim().split("?")[0].split("#")[0];
  if (u.startsWith("/")) u = u.slice(1);
  if (u.endsWith(".html")) u = u.slice(0, -5);
  if (u === "" || u === "index" || u === "login") return "login";
  if (u === "fluxos") return "fluxo";
  return u;
}

const cachePaginas = new Map();
const cacheModulos = new Map();

export async function preCarregarRota(url) {
  if (!url) return;
  const rota = normalizarRota(url);
  if (rota === "login" || rota === "trocar-senha" || cachePaginas.has(rota)) return;
  try {
    const arquivo = rota === "" ? "index.html" : `${rota}.html`;
    let resp = await fetch(`/${arquivo}`);
    if (!resp.ok) resp = await fetch(`/${rota}`);
    if (resp.ok) {
      const html = await resp.text();
      cachePaginas.set(rota, html);
    }
  } catch (_) {}
}

export function preCarregarTodasTelas() {
  const rotas = [
    "chamados",
    "novo-chamado",
    "empresas",
    "setores",
    "status",
    "usuarios",
    "grupos",
    "fluxos",
    "fluxo",
    "dashboards",
    "auditoria",
    "sql",
    "geral",
  ];
  rotas.forEach((r) => {
    preCarregarRota(r);
  });
}

export function podeAcessarTela(tela, usuario) {
  if (!usuario) return false;
  if (tela.adminApenas) return !!usuario.admin;
  if (tela.telaPerm) {
    const perm = permissaoDaTela(tela.telaPerm);
    if (tela.acaoPerm) return !!perm[tela.acaoPerm];
    return !!perm.visualizar;
  }
  return true;
}

export function aplicarPreferenciasVisuais(usuario) {
  const html = document.documentElement;
  html.setAttribute("data-tema", usuario?.tema ?? "claro");
  html.setAttribute("data-fonte", usuario?.fonte ?? "arial");
  html.setAttribute("data-tamanho", usuario?.tamanho_fonte ?? "m");
}

export async function navegarPara(url, push = true) {
  const rota = normalizarRota(url);
  if (rota === "login") {
    window.location.href = "/";
    return;
  }
  if (rota === "trocar-senha") {
    window.location.href = "/trocar-senha";
    return;
  }

  let barra = document.getElementById("barra-carregando-navegacao");
  if (!barra) {
    barra = document.createElement("div");
    barra.id = "barra-carregando-navegacao";
    barra.className = "barra-navegacao-carregando";
    document.body.appendChild(barra);
  }
  barra.style.display = "block";
  barra.style.width = "45%";

  try {
    let html = cachePaginas.get(rota);
    if (!html) {
      const arquivo = rota === "" ? "index.html" : `${rota}.html`;
      let resp = await fetch(`/${arquivo}`);
      if (!resp.ok) resp = await fetch(`/${rota}`);
      if (!resp.ok) {
        const dest = url.startsWith("/") ? url : `/${url}`;
        window.location.href = dest;
        return;
      }
      html = await resp.text();
      cachePaginas.set(rota, html);
    }

    barra.style.width = "80%";
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const novoMain = doc.querySelector("main");
    if (!novoMain) {
      const dest = url.startsWith("/") ? url : `/${url}`;
      window.location.href = dest;
      return;
    }

    // Animação de transição suave
    novoMain.style.animation = "transicaoTela 0.18s ease-out";

    // Sincronizar stylesheets adicionais requeridos pela tela
    doc.querySelectorAll("link[rel='stylesheet']").forEach((link) => {
      const href = link.getAttribute("href");
      if (href && !document.querySelector(`link[rel='stylesheet'][href="${href}"]`)) {
        const novoLink = document.createElement("link");
        novoLink.rel = "stylesheet";
        novoLink.href = href;
        document.head.appendChild(novoLink);
      }
    });

    // Sincronizar scripts externos adicionais
    doc.querySelectorAll("script:not([type='module'])").forEach((scr) => {
      const src = scr.getAttribute("src");
      if (src && !document.querySelector(`script[src="${src}"]`)) {
        const novoScript = document.createElement("script");
        novoScript.src = src;
        document.head.appendChild(novoScript);
      }
    });

    const mainAtual = document.querySelector("main");
    if (mainAtual) {
      mainAtual.replaceWith(novoMain);
    } else {
      const conteudo = document.querySelector(".app-shell__conteudo");
      if (conteudo) conteudo.appendChild(novoMain);
    }

    if (doc.title) {
      document.title = doc.title;
    }

    // Atualizar classe ativa dos links da sidebar
    document.querySelectorAll(".sidebar__link").forEach((link) => {
      const href = link.getAttribute("href");
      const rotaLink = normalizarRota(href);
      const ativo = rotaLink === rota;
      link.classList.toggle("sidebar__link--ativo", ativo);
    });

    const sidebar = document.querySelector(".sidebar");
    if (sidebar && sidebar.classList.contains("aberta")) {
      sidebar.classList.remove("aberta");
    }

    // Montar URL limpa para histórico
    const params = url.includes("?") ? `?${url.split("?")[1]}` : "";
    const hash = url.includes("#") ? `#${url.split("#")[1]}` : "";
    const urlLimpa = `/${rota}${params}${hash}`;

    if (push) {
      window.history.pushState({}, "", urlLimpa);
    }

    window.scrollTo({ top: 0, behavior: "instant" });

    // Ciclo de vida rápido de módulos JS
    const scriptTag = doc.querySelector("script[type='module']");
    if (scriptTag && scriptTag.src) {
      const scriptUrl = scriptTag.getAttribute("src");
      const scriptSrc = scriptUrl.replace(/^\.?\//, "");
      
      let modulo = cacheModulos.get(scriptSrc);
      if (!modulo) {
        modulo = await import(`./${scriptSrc}`);
        cacheModulos.set(scriptSrc, modulo);
      }

      if (typeof modulo.inicializar === "function") {
        modulo.inicializar();
      } else if (typeof modulo.default === "function") {
        modulo.default();
      } else {
        // Fallback dinâmico se módulo não expuser inicializar
        await import(`./${scriptSrc}?t=${Date.now()}`);
      }
    }
  } catch (err) {
    console.error("Erro na transição rápida de tela, redirecionando:", err);
    window.location.href = url.startsWith("/") ? url : `/${url}`;
  } finally {
    if (barra) {
      barra.style.width = "100%";
      setTimeout(() => {
        barra.style.display = "none";
        barra.style.width = "0%";
      }, 120);
    }
  }
}

function construirSidebar(usuario, modalBusca) {
  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  if (localStorage.getItem(CHAVE_COLAPSADA) === "1") {
    sidebar.classList.add("recolhida");
  }

  const rotaAtual = normalizarRota(window.location.pathname);
  const telasPermitidas = TELAS_SISTEMA.filter((t) => podeAcessarTela(t, usuario));

  const grupos = ["Cadastros", "Chamados", "Dashboards", "Administração"];

  const navHtml = grupos
    .map((nomeGrupo) => {
      const telasDoGrupo = telasPermitidas.filter((t) => t.grupo === nomeGrupo);
      if (telasDoGrupo.length === 0) return "";
      const linksHtml = telasDoGrupo
        .map((t) => {
          const ativo = normalizarRota(t.href) === rotaAtual ? " sidebar__link--ativo" : "";
          return `
            <div class="sidebar__link-wrap">
              <a href="${t.href}" class="sidebar__link${ativo}" title="[${t.numero}] ${t.titulo}">
                <span class="sidebar__numero">${t.numero}</span>
                <span class="sidebar__link-texto">${t.titulo}</span>
              </a>
              <a href="${t.href}" target="_blank" rel="noopener noreferrer" class="sidebar__link-externo" title="Abrir ${t.titulo} em nova guia" aria-label="Abrir ${t.titulo} em nova guia">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              </a>
            </div>
          `;
        })
        .join("");

      return `
        <div class="sidebar__grupo">
          <div class="sidebar__grupo-titulo">${nomeGrupo}</div>
          ${linksHtml}
        </div>
      `;
    })
    .join("");

  const primeiraLetra = (usuario?.nome || "U").trim().charAt(0).toUpperCase();

  sidebar.innerHTML = `
    <div class="sidebar__cabecalho">
      <span class="sidebar__logo">
        <img src="favicon.svg" alt="" class="sidebar__logo-img">
        <span class="sidebar__logo-texto">WorkFlow</span>
      </span>
      <button type="button" class="sidebar__colapsar" id="btn-colapsar-sidebar" aria-label="Recolher menu">«</button>
    </div>
    <div class="sidebar__busca-wrap">
      <button type="button" class="sidebar__busca" id="btn-sidebar-busca" title="Navegação rápida de telas (Pressione F1 ou Ctrl+F)">
        <span class="sidebar__busca-icone">🔍</span>
        <span class="sidebar__busca-texto">Ir para tela...</span>
        <kbd class="sidebar__busca-atalho" title="Pressione F1 ou Ctrl+F">F1</kbd>
      </button>
    </div>
    <nav class="sidebar__nav">
      ${navHtml}
    </nav>
    <div class="sidebar__rodape">
      <button type="button" class="sidebar__usuario" id="btn-sidebar-usuario" aria-haspopup="true" aria-expanded="false" title="Opções da conta">
        <span class="sidebar__usuario-avatar">${primeiraLetra}</span>
        <span class="sidebar__usuario-info">
          <span class="sidebar__usuario-nome">${escaparHtml(usuario?.nome ?? "")}</span>
          <span class="sidebar__usuario-cargo">${usuario?.admin ? "Administrador" : "Usuário"}</span>
        </span>
        <span class="sidebar__usuario-seta">▲</span>
      </button>
      <div class="sidebar__usuario-menu" id="sidebar-usuario-menu" hidden>
        <button type="button" id="btn-instalar-pwa" class="sidebar__usuario-item" style="display: none; width: 100%; border: none; background: none; text-align: left; cursor: pointer; color: var(--cor-primaria); font-weight: 700; padding: 0.5rem 0.75rem; font-size: 0.85rem;">📲 Instalar Aplicativo</button>
        <a href="#" id="link-preferencias">Preferências</a>
        <a href="#" id="link-logout-todos" style="font-size: 0.8rem; color: var(--cor-perigo, #e53935);">Sair de todos os dispositivos</a>
        <a href="#" id="link-sair">Sair</a>
      </div>
    </div>
  `;

  const btnInstalarPwa = sidebar.querySelector("#btn-instalar-pwa");
  if (btnInstalarPwa && typeof window !== "undefined") {
    if (window.__promptInstalacaoPwa) {
      btnInstalarPwa.style.display = "block";
    }
    btnInstalarPwa.addEventListener("click", async () => {
      if (window.__promptInstalacaoPwa) {
        window.__promptInstalacaoPwa.prompt();
        const { outcome } = await window.__promptInstalacaoPwa.userChoice;
        if (outcome === "accepted") {
          btnInstalarPwa.style.display = "none";
        }
        window.__promptInstalacaoPwa = null;
      }
    });
  }

  if (modalBusca) {
    const btnBusca = sidebar.querySelector("#btn-sidebar-busca");
    btnBusca?.addEventListener("click", () => {
      modalBusca.abrirModal();
    });
  }

  const botaoColapsar = sidebar.querySelector("#btn-colapsar-sidebar");
  botaoColapsar.textContent = sidebar.classList.contains("recolhida") ? "»" : "«";
  botaoColapsar.addEventListener("click", () => {
    const recolhida = sidebar.classList.toggle("recolhida");
    localStorage.setItem(CHAVE_COLAPSADA, recolhida ? "1" : "0");
    botaoColapsar.textContent = recolhida ? "»" : "«";
  });

  const btnUsuario = sidebar.querySelector("#btn-sidebar-usuario");
  const menuUsuario = sidebar.querySelector("#sidebar-usuario-menu");

  btnUsuario.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const abrindo = menuUsuario.hidden;
    menuUsuario.hidden = !abrindo;
    btnUsuario.setAttribute("aria-expanded", String(abrindo));
  });

  document.addEventListener("click", () => {
    menuUsuario.hidden = true;
    btnUsuario.setAttribute("aria-expanded", "false");
  });

  sidebar.querySelector("#link-sair").addEventListener("click", (ev) => {
    ev.preventDefault();
    logout();
    window.location.href = "/";
  });

  sidebar.querySelector("#link-logout-todos")?.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    menuUsuario.hidden = true;
    btnUsuario.setAttribute("aria-expanded", "false");
    const { confirmarAcao, mostrarAviso } = await import("./modal.js");
    const confirmado = await confirmarAcao(
      "Encerrar outras sessões?",
      "Deseja encerrar a sessão em todos os outros navegadores e dispositivos?",
      {
        textoCancelar: "Cancelar",
        textoConfirmar: "Encerrar sessões",
        tipo: "perigo",
      }
    );
    if (!confirmado) {
      return;
    }
    try {
      const { api } = await import("./api.js");
      await api.post("/logout-todos");
      await mostrarAviso("Todas as outras sessões foram encerradas com sucesso.", "Sessões encerradas", "sucesso");
    } catch (e) {
      await mostrarAviso("Erro ao encerrar sessões: " + (e.message || e), "Erro ao encerrar", "perigo");
    }
  });

  sidebar.querySelector("#link-preferencias").addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    menuUsuario.hidden = true;
    btnUsuario.setAttribute("aria-expanded", "false");
    const { abrirPainelPreferencias } = await import("./preferencias.js");
    abrirPainelPreferencias();
  });

  return sidebar;
}

function construirModalBusca(usuario) {
  const fundo = document.createElement("div");
  fundo.className = "modal-fundo modal-fundo--busca";
  fundo.id = "modal-busca-telas";
  fundo.hidden = true;
  fundo.style.display = "none";

  fundo.innerHTML = `
    <div class="modal modal--busca" role="dialog" aria-modal="true" aria-labelledby="titulo-busca-tela">
      <div class="modal__cabecalho-busca">
        <label id="titulo-busca-tela" for="campo-busca-tela" class="modal__busca-label">Busca rápida universal</label>
        <input type="text" id="campo-busca-tela" class="modal__busca-input" placeholder="Buscar chamados (#12) ou telas (ex: 01, usuarios)..." autocomplete="off">
      </div>
      <div class="modal__busca-lista" id="lista-busca-telas"></div>
      <div class="modal__busca-rodape">
        <span>Use <strong>Enter</strong> para abrir, <strong>Esc</strong> para fechar • Atalho: <strong>Ctrl + K</strong></span>
      </div>
    </div>
  `;

  const input = fundo.querySelector("#campo-busca-tela");
  const lista = fundo.querySelector("#lista-busca-telas");
  let indiceFoco = 0;

  function renderizarResultados(filtro = "") {
    const termo = filtro.trim().toLowerCase();
    const telasPermitidas = TELAS_SISTEMA.filter((t) => podeAcessarTela(t, usuario));

    let resultados = [];
    const numeroMatch = termo.replace(/^#/, "").match(/^\d+$/);
    if (numeroMatch) {
      const idChamado = termo.replace(/^#/, "");
      resultados.push({
        numero: `#${idChamado}`,
        titulo: `Abrir Chamado #${idChamado}`,
        grupo: "Chamados",
        href: `/chamado?id=${idChamado}`,
      });
    }

    const filtradas = telasPermitidas.filter((t) => {
      if (!termo) return true;
      const matchNum = t.numero.toLowerCase().includes(termo) || t.codigo === termo;
      const matchTitulo = t.titulo.toLowerCase().includes(termo);
      const matchGrupo = t.grupo.toLowerCase().includes(termo);
      return matchNum || matchTitulo || matchGrupo;
    });

    resultados = [...resultados, ...filtradas];

    if (resultados.length === 0) {
      lista.innerHTML = '<div style="padding: 0.8rem; font-size: 0.88rem; color: var(--cor-texto-secundario); text-align: center;">Nenhum resultado encontrado.</div>';
      return;
    }

    if (indiceFoco >= resultados.length) indiceFoco = 0;

    lista.innerHTML = resultados
      .map((t, idx) => `
        <a href="${t.href}" class="modal__busca-item${idx === indiceFoco ? " modal__busca-item--foco" : ""}" data-href="${t.href}" data-idx="${idx}">
          <div class="modal__busca-item-esquerda">
            <span class="modal__busca-item-num">${t.numero}</span>
            <span>${escaparHtml(t.titulo)}</span>
          </div>
          <span class="modal__busca-item-grupo">${escaparHtml(t.grupo)}</span>
        </a>
      `)
      .join("");
  }

  input.addEventListener("input", () => {
    indiceFoco = 0;
    renderizarResultados(input.value);
  });

  input.addEventListener("keydown", (ev) => {
    const itens = lista.querySelectorAll(".modal__busca-item");
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      if (itens.length > 0) {
        indiceFoco = (indiceFoco + 1) % itens.length;
        atualizarDestaque(itens);
      }
      return;
    }
    if (ev.key === "ArrowUp") {
      ev.preventDefault();
      if (itens.length > 0) {
        indiceFoco = (indiceFoco - 1 + itens.length) % itens.length;
        atualizarDestaque(itens);
      }
      return;
    }
    if (ev.key === "Enter") {
      ev.preventDefault();
      const selecionado = itens[indiceFoco];
      if (selecionado) {
        const destino = selecionado.getAttribute("data-href");
        fecharModal();
        navegarPara(destino);
      }
    }
  });

  function atualizarDestaque(itens) {
    itens.forEach((el, idx) => {
      el.classList.toggle("modal__busca-item--foco", idx === indiceFoco);
      if (idx === indiceFoco) {
        el.scrollIntoView({ block: "nearest" });
      }
    });
  }

  fundo.addEventListener("click", (ev) => {
    if (ev.target === fundo) {
      fecharModal();
    }
  });

  function abrirModal() {
    fundo.hidden = false;
    fundo.style.display = "flex";
    input.value = "";
    indiceFoco = 0;
    renderizarResultados("");
    setTimeout(() => input.focus(), 50);
  }

  function fecharModal() {
    fundo.hidden = true;
    fundo.style.display = "none";
  }

  window.addEventListener("keydown", (ev) => {
    const estaAberto = !fundo.hidden && fundo.style.display !== "none";
    if (ev.key === "F1") {
      ev.preventDefault();
      if (estaAberto) fecharModal();
      else abrirModal();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === "k" || ev.key === "K" || ev.key === "f" || ev.key === "F")) {
      ev.preventDefault();
      if (estaAberto) fecharModal();
      else abrirModal();
      return;
    }
    if (ev.key === "Escape") {
      if (estaAberto) {
        fecharModal();
      } else {
        // Fechar modais abertos no documento
        const modais = document.querySelectorAll(".modal-fundo:not([hidden])");
        modais.forEach((m) => {
          m.hidden = true;
          if (m.style) m.style.display = "none";
        });
      }
    }
    // Suporte a Ctrl + Enter para submissão ágil
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
      const active = document.activeElement;
      if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) {
        const form = active.closest("form");
        if (form) {
          const btn = form.querySelector("button[type='submit']") || form.querySelector(".btn-primario");
          if (btn && !btn.disabled) {
            ev.preventDefault();
            btn.click();
          }
        }
      }
    }
  });

  return { fundo, abrirModal, fecharModal };
}

function construirTopbar(usuario, sidebar, modalBusca, overlaySidebar) {
  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button type="button" class="topbar__hamburguer" id="btn-abrir-sidebar" aria-label="Abrir menu">☰</button>
    <div style="display: flex; align-items: center; gap: 0.65rem; margin-left: auto;">
      <button type="button" id="btn-busca-rapida-topbar" class="btn btn-secundario btn-pequeno" style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.25rem 0.6rem; font-size: 0.8rem;" title="Busca rápida universal (Ctrl + K)">
        <span>🔍</span>
        <span class="paleta-atalho-tag" style="margin: 0; padding: 0.1rem 0.35rem; font-size: 0.7rem;">Ctrl+K</span>
      </button>
      <a href="/chamados" id="link-notificacao-topbar" class="btn-icone" title="Meus chamados" style="position: relative; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; font-size: 1.15rem; width: 34px; height: 34px;">
        🔔
        <span id="badge-contador-chamados" style="display: none; position: absolute; top: -1px; right: -1px; background: var(--cor-alerta); color: #fff; font-size: 0.65rem; font-weight: bold; border-radius: 999px; padding: 1px 5px; min-width: 14px; text-align: center;"></span>
      </a>
    </div>
  `;

  topbar.querySelector("#btn-abrir-sidebar").addEventListener("click", () => {
    const aberta = sidebar.classList.toggle("aberta");
    if (overlaySidebar) {
      overlaySidebar.classList.toggle("visivel", aberta);
    }
  });

  const btnBusca = topbar.querySelector("#btn-busca-rapida-topbar");
  if (btnBusca && modalBusca) {
    btnBusca.addEventListener("click", () => modalBusca.abrirModal());
  }

  // Notificações leves periódicas
  iniciarNotificacoesLeves(topbar);

  return topbar;
}

let timerNotificacoes = null;
async function iniciarNotificacoesLeves(topbar) {
  if (!topbar) return;
  const badge = topbar.querySelector("#badge-contador-chamados");
  if (!badge) return;

  async function checar() {
    try {
      const chamados = await api("/chamados");
      if (Array.isArray(chamados)) {
        const pendentes = chamados.filter((c) => c.status_nome !== "finalizado");
        if (pendentes.length > 0) {
          badge.textContent = pendentes.length > 99 ? "99+" : String(pendentes.length);
          badge.style.display = "inline-block";
        } else {
          badge.style.display = "none";
        }
      }
    } catch (_) {}
  }

  checar();
  clearInterval(timerNotificacoes);
  timerNotificacoes = setInterval(checar, 60000);
}

let listenerNavegacaoInstalado = false;

export function aplicarLayout(usuario) {
  aplicarPreferenciasVisuais(usuario);

  const shellExistente = document.querySelector(".app-shell");
  if (shellExistente) {
    const rotaAtual = normalizarRota(window.location.pathname);
    shellExistente.querySelectorAll(".sidebar__link").forEach((link) => {
      const href = link.getAttribute("href");
      const ativo = normalizarRota(href) === rotaAtual;
      link.classList.toggle("sidebar__link--ativo", ativo);
    });
    return;
  }

  const navPlaceholder = document.getElementById("nav");
  if (!navPlaceholder) return;
  const main = document.querySelector("main");

  const shell = document.createElement("div");
  shell.className = "app-shell";

  const overlaySidebar = document.createElement("div");
  overlaySidebar.className = "sidebar-overlay";

  const modalBusca = construirModalBusca(usuario);
  const sidebar = construirSidebar(usuario, modalBusca);
  const topbar = construirTopbar(usuario, sidebar, modalBusca, overlaySidebar);

  overlaySidebar.addEventListener("click", () => {
    sidebar.classList.remove("aberta");
    overlaySidebar.classList.remove("visivel");
  });

  const conteudo = document.createElement("div");
  conteudo.className = "app-shell__conteudo";
  conteudo.appendChild(topbar);
  if (main) conteudo.appendChild(main);

  shell.appendChild(overlaySidebar);
  shell.appendChild(sidebar);
  shell.appendChild(conteudo);
  shell.appendChild(modalBusca.fundo);

  navPlaceholder.replaceWith(shell);
  registrarServiceWorker();

  if (!listenerNavegacaoInstalado) {
    listenerNavegacaoInstalado = true;

    document.addEventListener("click", (e) => {
      const link = e.target.closest("a");
      if (!link) return;
      const href = link.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        link.target === "_blank" ||
        link.classList.contains("sidebar__link-externo")
      ) {
        return;
      }

      e.preventDefault();
      navegarPara(href);
    });

    document.addEventListener(
      "mouseover",
      (e) => {
        const link = e.target.closest("a");
        if (!link) return;
        const href = link.getAttribute("href");
        if (
          href &&
          !href.startsWith("#") &&
          !href.startsWith("javascript:") &&
          !href.startsWith("http://") &&
          !href.startsWith("https://") &&
          link.target !== "_blank"
        ) {
          preCarregarRota(href);
        }
      },
      { passive: true }
    );

    window.addEventListener("popstate", () => {
      const rota = window.location.pathname + window.location.search;
      navegarPara(rota, false);
    });
  }

  if (typeof window !== "undefined") {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => preCarregarTodasTelas());
    } else {
      setTimeout(preCarregarTodasTelas, 300);
    }
  }
}

// Registro e gerenciamento PWA
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.__promptInstalacaoPwa = e;
    const btn = document.getElementById("btn-instalar-pwa");
    if (btn) btn.style.display = "block";
  });
}

export function registrarServiceWorker() {
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Falha ao registrar Service Worker:", err);
      });
    });
  }
}

