import { crudItemHandlers } from "../../_lib/crud.js";
export const { onRequestGet, onRequestPut, onRequestDelete } = crudItemHandlers("empresas", {
  required: ["nome"],
  optional: ["codigo"],
  tela: "empresas",
});
