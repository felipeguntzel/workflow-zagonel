import { json, error } from "../_lib/http.js";
import { exigirAdmin } from "../_lib/permissoes.js";
import {
  listarEstruturaTabelas,
  executarSql,
  restaurarSequenciasIds,
  diagnosticarErroSql,
  traduzirMensagemErroSql,
} from "../_lib/sql-service.js";
import { registrarAuditoriaSistema } from "../_lib/auditoria.js";

export async function onRequestGet(context) {
  const { erro } = await exigirAdmin(context);
  if (erro) return erro;

  try {
    const tabelas = await listarEstruturaTabelas(context.env.DB);
    return json({ tabelas });
  } catch (err) {
    return error(`Erro ao listar estrutura do banco de dados: ${traduzirMensagemErroSql(err.message)}`, 500);
  }
}

export async function onRequestPost(context) {
  const { usuario, erro } = await exigirAdmin(context);
  if (erro) return erro;

  let sql = "";
  try {
    const body = await context.request.json();

    if (body.acao === "resetar_sequencia") {
      const tabela = body.tabela ? String(body.tabela).trim() : null;
      const res = await restaurarSequenciasIds(context.env.DB, tabela);
      await registrarAuditoriaSistema(context.env.DB, {
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        entidade: "sql_editor",
        entidade_id: null,
        acao: "resetar_sequencia",
        detalhes: tabela
          ? `Restauração do contador de IDs da tabela "${tabela}" por ${usuario.nome}`
          : `Restauração do contador de IDs de todas as tabelas vazias por ${usuario.nome}`,
      });
      // Retorna a contagem atualizada das tabelas em tempo de execução
      try {
        res.tabelas = await listarEstruturaTabelas(context.env.DB);
      } catch (_) {}
      return json(res);
    }

    sql = String(body.sql || "").trim();
    if (!sql) {
      return error("Instrução SQL não informada.");
    }

    const resultado = await executarSql(context.env.DB, sql);
    if (!resultado.ehLeitura) {
      await registrarAuditoriaSistema(context.env.DB, {
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        entidade: "sql_editor",
        entidade_id: null,
        acao: "execucao_sql",
        detalhes: `Comando SQL executado por ${usuario.nome} (${resultado.linhasAfetadas || 0} linha(s) afetada(s)): ${sql.slice(0, 300)}`,
      });
      // Retorna a contagem atualizada das tabelas em tempo de execução
      try {
        resultado.tabelas = await listarEstruturaTabelas(context.env.DB);
      } catch (_) {}
    }
    return json(resultado);
  } catch (err) {
    let diag = err.diagnostico;
    if (!diag) {
      try {
        diag = await diagnosticarErroSql(context.env.DB, sql, err);
      } catch (_) {}
    }

    if (diag) {
      return error(diag.mensagemAmigavel, 400, {
        codigo: diag.tipoErro,
        tabela: diag.tabela,
        dependencias: diag.dependencias || [],
        comandosSugeridos: diag.comandosSugeridos || [],
        erroOriginal: diag.erroOriginal || err.erroOriginal || err.message,
      });
    }

    const msgTraduzida = traduzirMensagemErroSql(err.message);
    return error(msgTraduzida, 400, {
      erroOriginal: err.erroOriginal || err.message,
    });
  }
}
