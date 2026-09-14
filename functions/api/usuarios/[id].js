import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { hashSenha, validarFormatoLogin } from "../../_lib/auth.js";
import { exigirPermissao } from "../../_lib/permissoes.js";

async function carregarGruposDoUsuario(db, usuarioId) {
  const linhas = await all(db, "SELECT grupo_id FROM usuario_grupos WHERE usuario_id = ?", usuarioId);
  return linhas.map((l) => l.grupo_id);
}

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "usuarios", "visualizar");
  if (erro) return erro;
  const usuario = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login, admin, deve_trocar_senha FROM usuarios WHERE id = ?",
    context.params.id
  );
  if (!usuario) return error("Não encontrado", 404);
  usuario.grupos = await carregarGruposDoUsuario(context.env.DB, usuario.id);
  return json(usuario);
}

export async function onRequestPut(context) {
  const { erro } = await exigirPermissao(context, "usuarios", "editar");
  if (erro) return erro;
  const body = await context.request.json();
  const colunas = ["nome", "setor_id"].filter((c) => body[c] !== undefined);
  const valores = colunas.map((c) => body[c]);

  let login = null;
  if (body.login !== undefined) {
    login = String(body.login).toLowerCase();
    if (!validarFormatoLogin(login)) {
      return error(
        "Login inválido: use apenas letras e números, sem espaços, pontos ou caracteres especiais"
      );
    }
    const existente = await first(
      context.env.DB,
      "SELECT id FROM usuarios WHERE login = ? AND id != ?",
      login,
      context.params.id
    );
    if (existente) return error("Já existe um usuário com esse login");
    colunas.push("login");
    valores.push(login);
  }

  if (body.senha !== undefined && body.senha !== "") {
    const senhaHash = await hashSenha(body.senha);
    colunas.push("senha_hash", "deve_trocar_senha");
    valores.push(senhaHash, 1);
  }

  if (body.admin !== undefined) {
    colunas.push("admin");
    valores.push(body.admin ? 1 : 0);
  }

  if (colunas.length === 0 && body.grupos === undefined) {
    return error("Nenhum campo para atualizar");
  }

  if (colunas.length > 0) {
    const set = colunas.map((c) => `${c} = ?`).join(", ");
    await run(context.env.DB, `UPDATE usuarios SET ${set} WHERE id = ?`, ...valores, context.params.id);
  }

  if (Array.isArray(body.grupos)) {
    await run(context.env.DB, "DELETE FROM usuario_grupos WHERE usuario_id = ?", context.params.id);
    for (const grupoId of body.grupos) {
      await run(
        context.env.DB,
        "INSERT INTO usuario_grupos (usuario_id, grupo_id) VALUES (?, ?)",
        context.params.id,
        grupoId
      );
    }
  }

  const atualizado = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login, admin, deve_trocar_senha FROM usuarios WHERE id = ?",
    context.params.id
  );
  if (!atualizado) return error("Não encontrado", 404);
  atualizado.grupos = await carregarGruposDoUsuario(context.env.DB, context.params.id);
  return json(atualizado);
}

export async function onRequestDelete(context) {
  const { erro } = await exigirPermissao(context, "usuarios", "excluir");
  if (erro) return erro;
  await run(context.env.DB, "DELETE FROM usuario_grupos WHERE usuario_id = ?", context.params.id);
  await run(context.env.DB, "DELETE FROM usuarios WHERE id = ?", context.params.id);
  return json({ ok: true });
}
