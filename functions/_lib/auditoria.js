import { all, first, run } from "./db.js";

/**
 * Registra um evento de auditoria unificada no chamado mãe.
 */
export async function registrarAuditoria(db, { chamado_mae_id, chamado_id, usuario_id, usuario_nome, acao, detalhes }) {
  try {
    const raizId = chamado_mae_id || chamado_id;
    const agora = new Date().toISOString().replace("T", " ").slice(0, 19);
    await run(
      db,
      `INSERT INTO historico_auditoria
         (chamado_mae_id, chamado_id, usuario_id, usuario_nome, acao, detalhes, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      raizId,
      chamado_id,
      usuario_id ?? null,
      usuario_nome || "Sistema",
      acao,
      detalhes,
      agora
    );

    // Também registra centralizadamente na tabela auditoria_sistema para visualização no painel de Auditoria do Sistema
    await registrarAuditoriaSistema(db, {
      usuario_id: usuario_id ?? null,
      usuario_nome: usuario_nome || "Sistema",
      entidade: "chamados",
      entidade_id: chamado_id,
      acao: acao,
      detalhes: detalhes,
    });
  } catch (e) {
    console.error("Erro ao registrar auditoria:", e);
  }
}

/**
 * Lista todo o histórico de auditoria de um chamado mãe com nomes corretos de fluxo e etapas.
 */
export async function listarAuditoriaDoChamado(db, chamadoMaeId) {
  try {
    const chamadoMae = await first(
      db,
      `SELECT c.id, c.fluxo_template_id, ft.nome AS fluxo_nome,
              COALESCE(
                e.nome,
                (SELECT e2.nome FROM etapas e2 WHERE e2.fluxo_template_id = c.fluxo_template_id AND e2.eh_inicial = 1 LIMIT 1),
                'Solicitação Inicial'
              ) AS etapa_nome
       FROM chamados c
       LEFT JOIN fluxo_templates ft ON ft.id = c.fluxo_template_id
       LEFT JOIN etapas e ON e.id = c.etapa_id
       WHERE c.id = ?`,
      chamadoMaeId
    );

    const todosChamados = await all(
      db,
      `SELECT c.id, c.etapa_id, e.nome AS etapa_nome, a.rotulo AS acao_rotulo, c.titulo,
              (c.chamado_mae_id IS NULL OR c.chamado_mae_id = 0) AS eh_mae
       FROM chamados c
       LEFT JOIN etapas e ON e.id = c.etapa_id
       LEFT JOIN acoes a ON a.id = c.acao_origem_id
       WHERE c.id = ? OR c.chamado_mae_id = ?`,
      chamadoMaeId,
      chamadoMaeId
    );

    const mapa = new Map();
    for (const ch of todosChamados) {
      const nome = ch.etapa_nome || ch.acao_rotulo || ch.titulo || (ch.eh_mae ? (chamadoMae?.etapa_nome || "Solicitação Inicial") : `Etapa #${ch.id}`);
      mapa.set(ch.id, {
        etapaNome: nome,
        titulo: ch.titulo,
        ehMae: Boolean(ch.eh_mae),
      });
    }

    const registros = await all(
      db,
      `SELECT h.*, u.nome AS usuario_nome_cadastrado,
              c.etapa_id,
              COALESCE(
                e.nome,
                (SELECT e2.nome FROM etapas e2 WHERE e2.fluxo_template_id = c.fluxo_template_id AND (e2.eh_inicial = 1 OR e2.id = c.etapa_id) LIMIT 1),
                CASE WHEN c.chamado_mae_id IS NULL OR c.chamado_mae_id = 0 THEN 'Solicitação Inicial' ELSE ('Etapa #' || h.chamado_id) END
              ) AS etapa_nome,
              c.titulo AS chamado_titulo,
              (c.chamado_mae_id IS NULL OR c.chamado_mae_id = 0) AS eh_chamado_mae
       FROM historico_auditoria h
       LEFT JOIN usuarios u ON u.id = h.usuario_id
       LEFT JOIN chamados c ON c.id = h.chamado_id
       LEFT JOIN etapas e ON e.id = c.etapa_id
       WHERE h.chamado_mae_id = ?
       ORDER BY h.id ASC`,
      chamadoMaeId
    );

    const fluxoNome = chamadoMae?.fluxo_nome;

    return registros.map((r) => {
      let etapaNome = mapa.get(r.chamado_id)?.etapaNome || r.etapa_nome;
      let detalhes = r.detalhes || "";

      // Ajustar mensagens legadas ou padronizar nomes de etapas/fluxos:
      // 1. "Chamado mãe criado por ... com base no fluxo ..." ou "Chamado aberto por ... na etapa ..."
      if (detalhes.includes("com base no fluxo") || detalhes.startsWith("Chamado aberto por") || detalhes.startsWith("Chamado mãe criado por")) {
        const usuarioNome = r.usuario_nome || "Usuário";
        const nomeEtapaInicial = mapa.get(chamadoMaeId)?.etapaNome || "Solicitação Inicial";
        if (fluxoNome) {
          detalhes = `Chamado aberto por ${usuarioNome} no fluxo "${fluxoNome}" (Etapa: "${nomeEtapaInicial}").`;
        } else {
          detalhes = `Chamado aberto por ${usuarioNome} na etapa "${nomeEtapaInicial}".`;
        }
      }

      // 2. "Etapa #X APROVADA/REPROVADA por Y"
      const matchDecisao = detalhes.match(/Etapa #(\d+)\s+(APROVADA|REPROVADA)\s+por\s+([^.]+?)(?:\.\s*Justificativa:\s*(.*)|\.|$)/i);
      if (matchDecisao) {
        const idEtapa = Number(matchDecisao[1]);
        const acao = matchDecisao[2].toUpperCase();
        const responsavel = matchDecisao[3].trim();
        const justificativa = matchDecisao[4] ? `. Justificativa: ${matchDecisao[4].trim()}` : ".";
        const nome = mapa.get(idEtapa)?.etapaNome || `Etapa #${idEtapa}`;
        detalhes = `Etapa "${nome}" ${acao} por ${responsavel}${justificativa}`;
      }

      // 3. "Subchamado #X gerado pela aprovação da etapa #Y"
      const matchAprovacaoSub = detalhes.match(/Subchamado #(\d+)\s+gerado pela aprovação da etapa #(\d+)/i);
      if (matchAprovacaoSub) {
        const idFilho = Number(matchAprovacaoSub[1]);
        const idOrigem = Number(matchAprovacaoSub[2]);
        const nomeFilho = mapa.get(idFilho)?.etapaNome || `Etapa #${idFilho}`;
        const nomeOrigem = mapa.get(idOrigem)?.etapaNome || `Etapa #${idOrigem}`;
        detalhes = `Etapa "${nomeFilho}" iniciada pela aprovação da etapa "${nomeOrigem}".`;
      }

      // 4. "Subchamado #X gerado automaticamente pelo fluxo"
      const matchAutoSub = detalhes.match(/Subchamado #(\d+)\s+gerado automaticamente pelo fluxo/i);
      if (matchAutoSub) {
        const idFilho = Number(matchAutoSub[1]);
        const nomeFilho = mapa.get(idFilho)?.etapaNome || `Etapa #${idFilho}`;
        detalhes = `Etapa "${nomeFilho}" iniciada automaticamente pelo fluxo.`;
      }

      // 5. Remover "(Chamado #X)" se presente no texto para manter a leitura limpa e descritiva
      detalhes = detalhes.replace(/\s*\(Chamado #\d+\)/g, "");

      return {
        ...r,
        etapa_nome: etapaNome,
        detalhes,
      };
    });
  } catch (e) {
    return [];
  }
}

let tabelaAuditoriaSistemaGarantida = false;

export async function ensureAuditoriaSistemaTabela(db) {
  if (tabelaAuditoriaSistemaGarantida) return;
  try {
    await run(
      db,
      `CREATE TABLE IF NOT EXISTS auditoria_sistema (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        usuario_nome TEXT NOT NULL,
        entidade TEXT NOT NULL,
        entidade_id INTEGER,
        acao TEXT NOT NULL,
        detalhes TEXT,
        dados_antigos TEXT,
        dados_novos TEXT,
        criado_em TEXT NOT NULL
      )`
    );
  } catch (_) {}
  tabelaAuditoriaSistemaGarantida = true;
}

/**
 * Registra uma acao administrativa no log de auditoria do sistema.
 */
export async function registrarAuditoriaSistema(
  db,
  { usuario_id, usuario_nome, entidade, entidade_id, acao, detalhes, dados_antigos, dados_novos }
) {
  try {
    await ensureAuditoriaSistemaTabela(db);
    const agora = new Date().toISOString().replace("T", " ").slice(0, 19);
    await run(
      db,
      `INSERT INTO auditoria_sistema
         (usuario_id, usuario_nome, entidade, entidade_id, acao, detalhes, dados_antigos, dados_novos, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      usuario_id ?? null,
      usuario_nome || "Sistema",
      entidade,
      entidade_id ?? null,
      acao,
      detalhes ?? null,
      typeof dados_antigos === "object" ? JSON.stringify(dados_antigos) : dados_antigos ?? null,
      typeof dados_novos === "object" ? JSON.stringify(dados_novos) : dados_novos ?? null,
      agora
    );
  } catch (e) {
    console.error("Erro ao registrar auditoria do sistema:", e);
  }
}

/**
 * Lista registros de auditoria administrativa com filtros opcionais e paginacao.
 */
export async function listarAuditoriaSistema(
  db,
  { entidade, usuario_id, acao, limite = 100, offset = 0 } = {}
) {
  try {
    await ensureAuditoriaSistemaTabela(db);
    const condicoes = [];
    const params = [];

    if (entidade) {
      condicoes.push("entidade = ?");
      params.push(entidade);
    }
    if (usuario_id) {
      condicoes.push("usuario_id = ?");
      params.push(usuario_id);
    }
    if (acao) {
      condicoes.push("acao = ?");
      params.push(acao);
    }

    const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
    const sql = `SELECT * FROM auditoria_sistema ${where} ORDER BY id DESC LIMIT ? OFFSET ?`;
    return await all(db, sql, ...params, Number(limite) || 100, Number(offset) || 0);
  } catch (e) {
    console.error("Erro ao listar auditoria do sistema:", e);
    return [];
  }
}

/**
 * Retorna o total de registros de auditoria administrativa que atendem aos filtros.
 */
export async function contarAuditoriaSistema(
  db,
  { entidade, usuario_id, acao } = {}
) {
  try {
    await ensureAuditoriaSistemaTabela(db);
    const condicoes = [];
    const params = [];

    if (entidade) {
      condicoes.push("entidade = ?");
      params.push(entidade);
    }
    if (usuario_id) {
      condicoes.push("usuario_id = ?");
      params.push(usuario_id);
    }
    if (acao) {
      condicoes.push("acao = ?");
      params.push(acao);
    }

    const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
    const res = await first(db, `SELECT COUNT(*) AS total FROM auditoria_sistema ${where}`, ...params);
    return Number(res?.total) || 0;
  } catch (e) {
    console.error("Erro ao contar auditoria do sistema:", e);
    return 0;
  }
}

/**
 * Exclui logs de auditoria administrativa para economizar espaço em disco/D1.
 */
export async function excluirLogsAuditoria(db, { dias, dataLimite, tudo = false } = {}) {
  try {
    await ensureAuditoriaSistemaTabela(db);
    let sql = "DELETE FROM auditoria_sistema";
    const params = [];
    if (!tudo) {
      if (dias && Number(dias) > 0) {
        sql += " WHERE criado_em < datetime('now', '-' || ? || ' days')";
        params.push(Math.floor(Number(dias)));
      } else if (dataLimite) {
        sql += " WHERE substr(criado_em, 1, 10) < ?";
        params.push(dataLimite);
      }
    }
    const res = await run(db, sql, ...params);
    let removidos = res?.meta?.changes ?? 0;

    // Se solicitado excluir tudo ou por período, expurga também o histórico de auditoria de chamados
    if (tudo) {
      const resHist = await run(db, "DELETE FROM historico_auditoria").catch(() => ({ meta: { changes: 0 } }));
      removidos += (resHist?.meta?.changes ?? 0);
      await run(db, "DELETE FROM sqlite_sequence WHERE name IN ('auditoria_sistema', 'historico_auditoria')").catch(() => {});
    } else if (dias && Number(dias) > 0) {
      const resHist = await run(db, "DELETE FROM historico_auditoria WHERE criado_em < datetime('now', '-' || ? || ' days')", Math.floor(Number(dias))).catch(() => ({ meta: { changes: 0 } }));
      removidos += (resHist?.meta?.changes ?? 0);
    } else if (dataLimite) {
      const resHist = await run(db, "DELETE FROM historico_auditoria WHERE substr(criado_em, 1, 10) < ?", dataLimite).catch(() => ({ meta: { changes: 0 } }));
      removidos += (resHist?.meta?.changes ?? 0);
    }

    return removidos;
  } catch (e) {
    console.error("Erro ao excluir logs de auditoria do sistema:", e);
    return 0;
  }
}

