import { crudItemHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPut, onRequestDelete } = crudItemHandlers("setores", {
  required: ["nome", "empresa_id", "prazo_padrao_dias"],
  optional: ["centro_custo"],
});
