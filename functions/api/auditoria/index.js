import { json } from "../../_lib/http.js";
import { exigirAdmin } from "../../_lib/permissoes.js";
import { listarAuditoriaSistema } from "../../_lib/auditoria.js";

export async function onRequestGet(context) {
  const { erro } = await exigirAdmin(context);
  if (erro) return erro;

  const url = new URL(context.request.url);
  const entidade = url.searchParams.get("entidade") || undefined;
  const acao = url.searchParams.get("acao") || undefined;
  const usuario_id = url.searchParams.get("usuario_id") ? Number(url.searchParams.get("usuario_id")) : undefined;
  const limite = url.searchParams.get("limite") ? Number(url.searchParams.get("limite")) : 100;
  const offset = url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0;

  const lista = await listarAuditoriaSistema(context.env.DB, {
    entidade,
    acao,
    usuario_id,
    limite,
    offset,
  });

  return json(lista);
}
