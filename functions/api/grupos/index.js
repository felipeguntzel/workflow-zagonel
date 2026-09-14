import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirAdmin, exigirPermissao } from "../../_lib/permissoes.js";

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "usuarios", "visualizar");
  if (erro) return erro;
  return json(await all(context.env.DB, "SELECT * FROM grupos_permissao ORDER BY id"));
}

export async function onRequestPost(context) {
  const { erro } = await exigirAdmin(context);
  if (erro) return erro;
  const body = await context.request.json();
  if (!body.nome) return error("Campo obrigatório: nome");
  const resultado = await run(context.env.DB, "INSERT INTO grupos_permissao (nome) VALUES (?)", body.nome);
  const novo = await first(
    context.env.DB,
    "SELECT * FROM grupos_permissao WHERE id = ?",
    resultado.meta.last_row_id
  );
  return json(novo, 201);
}
