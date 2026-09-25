import { all, run, first } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirPermissao } from "../../_lib/permissoes.js";
import { registrarAuditoria } from "../../_lib/auditoria.js";
import { hojeISO } from "../../_lib/chamados.js";
import {
  extrairAnoMes,
  verificarMesFechado,
  verificarMesLiberadoPorAdmin,
  calcularDataFechamentoMes,
  validarPermissaoAlteracaoApontamento,
  ensureTabelaMesesLiberados,
} from "../../_lib/apontamentos.js";

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
  } catch (_) {}
}

export async function onRequestGet(context) {
  // Acesso liberado se tiver permissão de visualizar em 'apontamentos' OU 'chamados'
  let { usuario, erro } = await exigirPermissao(context, "apontamentos", "visualizar");
  if (erro) {
    ({ usuario, erro } = await exigirPermissao(context, "chamados", "visualizar"));
  }
  if (erro) return erro;

  const db = context.env.DB;
  await garantirTabelaHoras(db);
  await ensureTabelaMesesLiberados(db);

  const url = new URL(context.request.url);
  const mesFiltro = url.searchParams.get("mes") || url.searchParams.get("ano_mes") || hojeISO().slice(0, 7);
  const diaFiltro = url.searchParams.get("dia") || null;
  const usuarioIdFiltro = url.searchParams.get("usuario_id") ? Number(url.searchParams.get("usuario_id")) : null;
  const setorIdFiltro = url.searchParams.get("setor_id") ? Number(url.searchParams.get("setor_id")) : null;
  const chamadoIdFiltro = url.searchParams.get("chamado_id") ? Number(url.searchParams.get("chamado_id")) : null;
  const busca = (url.searchParams.get("busca") || "").trim().toLowerCase();

  const condicoes = [];
  const params = [];

  if (diaFiltro) {
    condicoes.push("h.data = ?");
    params.push(diaFiltro);
  } else if (mesFiltro) {
    condicoes.push("substr(h.data, 1, 7) = ?");
    params.push(mesFiltro);
  }

  if (usuarioIdFiltro) {
    condicoes.push("h.usuario_id = ?");
    params.push(usuarioIdFiltro);
  }

  if (setorIdFiltro) {
    condicoes.push("(u.setor_id = ? OR c_setor.id = ?)");
    params.push(setorIdFiltro, setorIdFiltro);
  }

  if (chamadoIdFiltro) {
    condicoes.push("h.chamado_id = ?");
    params.push(chamadoIdFiltro);
  }

  if (busca) {
    condicoes.push("(CAST(h.chamado_id AS TEXT) LIKE ? OR LOWER(h.observacao) LIKE ? OR LOWER(u.nome) LIKE ? OR LOWER(COALESCE(c.titulo, '')) LIKE ?)");
    const like = `%${busca}%`;
    params.push(like, like, like, like);
  }

  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";

  const sql = `
    SELECT
      h.id,
      h.chamado_id,
      h.usuario_id,
      h.data,
      h.horas,
      h.observacao,
      u.nome AS usuario_nome,
      u_setor.nome AS setor_nome,
      COALESCE(c.titulo, e.nome, 'Chamado #' || h.chamado_id) AS chamado_titulo,
      st.nome AS chamado_status_nome,
      st.cor AS chamado_status_cor
    FROM apontamentos_horas h
    JOIN usuarios u ON u.id = h.usuario_id
    LEFT JOIN setores u_setor ON u_setor.id = u.setor_id
    LEFT JOIN chamados c ON c.id = h.chamado_id
    LEFT JOIN etapas e ON e.id = c.etapa_id
    LEFT JOIN acoes a ON a.id = c.acao_origem_id
    LEFT JOIN setores c_setor ON c_setor.id = COALESCE(e.setor_id, a.setor_destino_id)
    LEFT JOIN status st ON st.id = c.status_id
    ${where}
    ORDER BY h.data DESC, h.id DESC
  `;

  const apontamentos = await all(db, sql, ...params).catch(() => []);

  // Metadados de fechamento para o mês consultado
  const mesCompetencia = diaFiltro ? diaFiltro.slice(0, 7) : mesFiltro;
  const mesFechado = verificarMesFechado(mesCompetencia);
  const mesLiberado = await verificarMesLiberadoPorAdmin(db, mesCompetencia);
  const dataFechamento = calcularDataFechamentoMes(mesCompetencia);

  const totalHoras = apontamentos.reduce((s, a) => s + (Number(a.horas) || 0), 0);

  // Calcula para cada item se o usuário atual tem permissão para editar
  const itensComPermissao = apontamentos.map((item) => {
    const itemAnoMes = extrairAnoMes(item.data);
    const itemFechado = verificarMesFechado(itemAnoMes);
    let podeEditar = false;

    if (usuario.admin === 1 || usuario.admin === true) {
      podeEditar = true;
    } else if (!itemFechado || mesLiberado) {
      // Se mês aberto ou liberado pelo admin, o próprio autor pode editar
      podeEditar = item.usuario_id === usuario.id;
    }

    return {
      ...item,
      horas: Number(Number(item.horas).toFixed(2)),
      mes_fechado: itemFechado,
      mes_liberado: mesLiberado,
      pode_editar: podeEditar,
    };
  });

  return json({
    itens: itensComPermissao,
    total_horas: Number(totalHoras.toFixed(2)),
    total_lancamentos: itensComPermissao.length,
    mes_consultado: mesCompetencia,
    dia_consultado: diaFiltro,
    mes_fechado: mesFechado,
    mes_liberado: mesLiberado,
    data_fechamento: dataFechamento,
    usuario_admin: Boolean(usuario.admin),
  });
}

