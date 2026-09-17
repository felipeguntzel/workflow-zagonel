import { logout, permissaoDaTela } from "./auth.js";
import { escaparHtml } from "./ui.js";

const CHAVE_COLAPSADA = "workflow_zagonel_sidebar_colapsada";

export const TELAS_SISTEMA = [
  // Cadastros (em ordem alfabética)
  { numero: "01", codigo: "1", id: "empresas", titulo: "Empresas", grupo: "Cadastros", href: "empresas.html", telaPerm: "empresas" },
  { numero: "02", codigo: "2", id: "fluxos", titulo: "Fluxos", grupo: "Cadastros", href: "fluxo.html", telaPerm: "fluxos" },
  { numero: "03", codigo: "3", id: "grupos", titulo: "Grupos de Permissão", grupo: "Cadastros", href: "grupos.html", adminApenas: true },
  { numero: "04", codigo: "4", id: "setores", titulo: "Setores", grupo: "Cadastros", href: "setores.html", telaPerm: "setores" },
  { numero: "05", codigo: "5", id: "status", titulo: "Status", grupo: "Cadastros", href: "status.html", telaPerm: "status" },
  { numero: "06", codigo: "6", id: "usuarios", titulo: "Usuários", grupo: "Cadastros", href: "usuarios.html", telaPerm: "usuarios" },
  // Chamados (em ordem alfabética)
  { numero: "07", codigo: "7", id: "chamados", titulo: "Meus chamados", grupo: "Chamados", href: "chamados.html", telaPerm: "chamados" },
  { numero: "08", codigo: "8", id: "novo-chamado", titulo: "Abrir novo chamado", grupo: "Chamados", href: "novo-chamado.html", telaPerm: "chamados", acaoPerm: "inserir" },
  // Dashboards
  { numero: "09", codigo: "9", id: "dashboards", titulo: "Dashboards", grupo: "Dashboards", href: "dashboards.html" },
];

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
  const destinoLimpo = url.split("?")[0].split("#")[0];
  if (destinoLimpo === "index.html" || destinoLimpo === "trocar-senha.html") {
    window.location.href = url;
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
  barra.style.width = "40%";

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      window.location.href = url;
      return;
    }
    barra.style.width = "75%";
    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const novoMain = doc.querySelector("main");
    if (!novoMain) {
      window.location.href = url;
      return;
    }

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

    const nomePagina = destinoLimpo.split("/").pop();
    document.querySelectorAll(".sidebar__link").forEach((link) => {
      const href = link.getAttribute("href")?.split("?")[0];
      const ativo = href === nomePagina || (href === "fluxo.html" && nomePagina === "fluxos.html");
      link.classList.toggle("sidebar__link--ativo", ativo);
    });

    const sidebar = document.querySelector(".sidebar");
    if (sidebar && sidebar.classList.contains("aberta")) {
      sidebar.classList.remove("aberta");
    }

    if (push) {
      window.history.pushState({}, "", url);
    }

    window.scrollTo({ top: 0, behavior: "instant" });

    const scriptTag = doc.querySelector("script[type='module']");
    if (scriptTag && scriptTag.src) {
      const scriptUrl = scriptTag.getAttribute("src");
      await import(`./${scriptUrl.replace(/^\.?\//, "")}?t=${Date.now()}`);
    }
  } catch (err) {
    console.error("Erro na transição rápida de tela, redirecionando:", err);
    window.location.href = url;
  } finally {
    if (barra) {
      barra.style.width = "100%";
      setTimeout(() => {
        barra.style.display = "none";
        barra.style.width = "0%";
      }, 150);
    }
  }
}

