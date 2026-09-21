import { all, first, run } from "./db.js";
import { json, error } from "./http.js";
import { exigirPermissao } from "./permissoes.js";
import { validarDependenciasExclusao, atualizarContadorId } from "./dependencias.js";
import { registrarAuditoriaSistema } from "./auditoria.js";

export { validarDependenciasExclusao, atualizarContadorId };

export function campoObrigatorioFaltando(body, required, { exigirPresente = false } = {}) {
  for (const campo of required) {
    const vazio = body[campo] === null || body[campo] === "";
    const ausente = exigirPresente && body[campo] === undefined;
    if (vazio || ausente) return campo;
  }
  return null;
}

export function crudHandlers(table, { required = [], optional = [], tela } = {}) {
  const campos = [...required, ...optional];

  async function onRequestGet(context) {
    const { erro } = await exigirPermissao(context, tela, "visualizar");
    if (erro) return erro;
    return json(await all(context.env.DB, `SELECT * FROM ${table} ORDER BY id`));
  }

  async function onRequestPost(context) {
    const { usuario, erro } = await exigirPermissao(context, tela, "inserir");
    if (erro) return erro;
    const body = await context.request.json();
    const faltando = campoObrigatorioFaltando(body, required, { exigirPresente: true });
    if (faltando) return error(`Campo obrigatório: ${faltando}`);
    const colunas = campos.filter((c) => body[c] !== undefined);
    const placeholders = colunas.map(() => "?").join(", ");
    const valores = colunas.map((c) => body[c]);
    const resultado = await run(
      context.env.DB,
      `INSERT INTO ${table} (${colunas.join(", ")}) VALUES (${placeholders})`,
      ...valores
    );
    const novo = await first(
      context.env.DB,
      `SELECT * FROM ${table} WHERE id = ?`,
      resultado.meta.last_row_id
    );
    await registrarAuditoriaSistema(context.env.DB, {
      usuario_id: usuario?.id,
      usuario_nome: usuario?.nome || "Sistema",
      entidade: table,
      entidade_id: resultado.meta.last_row_id,
      acao: "insercao",
      detalhes: `Novo registro cadastrado em ${table} (ID ${resultado.meta.last_row_id})`,
      dados_novos: novo,
    });
    return json(novo, 201);
  }

  return { onRequestGet, onRequestPost };
}

export function crudItemHandlers(table, { required = [], optional = [], tela } = {}) {
  const campos = [...required, ...optional];

  async function onRequestGet(context) {
    const { erro } = await exigirPermissao(context, tela, "visualizar");
    if (erro) return erro;
    const row = await first(context.env.DB, `SELECT * FROM ${table} WHERE id = ?`, context.params.id);
    if (!row) return error("Não encontrado", 404);
    return json(row);
  }

  async function onRequestPut(context) {
    const { usuario, erro } = await exigirPermissao(context, tela, "editar");
    if (erro) return erro;
    const body = await context.request.json();
    const faltando = campoObrigatorioFaltando(body, required);
    if (faltando) return error(`Campo obrigatório: ${faltando}`);
    const antes = await first(context.env.DB, `SELECT * FROM ${table} WHERE id = ?`, context.params.id);
    if (!antes) return error("Não encontrado", 404);
    const colunas = campos.filter((c) => body[c] !== undefined);
    if (colunas.length === 0) return error("Nenhum campo para atualizar");
    const set = colunas.map((c) => `${c} = ?`).join(", ");
    const valores = colunas.map((c) => body[c]);
    await run(context.env.DB, `UPDATE ${table} SET ${set} WHERE id = ?`, ...valores, context.params.id);
    const atualizado = await first(context.env.DB, `SELECT * FROM ${table} WHERE id = ?`, context.params.id);
    if (!atualizado) return error("Não encontrado", 404);
    await registrarAuditoriaSistema(context.env.DB, {
      usuario_id: usuario?.id,
      usuario_nome: usuario?.nome || "Sistema",
      entidade: table,
      entidade_id: Number(context.params.id),
      acao: "edicao",
      detalhes: `Registro atualizado em ${table} (ID ${context.params.id})`,
      dados_antigos: antes,
      dados_novos: atualizado,
    });
    return json(atualizado);
  }

  async function onRequestDelete(context) {
    const { usuario, erro } = await exigirPermissao(context, tela, "excluir");
    if (erro) return erro;
    const erroDependencia = await validarDependenciasExclusao(context.env.DB, table, context.params.id);
    if (erroDependencia) return error(erroDependencia, 400);
    const antes = await first(context.env.DB, `SELECT * FROM ${table} WHERE id = ?`, context.params.id);
    try {
      const resultado = await run(context.env.DB, `DELETE FROM ${table} WHERE id = ?`, context.params.id);
      if (resultado.meta.changes === 0) return error("Não encontrado", 404);
      await atualizarContadorId(context.env.DB, table);
      await registrarAuditoriaSistema(context.env.DB, {
        usuario_id: usuario?.id,
        usuario_nome: usuario?.nome || "Sistema",
        entidade: table,
        entidade_id: Number(context.params.id),
        acao: "exclusao",
        detalhes: `Registro excluído em ${table} (ID ${context.params.id})`,
        dados_antigos: antes,
      });
      return json({ ok: true });
    } catch (e) {
      if (String(e.message).includes("FOREIGN KEY") || String(e.message).includes("CONSTRAINT")) {
        return error(
          "Não é possível excluir este registro pois existem outros registros vinculados a ele. Por favor, verifique e remova os vínculos primeiro.",
          400
        );
      }
      throw e;
    }
  }

  return { onRequestGet, onRequestPut, onRequestDelete };
}
