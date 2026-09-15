import { run } from "../_lib/db.js";
import { json, error } from "../_lib/http.js";
import { obterUsuarioDaRequisicao } from "../_lib/permissoes.js";

const FONTES = ["arial", "times", "verdana", "courier"];
const TAMANHOS = ["p", "m", "g", "gg"];
const TEMAS = ["claro", "alto-contraste"];

export async function onRequestPut(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);
  const body = await context.request.json();

  if (!FONTES.includes(body.fonte)) {
    return error(`Fonte inválida: use uma de ${FONTES.join(", ")}`);
  }
  if (!TAMANHOS.includes(body.tamanho_fonte)) {
    return error(`Tamanho inválido: use um de ${TAMANHOS.join(", ")}`);
  }
  if (!TEMAS.includes(body.tema)) {
    return error(`Tema inválido: use um de ${TEMAS.join(", ")}`);
  }

  await run(
    context.env.DB,
    "UPDATE usuarios SET fonte = ?, tamanho_fonte = ?, tema = ? WHERE id = ?",
    body.fonte,
    body.tamanho_fonte,
    body.tema,
    usuario.id
  );
  return json({ fonte: body.fonte, tamanho_fonte: body.tamanho_fonte, tema: body.tema });
}
