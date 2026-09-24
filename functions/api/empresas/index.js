import { all } from "../../_lib/db.js";
import { json } from "../../_lib/http.js";
import { exigirUsuarioLogado } from "../../_lib/permissoes.js";
import { crudHandlers, assegurarEsquemaTabela } from "../../_lib/crud.js";

const crud = crudHandlers("empresas", {
  required: ["nome"],
  optional: ["codigo"],
  tela: "empresas",
});

export async function onRequestGet(context) {
  // Qualquer usuario autenticado pode listar empresas para abertura de chamados ou selecao
  const { erro } = await exigirUsuarioLogado(context);
  if (erro) return erro;
  await assegurarEsquemaTabela(context.env.DB, "empresas");
  const empresas = await all(context.env.DB, "SELECT * FROM empresas ORDER BY id");
  return json(empresas);
}

export const onRequestPost = crud.onRequestPost;
