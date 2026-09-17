import { json, error } from "../_lib/http.js";
import { exigirAdmin } from "../_lib/permissoes.js";
import { listarEstruturaTabelas, executarSql } from "../_lib/sql-service.js";

export async function onRequestGet(context) {
  const { erro } = await exigirAdmin(context);
  if (erro) return erro;

  try {
    const tabelas = await listarEstruturaTabelas(context.env.DB);
    return json({ tabelas });
  } catch (err) {
    return error(`Erro ao listar estrutura do banco de dados: ${err.message}`, 500);
  }
}

export async function onRequestPost(context) {
  const { erro } = await exigirAdmin(context);
  if (erro) return erro;

  try {
    const body = await context.request.json();
    const sql = String(body.sql || "").trim();
    if (!sql) {
      return error("Instrução SQL não informada.");
    }

    const resultado = await executarSql(context.env.DB, sql);
    return json(resultado);
  } catch (err) {
    return error(err.message || "Erro ao executar comando SQL.", 400);
  }
}
