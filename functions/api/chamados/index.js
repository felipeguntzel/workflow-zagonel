import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { carregarEtapaComAcoes } from "../../_lib/etapas.js";
import { criarChamado, avancarFluxo, hojeISO, garantirColunasChamados } from "../../_lib/chamados.js";
import { exigirPermissao } from "../../_lib/permissoes.js";
import { salvarValoresCamposChamado, listarCamposDaEtapa, validarCamposObrigatorios, garantirTabelaValores } from "../../_lib/campos.js";
import { registrarAuditoria } from "../../_lib/auditoria.js";

export async function onRequestGet(context) {
  const { usuario, permissoes, erro } = await exigirPermissao(context, "chamados", "visualizar");
  if (erro) return erro;

  await garantirColunasChamados(context.env.DB);

  const verTodos = usuario.admin === 1 || permissoes.chamados.ver_todos_setores;
  const condicaoSetor = verTodos ? "1 = 1" : "COALESCE(e.setor_id, a.setor_destino_id) = ?";
  const parametros = verTodos ? [] : [usuario.setor_id];

  const chamados = await all(
    context.env.DB,
    `SELECT
       c.*,
       COALESCE(e.setor_id, a.setor_destino_id) AS setor_id,
       COALESCE(
         (SELECT s2.nome
          FROM chamados c2
          LEFT JOIN etapas e2 ON e2.id = c2.etapa_id
          LEFT JOIN acoes a2 ON a2.id = c2.acao_origem_id
          LEFT JOIN setores s2 ON s2.id = COALESCE(e2.setor_id, a2.setor_destino_id)
          WHERE c2.chamado_mae_id = c.id AND c2.data_finalizacao IS NULL
          ORDER BY c2.id DESC LIMIT 1),
         s.nome,
         '-'
       ) AS setor_nome,
       COALESCE(c.titulo, e.nome, a.rotulo) AS titulo,
       COALESCE(
         (SELECT COALESCE(e2.nome, a2.rotulo)
          FROM chamados c2
          LEFT JOIN etapas e2 ON e2.id = c2.etapa_id
          LEFT JOIN acoes a2 ON a2.id = c2.acao_origem_id
          WHERE c2.chamado_mae_id = c.id AND c2.data_finalizacao IS NULL
          ORDER BY c2.id DESC LIMIT 1),
         (SELECT COALESCE(e2.nome, a2.rotulo)
          FROM chamados c2
          LEFT JOIN etapas e2 ON e2.id = c2.etapa_id
          LEFT JOIN acoes a2 ON a2.id = c2.acao_origem_id
          WHERE c2.chamado_mae_id = c.id
          ORDER BY c2.id DESC LIMIT 1),
         e.nome,
         a.rotulo,
         '-'
       ) AS etapa_atual,
       st.nome AS status_nome,
       st.cor AS status_cor,
       resp.nome AS responsavel_nome,
       sol.nome AS solicitante_nome,
       emp.nome AS empresa_nome
     FROM chamados c
     LEFT JOIN etapas e ON e.id = c.etapa_id
     LEFT JOIN acoes a ON a.id = c.acao_origem_id
     LEFT JOIN setores s ON s.id = COALESCE(e.setor_id, a.setor_destino_id)
     LEFT JOIN status st ON st.id = c.status_id
     LEFT JOIN usuarios resp ON resp.id = c.responsavel_id
     LEFT JOIN usuarios sol ON sol.id = c.solicitante_id
     LEFT JOIN empresas emp ON emp.id = c.empresa_id
     WHERE ${condicaoSetor}
     ORDER BY c.prazo`,
    ...parametros
  );
  return json(chamados);
}

export async function onRequestPost(context) {
  try {
    const { usuario, erro } = await exigirPermissao(context, "chamados", "inserir");
    if (erro) return erro;

    await garantirColunasChamados(context.env.DB);
    await garantirTabelaValores(context.env.DB);

    const body = await context.request.json();
    if (!body.fluxo_template_id || !body.etapa_inicial_id) {
      return error("Campos obrigatórios: fluxo_template_id, etapa_inicial_id", 400);
    }
    const etapa = await carregarEtapaComAcoes(context.env.DB, body.etapa_inicial_id);
    if (!etapa || Number(etapa.fluxo_template_id) !== Number(body.fluxo_template_id)) {
      return error("etapa_inicial_id inválido para este fluxo_template_id", 400);
    }

    const solicitante = await first(
      context.env.DB,
      "SELECT u.id, u.setor_id, s.empresa_id FROM usuarios u LEFT JOIN setores s ON s.id = u.setor_id WHERE u.id = ?",
      usuario.id
    );

    const titulo = body.titulo ? String(body.titulo).trim() : "";
    if (!titulo) {
      return error("O campo Título é obrigatório.", 400);
    }

    // Se a empresa não foi especificada, usa a empresa do setor do solicitante ou a primeira empresa ativa cadastrada
    let empresaId = body.empresa_id ? Number(body.empresa_id) : (solicitante?.empresa_id || null);
    if (!empresaId) {
      const primeiraEmpresa = await first(context.env.DB, "SELECT id FROM empresas ORDER BY id ASC LIMIT 1");
      empresaId = primeiraEmpresa?.id || 1;
    }

    const prioridade = body.prioridade ? String(body.prioridade).trim().toLowerCase() : "normal";
    const observacao = body.observacao ? String(body.observacao).trim() : null;

    // Validação de campos personalizados obrigatórios e regras de formato
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
      "UPDATE chamados SET status_id = (SELECT id FROM status WHERE LOWER(nome) = 'finalizado' LIMIT 1), data_finalizacao = ? WHERE id = ?",
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
  } catch (err) {
    console.error("[POST /api/chamados] Falha:", err);
    return error(err.message || "Erro ao processar criação de chamado.", 500);
  }
}
