import { crudHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPost } = crudHandlers("status", {
  required: ["nome"],
  tela: "status",
});
