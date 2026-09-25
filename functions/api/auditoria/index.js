import { json } from "../../_lib/http.js";
import { exigirAdmin } from "../../_lib/permissoes.js";
import { listarAuditoriaSistema, contarAuditoriaSistema } from "../../_lib/auditoria.js";

export async function onRequestGet(context) {
  const { erro } = await exigirAdmin(context);
  if (erro) return erro;

  const url = new URL(context.request.url);
  const entidade = url.searchParams.get("entidade") || undefined;
  const acao = url.searchParams.get("acao") || undefined;
  const usuario_id = url.searchParams.get("usuario_id") ? Number(url.searchParams.get("usuario_id")) : undefined;
  const limite = url.searchParams.get("limite") ? Number(url.searchParams.get("limite")) : 100;
  const offset = url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0;
  const incluirEnvelope = url.searchParams.get("envelope") === "1" || url.searchParams.get("total") === "1";

  const lista = await listarAuditoriaSistema(context.env.DB, {
    entidade,
    acao,
    usuario_id,
    limite,
    offset,
  });

  if (incluirEnvelope) {
    const total = await contarAuditoriaSistema(context.env.DB, {
      entidade,
      acao,
      usuario_id,
    });
    return json({
      itens: lista,
      total,
      limite,
      offset,
      pagina: Math.floor(offset / limite) + 1,
      paginas: Math.ceil(total / limite) || 1,
    });
  }

  return json(lista);
}

export async function onRequestDelete(context) {
  const { usuario, erro } = await exigirAdmin(context);
  if (erro) return erro;

  const url = new URL(context.request.url);
  const diasParam = url.searchParams.get("dias");
  const tudoParam = url.searchParams.get("tudo");
  const dataLimiteParam = url.searchParams.get("data_limite");

  const tudo = tudoParam === "1" || tudoParam === "true";
  const dias = diasParam ? Number(diasParam) : null;
  const dataLimite = dataLimiteParam || null;

  const removidos = await excluirLogsAuditoria(context.env.DB, { dias, dataLimite, tudo });

  await registrarAuditoriaSistema(context.env.DB, {
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    entidade: "auditoria_sistema",
    acao: "exclusao",
    detalhes: `Exclusão de logs de auditoria realizada por ${usuario.nome}. Total de ${removidos} registro(s) excluído(s) para liberação de espaço no banco.`,
  });

  return json({
    sucesso: true,
    removidos,
    mensagem: `${removidos} registro(s) de auditoria excluído(s) com sucesso.`,
  });
}
