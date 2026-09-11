import { crudHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPost } = crudHandlers("empresas", {
  required: ["nome"],
});
