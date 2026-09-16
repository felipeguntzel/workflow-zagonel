import { logout, permissaoDaTela } from "./auth.js";

const CHAVE_COLAPSADA = "workflow_zagonel_sidebar_colapsada";

export function aplicarPreferenciasVisuais(usuario) {
  const html = document.documentElement;
  html.setAttribute("data-tema", usuario?.tema ?? "claro");
  html.setAttribute("data-fonte", usuario?.fonte ?? "arial");
  html.setAttribute("data-tamanho", usuario?.tamanho_fonte ?? "m");
}

function construirSidebar(usuario) {
  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  if (localStorage.getItem(CHAVE_COLAPSADA) === "1") {
    sidebar.classList.add("recolhida");
  }

  const podeVerCadastros = ["empresas", "setores", "usuarios", "status"].some(
    (tela) => permissaoDaTela(tela).visualizar
  );
  const podeVerFluxos = permissaoDaTela("fluxos").visualizar;
  const paginaAtual = window.location.pathname.split("/").pop();

  const links = [
    { href: "chamados.html", texto: "Meus chamados", visivel: true },
    { href: "cadastros.html", texto: "Cadastros", visivel: podeVerCadastros },
    { href: "fluxo.html", texto: "Fluxos", visivel: podeVerFluxos },
    { href: "grupos.html", texto: "Grupos de Permissão", visivel: !!usuario?.admin },
  ];

  sidebar.innerHTML = `
    <div class="sidebar__cabecalho">
      <span class="sidebar__logo">
        <img src="favicon.svg" alt="" class="sidebar__logo-img">
        <span class="sidebar__logo-texto">WorkFlow</span>
      </span>
      <button type="button" class="sidebar__colapsar" id="btn-colapsar-sidebar" aria-label="Recolher menu">«</button>
    </div>
    <nav class="sidebar__links">
      ${links
        .filter((l) => l.visivel)
        .map(
          (l) =>
            `<a href="${l.href}" class="sidebar__link${l.href === paginaAtual ? " sidebar__link--ativo" : ""}"><span class="sidebar__link-texto">${l.texto}</span></a>`
        )
        .join("")}
    </nav>
  `;

  const botaoColapsar = sidebar.querySelector("#btn-colapsar-sidebar");
  botaoColapsar.textContent = sidebar.classList.contains("recolhida") ? "»" : "«";
  botaoColapsar.addEventListener("click", () => {
    const recolhida = sidebar.classList.toggle("recolhida");
    localStorage.setItem(CHAVE_COLAPSADA, recolhida ? "1" : "0");
    botaoColapsar.textContent = recolhida ? "»" : "«";
  });

  return sidebar;
}

function construirTopbar(usuario, sidebar) {
  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button type="button" class="topbar__hamburguer" id="btn-abrir-sidebar" aria-label="Abrir menu">☰</button>
    <div class="topbar__usuario" id="topbar-usuario">
      <span>${usuario?.nome ?? ""}</span>
      <div class="topbar__menu" id="topbar-menu" hidden>
        <a href="#" id="link-preferencias">Preferências</a>
        <a href="#" id="link-sair">Sair</a>
      </div>
    </div>
  `;

  topbar.querySelector("#btn-abrir-sidebar").addEventListener("click", () => {
    sidebar.classList.toggle("aberta");
  });

  const usuarioContainer = topbar.querySelector("#topbar-usuario");
  const menu = topbar.querySelector("#topbar-menu");
  usuarioContainer.addEventListener("click", (ev) => {
    ev.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener("click", () => {
    menu.hidden = true;
  });

  topbar.querySelector("#link-sair").addEventListener("click", (ev) => {
    ev.preventDefault();
    logout();
    window.location.href = "index.html";
  });

  topbar.querySelector("#link-preferencias").addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    menu.hidden = true;
    const { abrirPainelPreferencias } = await import("./preferencias.js");
    abrirPainelPreferencias();
  });

  return topbar;
}

export function aplicarLayout(usuario) {
  aplicarPreferenciasVisuais(usuario);

  const navPlaceholder = document.getElementById("nav");
  const main = document.querySelector("main");

  const shell = document.createElement("div");
  shell.className = "app-shell";

  const sidebar = construirSidebar(usuario);
  const topbar = construirTopbar(usuario, sidebar);

  const conteudo = document.createElement("div");
  conteudo.className = "app-shell__conteudo";
  conteudo.appendChild(topbar);
  conteudo.appendChild(main);

  shell.appendChild(sidebar);
  shell.appendChild(conteudo);

  navPlaceholder.replaceWith(shell);
}
