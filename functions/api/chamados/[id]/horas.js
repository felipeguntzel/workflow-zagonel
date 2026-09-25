import { all, run, first } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { exigirPermissao } from "../../../_lib/permissoes.js";
import { registrarAuditoria } from "../../../_lib/auditoria.js";

let tabelaHorasGarantida = false;
async function garantirTabelaHoras(db) {
  if (tabelaHorasGarantida) return;
  try {
    await run(
      db,
      `CREATE TABLE IF NOT EXISTS apontamentos_horas (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         chamado_id INTEGER NOT NULL REFERENCES chamados(id),
         usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
         data TEXT NOT NULL,
         horas REAL NOT NULL,
         observacao TEXT
       )`
    );
    tabelaHorasGarantida = true;
  } catch (err) {
    console.error("Aviso ao garantir tabela de apontamentos_horas:", err);
  }
}

async function resumoHoras(db, chamadoId) {
  await garantirTabelaHoras(db);
  const lancamentos = await all(
    db,
    `SELECT h.*, u.nome AS usuario_nome
     FROM apontamentos_horas h
     JOIN usuarios u ON u.id = h.usuario_id
     WHERE h.chamado_id = ?
     ORDER BY h.data DESC, h.id DESC`,
    chamadoId
  ).catch(() => []);
  const total_horas = lancamentos.reduce((soma, l) => soma + (Number(l.horas) || 0), 0);
  return { lancamentos, total_horas: Number(total_horas.toFixed(2)) };
}

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "chamados", "visualizar");
  if (erro) return erro;
  return json(await resumoHoras(context.env.DB, context.params.id));
}

export async function onRequestPost(context) {
  // Permite apontar horas se tiver permissão de editar OU visualizar OU inserir em chamados
  let { usuario, erro } = await exigirPermissao(context, "chamados", "editar");
  if (erro) {
    ({ usuario, erro } = await exigirPermissao(context, "chamados", "visualizar"));
  }
  if (erro) return erro;

  await garantirTabelaHoras(context.env.DB);
  const body = await context.request.json().catch(() => ({}));
  if (!body.data || body.horas == null || isNaN(Number(body.horas))) {
    return error("Campos obrigatórios: data, horas");
  }

  const horasNum = Number(body.horas);
  if (horasNum <= 0) {
    return error("A quantidade de horas deve ser maior que zero.");
  }

  const chamado = await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", context.params.id);
  if (!chamado) return error("Chamado não encontrado", 404);

  // Validação: só permitir apontamento se o usuário for administrador ou for o usuário responsável pela atividade
  const ehAdmin = usuario.admin === 1 || usuario.admin === true;
  let ehResponsavel = chamado.responsavel_id === usuario.id;
  if (!ehResponsavel) {
    const subAtivo = await first(
      context.env.DB,
      "SELECT id FROM chamados WHERE chamado_mae_id = ? AND data_finalizacao IS NULL AND responsavel_id = ? LIMIT 1",
      chamado.id,
      usuario.id
    );
    if (subAtivo) ehResponsavel = true;
  }

  if (!ehAdmin && !ehResponsavel) {
    return error("Apenas o responsável pela atividade ou um administrador pode realizar apontamentos.", 403);
  }

  await run(
    context.env.DB,
    `INSERT INTO apontamentos_horas (chamado_id, usuario_id, data, horas, observacao)
     VALUES (?, ?, ?, ?, ?)`,
    context.params.id,
    usuario.id,
    body.data,
    horasNum,
    body.observacao ?? null
  );

  const raizId = chamado ? (chamado.chamado_mae_id || chamado.id) : context.params.id;
  await registrarAuditoria(context.env.DB, {
    chamado_mae_id: raizId,
    chamado_id: context.params.id,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    acao: "apontamento_horas",
    detalhes: `Apontou ${horasNum}h na data ${body.data}${body.observacao ? `: "${body.observacao}"` : ""}`
  }).catch(() => {});

  return json(await resumoHoras(context.env.DB, context.params.id), 201);
}
