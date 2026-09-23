import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { carregarEtapaComAcoes } from "../../_lib/etapas.js";
import { criarChamado, avancarFluxo, hojeISO } from "../../_lib/chamados.js";
import { exigirPermissao } from "../../_lib/permissoes.js";
import { salvarValoresCamposChamado, listarCamposDaEtapa, validarCamposObrigatorios } from "../../_lib/campos.js";
import { registrarAuditoria } from "../../_lib/auditoria.js";

export async function onRequestGet(context) {
  const { usuario, permissoes, erro } = await exigirPermissao(context, "chamados", "visualizar");
  if (erro) return erro;

  const verTodos = usuario.admin === 1 || permissoes.chamados.ver_todos_setores;
  const condicaoSetor = verTodos ? "1 = 1" : "COALESCE(e.setor_id, a.setor_destino_id) = ?";
  const parametros = verTodos ? [] : [usuario.setor_id];

  const chamados = await all(
    context.env.DB,
    `SELECT
       c.*,
       COALESCE(e.setor_id, a.setor_destino_id) AS setor_id,
       COALESCE(c.titulo, e.nome, a.rotulo) AS titulo,
       st.nome AS status_nome,
       resp.nome AS responsavel_nome,
       emp.nome AS empresa_nome
     FROM chamados c
     LEFT JOIN etapas e ON e.id = c.etapa_id
     LEFT JOIN acoes a ON a.id = c.acao_origem_id
     LEFT JOIN status st ON st.id = c.status_id
     LEFT JOIN usuarios resp ON resp.id = c.responsavel_id
     LEFT JOIN empresas emp ON emp.id = c.empresa_id
     WHERE ${condicaoSetor}
     ORDER BY c.prazo`,
    ...parametros
  );
  return json(chamados);
}

export async function onRequestPost(context) {
  const { usuario, erro } = await exigirPermissao(context, "chamados", "inserir");
  if (erro) return erro;
  const body = await context.request.json();
  if (!body.fluxo_template_id || !body.etapa_inicial_id) {
    return error("Campos obrigatórios: fluxo_template_id, etapa_inicial_id");
  }
  const etapa = await carregarEtapaComAcoes(context.env.DB, body.etapa_inicial_id);
  if (!etapa || !etapa.eh_inicial || Number(etapa.fluxo_template_id) !== Number(body.fluxo_template_id)) {
    return error("etapa_inicial_id inválido para este fluxo_template_id");
  }
  const solicitante = await first(
    context.env.DB,
    "SELECT u.id, s.empresa_id FROM usuarios u JOIN setores s ON s.id = u.setor_id WHERE u.id = ?",
    usuario.id
  );
  if (!solicitante) return error("solicitante inválido");

  const titulo = body.titulo ? String(body.titulo).trim() : "";
  if (!titulo) {
    return error("O campo Título é obrigatório.", 400);
  }

  const empresaId = body.empresa_id ? Number(body.empresa_id) : solicitante.empresa_id;
  const prioridade = body.prioridade ? String(body.prioridade).trim().toLowerCase() : "normal";
  const observacao = body.observacao ? String(body.observacao).trim() : null;

  // Validação de campos personalizados obrigatórios
  const camposDef = await listarCamposDaEtapa(context.env.DB, etapa.id);
  const validacao = validarCamposObrigatorios(camposDef, body.campos || {});
  if (!validacao.valido) {
    return error(validacao.erro, 400);
  }

  const mae = await criarChamado(context.env.DB, {
    fluxo_template_id: body.fluxo_template_id,
    etapa_id: etapa.id,
    chamado_mae_id: null,
    chamado_pai_id: null,
    empresa_id: empresaId,
    solicitante_id: usuario.id,
    prazo: body.prazo ?? null,
    titulo: titulo,
    prioridade: prioridade,
    observacao: observacao,
  });

  // Salva campos personalizados se enviados
  if (body.campos && typeof body.campos === "object") {
    await salvarValoresCamposChamado(context.env.DB, mae.id, body.campos, etapa.id);
  }

  // Registrar auditoria de criação do chamado mãe
  await registrarAuditoria(context.env.DB, {
    chamado_mae_id: mae.id,
    chamado_id: mae.id,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    acao: "criacao",
    detalhes: `Chamado mãe criado por ${usuario.nome} com base no fluxo "${etapa.nome}".`
  });

  const hoje = hojeISO();
  await run(
    context.env.DB,
    "UPDATE chamados SET status_id = (SELECT id FROM status WHERE nome = 'finalizado'), data_finalizacao = ? WHERE id = ?",
    hoje,
    mae.id
  );
  const maeFinalizada = { ...mae, data_finalizacao: hoje };

  const criados = await avancarFluxo(context.env.DB, maeFinalizada, etapa, {});

  // Registrar auditoria para as etapas filhas criadas
  for (const filho of criados) {
    await registrarAuditoria(context.env.DB, {
      chamado_mae_id: mae.id,
      chamado_id: filho.id,
      usuario_id: null,
      usuario_nome: "Sistema",
      acao: "criacao_subchamado",
      detalhes: `Subchamado #${filho.id} gerado automaticamente pelo fluxo.`
    });
  }

  return json({ chamado: maeFinalizada, criados }, 201);
}
