import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirAdmin } from "../../_lib/permissoes.js";
import { validarDependenciasExclusao, atualizarContadorId } from "../../_lib/dependencias.js";

const TELAS = ["empresas", "setores", "usuarios", "status", "fluxos", "chamados"];

async function carregarMatrizPermissoes(db, grupoId) {
  const linhas = await all(db, "SELECT * FROM permissoes WHERE grupo_id = ?", grupoId);
  const matriz = {};
  for (const tela of TELAS) {
    matriz[tela] = { visualizar: false, inserir: false, editar: false, excluir: false };
  }
  matriz.chamados.ver_todos_setores = false;
  for (const linha of linhas) {
    matriz[linha.tela] = {
      visualizar: linha.visualizar === 1,
      inserir: linha.inserir === 1,
      editar: linha.editar === 1,
      excluir: linha.excluir === 1,
    };
    if (linha.tela === "chamados") {
      matriz.chamados.ver_todos_setores = linha.ver_todos_setores === 1;
    }
  }
  return matriz;
}

export async function onRequestGet(context) {
  const { erro } = await exigirAdmin(context);
  if (erro) return erro;
  const grupo = await first(context.env.DB, "SELECT * FROM grupos_permissao WHERE id = ?", context.params.id);
  if (!grupo) return error("Não encontrado", 404);
  grupo.permissoes = await carregarMatrizPermissoes(context.env.DB, grupo.id);
  return json(grupo);
}

export async function onRequestPut(context) {
  const { erro } = await exigirAdmin(context);
  if (erro) return erro;
  const body = await context.request.json();
  if (!body.nome) return error("Campo obrigatório: nome");

  await run(context.env.DB, "UPDATE grupos_permissao SET nome = ? WHERE id = ?", body.nome.trim(), context.params.id);

  if (body.permissoes) {
    for (const tela of TELAS) {
      const valores = body.permissoes[tela] ?? {};
      const existente = await first(
        context.env.DB,
        "SELECT id FROM permissoes WHERE grupo_id = ? AND tela = ?",
        context.params.id,
        tela
      );
      const visualizar = valores.visualizar ? 1 : 0;
      const inserir = valores.inserir ? 1 : 0;
      const editar = valores.editar ? 1 : 0;
      const excluir = valores.excluir ? 1 : 0;
      const verTodosSetores = tela === "chamados" && valores.ver_todos_setores ? 1 : 0;
      if (existente) {
        await run(
          context.env.DB,
          `UPDATE permissoes SET visualizar = ?, inserir = ?, editar = ?, excluir = ?, ver_todos_setores = ?
           WHERE id = ?`,
          visualizar,
          inserir,
          editar,
          excluir,
          verTodosSetores,
          existente.id
        );
      } else {
        await run(
          context.env.DB,
          `INSERT INTO permissoes (grupo_id, tela, visualizar, inserir, editar, excluir, ver_todos_setores)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          context.params.id,
          tela,
          visualizar,
          inserir,
          editar,
          excluir,
          verTodosSetores
        );
      }
    }
  }

  const atualizado = await first(context.env.DB, "SELECT * FROM grupos_permissao WHERE id = ?", context.params.id);
  if (!atualizado) return error("Não encontrado", 404);
  atualizado.permissoes = await carregarMatrizPermissoes(context.env.DB, atualizado.id);
  return json(atualizado);
}

export async function onRequestDelete(context) {
  const { erro } = await exigirAdmin(context);
  if (erro) return erro;
  const erroDependencia = await validarDependenciasExclusao(context.env.DB, "grupos_permissao", context.params.id);
  if (erroDependencia) return error(erroDependencia, 400);

  try {
    await run(context.env.DB, "DELETE FROM usuario_grupos WHERE grupo_id = ?", context.params.id);
    await run(context.env.DB, "DELETE FROM permissoes WHERE grupo_id = ?", context.params.id);
    const res = await run(context.env.DB, "DELETE FROM grupos_permissao WHERE id = ?", context.params.id);
    if (res.meta.changes === 0) return error("Não encontrado", 404);
    await atualizarContadorId(context.env.DB, "grupos_permissao");
    return json({ ok: true });
  } catch (e) {
    if (String(e.message).includes("FOREIGN KEY") || String(e.message).includes("CONSTRAINT")) {
      return error(
        "Não é possível excluir este grupo de permissão pois existem outros registros vinculados a ele.",
        400
      );
    }
    throw e;
  }
}
