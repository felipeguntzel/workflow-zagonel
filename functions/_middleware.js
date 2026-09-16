import { error } from "./_lib/http.js";

export async function onRequest(context) {
  try {
    return await context.next();
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    if (message.includes("FOREIGN KEY constraint failed")) {
      return error("Não é possível excluir: existem registros vinculados a este item.", 409);
    }
    if (message.includes("UNIQUE constraint failed")) {
      return error("Já existe um registro com esse valor.", 400);
    }
    if (err instanceof SyntaxError) {
      return error("Corpo da requisição inválido (JSON malformado).", 400);
    }
    return error("Erro interno do servidor.", 500);
  }
}
