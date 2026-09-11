import { logout } from "./auth.js";

export function info(texto) {
  return `<span class="info" title="${texto.replace(/"/g, "&quot;")}">i</span>`;
}

export function situacaoClasse(situacao) {
  if (situacao === "vencido") return "badge badge-vencido";
  if (situacao === "alerta") return "badge badge-alerta";
  return "badge badge-ok";
}

export function montarNav(usuario) {
  const nav = document.createElement("nav");
  nav.className = "nav";
  nav.innerHTML = `
    <a href="chamados.html">Meus chamados</a>
    <a href="cadastros.html">Cadastros</a>
    <a href="fluxo.html">Fluxos</a>
    <span class="nav-usuario">${usuario ? usuario.nome : ""}</span>
    <a href="#" id="link-sair">Sair</a>
  `;
  nav.querySelector("#link-sair").addEventListener("click", (ev) => {
    ev.preventDefault();
    logout();
    window.location.href = "index.html";
  });
  return nav;
}