function construirSidebar(usuario, modalBusca) {
  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  if (localStorage.getItem(CHAVE_COLAPSADA) === "1") {
    sidebar.classList.add("recolhida");
  }

  const paginaAtual = window.location.pathname.split("/").pop() || "empresas.html";
  const telasPermitidas = TELAS_SISTEMA.filter((t) => podeAcessarTela(t, usuario));

  const grupos = ["Cadastros", "Chamados", "Dashboards"];

  const navHtml = grupos
    .map((nomeGrupo) => {
      const telasDoGrupo = telasPermitidas.filter((t) => t.grupo === nomeGrupo);
      if (telasDoGrupo.length === 0) return "";
      const linksHtml = telasDoGrupo
        .map((t) => {
          const ativo = (t.href === paginaAtual || (t.href === "fluxo.html" && paginaAtual === "fluxos.html"))
            ? " sidebar__link--ativo"
            : "";
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
        <a href="#" id="link-preferencias">Preferências</a>
        <a href="#" id="link-sair">Sair</a>
      </div>
    </div>
  `;

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
    window.location.href = "index.html";
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
        <label id="titulo-busca-tela" for="campo-busca-tela" class="modal__busca-label">Navegação rápida de telas</label>
        <input type="text" id="campo-busca-tela" class="modal__busca-input" placeholder="Digite o número (ex: 01) ou nome da tela..." autocomplete="off">
      </div>
      <div class="modal__busca-lista" id="lista-busca-telas"></div>
      <div class="modal__busca-rodape">
        <span>Use <strong>Enter</strong> para ir até a tela, <strong>Esc</strong> para fechar</span>
      </div>
    </div>
  `;

  const input = fundo.querySelector("#campo-busca-tela");
  const lista = fundo.querySelector("#lista-busca-telas");
  let indiceFoco = 0;

  function renderizarResultados(filtro = "") {
    const termo = filtro.trim().toLowerCase();
    const telasPermitidas = TELAS_SISTEMA.filter((t) => podeAcessarTela(t, usuario));

    const filtradas = telasPermitidas.filter((t) => {
      if (!termo) return true;
      const matchNum = t.numero.toLowerCase().includes(termo) || t.codigo === termo;
      const matchTitulo = t.titulo.toLowerCase().includes(termo);
      const matchGrupo = t.grupo.toLowerCase().includes(termo);
      return matchNum || matchTitulo || matchGrupo;
    });

    if (filtradas.length === 0) {
      lista.innerHTML = '<div style="padding: 0.8rem; font-size: 0.88rem; color: var(--cor-texto-secundario); text-align: center;">Nenhuma tela encontrada.</div>';
      return;
    }

    if (indiceFoco >= filtradas.length) indiceFoco = 0;

    lista.innerHTML = filtradas
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
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === "f" || ev.key === "F")) {
      ev.preventDefault();
      if (estaAberto) fecharModal();
      else abrirModal();
      return;
    }
    if (ev.key === "Escape" && estaAberto) {
      fecharModal();
    }
  });

  return { fundo, abrirModal, fecharModal };
}

function construirTopbar(usuario, sidebar) {
  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button type="button" class="topbar__hamburguer" id="btn-abrir-sidebar" aria-label="Abrir menu">☰</button>
  `;

  topbar.querySelector("#btn-abrir-sidebar").addEventListener("click", () => {
    sidebar.classList.toggle("aberta");
  });

  return topbar;
}

let listenerNavegacaoInstalado = false;

export function aplicarLayout(usuario) {
  aplicarPreferenciasVisuais(usuario);

  const shellExistente = document.querySelector(".app-shell");
  if (shellExistente) {
    const paginaAtual = window.location.pathname.split("/").pop() || "empresas.html";
    shellExistente.querySelectorAll(".sidebar__link").forEach((link) => {
      const href = link.getAttribute("href")?.split("?")[0];
      const ativo = href === paginaAtual || (href === "fluxo.html" && paginaAtual === "fluxos.html");
      link.classList.toggle("sidebar__link--ativo", ativo);
    });
    return;
  }

  const navPlaceholder = document.getElementById("nav");
  if (!navPlaceholder) return;
  const main = document.querySelector("main");

  const shell = document.createElement("div");
  shell.className = "app-shell";

  const modalBusca = construirModalBusca(usuario);
  const sidebar = construirSidebar(usuario, modalBusca);
  const topbar = construirTopbar(usuario, sidebar);

  const conteudo = document.createElement("div");
  conteudo.className = "app-shell__conteudo";
  conteudo.appendChild(topbar);
  if (main) conteudo.appendChild(main);

  shell.appendChild(sidebar);
  shell.appendChild(conteudo);
  shell.appendChild(modalBusca.fundo);

  navPlaceholder.replaceWith(shell);

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
        href.startsWith("mailto:")
      ) {
        return;
      }

      const ehHtml = href.endsWith(".html") || href.includes(".html?");
      if (ehHtml) {
        e.preventDefault();
        navegarPara(href);
      }
    });

    window.addEventListener("popstate", () => {
      const pag = window.location.pathname.split("/").pop() || "empresas.html";
      navegarPara(pag + window.location.search, false);
    });
  }
}
