import { all, first } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirUsuarioLogado } from "../../_lib/permissoes.js";
import { crudHandlers, assegurarEsquemaTabela } from "../../_lib/crud.js";

const crud = crudHandlers("empresas", {
  required: ["nome"],
  optional: ["codigo"],
  tela: "empresas",
});

let empresasSaneadas = false;
async function consolidarEmpresasDuplicadas(db) {
  if (empresasSaneadas) return;
  try {
    const duplicatas = await all(
      db,
      `SELECT LOWER(TRIM(nome)) as nome_norm, MIN(id) as id_principal, COUNT(*) as qtd
       FROM empresas
       GROUP BY LOWER(TRIM(nome))
       HAVING qtd > 1`
    ).catch(() => []);

    if (Array.isArray(duplicatas) && duplicatas.length > 0) {
      for (const dup of duplicatas) {
        const outros = await all(
          db,
          `SELECT id, codigo FROM empresas WHERE LOWER(TRIM(nome)) = ? AND id != ?`,
          dup.nome_norm,
          dup.id_principal
        ).catch(() => []);

        for (const outro of outros) {
          if (outro.codigo) {
            await db.prepare(
              `UPDATE empresas SET codigo = COALESCE(codigo, ?) WHERE id = ?`
            ).bind(outro.codigo, dup.id_principal).run().catch(() => {});
          }
          await db.prepare("UPDATE chamados SET empresa_id = ? WHERE empresa_id = ?").bind(dup.id_principal, outro.id).run().catch(() => {});
          await db.prepare("UPDATE setores SET empresa_id = ? WHERE empresa_id = ?").bind(dup.id_principal, outro.id).run().catch(() => {});
          await db.prepare("UPDATE setor_empresas SET empresa_id = ? WHERE empresa_id = ?").bind(dup.id_principal, outro.id).run().catch(() => {});
          await db.prepare(
            `DELETE FROM setor_empresas WHERE rowid NOT IN (
               SELECT MIN(rowid) FROM setor_empresas GROUP BY setor_id, empresa_id
             )`
          ).run().catch(() => {});
          await db.prepare("DELETE FROM empresas WHERE id = ?").bind(outro.id).run().catch(() => {});
        }
      }
    }
    empresasSaneadas = true;
  } catch (err) {
    console.error("Aviso ao consolidar empresas:", err);
  }
}

export async function onRequestGet(context) {
  // Qualquer usuario autenticado pode listar empresas para abertura de chamados ou selecao
  const { erro } = await exigirUsuarioLogado(context);
  if (erro) return erro;
  await assegurarEsquemaTabela(context.env.DB, "empresas");
  await consolidarEmpresasDuplicadas(context.env.DB);
  const empresas = await all(
    context.env.DB,
    `SELECT MIN(id) AS id, nome, MAX(codigo) AS codigo
     FROM empresas
     GROUP BY LOWER(TRIM(nome))
     ORDER BY MIN(id)`
  );
  return json(empresas);
}

export async function onRequestPost(context) {
  const { erro } = await exigirUsuarioLogado(context);
  if (erro) return erro;

  // Clona a request para verificar duplicidade de nome antes de delegar ao crud
  const clone = context.request.clone();
  const body = await clone.json().catch(() => ({}));
  const nome = String(body.nome || "").trim();

  if (nome) {
    await assegurarEsquemaTabela(context.env.DB, "empresas");
    const existente = await first(
      context.env.DB,
      "SELECT id FROM empresas WHERE LOWER(TRIM(nome)) = ?",
      nome.toLowerCase()
    );
    if (existente) {
      return error("Já existe uma empresa cadastrada com este nome.");
    }
  }

  return crud.onRequestPost(context);
}

