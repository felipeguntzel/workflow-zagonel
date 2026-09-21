import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro } from "./ui.js";
import { renderCrud } from "./crud-ui.js";

export function inicializar() {
  const usuario = exigirLogin();
  if (!usuario) return;

  aplicarLayout(usuario);
  const mensagemErro = document.getElementById("mensagem-erro");
  const container = document.getElementById("secao-setores");
  if (!container) return;

  renderCrud(container, {
    titulo: "Setores",
    tituloSingular: "Setor",
    estilo: "complexo",
    endpoint: "/setores",
    tela: "setores",
    larguraColuna1: 16,
    preRequisitos: [{ nome: "Empresas", endpoint: "/empresas", url: "/empresas" }],
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

inicializar();
