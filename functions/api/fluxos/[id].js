import { first } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirUsuarioLogado } from "../../_lib/permissoes.js";
import { crudItemHandlers, assegurarEsquemaTabela } from "../../_lib/crud.js";

const crud = crudItemHandlers("fluxo_templates", {
  required: ["nome"],
  optional: ["descricao", "ativo"],
  tela: "fluxos",
});

export async function onRequestGet(context) {
  // Qualquer usuario autenticado pode consultar dados do fluxo para abertura ou acompanhamento
  const { erro } = await exigirUsuarioLogado(context);
  if (erro) return erro;
  await assegurarEsquemaTabela(context.env.DB, "fluxo_templates");
  const item = await first(context.env.DB, "SELECT * FROM fluxo_templates WHERE id = ?", context.params.id);
  if (!item) return error("Não encontrado", 404);
  return json(item);
}

export const onRequestPut = crud.onRequestPut;
export const onRequestDelete = crud.onRequestDelete;
