import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro } from "./ui.js";
import { renderCrud } from "./crud-ui.js";

const usuario = exigirLogin();
if (usuario) {
  aplicarLayout(usuario);
  const mensagemErro = document.getElementById("mensagem-erro");

  renderCrud(document.getElementById("secao-empresas"), {
    titulo: "Empresas",
    endpoint: "/empresas",
    tela: "empresas",
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  }).catch((e) => mostrarErro(mensagemErro, e));

  renderCrud(document.getElementById("secao-setores"), {
    titulo: "Setores",
    endpoint: "/setores",
    tela: "setores",
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
    tela: "usuarios",
    campos: [
      { nome: "nome", label: "Nome", obrigatorio: true },
      {
        nome: "empresa_id",
        label: "Empresa",
        obrigatorio: true,
        opcoesEndpoint: "/empresas",
        apenasFiltro: true,
        dica: "Filtra a lista de Setor abaixo. Não é salva diretamente — o setor escolhido já indica a empresa.",
      },
      {
        nome: "setor_id",
        label: "Setor",
        obrigatorio: true,
        opcoesEndpoint: "/setores",
        dependeDe: "empresa_id",
        filtrarPor: "empresa_id",
      },
      {
        nome: "login",
        label: "Login",
        obrigatorio: true,
        dica: "Usado para entrar no sistema. Só letras e números, sem espaços, pontos ou caracteres especiais.",
      },
      {
        nome: "senha",
        label: "Senha",
        tipo: "password",
        dica: "Obrigatória ao criar um novo usuário — o próprio usuário troca no primeiro login. Ao editar, deixe em branco para manter a senha atual; preencher define uma nova senha e exige troca no próximo login.",
      },
      {
        nome: "admin",
        label: "Administrador",
        tipo: "checkbox",
        dica: "Ignora todos os grupos de permissão e libera acesso total a todas as telas e ações.",
      },
      {
        nome: "grupos",
        label: "Grupos de permissão",
        tipo: "multiselect",
        opcoesEndpoint: "/grupos",
        dica: "Define o que este usuário pode visualizar, inserir, editar ou excluir em cada tela. Administradores não precisam de grupo.",
      },
    ],
  }).catch((e) => mostrarErro(mensagemErro, e));

  renderCrud(document.getElementById("secao-status"), {
    titulo: "Status",
    endpoint: "/status",
    tela: "status",
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  }).catch((e) => mostrarErro(mensagemErro, e));
}
