import { all } from "../../_lib/db.js";
import { json } from "../../_lib/http.js";
import { exigirUsuarioLogado } from "../../_lib/permissoes.js";
import { crudHandlers, assegurarEsquemaTabela } from "../../_lib/crud.js";

const crud = crudHandlers("fluxo_templates", {
  required: ["nome"],
  optional: ["descricao", "ativo"],
  tela: "fluxos",
});

export async function onRequestGet(context) {
  // Qualquer usuario autenticado pode listar fluxos para selecao em chamados ou consulta
  const { erro } = await exigirUsuarioLogado(context);
  if (erro) return erro;
  await assegurarEsquemaTabela(context.env.DB, "fluxo_templates");
  return json(await all(context.env.DB, "SELECT * FROM fluxo_templates ORDER BY id"));
}

export const onRequestPost = crud.onRequestPost;
