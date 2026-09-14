import { first, run } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { exigirAdmin } from "../../../_lib/permissoes.js";

const TELAS = ["empresas", "setores", "usuarios", "status", "fluxos", "chamados"];

export async function onRequestPut(context) {
  const { erro } = await exigirAdmin(context);
  if (erro) return erro;
  const grupo = await first(context.env.DB, "SELECT id FROM grupos_permissao WHERE id = ?", context.params.id);
  if (!grupo) return error("Não encontrado", 404);

  const body = await context.request.json();
  for (const tela of TELAS) {
    const valores = body[tela] ?? {};
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
  return json({ ok: true });
}
