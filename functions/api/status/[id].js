import { first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirPermissao } from "../../_lib/permissoes.js";
import { assegurarEsquemaTabela, validarDependenciasExclusao, atualizarContadorId } from "../../_lib/crud.js";
import { registrarAuditoriaSistema } from "../../_lib/auditoria.js";

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "status", "visualizar");
  if (erro) return erro;
  await assegurarEsquemaTabela(context.env.DB, "status");
  const row = await first(context.env.DB, "SELECT * FROM status WHERE id = ?", context.params.id);
  if (!row) return error("Não encontrado", 404);
  return json(row);
}

export async function onRequestPut(context) {
  const { usuario, erro } = await exigirPermissao(context, "status", "editar");
  if (erro) return erro;
  await assegurarEsquemaTabela(context.env.DB, "status");
  const antes = await first(context.env.DB, "SELECT * FROM status WHERE id = ?", context.params.id);
  if (!antes) return error("Não encontrado", 404);

  const body = await context.request.json();
  const nome = body.nome !== undefined ? String(body.nome).trim() : antes.nome;
  if (!nome) return error("Campo obrigatório: nome", 400);

  const cor = body.cor !== undefined ? String(body.cor).trim() : antes.cor;
  if (cor) {
    const statusComMesmaCor = await first(
      context.env.DB,
      "SELECT id, nome FROM status WHERE LOWER(cor) = LOWER(?) AND id != ?",
      cor,
      context.params.id
    );
    if (statusComMesmaCor) {
      return error(`A cor "${cor}" já está em uso pelo status "${statusComMesmaCor.nome}". Escolha uma cor diferente.`, 400);
    }
  }

  await run(
    context.env.DB,
    "UPDATE status SET nome = ?, cor = ? WHERE id = ?",
    nome,
    cor || null,
    context.params.id
  );
  const atualizado = await first(context.env.DB, "SELECT * FROM status WHERE id = ?", context.params.id);
  await registrarAuditoriaSistema(context.env.DB, {
    usuario_id: usuario?.id,
    usuario_nome: usuario?.nome || "Sistema",
    entidade: "status",
    entidade_id: Number(context.params.id),
    acao: "edicao",
    detalhes: `Status #${context.params.id} atualizado`,
    dados_antigos: antes,
    dados_novos: atualizado,
  });
  return json(atualizado);
}

export async function onRequestDelete(context) {
  const { usuario, erro } = await exigirPermissao(context, "status", "excluir");
  if (erro) return erro;
  const erroDep = await validarDependenciasExclusao(context.env.DB, "status", context.params.id);
  if (erroDep) return error(erroDep, 400);

  const antes = await first(context.env.DB, "SELECT * FROM status WHERE id = ?", context.params.id);
  if (!antes) return error("Não encontrado", 404);

  await run(context.env.DB, "DELETE FROM status WHERE id = ?", context.params.id);
  await atualizarContadorId(context.env.DB, "status");
  await registrarAuditoriaSistema(context.env.DB, {
    usuario_id: usuario?.id,
    usuario_nome: usuario?.nome || "Sistema",
    entidade: "status",
    entidade_id: Number(context.params.id),
    acao: "exclusao",
    detalhes: `Status "${antes.nome}" excluído`,
    dados_antigos: antes,
  });
  return json({ ok: true });
}
