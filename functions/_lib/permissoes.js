import { first, all } from "./db.js";
import { verificarToken } from "./sessao.js";
import { error } from "./http.js";

const TELAS = ["empresas", "setores", "usuarios", "status", "fluxos", "chamados"];

export async function obterUsuarioDaRequisicao(request, env) {
  const cabecalho = request.headers.get("Authorization") ?? "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  const verificado = await verificarToken(token, env.SESSAO_SEGREDO);
  if (!verificado) return null;
  const usuario = await first(
    env.DB,
    "SELECT id, nome, setor_id, admin, deve_trocar_senha FROM usuarios WHERE id = ?",
    verificado.usuarioId
  );
  return usuario ?? null;
}

export async function obterPermissoesDoUsuario(db, usuarioId) {
  const resultado = {};
  for (const tela of TELAS) {
    resultado[tela] = { visualizar: false, inserir: false, editar: false, excluir: false };
  }
  resultado.chamados.ver_todos_setores = false;

  const usuario = await first(db, "SELECT admin FROM usuarios WHERE id = ?", usuarioId);
  if (usuario && usuario.admin) {
    for (const tela of TELAS) {
      resultado[tela] = { visualizar: true, inserir: true, editar: true, excluir: true };
    }
    resultado.chamados.ver_todos_setores = true;
    return resultado;
  }

  const linhas = await all(
    db,
    `SELECT p.tela, p.visualizar, p.inserir, p.editar, p.excluir, p.ver_todos_setores
     FROM permissoes p
     JOIN usuario_grupos ug ON ug.grupo_id = p.grupo_id
     WHERE ug.usuario_id = ?`,
    usuarioId
  );
  for (const linha of linhas) {
    const alvo = resultado[linha.tela];
    if (!alvo) continue;
    alvo.visualizar = alvo.visualizar || linha.visualizar === 1;
    alvo.inserir = alvo.inserir || linha.inserir === 1;
    alvo.editar = alvo.editar || linha.editar === 1;
    alvo.excluir = alvo.excluir || linha.excluir === 1;
    if (linha.tela === "chamados") {
      resultado.chamados.ver_todos_setores =
        resultado.chamados.ver_todos_setores || linha.ver_todos_setores === 1;
    }
  }
  return resultado;
}

export async function exigirPermissao(context, tela, acao) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return { erro: error("Não autenticado", 401) };
  if (usuario.deve_trocar_senha === 1) {
    return { erro: error("Troque sua senha antes de continuar", 403) };
  }
  const permissoes = await obterPermissoesDoUsuario(context.env.DB, usuario.id);
  const permitido = usuario.admin === 1 || Boolean(permissoes[tela]?.[acao]);
  if (!permitido) return { erro: error("Acesso negado", 403) };
  return { usuario, permissoes };
}

export async function exigirAdmin(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return { erro: error("Não autenticado", 401) };
  if (usuario.deve_trocar_senha === 1) {
    return { erro: error("Troque sua senha antes de continuar", 403) };
  }
  if (usuario.admin !== 1) return { erro: error("Acesso restrito a administradores", 403) };
  return { usuario };
}
