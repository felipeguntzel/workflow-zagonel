import { logout, permissaoDaTela } from "./auth.js";

export function info(texto) {
  return `<span class="info" title="${texto.replace(/"/g, "&quot;")}">i</span>`;
}

export function mostrarErro(elemento, erro) {
  elemento.textContent = erro && erro.message ? erro.message : String(erro);
  elemento.className = "erro";
  elemento.hidden = false;
}

export function mostrarMensagem(elemento, texto, tipo = "aviso") {
  elemento.textContent = texto;
  elemento.className = tipo === "sucesso" ? "mensagem-sucesso" : "mensagem-aviso";
  elemento.hidden = false;
}

export function situacaoClasse(situacao) {
  if (situacao === "vencido") return "badge badge-vencido";
  if (situacao === "alerta") return "badge badge-alerta";
  return "badge badge-ok";
}

export function montarNav(usuario) {
  const nav = document.createElement("nav");
  nav.className = "nav";

  const podeVerCadastros = ["empresas", "setores", "usuarios", "status"].some(
    (tela) => permissaoDaTela(tela).visualizar
  );
  const podeVerFluxos = permissaoDaTela("fluxos").visualizar;

  nav.innerHTML = `
    <a href="chamados.html">Meus chamados</a>
    ${podeVerCadastros ? `<a href="cadastros.html">Cadastros</a>` : ""}
    ${podeVerFluxos ? `<a href="fluxo.html">Fluxos</a>` : ""}
    ${usuario?.admin ? `<a href="grupos.html">Grupos de Permissão</a>` : ""}
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
