import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro } from "./ui.js";
import { renderCrud } from "./crud-ui.js";

export function inicializar() {
  const usuario = exigirLogin();
  if (!usuario) return;

  aplicarLayout(usuario);
  const mensagemErro = document.getElementById("mensagem-erro");
  const container = document.getElementById("secao-empresas");
  if (!container) return;

  renderCrud(container, {
    titulo: "Empresas",
    tituloSingular: "Empresa",
    estilo: "simples",
    endpoint: "/empresas",
    tela: "empresas",
    campos: [
      { nome: "codigo", label: "Código", obrigatorio: true },
      { nome: "nome", label: "Nome", obrigatorio: true },
    ],
  }).catch((e) => mostrarErro(mensagemErro, e));
}

inicializar();
