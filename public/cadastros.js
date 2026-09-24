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
    tituloSingular: "Empresa",
    estilo: "simples",
    endpoint: "/empresas",
    tela: "empresas",
    campos: [
      { nome: "codigo", label: "Código", obrigatorio: true },
      { nome: "nome", label: "Nome", obrigatorio: true },
    ],
  }).catch((e) => mostrarErro(mensagemErro, e));

  renderCrud(document.getElementById("secao-setores"), {
    titulo: "Setores",
    tituloSingular: "Setor",
    estilo: "complexo",
    endpoint: "/setores",
    tela: "setores",
    larguraColuna1: 16,
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

  renderCrud(document.getElementById("secao-usuarios"), {
    titulo: "Usuários",
    tituloSingular: "Usuário",
    estilo: "complexo",
    endpoint: "/usuarios",
    tela: "usuarios",
    larguraColuna1: 14,
    campos: [
      { nome: "nome", label: "Nome", obrigatorio: true },
      {
        nome: "empresa_id",
        label: "Empresa",
        obrigatorio: true,
        opcoesEndpoint: "/empresas",
        apenasFiltro: true,
        dica: "Filtra a lista de Setor abaixo. O setor escolhido já vincula a empresa.",
      },
      {
        nome: "setor_id",
        label: "Setor",
        obrigatorio: true,
        opcoesEndpoint: "/setores",
        dependeDe: "empresa_id",
        filtrarPor: "empresas",
      },
      {
        nome: "login",
        label: "Login",
        obrigatorio: true,
        desabilitadoNaEdicao: true,
        dica: "Usado para entrar no sistema. Só letras e números, sem espaços, pontos ou caracteres especiais.",
      },
      {
        nome: "email",
        label: "E-mail",
        tipo: "email",
        obrigatorio: false,
        dica: "E-mail corporativo ou pessoal.\nUsado para envio de notificações e redefinição de senha por e-mail.\nExemplo: usuario@zagonel.com.br",
      },
      {
        nome: "telefone",
        label: "WhatsApp / Telefone",
        tipo: "text",
        obrigatorio: false,
        dica: "Número de telefone com DDD para contato direto via WhatsApp no navegador.\nExemplo: (49) 99999-9999",
      },
      {
        nome: "senha",
        label: "Senha",
        tipo: "password",
        dica: "Regras de senha:\n- Mínimo de 6 e máximo de 10 caracteres\n- Pode conter letras maiúsculas, minúsculas, números e caracteres especiais\n- Senhas exclusivamente numéricas não podem ser números repetidos (ex: 111111) nem sequências de 1 em 1 (ex: 123456)\nObrigatória na criação. Ao editar, deixe em branco para manter a senha existente.",
      },
      {
        nome: "admin",
        label: "Administrador",
        tipo: "checkbox",
        dica: "Acesso administrativo completo:\nLibera todas as telas, relatórios e permissões do sistema.",
      },
      {
        nome: "grupos",
        label: "Grupos de permissão",
        tipo: "multiselect",
        opcoesEndpoint: "/grupos",
        dica: "Define as permissões de acesso do usuário:\nVisualizar, inserir, editar ou excluir em cada tela.\n(Administradores não necessitam de grupos vinculados).",
      },
    ],
  }).catch((e) => mostrarErro(mensagemErro, e));

  renderCrud(document.getElementById("secao-status"), {
    titulo: "Status",
    tituloSingular: "Status",
    estilo: "simples",
    endpoint: "/status",
    tela: "status",
    campos: [
      { nome: "nome", label: "Nome", obrigatorio: true },
      { nome: "cor", label: "Cor do Status", tipo: "cor", obrigatorio: false },
    ],
  }).catch((e) => mostrarErro(mensagemErro, e));
}
