import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirAdmin, ensureColunaGrupoPai, ensureTabelaPermissoes, TELAS } from "../../_lib/permissoes.js";
import { validarDependenciasExclusao, atualizarContadorId } from "../../_lib/dependencias.js";
import { registrarAuditoriaSistema } from "../../_lib/auditoria.js";

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
  await ensureColunaGrupoPai(context.env.DB);
  await ensureTabelaPermissoes(context.env.DB);
  const grupo = await first(context.env.DB, "SELECT * FROM grupos_permissao WHERE id = ?", context.params.id);
  if (!grupo) return error("Não encontrado", 404);
  grupo.permissoes = await carregarMatrizPermissoes(context.env.DB, grupo.id);
  return json(grupo);
}

export async function onRequestPut(context) {
  try {
    const { usuario, erro } = await exigirAdmin(context);
    if (erro) return erro;
    await ensureColunaGrupoPai(context.env.DB);
    await ensureTabelaPermissoes(context.env.DB);
    const body = await context.request.json();
    if (!body.nome) return error("Campo obrigatório: nome");

    const antes = await first(context.env.DB, "SELECT * FROM grupos_permissao WHERE id = ?", context.params.id);
    if (!antes) return error("Não encontrado", 404);

    const grupoPaiId = body.grupo_pai_id !== undefined ? (body.grupo_pai_id ? Number(body.grupo_pai_id) : null) : antes.grupo_pai_id;
    if (grupoPaiId === Number(context.params.id)) {
      return error("Um grupo não pode ser pai de si mesmo.");
    }

    await run(
      context.env.DB,
      "UPDATE grupos_permissao SET nome = ?, grupo_pai_id = ? WHERE id = ?",
      body.nome.trim(),
      grupoPaiId,
      context.params.id
    );

    if (body.permissoes) {
      const telasUnicas = Array.from(new Set([...TELAS, ...Object.keys(body.permissoes)]));
      for (const tela of telasUnicas) {
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

    await registrarAuditoriaSistema(context.env.DB, {
      usuario_id: usuario?.id,
      usuario_nome: usuario?.nome || "Sistema",
      entidade: "grupos_permissao",
      entidade_id: Number(context.params.id),
      acao: "edicao",
      detalhes: `Grupo de permissão atualizado: ${atualizado.nome}`,
      dados_antigos: antes,
      dados_novos: atualizado,
    });

    return json(atualizado);
  } catch (err) {
    console.error("Erro ao salvar grupo de permissao:", err);
    return error(err.message || "Erro ao salvar alterações no grupo de permissão", 500);
  }
}

export async function onRequestDelete(context) {
  const { usuario, erro } = await exigirAdmin(context);
  if (erro) return erro;
  const erroDependencia = await validarDependenciasExclusao(context.env.DB, "grupos_permissao", context.params.id);
  if (erroDependencia) return error(erroDependencia, 400);

  const antes = await first(context.env.DB, "SELECT * FROM grupos_permissao WHERE id = ?", context.params.id);

  try {
    await run(context.env.DB, "DELETE FROM usuario_grupos WHERE grupo_id = ?", context.params.id);
    await run(context.env.DB, "DELETE FROM permissoes WHERE grupo_id = ?", context.params.id);
    await run(context.env.DB, "UPDATE grupos_permissao SET grupo_pai_id = NULL WHERE grupo_pai_id = ?", context.params.id);
    const res = await run(context.env.DB, "DELETE FROM grupos_permissao WHERE id = ?", context.params.id);
    if (res.meta.changes === 0) return error("Não encontrado", 404);
    await atualizarContadorId(context.env.DB, "grupos_permissao");

    await registrarAuditoriaSistema(context.env.DB, {
      usuario_id: usuario?.id,
      usuario_nome: usuario?.nome || "Sistema",
      entidade: "grupos_permissao",
      entidade_id: Number(context.params.id),
      acao: "exclusao",
      detalhes: `Grupo de permissão excluído: ${antes?.nome || context.params.id}`,
      dados_antigos: antes,
    });

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
