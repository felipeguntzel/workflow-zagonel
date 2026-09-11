import { crudItemHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPut, onRequestDelete } = crudItemHandlers("usuarios", {
  required: ["nome", "setor_id"],
});
