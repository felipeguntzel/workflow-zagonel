import { json, error } from "../../../_lib/http.js";
import { all, first } from "../../../_lib/db.js";
import { obterUsuarioDaRequisicao } from "../../../_lib/permissoes.js";
import { carregarCamposEValoresDoChamado, salvarValoresCamposChamado } from "../../../_lib/campos.js";
import { registrarAuditoria } from "../../../_lib/auditoria.js";

export async function onRequestGet(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);

  const chamado = await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", context.params.id);
  if (!chamado) return error("Chamado não encontrado", 404);

  const raizId = chamado.chamado_mae_id || chamado.id;
  const ehChamadoMae = chamado.chamado_mae_id == null;

  // 1. Identificar o chamado mãe
  const mae = ehChamadoMae
    ? chamado
    : await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", raizId);

  const ehSolicitante = usuario.id === (mae?.solicitante_id || chamado.solicitante_id);
  const ehAdmin = usuario.admin === 1;

  // 2. Determinar a etapa da solicitação original (chamado mãe)
  let etapaMaeId = mae?.etapa_id;
  if (!etapaMaeId && mae?.fluxo_template_id) {
    const inicial = await first(
      context.env.DB,
      "SELECT id FROM etapas WHERE fluxo_template_id = ? ORDER BY eh_inicial DESC, id ASC LIMIT 1",
      mae.fluxo_template_id
    );
    etapaMaeId = inicial?.id;
  }

  // 3. Campos da Solicitação Original
  let camposMaeFormatados = [];
  if (mae && etapaMaeId) {
    const camposMae = await carregarCamposEValoresDoChamado(context.env.DB, mae.id, etapaMaeId);
    if (Array.isArray(camposMae) && camposMae.length > 0) {
      camposMaeFormatados = camposMae.map((c) => ({
        ...c,
        da_solicitacao: true,
        somente_leitura: ehChamadoMae ? (c.somente_leitura || 0) : ((ehSolicitante || ehAdmin) ? (c.somente_leitura || 0) : 1),
        origem_etapa: "Solicitação Original"
      }));
    }
  }

  // 4. Campos da etapa do chamado atual (se for subchamado)
  let camposDaEtapaAtual = [];
  if (!ehChamadoMae && chamado.etapa_id) {
    const camposEtapa = await carregarCamposEValoresDoChamado(context.env.DB, chamado.id, chamado.etapa_id);
    if (Array.isArray(camposEtapa) && camposEtapa.length > 0) {
      const etapaAtualRow = await first(context.env.DB, "SELECT nome FROM etapas WHERE id = ?", chamado.etapa_id);
      camposDaEtapaAtual = camposEtapa.map((c) => ({
        ...c,
        da_solicitacao: false,
        somente_leitura: c.somente_leitura || 0,
        origem_etapa: etapaAtualRow?.nome || "Etapa Atual"
      }));
    }
  }

  // 5. Campos de outras etapas irmãs / filhas da mesma árvore
  let camposOutrasEtapas = [];
  if (mae) {
    const outrosChamados = await all(
      context.env.DB,
      `SELECT c.id, c.etapa_id, e.nome AS etapa_nome
       FROM chamados c
       LEFT JOIN etapas e ON e.id = c.etapa_id
       WHERE c.chamado_mae_id = ? AND c.id != ?
       ORDER BY c.id ASC`,
      raizId,
      chamado.id
    );

    for (const outro of outrosChamados || []) {
      if (outro.etapa_id && outro.etapa_id !== etapaMaeId && outro.etapa_id !== chamado.etapa_id) {
        const camposOutro = await carregarCamposEValoresDoChamado(context.env.DB, outro.id, outro.etapa_id);
        if (Array.isArray(camposOutro) && camposOutro.length > 0) {
          for (const co of camposOutro) {
            camposOutrasEtapas.push({
              ...co,
              da_solicitacao: false,
              somente_leitura: 1,
              origem_etapa: outro.etapa_nome || `Etapa #${outro.id}`
            });
          }
        }
      }
    }
  }

  // 6. Mesclar todos os campos preservando precedência
  const mapaCampos = new Map();

  // 1º Campos da Solicitação Original
  for (const c of camposMaeFormatados) {
    mapaCampos.set(Number(c.id), c);
  }

  // 2º Campos de outras etapas filhas do fluxo (visualização)
  for (const c of camposOutrasEtapas) {
    if (!mapaCampos.has(Number(c.id))) {
      mapaCampos.set(Number(c.id), c);
    }
  }

  // 3º Campos da etapa atual deste chamado (com prioridade máxima e editáveis)
  for (const c of camposDaEtapaAtual) {
    mapaCampos.set(Number(c.id), c);
  }

  const resultado = Array.from(mapaCampos.values());
  return json(resultado);
}

export async function onRequestPut(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);

  const chamado = await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", context.params.id);
  if (!chamado) return error("Chamado não encontrado", 404);

  const raizId = chamado.chamado_mae_id || chamado.id;
  const ehChamadoMae = chamado.chamado_mae_id == null;

  const mae = ehChamadoMae
    ? chamado
    : await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", raizId);

  const ehSolicitante = usuario.id === (mae?.solicitante_id || chamado.solicitante_id);
  const ehAdmin = usuario.admin === 1;

  // No chamado mãe, apenas o solicitante e administradores podem editar
  if (ehChamadoMae && !ehSolicitante && !ehAdmin) {
    return error("Apenas o solicitante e administradores podem editar os dados da solicitação inicial.", 403);
  }

  const body = await context.request.json();
  const valores = body.valores || body; // aceita { valores: { ... } } ou { campoId: valor }

  let etapaMaeId = mae?.etapa_id;
  if (!etapaMaeId && mae?.fluxo_template_id) {
    const inicial = await first(
      context.env.DB,
      "SELECT id FROM etapas WHERE fluxo_template_id = ? ORDER BY eh_inicial DESC, id ASC LIMIT 1",
      mae.fluxo_template_id
    );
    etapaMaeId = inicial?.id;
  }

  if (ehChamadoMae) {
    await salvarValoresCamposChamado(context.env.DB, chamado.id, valores, etapaMaeId || chamado.etapa_id);
  } else {
    // Se for subchamado, salva os campos da etapa atual no subchamado
    await salvarValoresCamposChamado(context.env.DB, chamado.id, valores, chamado.etapa_id);
    // E se o usuário for solicitante ou admin e enviou campos da solicitação inicial, salva também no chamado mãe
    if ((ehSolicitante || ehAdmin) && etapaMaeId) {
      await salvarValoresCamposChamado(context.env.DB, raizId, valores, etapaMaeId);
    }
  }

  const etapa = chamado.etapa_id ? await first(context.env.DB, "SELECT nome FROM etapas WHERE id = ?", chamado.etapa_id) : null;
  const etapaNome = etapa?.nome || (chamado.chamado_mae_id ? `Etapa #${chamado.id}` : "Solicitação Inicial");
  await registrarAuditoria(context.env.DB, {
    chamado_mae_id: raizId,
    chamado_id: chamado.id,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    acao: "edicao_campos",
    detalhes: `Atualizou campos personalizados da etapa "${etapaNome}"`
  });

  return onRequestGet(context);
}
