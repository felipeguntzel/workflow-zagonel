import { first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { validarFormatoLogin } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const usuario = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login FROM usuarios WHERE id = ?",
    context.params.id
  );
  if (!usuario) return error("Não encontrado", 404);
  return json(usuario);
}

export async function onRequestPut(context) {
  const body = await context.request.json();
  const campos = ["nome", "setor_id"];
  const colunas = campos.filter((c) => body[c] !== undefined);

  let login = null;
  if (body.login !== undefined) {
    login = body.login.toLowerCase();
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
  }

  if (colunas.length === 0 && login === null) {
    return error("Nenhum campo para atualizar");
  }

  const colunasFinal = login !== null ? [...colunas, "login"] : colunas;
  const valoresFinal = login !== null ? [...colunas.map((c) => body[c]), login] : colunas.map((c) => body[c]);
  const set = colunasFinal.map((c) => `${c} = ?`).join(", ");
  await run(context.env.DB, `UPDATE usuarios SET ${set} WHERE id = ?`, ...valoresFinal, context.params.id);

  const atualizado = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login FROM usuarios WHERE id = ?",
    context.params.id
  );
  if (!atualizado) return error("Não encontrado", 404);
  return json(atualizado);
}

export async function onRequestDelete(context) {
  await run(context.env.DB, "DELETE FROM usuarios WHERE id = ?", context.params.id);
  return json({ ok: true });
}
