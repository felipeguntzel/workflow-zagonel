import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirAdmin, exigirPermissao, ensureColunaGrupoPai } from "../../_lib/permissoes.js";
import { registrarAuditoriaSistema } from "../../_lib/auditoria.js";

const TELAS = ["empresas", "setores", "usuarios", "status", "fluxos", "chamados", "dashboards"];

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "usuarios", "visualizar");
  if (erro) return erro;
  await ensureColunaGrupoPai(context.env.DB);
  const grupos = await all(
    context.env.DB,
    `SELECT g.*, p.nome AS grupo_pai_nome
     FROM grupos_permissao g
     LEFT JOIN grupos_permissao p ON p.id = g.grupo_pai_id
     ORDER BY g.id`
  );

  const permissoes = await all(
    context.env.DB,
    "SELECT grupo_id, tela, visualizar, inserir, editar, excluir, ver_todos_setores FROM permissoes"
  );
  const porGrupo = {};
  for (const p of permissoes) {
    if (!porGrupo[p.grupo_id]) porGrupo[p.grupo_id] = [];
    if (p.visualizar || p.inserir || p.editar || p.excluir) {
      porGrupo[p.grupo_id].push(p.tela);
    }
  }
  for (const g of grupos) {
    g.telasPermitidas = porGrupo[g.id] || [];
  }

  return json(grupos);
}

export async function onRequestPost(context) {
  const { usuario, erro } = await exigirAdmin(context);
  if (erro) return erro;
  await ensureColunaGrupoPai(context.env.DB);
  const body = await context.request.json();
  if (!body.nome) return error("Campo obrigatório: nome");

  const grupoPaiId = body.grupo_pai_id ? Number(body.grupo_pai_id) : null;
  const resultado = await run(
    context.env.DB,
    "INSERT INTO grupos_permissao (nome, grupo_pai_id) VALUES (?, ?)",
    body.nome.trim(),
    grupoPaiId
  );
  const grupoId = resultado.meta.last_row_id;

  if (body.permissoes) {
    for (const tela of TELAS) {
      const valores = body.permissoes[tela] ?? {};
      await run(
        context.env.DB,
        `INSERT INTO permissoes (grupo_id, tela, visualizar, inserir, editar, excluir, ver_todos_setores)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        grupoId,
        tela,
        valores.visualizar ? 1 : 0,
        valores.inserir ? 1 : 0,
        valores.editar ? 1 : 0,
        valores.excluir ? 1 : 0,
        tela === "chamados" && valores.ver_todos_setores ? 1 : 0
      );
    }
  }

  const novo = await first(
    context.env.DB,
    "SELECT * FROM grupos_permissao WHERE id = ?",
    grupoId
  );

  await registrarAuditoriaSistema(context.env.DB, {
    usuario_id: usuario?.id,
    usuario_nome: usuario?.nome || "Sistema",
    entidade: "grupos_permissao",
    entidade_id: grupoId,
    acao: "insercao",
    detalhes: `Grupo de permissão criado: ${novo.nome}`,
    dados_novos: novo,
  });

  return json(novo, 201);
}
