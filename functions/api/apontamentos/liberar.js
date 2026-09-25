import { run, first } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirAdmin } from "../../_lib/permissoes.js";
import { registrarAuditoriaSistema } from "../../_lib/auditoria.js";
import { ensureTabelaMesesLiberados } from "../../_lib/apontamentos.js";

export async function onRequestPost(context) {
  const { usuario, erro } = await exigirAdmin(context);
  if (erro) return erro;

  const db = context.env.DB;
  await ensureTabelaMesesLiberados(db);

  const body = await context.request.json().catch(() => ({}));
  const anoMes = body.ano_mes || body.mes;
  const liberar = body.liberar !== false; // Padrão é true (liberar)

  if (!anoMes || !anoMes.includes("-")) {
    return error("Formato inválido para mês. Esperado: AAAA-MM (Ex: 2026-08)");
  }

  const agora = new Date().toISOString();

  if (liberar) {
    await run(
      db,
      `INSERT INTO meses_liberados_apontamento (ano_mes, liberado_em, liberado_por, liberado_por_nome)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(ano_mes) DO UPDATE SET liberado_em = excluded.liberado_em, liberado_por = excluded.liberado_por, liberado_por_nome = excluded.liberado_por_nome`,
      anoMes,
      agora,
      usuario.id,
      usuario.nome
    );

    await registrarAuditoriaSistema(db, {
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      entidade: "apontamentos_horas",
      acao: "edicao",
      detalhes: `Administrador ${usuario.nome} liberou a edição de apontamentos do mês fechado ${anoMes}.`,
    });

    return json({
      sucesso: true,
      ano_mes: anoMes,
      liberado: true,
      mensagem: `Mês ${anoMes} liberado com sucesso para apontamento e edição de horas.`,
    });
  } else {
    await run(db, "DELETE FROM meses_liberados_apontamento WHERE ano_mes = ?", anoMes);

    await registrarAuditoriaSistema(db, {
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      entidade: "apontamentos_horas",
      acao: "edicao",
      detalhes: `Administrador ${usuario.nome} bloqueou novamente o mês ${anoMes}.`,
    });

    return json({
      sucesso: true,
      ano_mes: anoMes,
      liberado: false,
      mensagem: `Mês ${anoMes} bloqueado novamente.`,
    });
  }
}
