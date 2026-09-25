import { json, error } from "../../../_lib/http.js";
import { first } from "../../../_lib/db.js";
import { obterUsuarioDaRequisicao } from "../../../_lib/permissoes.js";
import { carregarCamposEValoresDoChamado, salvarValoresCamposChamado } from "../../../_lib/campos.js";
import { registrarAuditoria } from "../../../_lib/auditoria.js";

export async function onRequestGet(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);

  const chamado = await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", context.params.id);
  if (!chamado) return error("Chamado não encontrado", 404);

  let camposComValores = await carregarCamposEValoresDoChamado(context.env.DB, chamado.id, chamado.etapa_id);

  if (chamado.chamado_mae_id) {
    const mae = await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", chamado.chamado_mae_id);
    if (mae && mae.etapa_id) {
      const camposMae = await carregarCamposEValoresDoChamado(context.env.DB, mae.id, mae.etapa_id);
      if (camposMae && camposMae.length > 0) {
        if (!camposComValores || camposComValores.length === 0) {
          camposComValores = camposMae.map((c) => ({ ...c, da_solicitacao: true, somente_leitura: 1 }));
        } else {
          const idsAtuais = new Set(camposComValores.map((c) => c.id));
          const camposMaeFormatados = camposMae
            .filter((c) => !idsAtuais.has(c.id))
            .map((c) => ({ ...c, da_solicitacao: true, somente_leitura: 1 }));
          camposComValores = [...camposMaeFormatados, ...camposComValores];
        }
      }
    }
  }

  return json(camposComValores);
}

export async function onRequestPut(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);

  const chamado = await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", context.params.id);
  if (!chamado) return error("Chamado não encontrado", 404);

  const ehSolicitante = usuario.id === chamado.solicitante_id;
  const ehAdmin = usuario.admin === 1;

  // No chamado mãe, apenas o solicitante e administradores podem editar
  if (chamado.chamado_mae_id == null && !ehSolicitante && !ehAdmin) {
    return error("Apenas o solicitante e administradores podem editar os dados do chamado mãe.", 403);
  }

  const body = await context.request.json();
  const valores = body.valores || body; // aceita { valores: { ... } } ou { campoId: valor }

  await salvarValoresCamposChamado(context.env.DB, chamado.id, valores, chamado.etapa_id);

  const raizId = chamado.chamado_mae_id || chamado.id;
  await registrarAuditoria(context.env.DB, {
    chamado_mae_id: raizId,
    chamado_id: chamado.id,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    acao: "edicao_campos",
    detalhes: "Atualizou campos personalizados do chamado"
  });

  const atualizados = await carregarCamposEValoresDoChamado(context.env.DB, chamado.id, chamado.etapa_id);
  return json(atualizados);
}
