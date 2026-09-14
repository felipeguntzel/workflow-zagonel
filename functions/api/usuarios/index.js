import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { hashSenha, validarFormatoLogin } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const usuarios = await all(
    context.env.DB,
    "SELECT id, nome, setor_id, login FROM usuarios ORDER BY id"
  );
  return json(usuarios);
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.nome || !body.setor_id || !body.login) {
    return error("Campos obrigatórios: nome, setor_id, login");
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
  const senhaHash = await hashSenha(`1234${login}`);
  const resultado = await run(
    context.env.DB,
    "INSERT INTO usuarios (nome, setor_id, login, senha_hash) VALUES (?, ?, ?, ?)",
    body.nome,
    body.setor_id,
    login,
    senhaHash
  );
  const novo = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login FROM usuarios WHERE id = ?",
    resultado.meta.last_row_id
  );
  return json(novo, 201);
}
