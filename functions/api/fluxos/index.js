import { crudHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPost } = crudHandlers("fluxo_templates", {
  required: ["nome"],
  tela: "fluxos",
});
