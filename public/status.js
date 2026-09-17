import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro } from "./ui.js";
import { renderCrud } from "./crud-ui.js";

const usuario = exigirLogin();
if (usuario) {
  aplicarLayout(usuario);
  const mensagemErro = document.getElementById("mensagem-erro");

  renderCrud(document.getElementById("secao-status"), {
    titulo: "Status",
    tituloSingular: "Status",
    estilo: "simples",
    endpoint: "/status",
    tela: "status",
    larguraColuna1: 20,
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  }).catch((e) => mostrarErro(mensagemErro, e));
}
