import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro } from "./ui.js";
import { renderCrud } from "./crud-ui.js";

const usuario = exigirLogin();
if (usuario) {
  aplicarLayout(usuario);
  const mensagemErro = document.getElementById("mensagem-erro");

  renderCrud(document.getElementById("secao-setores"), {
    titulo: "Setores",
    tituloSingular: "Setor",
    estilo: "complexo",
    endpoint: "/setores",
    tela: "setores",
    larguraColuna1: 16,
    preRequisitos: [{ nome: "Empresas", endpoint: "/empresas", url: "empresas.html" }],
    campos: [
      { nome: "nome", label: "Nome", obrigatorio: true },
      {
        nome: "empresas",
        label: "Empresas",
        tipo: "multiselect",
        obrigatorio: true,
        opcoesEndpoint: "/empresas",
        dica: "Selecione uma ou mais empresas às quais este setor pertence.",
      },
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
}