export async function onRequestPost(context) {
  let { usuario, erro } = await exigirPermissao(context, "apontamentos", "inserir");
  if (erro) {
    ({ usuario, erro } = await exigirPermissao(context, "chamados", "editar"));
  }
  if (erro) {
    ({ usuario, erro } = await exigirPermissao(context, "chamados", "visualizar"));
  }
  if (erro) return erro;

  const db = context.env.DB;
  await garantirTabelaHoras(db);
  const body = await context.request.json().catch(() => ({}));

  if (!body.chamado_id || !body.data || body.horas == null || isNaN(Number(body.horas))) {
    return error("Campos obrigatórios: chamado_id, data, horas");
  }

  const horasNum = Number(body.horas);
  if (horasNum <= 0) {
    return error("A quantidade de horas deve ser maior que zero.");
  }

  // Validação de fechamento de mês
  const validacao = await validarPermissaoAlteracaoApontamento(db, body.data, usuario);
  if (!validacao.permitido) {
    return error(validacao.motivo, 403);
  }

  // Verifica se o chamado existe
  const chamado = await first(db, "SELECT id, chamado_mae_id, titulo, responsavel_id FROM chamados WHERE id = ?", body.chamado_id);
  if (!chamado) {
    return error("Chamado não encontrado", 404);
  }

  // Validação: só permitir apontamento se o usuário for administrador ou for o usuário responsável pela atividade
  const ehAdmin = usuario.admin === 1 || usuario.admin === true;
  let ehResponsavel = chamado.responsavel_id === usuario.id;
  if (!ehResponsavel) {
    const subAtivo = await first(
      db,
      "SELECT id FROM chamados WHERE chamado_mae_id = ? AND data_finalizacao IS NULL AND responsavel_id = ? LIMIT 1",
      chamado.id,
      usuario.id
    );
    if (subAtivo) ehResponsavel = true;
  }

  if (!ehAdmin && !ehResponsavel) {
    return error("Apenas o responsável pela atividade ou um administrador pode realizar apontamentos.", 403);
  }

  const usuarioIdAlvo = usuario.admin && body.usuario_id ? Number(body.usuario_id) : usuario.id;

  const res = await run(
    db,
    `INSERT INTO apontamentos_horas (chamado_id, usuario_id, data, horas, observacao)
     VALUES (?, ?, ?, ?, ?)`,
    body.chamado_id,
    usuarioIdAlvo,
    body.data,
    horasNum,
    body.observacao ?? null
  );

  const raizId = chamado.chamado_mae_id || chamado.id;
  await registrarAuditoria(db, {
    chamado_mae_id: raizId,
    chamado_id: body.chamado_id,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    acao: "apontamento_horas",
    detalhes: `Lançou ${horasNum}h na data ${body.data}${body.observacao ? `: "${body.observacao}"` : ""}`,
  }).catch(() => {});

  const criado = await first(db, "SELECT * FROM apontamentos_horas WHERE id = ?", res.meta.last_row_id);
  return json(criado, 201);
}
