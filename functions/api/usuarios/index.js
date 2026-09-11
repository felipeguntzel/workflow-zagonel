import { crudHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPost } = crudHandlers("usuarios", {
  required: ["nome", "setor_id"],
});
