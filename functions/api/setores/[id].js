import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirPermissao } from "../../_lib/permissoes.js";
import { validarDependenciasExclusao, atualizarContadorId } from "../../_lib/dependencias.js";

async function carregarEmpresasDoSetor(db, setorId) {
  try {
    const rows = await all(db, "SELECT empresa_id FROM setor_empresas WHERE setor_id = ?", setorId);
    return rows.map((r) => r.empresa_id);
  } catch (e) {
    return [];
  }
}

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "setores", "visualizar");
  if (erro) return erro;

  const setor = await first(context.env.DB, "SELECT * FROM setores WHERE id = ?", context.params.id);
  if (!setor) return error("Não encontrado", 404);

  const empresas = await carregarEmpresasDoSetor(context.env.DB, setor.id);
  setor.empresas = empresas.length > 0 ? empresas : (setor.empresa_id ? [setor.empresa_id] : []);

  return json(setor);
}

export async function onRequestPut(context) {
  const { erro } = await exigirPermissao(context, "setores", "editar");
  if (erro) return erro;

  const body = await context.request.json();
  const setor = await first(context.env.DB, "SELECT * FROM setores WHERE id = ?", context.params.id);
  if (!setor) return error("Não encontrado", 404);

  let empresas = null;
  if (body.empresas !== undefined) {
    empresas = Array.isArray(body.empresas) ? body.empresas.map(Number).filter(Boolean) : [];
    if (empresas.length === 0) {
      return error("Selecione pelo menos uma empresa para o setor.");
    }
  } else if (body.empresa_id !== undefined) {
    empresas = [Number(body.empresa_id)];
  }

  const colunas = [];
  const valores = [];

  if (body.nome !== undefined) {
    if (!body.nome) return error("Campo obrigatório: nome");
    colunas.push("nome");
    valores.push(body.nome);
  }
  if (body.centro_custo !== undefined) {
    colunas.push("centro_custo");
    valores.push(body.centro_custo || null);
  }
  if (body.prazo_padrao_dias !== undefined && body.prazo_padrao_dias !== "") {
    colunas.push("prazo_padrao_dias");
    valores.push(Number(body.prazo_padrao_dias));
  }
  if (empresas && empresas.length > 0) {
    colunas.push("empresa_id");
    valores.push(empresas[0]);
  }

  if (colunas.length > 0) {
    const set = colunas.map((c) => `${c} = ?`).join(", ");
    await run(context.env.DB, `UPDATE setores SET ${set} WHERE id = ?`, ...valores, context.params.id);
  }

  if (empresas) {
    await run(context.env.DB, "DELETE FROM setor_empresas WHERE setor_id = ?", context.params.id);
    for (const empId of empresas) {
      await run(
        context.env.DB,
        "INSERT OR IGNORE INTO setor_empresas (setor_id, empresa_id) VALUES (?, ?)",
        context.params.id,
        empId
      );
    }
  }

  const atualizado = await first(context.env.DB, "SELECT * FROM setores WHERE id = ?", context.params.id);
  const empresasAtualizadas = await carregarEmpresasDoSetor(context.env.DB, context.params.id);
  atualizado.empresas = empresasAtualizadas.length > 0 ? empresasAtualizadas : (atualizado.empresa_id ? [atualizado.empresa_id] : []);

  return json(atualizado);
}

export async function onRequestDelete(context) {
  const { erro } = await exigirPermissao(context, "setores", "excluir");
  if (erro) return erro;

  const erroDependencia = await validarDependenciasExclusao(context.env.DB, "setores", context.params.id);
  if (erroDependencia) return error(erroDependencia, 400);

  try {
    await run(context.env.DB, "DELETE FROM setor_empresas WHERE setor_id = ?", context.params.id);
    const res = await run(context.env.DB, "DELETE FROM setores WHERE id = ?", context.params.id);
    if (res.meta.changes === 0) return error("Não encontrado", 404);
    await atualizarContadorId(context.env.DB, "setores");
    return json({ ok: true });
  } catch (e) {
    if (String(e.message).includes("FOREIGN KEY") || String(e.message).includes("CONSTRAINT")) {
      return error(
        "Não é possível excluir este setor pois existem registros vinculados a ele.",
        400
      );
    }
    throw e;
  }
}
