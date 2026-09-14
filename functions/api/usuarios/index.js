import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { hashSenha, validarFormatoLogin } from "../../_lib/auth.js";
import { exigirPermissao } from "../../_lib/permissoes.js";

async function carregarGruposDoUsuario(db, usuarioId) {
  const linhas = await all(db, "SELECT grupo_id FROM usuario_grupos WHERE usuario_id = ?", usuarioId);
  return linhas.map((l) => l.grupo_id);
}

async function validarGruposExistem(db, grupos) {
  if (grupos.length === 0) return true;
  const placeholders = grupos.map(() => "?").join(", ");
  const validos = await all(db, `SELECT id FROM grupos_permissao WHERE id IN (${placeholders})`, ...grupos);
  return validos.length === new Set(grupos).size;
}

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "usuarios", "visualizar");
  if (erro) return erro;
  const usuarios = await all(
    context.env.DB,
    "SELECT id, nome, setor_id, login, admin, deve_trocar_senha FROM usuarios ORDER BY id"
  );
  for (const usuario of usuarios) {
    usuario.grupos = await carregarGruposDoUsuario(context.env.DB, usuario.id);
  }
  return json(usuarios);
}

export async function onRequestPost(context) {
  const { usuario, erro } = await exigirPermissao(context, "usuarios", "inserir");
  if (erro) return erro;
  const body = await context.request.json();
  if (!body.nome || !body.setor_id || !body.login || !body.senha) {
    return error("Campos obrigatórios: nome, setor_id, login, senha");
  }
  if (body.admin && usuario.admin !== 1) {
    return error("Apenas administradores podem conceder admin a um usuário.", 403);
  }
  const login = String(body.login).toLowerCase();
  if (!validarFormatoLogin(login)) {
    return error(
      "Login inválido: use apenas letras e números, sem espaços, pontos ou caracteres especiais"
    );
  }
  const existente = await first(context.env.DB, "SELECT id FROM usuarios WHERE login = ?", login);
  if (existente) {
    return error("Já existe um usuário com esse login");
  }
  const grupos = Array.isArray(body.grupos) ? body.grupos : [];
  if (!(await validarGruposExistem(context.env.DB, grupos))) {
    return error("Um ou mais grupos informados não existem.");
  }
  const senhaHash = await hashSenha(body.senha);
  const admin = body.admin ? 1 : 0;
  const resultado = await run(
    context.env.DB,
    "INSERT INTO usuarios (nome, setor_id, login, senha_hash, admin, deve_trocar_senha) VALUES (?, ?, ?, ?, ?, 1)",
    body.nome,
    body.setor_id,
    login,
    senhaHash,
    admin
  );
  const novoId = resultado.meta.last_row_id;
  for (const grupoId of grupos) {
    await run(
      context.env.DB,
      "INSERT INTO usuario_grupos (usuario_id, grupo_id) VALUES (?, ?)",
      novoId,
      grupoId
    );
  }
  const novo = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login, admin, deve_trocar_senha FROM usuarios WHERE id = ?",
    novoId
  );
  novo.grupos = grupos;
  return json(novo, 201);
}
