import { exigirLogin } from "./auth.js";
import { montarNav, mostrarErro } from "./ui.js";
import { renderCrud } from "./crud-ui.js";

const usuario = exigirLogin();
if (usuario) {
  document.getElementById("nav").replaceWith(montarNav(usuario));
  const mensagemErro = document.getElementById("mensagem-erro");

  renderCrud(document.getElementById("secao-empresas"), {
    titulo: "Empresas",
    endpoint: "/empresas",
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  }).catch((e) => mostrarErro(mensagemErro, e));

  renderCrud(document.getElementById("secao-setores"), {
    titulo: "Setores",
    endpoint: "/setores",
    campos: [
      { nome: "nome", label: "Nome", obrigatorio: true },
      { nome: "empresa_id", label: "Empresa", obrigatorio: true, opcoesEndpoint: "/empresas" },
      { nome: "centro_custo", label: "Centro de custo" },
      {
        nome: "prazo_padrao_dias",
        label: "Prazo padrão (dias)",
        tipo: "number",
        obrigatorio: true,
        dica: "Usado para sugerir automaticamente o prazo de qualquer chamado aberto para este setor (data de abertura + este número de dias).",
      },
    ],
  }).catch((e) => mostrarErro(mensagemErro, e));

  renderCrud(document.getElementById("secao-usuarios"), {
    titulo: "Usuários",
    endpoint: "/usuarios",
    campos: [
      { nome: "nome", label: "Nome", obrigatorio: true },
      { nome: "setor_id", label: "Setor", obrigatorio: true, opcoesEndpoint: "/setores" },
    ],
  }).catch((e) => mostrarErro(mensagemErro, e));

  renderCrud(document.getElementById("secao-status"), {
    titulo: "Status",
    endpoint: "/status",
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  }).catch((e) => mostrarErro(mensagemErro, e));
}
