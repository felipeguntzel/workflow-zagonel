import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirPermissao } from "../../_lib/permissoes.js";
import { assegurarEsquemaTabela } from "../../_lib/crud.js";
import { registrarAuditoriaSistema } from "../../_lib/auditoria.js";
import { obterProximoIdDisponivel, atualizarContadorId } from "../../_lib/dependencias.js";

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "status", "visualizar");
  if (erro) return erro;
  await assegurarEsquemaTabela(context.env.DB, "status");
  const lista = await all(context.env.DB, "SELECT * FROM status ORDER BY id");
  return json(lista);
}

export async function onRequestPost(context) {
  const { usuario, erro } = await exigirPermissao(context, "status", "inserir");
  if (erro) return erro;
  await assegurarEsquemaTabela(context.env.DB, "status");
  const body = await context.request.json();
  const nome = (body.nome || "").trim();
  if (!nome) return error("Campo obrigatório: nome", 400);

  const cor = (body.cor || "").trim();
  if (cor) {
    const statusComMesmaCor = await first(
      context.env.DB,
      "SELECT id, nome FROM status WHERE LOWER(cor) = LOWER(?)",
      cor
    );
    if (statusComMesmaCor) {
      return error(`A cor "${cor}" já está em uso pelo status "${statusComMesmaCor.nome}". Escolha uma cor diferente.`, 400);
    }
  }

  const proximoId = await obterProximoIdDisponivel(context.env.DB, "status");
  const res = await run(
    context.env.DB,
    "INSERT INTO status (id, nome, cor) VALUES (?, ?, ?)",
    proximoId,
    nome,
    cor || null
  );
  const inseridoId = proximoId || res?.meta?.last_row_id;
  await atualizarContadorId(context.env.DB, "status");
  const novo = await first(context.env.DB, "SELECT * FROM status WHERE id = ?", inseridoId);
  await registrarAuditoriaSistema(context.env.DB, {
    usuario_id: usuario?.id,
    usuario_nome: usuario?.nome || "Sistema",
    entidade: "status",
    entidade_id: inseridoId,
    acao: "insercao",
    detalhes: `Novo status "${nome}" cadastrado com cor ${cor || "padrão"}`,
    dados_novos: novo,
  });
  return json(novo, 201);
}
