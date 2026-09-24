import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro } from "./ui.js";
import { renderCrud } from "./crud-ui.js";

export function inicializar() {
  const usuario = exigirLogin();
  if (!usuario) return;

  aplicarLayout(usuario);
  const mensagemErro = document.getElementById("mensagem-erro");
  const container = document.getElementById("secao-usuarios");
  if (!container) return;

  renderCrud(container, {
    titulo: "Usuários",
    tituloSingular: "Usuário",
    estilo: "complexo",
    endpoint: "/usuarios",
    tela: "usuarios",
    larguraColuna1: 14,
    preRequisitos: [
      { nome: "Empresas", endpoint: "/empresas", url: "/empresas" },
      { nome: "Setores", endpoint: "/setores", url: "/setores" },
    ],
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
        placeholder: "Ex: felipe.guntzel ou projetoszagonel",
        dica: "Usado para entrar no sistema. Permite letras minúsculas, números, ponto e sublinhado (ex: felipe.guntzel ou projetoszagonel).",
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
        nome: "deve_trocar_senha",
        label: "Obrigatório trocar senha no primeiro acesso",
        tipo: "checkbox",
        padrao: true,
        dica: "Quando marcado, obriga o usuário a cadastrar uma nova senha logo no seu próximo acesso ao sistema.",
      },
      {
        nome: "ativo",
        label: "Ativo",
        tipo: "checkbox",
        padrao: true,
        dica: "Status do cadastro. Usuários inativos não conseguem logar no sistema, mesmo com login e senha corretos.",
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
}

inicializar();
