import { crudHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPost } = crudHandlers("setores", {
  required: ["nome", "empresa_id", "prazo_padrao_dias"],
  optional: ["centro_custo"],
});
