import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro } from "./ui.js";
import { renderCrud } from "./crud-ui.js";

export function inicializar() {
  const usuario = exigirLogin();
  if (!usuario) return;

  aplicarLayout(usuario);
  const mensagemErro = document.getElementById("mensagem-erro");
  const container = document.getElementById("secao-status");
  if (!container) return;

  renderCrud(container, {
    titulo: "Status",
    tituloSingular: "Status",
    estilo: "simples",
    endpoint: "/status",
    tela: "status",
    larguraColuna1: 20,
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  }).catch((e) => mostrarErro(mensagemErro, e));
}

inicializar();
