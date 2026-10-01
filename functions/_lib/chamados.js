import { all, first, run } from "./db.js";
import {
  calcularPrazoSugerido,
  calcularDiasAtraso,
  empurrarPrazo,
  situacaoPrazo,
} from "./prazos.js";
import { resolverProximosChamados, estaBloqueado } from "./fluxo.js";

export function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

const cacheStatusId = new Map();
let cacheStatusCarregado = false;

export async function carregarCacheStatus(db) {
  if (cacheStatusCarregado && cacheStatusId.size > 0) return;
  try {
    const todos = await all(db, "SELECT id, nome FROM status");
    if (Array.isArray(todos)) {
      for (const s of todos) {
        if (s.nome) {
          cacheStatusId.set(String(s.nome).toLowerCase(), s.id);
        }
      }
      if (cacheStatusId.has("cancelado") && !cacheStatusId.has("cancelada")) {
        cacheStatusId.set("cancelada", cacheStatusId.get("cancelado"));
      }
      cacheStatusCarregado = true;
    }
  } catch (_) {}
}

export async function statusIdPorNome(db, nome) {
  const chave = String(nome).toLowerCase();
  if (cacheStatusId.has(chave)) return cacheStatusId.get(chave);
  await carregarCacheStatus(db);
  if (cacheStatusId.has(chave)) return cacheStatusId.get(chave);

  let row = await first(db, "SELECT id FROM status WHERE LOWER(nome) = LOWER(?)", nome);
  if (!row && (chave === "cancelado" || chave === "cancelada")) {
    row = await first(db, "SELECT id FROM status WHERE LOWER(nome) IN ('cancelado', 'cancelada') LIMIT 1");
  }
  if (row) {
    cacheStatusId.set(chave, row.id);
    return row.id;
  }
  if (chave === "cancelado" || chave === "cancelada") {
    const maxRow = await first(db, "SELECT MAX(id) AS max_id FROM status").catch(() => null);
    const novoId = ((maxRow && maxRow.max_id) ? maxRow.max_id : 6) + 1;
    await run(db, "INSERT INTO status (id, nome, cor) VALUES (?, 'cancelado', '#dc2626')", novoId).catch(() => {});
    cacheStatusId.set(chave, novoId);
    return novoId;
  }
  const fallback = await first(db, "SELECT id FROM status ORDER BY id ASC LIMIT 1");
  if (fallback) {
    cacheStatusId.set(chave, fallback.id);
    return fallback.id;
  }
  throw new Error(`Status não encontrado no sistema: ${nome}`);
}

async function resolverSetorEPrazoPadrao(db, { etapa_id, acao_origem_id }) {
  if (etapa_id) {
    const row = await first(
      db,
      `SELECT s.id AS setor_id, s.prazo_padrao_dias
       FROM etapas e LEFT JOIN setores s ON s.id = e.setor_id
       WHERE e.id = ?`,
      etapa_id
    );
    if (!row) {
      return { setor_id: null, prazo_padrao_dias: 5 };
    }
    return {
      setor_id: row.setor_id || null,
      prazo_padrao_dias: row.prazo_padrao_dias != null ? Number(row.prazo_padrao_dias) : 5,
    };
  }
  if (acao_origem_id) {
    const row = await first(
      db,
      `SELECT s.id AS setor_id, s.prazo_padrao_dias
       FROM acoes a LEFT JOIN setores s ON s.id = a.setor_destino_id
       WHERE a.id = ?`,
      acao_origem_id
    );
    if (!row) {
      return { setor_id: null, prazo_padrao_dias: 5 };
    }
    return {
      setor_id: row.setor_id || null,
      prazo_padrao_dias: row.prazo_padrao_dias != null ? Number(row.prazo_padrao_dias) : 5,
    };
  }
  return { setor_id: null, prazo_padrao_dias: 5 };
}

let colunasChamadosGarantidas = false;
export async function garantirColunasChamados(db) {
  if (colunasChamadosGarantidas) return;


  try {
    await repararFksOrfasChamados(db);
    const cols = await all(db, "PRAGMA table_info(chamados)");
    const nomes = new Set(cols.map((c) => c.name.toLowerCase()));
    if (!nomes.has("titulo")) {
      await run(db, "ALTER TABLE chamados ADD COLUMN titulo TEXT").catch(() => {});
    }
    if (!nomes.has("prioridade")) {
      await run(db, "ALTER TABLE chamados ADD COLUMN prioridade TEXT NOT NULL DEFAULT 'normal'").catch(() => {});
    }
    if (!nomes.has("observacao")) {
      await run(db, "ALTER TABLE chamados ADD COLUMN observacao TEXT").catch(() => {});
    }
    if (!nomes.has("empresa_id")) {
      await run(db, "ALTER TABLE chamados ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)").catch(() => {});
    }

    // Garante que chamados possam ter etapa_id e acao_origem_id juntos (removendo restrição restritiva antiga se existir)
    const tblChamados = await first(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='chamados'").catch(() => null);
    if (tblChamados?.sql && tblChamados.sql.includes("!= (acao_origem_id IS NOT NULL)")) {
      try {
        await run(db, "PRAGMA foreign_keys = OFF").catch(() => {});
        await run(db, "PRAGMA defer_foreign_keys = ON").catch(() => {});
        await run(db, "ALTER TABLE chamados RENAME TO _chamados_old");
        await run(db, `CREATE TABLE chamados (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          fluxo_template_id INTEGER NOT NULL REFERENCES fluxo_templates(id),
          etapa_id INTEGER REFERENCES etapas(id),
          acao_origem_id INTEGER REFERENCES acoes(id),
          chamado_mae_id INTEGER REFERENCES chamados(id),
          chamado_pai_id INTEGER REFERENCES chamados(id),
          empresa_id INTEGER NOT NULL REFERENCES empresas(id),
          status_id INTEGER NOT NULL REFERENCES status(id),
          resultado TEXT CHECK (resultado IN ('aprovado','reprovado')),
          solicitante_id INTEGER NOT NULL REFERENCES usuarios(id),
          responsavel_id INTEGER REFERENCES usuarios(id),
          data_abertura TEXT NOT NULL,
          prazo TEXT NOT NULL,
          data_finalizacao TEXT,
          titulo TEXT,
          prioridade TEXT NOT NULL DEFAULT 'normal',
          observacao TEXT,
          CHECK (etapa_id IS NOT NULL OR acao_origem_id IS NOT NULL)
        )`);
        const oldCols = await all(db, "PRAGMA table_info(_chamados_old)").catch(() => []);
        const oldNomes = new Set(oldCols.map((c) => c.name.toLowerCase()));
        const colTitulo = oldNomes.has("titulo") ? "titulo" : "NULL";
        const colPrioridade = oldNomes.has("prioridade") ? "prioridade" : "'normal'";
        const colObservacao = oldNomes.has("observacao") ? "observacao" : "NULL";
        await run(db, `INSERT INTO chamados (id, fluxo_template_id, etapa_id, acao_origem_id, chamado_mae_id, chamado_pai_id, empresa_id, status_id, resultado, solicitante_id, responsavel_id, data_abertura, prazo, data_finalizacao, titulo, prioridade, observacao)
          SELECT id, fluxo_template_id, etapa_id, acao_origem_id, chamado_mae_id, chamado_pai_id, empresa_id, status_id, resultado, solicitante_id, responsavel_id, data_abertura, prazo, data_finalizacao,
                 ${colTitulo}, ${colPrioridade}, ${colObservacao}
          FROM _chamados_old`);
        await run(db, "DROP TABLE _chamados_old");
        await run(db, "PRAGMA foreign_keys = ON").catch(() => {});
      } catch (errMigracao) {
        console.error("Aviso ao atualizar CHECK de chamados:", errMigracao);
      }
    }

    await repararFksOrfasChamados(db);

    const statusCols = await all(db, "PRAGMA table_info(status)").catch(() => []);
    const statusNomes = new Set(statusCols.map((c) => c.name.toLowerCase()));
    if (!statusNomes.has("cor")) {
      await run(db, "ALTER TABLE status ADD COLUMN cor TEXT").catch(() => {});
    }

    const statusCancelado = await first(db, "SELECT id FROM status WHERE LOWER(nome) IN ('cancelado', 'cancelada')").catch(() => null);
    if (!statusCancelado) {
      const maxRow = await first(db, "SELECT MAX(id) AS max_id FROM status").catch(() => null);
      const novoId = ((maxRow && maxRow.max_id) ? maxRow.max_id : 6) + 1;
      await run(db, "INSERT INTO status (id, nome, cor) VALUES (?, 'cancelado', '#dc2626')", novoId).catch(() => {});
    }

    const fluxoCols = await all(db, "PRAGMA table_info(fluxo_templates)").catch(() => []);
    const fluxoNomes = new Set(fluxoCols.map((c) => c.name.toLowerCase()));
    if (!fluxoNomes.has("descricao")) {
      await run(db, "ALTER TABLE fluxo_templates ADD COLUMN descricao TEXT").catch(() => {});
    }
    if (!fluxoNomes.has("ativo")) {
      await run(db, "ALTER TABLE fluxo_templates ADD COLUMN ativo INTEGER DEFAULT 1").catch(() => {});
      await run(db, "UPDATE fluxo_templates SET ativo = 1 WHERE ativo IS NULL").catch(() => {});
    }

    // Índices de alta performance
    await run(db, "CREATE INDEX IF NOT EXISTS idx_chamados_mae_fin_id ON chamados(chamado_mae_id, data_finalizacao, id DESC)").catch(() => {});
    await run(db, "CREATE INDEX IF NOT EXISTS idx_chamados_status_id ON chamados(status_id)").catch(() => {});
    await run(db, "CREATE INDEX IF NOT EXISTS idx_chamados_responsavel_id ON chamados(responsavel_id)").catch(() => {});
    await run(db, "CREATE INDEX IF NOT EXISTS idx_chamados_solicitante_id ON chamados(solicitante_id)").catch(() => {});
    await run(db, "CREATE INDEX IF NOT EXISTS idx_chamados_etapa_id ON chamados(etapa_id)").catch(() => {});
    await run(db, "CREATE INDEX IF NOT EXISTS idx_chamados_empresa_id ON chamados(empresa_id)").catch(() => {});
    await run(db, "CREATE INDEX IF NOT EXISTS idx_chamados_prazo ON chamados(prazo)").catch(() => {});
    await run(db, "CREATE INDEX IF NOT EXISTS idx_etapas_template ON etapas(fluxo_template_id)").catch(() => {});
    await run(db, "CREATE INDEX IF NOT EXISTS idx_apontamentos_chamado_data ON apontamentos_horas(chamado_id, data)").catch(() => {});

    colunasChamadosGarantidas = true;
  } catch (err) {
    console.error("Aviso ao garantir colunas de chamados:", err);
  }
}

let fksOrfasReparadas = false;
export async function repararFksOrfasChamados(db) {
  if (fksOrfasReparadas) return;
  try {
    const tabelasComFkQuebrada = await all(
      db,
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND (sql LIKE '%_chamados_old%' OR sql LIKE '%_chamados_antigo%')"
    ).catch(() => []);

    if (!tabelasComFkQuebrada || tabelasComFkQuebrada.length === 0) {
      fksOrfasReparadas = true;
      return;
    }

    await run(db, "PRAGMA foreign_keys = OFF").catch(() => {});

    for (const tbl of tabelasComFkQuebrada) {
      const nome = tbl.name;
      if (nome === "comentarios") {
        await run(db, `CREATE TABLE IF NOT EXISTS _comentarios_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chamado_id INTEGER NOT NULL REFERENCES chamados(id),
          usuario_id INTEGER REFERENCES usuarios(id),
          data TEXT NOT NULL,
          texto TEXT NOT NULL,
          eh_justificativa INTEGER NOT NULL DEFAULT 0,
          eh_privado INTEGER NOT NULL DEFAULT 0
        )`).catch(() => {});
        await run(db, "INSERT INTO _comentarios_new (id, chamado_id, usuario_id, data, texto, eh_justificativa, eh_privado) SELECT id, chamado_id, usuario_id, data, texto, COALESCE(eh_justificativa, 0), COALESCE(eh_privado, 0) FROM comentarios").catch(() => {});
        await run(db, "DROP TABLE comentarios").catch(() => {});
        await run(db, "ALTER TABLE _comentarios_new RENAME TO comentarios").catch(() => {});
        await run(db, "CREATE INDEX IF NOT EXISTS idx_comentarios_chamado ON comentarios(chamado_id)").catch(() => {});
      } else if (nome === "apontamentos_horas") {
        await run(db, `CREATE TABLE IF NOT EXISTS _apontamentos_horas_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chamado_id INTEGER NOT NULL REFERENCES chamados(id),
          usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
          data TEXT NOT NULL,
          horas REAL NOT NULL,
          observacao TEXT
        )`).catch(() => {});
        await run(db, "INSERT INTO _apontamentos_horas_new (id, chamado_id, usuario_id, data, horas, observacao) SELECT id, chamado_id, usuario_id, data, horas, observacao FROM apontamentos_horas").catch(() => {});
        await run(db, "DROP TABLE apontamentos_horas").catch(() => {});
        await run(db, "ALTER TABLE _apontamentos_horas_new RENAME TO apontamentos_horas").catch(() => {});
        await run(db, "CREATE INDEX IF NOT EXISTS idx_apontamentos_chamado_data ON apontamentos_horas(chamado_id, data)").catch(() => {});
      } else if (nome === "chamado_campos_valores") {
        await run(db, "DROP TABLE IF EXISTS _chamado_campos_valores_new").catch(() => {});
        await run(db, `CREATE TABLE _chamado_campos_valores_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chamado_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
          campo_id INTEGER NOT NULL,
          valor TEXT,
          UNIQUE(chamado_id, campo_id)
        )`).catch(() => {});
        const colsVal = await all(db, "PRAGMA table_info(chamado_campos_valores)").catch(() => []);
        const nomesVal = new Set(colsVal.map((c) => c.name.toLowerCase()));
        const colCampo = nomesVal.has("campo_id")
          ? "campo_id"
          : nomesVal.has("etapa_campo_id")
          ? "etapa_campo_id"
          : nomesVal.has("campo_etapa_id")
          ? "campo_etapa_id"
          : "NULL";
        await run(
          db,
          `INSERT OR REPLACE INTO _chamado_campos_valores_new (id, chamado_id, campo_id, valor)
           SELECT id, chamado_id, ${colCampo}, valor FROM chamado_campos_valores WHERE ${colCampo} IS NOT NULL`
        ).catch(() => {});
        await run(db, "DROP TABLE chamado_campos_valores").catch(() => {});
        await run(db, "ALTER TABLE _chamado_campos_valores_new RENAME TO chamado_campos_valores").catch(() => {});
        await run(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_chamado_campos_valores_chamado_campo ON chamado_campos_valores(chamado_id, campo_id)").catch(() => {});
        await run(db, "CREATE INDEX IF NOT EXISTS idx_chamado_campos_chamado ON chamado_campos_valores(chamado_id)").catch(() => {});
      } else if (nome === "chamado_anexos") {
        await run(db, `CREATE TABLE IF NOT EXISTS _chamado_anexos_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chamado_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
          usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
          nome_arquivo TEXT NOT NULL,
          tipo_mime TEXT NOT NULL,
          tamanho_bytes INTEGER NOT NULL,
          conteudo_base64 TEXT NOT NULL,
          eh_privado INTEGER NOT NULL DEFAULT 0,
          criado_em TEXT NOT NULL
        )`).catch(() => {});
        await run(db, "INSERT INTO _chamado_anexos_new (id, chamado_id, usuario_id, nome_arquivo, tipo_mime, tamanho_bytes, conteudo_base64, eh_privado, criado_em) SELECT id, chamado_id, usuario_id, nome_arquivo, tipo_mime, tamanho_bytes, conteudo_base64, COALESCE(eh_privado, 0), criado_em FROM chamado_anexos").catch(() => {});
        await run(db, "DROP TABLE chamado_anexos").catch(() => {});
        await run(db, "ALTER TABLE _chamado_anexos_new RENAME TO chamado_anexos").catch(() => {});
        await run(db, "CREATE INDEX IF NOT EXISTS idx_chamado_anexos_chamado ON chamado_anexos(chamado_id)").catch(() => {});
      } else if (nome === "historico_auditoria") {
        await run(db, `CREATE TABLE IF NOT EXISTS _historico_auditoria_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chamado_mae_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
          chamado_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
          usuario_id INTEGER REFERENCES usuarios(id),
          usuario_nome TEXT NOT NULL,
          acao TEXT NOT NULL,
          detalhes TEXT NOT NULL,
          criado_em TEXT NOT NULL
        )`).catch(() => {});
        await run(db, "INSERT INTO _historico_auditoria_new (id, chamado_mae_id, chamado_id, usuario_id, usuario_nome, acao, detalhes, criado_em) SELECT id, chamado_mae_id, chamado_id, usuario_id, usuario_nome, acao, detalhes, criado_em FROM historico_auditoria").catch(() => {});
        await run(db, "DROP TABLE historico_auditoria").catch(() => {});
        await run(db, "ALTER TABLE _historico_auditoria_new RENAME TO historico_auditoria").catch(() => {});
        await run(db, "CREATE INDEX IF NOT EXISTS idx_historico_chamado_mae ON historico_auditoria(chamado_mae_id)").catch(() => {});
      }
    }

    await run(db, "PRAGMA foreign_keys = ON").catch(() => {});
    fksOrfasReparadas = true;
  } catch (err) {
    console.error("Falha ao reparar FKs órfãs de chamados:", err);
  }
}

export async function criarChamado(db, spec) {
  const { prazo_padrao_dias } = await resolverSetorEPrazoPadrao(db, spec);

  const hoje = hojeISO();
  const prazo = spec.prazo ?? calcularPrazoSugerido(hoje, prazo_padrao_dias, { apenasDiasUteis: true });
  const statusPrevisto = await statusIdPorNome(db, "previsto");
  const titulo = spec.titulo ?? null;
  const prioridade = spec.prioridade ?? "normal";
  const observacao = spec.observacao ?? null;

  let resultado;
  try {
    resultado = await run(
      db,
      `INSERT INTO chamados
         (fluxo_template_id, etapa_id, acao_origem_id, chamado_mae_id, chamado_pai_id,
          empresa_id, status_id, solicitante_id, data_abertura, prazo, titulo, prioridade, observacao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      spec.fluxo_template_id,
      spec.etapa_id ?? null,
      spec.acao_origem_id ?? null,
      spec.chamado_mae_id ?? null,
      spec.chamado_pai_id ?? null,
      spec.empresa_id,
      statusPrevisto,
      spec.solicitante_id,
      hoje,
      prazo,
      titulo,
      prioridade,
      observacao
    );
  } catch (err) {
    // Se falhar devido a restrição CHECK legada (etapa_id != acao_origem_id) em banco ainda não migrado
    if (String(err?.message || "").includes("CHECK constraint failed") && spec.etapa_id && spec.acao_origem_id) {
      console.warn("Aviso: CHECK constraint legada detectada ao criar chamado. Inserindo com fallback prioritário de etapa_id.");
      resultado = await run(
        db,
        `INSERT INTO chamados
           (fluxo_template_id, etapa_id, acao_origem_id, chamado_mae_id, chamado_pai_id,
            empresa_id, status_id, solicitante_id, data_abertura, prazo, titulo, prioridade, observacao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        spec.fluxo_template_id,
        spec.etapa_id,
        null,
        spec.chamado_mae_id ?? null,
        spec.chamado_pai_id ?? null,
        spec.empresa_id,
        statusPrevisto,
        spec.solicitante_id,
        hoje,
        prazo,
        titulo,
        prioridade,
        observacao
      );
    } else {
      throw err;
    }
  }
  return first(db, "SELECT * FROM chamados WHERE id = ?", resultado.meta.last_row_id);
}

export async function avancarFluxo(db, chamado, etapa, decisoesAcoes = {}, observacoesAcoes = {}) {
  const especificacoes = resolverProximosChamados(
    etapa,
    { id: chamado.id, chamado_mae_id: chamado.chamado_mae_id },
    decisoesAcoes
  );
  const criados = [];
  for (const spec of especificacoes) {
    const acaoDef = etapa?.acoes?.find((a) => a.id === spec.acao_origem_id);
    const obsAcao = (observacoesAcoes && observacoesAcoes[spec.acao_origem_id]) ||
                    (typeof decisoesAcoes[spec.acao_origem_id] === "object" ? decisoesAcoes[spec.acao_origem_id]?.observacao : null) ||
                    acaoDef?.observacao ||
                    chamado.observacao;

    // Título dos subchamados: Nome da etapa + referência ao chamado original (ex: "Etapa tal - Ref Chamado 1")
    const idChamadoOriginal = spec.chamado_mae_id || chamado.chamado_mae_id || chamado.id;
    let nomeEtapa = null;
    if (spec.etapa_id) {
      const etapaDestino = await first(db, "SELECT nome FROM etapas WHERE id = ?", spec.etapa_id);
      nomeEtapa = etapaDestino?.nome;
    }
    if (!nomeEtapa && acaoDef?.rotulo) {
      nomeEtapa = acaoDef.rotulo;
    }
    const tituloBase = nomeEtapa || chamado.titulo || "Etapa";
    const tituloSubchamado = `${tituloBase} - Ref Chamado ${idChamadoOriginal}`;

    const criado = await criarChamado(db, {
      fluxo_template_id: chamado.fluxo_template_id,
      etapa_id: spec.etapa_id,
      acao_origem_id: spec.acao_origem_id,
      chamado_mae_id: spec.chamado_mae_id,
      chamado_pai_id: spec.chamado_pai_id,
      empresa_id: chamado.empresa_id,
      solicitante_id: chamado.solicitante_id,
      titulo: tituloSubchamado,
      prioridade: chamado.prioridade,
      observacao: obsAcao,
    });

    const textoObs = (observacoesAcoes && observacoesAcoes[spec.acao_origem_id]) ||
                     (typeof decisoesAcoes[spec.acao_origem_id] === "object" ? decisoesAcoes[spec.acao_origem_id]?.observacao : null) ||
                     acaoDef?.observacao;
    if (textoObs && String(textoObs).trim()) {
      const hoje = hojeISO();
      await run(
        db,
        `INSERT INTO comentarios (chamado_id, usuario_id, data, texto, eh_justificativa, eh_privado)
         VALUES (?, ?, ?, ?, 0, 0)`,
        criado.id,
        chamado.solicitante_id,
        hoje,
        `📌 Observação/Orientação da Ação:\n${String(textoObs).trim()}`
      ).catch(() => {});
    }

    criados.push(criado);
  }
  return criados;
}

export async function finalizarComCascata(db, chamadoId, { hoje, resultadoOrigem = null }) {
  const statusFinalizado = await statusIdPorNome(db, "finalizado");
  const statusCancelado = await statusIdPorNome(db, "cancelado").catch(() => statusFinalizado);
  let atual = await first(db, "SELECT * FROM chamados WHERE id = ?", chamadoId);
  let primeira = true;
  while (atual) {
    const resultado = primeira ? resultadoOrigem : atual.resultado;
    const ehReprovado = resultado === "reprovado" || resultadoOrigem === "reprovado";
    const statusAlvo = ehReprovado ? statusCancelado : statusFinalizado;
    await run(
      db,
      `UPDATE chamados
       SET status_id = ?, data_finalizacao = COALESCE(data_finalizacao, ?), resultado = ?
       WHERE id = ?`,
      statusAlvo,
      hoje,
      resultado,
      atual.id
    );
    if (atual.chamado_pai_id == null) break;
    atual = await first(db, "SELECT * FROM chamados WHERE id = ?", atual.chamado_pai_id);
    primeira = false;
  }
}

export async function aplicarCascataAtraso(db, chamado, hoje) {
  const diasAtraso = calcularDiasAtraso(chamado.prazo, hoje);
  if (diasAtraso <= 0) return;
  const raizId = chamado.chamado_mae_id ?? chamado.id;
  const statusPrevisto = await statusIdPorNome(db, "previsto");
  const dependentes = await all(
    db,
    `SELECT * FROM chamados
     WHERE status_id = ? AND id != ? AND (id = ? OR chamado_mae_id = ?)`,
    statusPrevisto,
    chamado.id,
    raizId,
    raizId
  );
  for (const dep of dependentes) {
    const novoPrazo = empurrarPrazo(dep.prazo, diasAtraso, { apenasDiasUteis: true });
    await run(db, "UPDATE chamados SET prazo = ? WHERE id = ?", novoPrazo, dep.id);
    await run(
      db,
      `INSERT INTO comentarios (chamado_id, usuario_id, data, texto, eh_justificativa)
       VALUES (?, NULL, ?, ?, 0)`,
      dep.id,
      hoje,
      `Prazo reajustado em dias úteis de ${dep.prazo} para ${novoPrazo} devido a atraso de ${diasAtraso} dia(s) no chamado #${chamado.id}.`
    );
  }
}

export async function computarBloqueado(db, chamado) {
  if (!chamado.acao_origem_id) return false;
  const acao = await first(db, "SELECT * FROM acoes WHERE id = ?", chamado.acao_origem_id);
  if (!acao || !acao.prerequisito_acao_id) return false;
  const irmaos = await all(
    db,
    "SELECT acao_origem_id, data_finalizacao FROM chamados WHERE chamado_mae_id = ?",
    chamado.chamado_mae_id
  );
  return estaBloqueado(acao, irmaos);
}

export async function chamadoComDetalhes(db, id) {
  const chamado = await first(
    db,

    `SELECT
       c.*,
       COALESCE(e.setor_id, a.setor_destino_id) AS setor_id,
       s.nome AS setor_nome,
       COALESCE(c.titulo, e.nome, a.rotulo) AS titulo,
       e.nome AS etapa_nome,
       CASE 
         WHEN e.tipo = 'aprovacao'
           OR (SELECT COUNT(1) FROM acoes ac WHERE ac.etapa_id = c.etapa_id) > 0
           OR LOWER(COALESCE(e.nome, c.titulo, a.rotulo, '')) LIKE '%aprova%' THEN 'aprovacao'
         ELSE COALESCE(e.tipo, 'tarefa')
       END AS etapa_tipo,
       st.nome AS status_nome,
       st.cor AS status_cor,
       resp.nome AS responsavel_nome,
       resp.telefone AS responsavel_telefone,
       sol.nome AS solicitante_nome,
       sol.telefone AS solicitante_telefone,
       ft.nome AS fluxo_nome,
       emp.nome AS empresa_nome
     FROM chamados c
     LEFT JOIN etapas e ON e.id = c.etapa_id
     LEFT JOIN acoes a ON a.id = c.acao_origem_id
     LEFT JOIN setores s ON s.id = COALESCE(e.setor_id, a.setor_destino_id)
     LEFT JOIN status st ON st.id = c.status_id
     LEFT JOIN usuarios resp ON resp.id = c.responsavel_id
     LEFT JOIN usuarios sol ON sol.id = c.solicitante_id
     LEFT JOIN fluxo_templates ft ON ft.id = c.fluxo_template_id
     LEFT JOIN empresas emp ON emp.id = c.empresa_id
     WHERE c.id = ?`,
    id
  );
  if (!chamado) return null;
  const bloqueado = await computarBloqueado(db, chamado);
  const finalizadoOuCancelado = chamado.data_finalizacao != null ||
    chamado.status_nome === "suspenso" ||
    chamado.status_nome === "cancelado" ||
    chamado.status_nome === "cancelada";
  const situacao = situacaoPrazo(
    chamado.prazo,
    hojeISO(),
    finalizadoOuCancelado
  );
  const ehChamadoMae = !chamado.chamado_mae_id || chamado.chamado_mae_id === 0;
  const permComentarios = await verificarPermissaoComentariosChamado(db, chamado);

  let acoesDisponiveis = [];
  if (chamado.acao_origem_id && !chamado.etapa_id) {
    const acaoOrigem = await first(
      db,
      "SELECT id, rotulo, setor_destino_id, vinculo, etapa_destino_id, etapas_destino_ids, observacao, modo_execucao FROM acoes WHERE id = ?",
      chamado.acao_origem_id
    ).catch(() => null);

    if (acaoOrigem) {
      let idsEtapas = [];
      if (acaoOrigem.etapas_destino_ids) {
        try {
          idsEtapas = JSON.parse(acaoOrigem.etapas_destino_ids).map(Number).filter(Boolean);
        } catch (_) {
          idsEtapas = String(acaoOrigem.etapas_destino_ids).split(",").map(Number).filter(Boolean);
        }
      } else if (acaoOrigem.etapa_destino_id) {
        idsEtapas = [Number(acaoOrigem.etapa_destino_id)];
      }

      if (idsEtapas.length > 0) {
        const placeholders = idsEtapas.map(() => "?").join(",");
        const etapasDest = await all(
          db,
          `SELECT e.id, e.nome, e.setor_id, s.nome AS setor_nome
           FROM etapas e
           LEFT JOIN setores s ON s.id = e.setor_id
           WHERE e.id IN (${placeholders})`,
          ...idsEtapas
        ).catch(() => []);

        const listaEtapas = Array.isArray(etapasDest) ? etapasDest : [];

        acoesDisponiveis = idsEtapas.map((id) => {
          const et = listaEtapas.find((x) => x.id === id);
          return {
            id: et?.id || id,
            rotulo: et ? `${et.nome}${et.setor_nome ? ` (${et.setor_nome})` : ""}` : `Etapa #${id}`,
            setor_id: et?.setor_id || null,
            setor_nome: et?.setor_nome || null,
            vinculo: acaoOrigem.vinculo || "mae",
            observacao: null,
            eh_etapa_encadeada: true,
          };
        });
      }
    }
  }

  const ehAprovacaoCalculado =
    chamado.etapa_tipo === "aprovacao" ||
    acoesDisponiveis.length > 0 ||
    String(chamado.titulo || "").toLowerCase().includes("aprova") ||
    String(chamado.etapa_nome || "").toLowerCase().includes("aprova");

  return {
    ...chamado,
    etapa_tipo: ehAprovacaoCalculado ? "aprovacao" : (chamado.etapa_tipo || "tarefa"),
    acoes: acoesDisponiveis,
    eh_chamado_mae: ehChamadoMae,
    pode_apontar_horas: !ehChamadoMae,
    pode_comentar: permComentarios.permitido,
    motivo_bloqueio_comentario: permComentarios.motivo || null,
    bloqueado,
    situacao_prazo: situacao,
  };
}

/**
 * Verifica se comentários/anexos são permitidos para um chamado.
 * Regra: Na solicitação inicial (chamado mãe), comentários e anexos só são permitidos
 * se a etapa 1 de aprovação ainda está como prevista (ou seja, ainda não foi aprovada).
 */
export async function verificarPermissaoComentariosChamado(db, chamado) {
  const ehChamadoMae = !chamado.chamado_mae_id || chamado.chamado_mae_id === 0;
  if (!ehChamadoMae) {
    return { permitido: true };
  }

  const etapasFilhas = await all(
    db,
    `SELECT c.id, c.status_id, st.nome AS status_nome, c.resultado, c.data_finalizacao, e.tipo AS etapa_tipo
     FROM chamados c
     LEFT JOIN status st ON st.id = c.status_id
     LEFT JOIN etapas e ON e.id = c.etapa_id
     WHERE c.chamado_mae_id = ?
     ORDER BY c.id ASC`,
    chamado.id
  );

  if (!etapasFilhas || etapasFilhas.length === 0) {
    return { permitido: true };
  }

  // Identifica a primeira etapa de aprovação (ou a primeira etapa filha criada a partir da solicitação inicial)
  const primeiraEtapaAprovacao = etapasFilhas.find((f) => f.etapa_tipo === "aprovacao") || etapasFilhas[0];
  const statusNome = String(primeiraEtapaAprovacao?.status_nome || "").toLowerCase();
  const estaPrevista = statusNome === "previsto" && !primeiraEtapaAprovacao?.data_finalizacao && !primeiraEtapaAprovacao?.resultado;

  if (!estaPrevista) {
    return {
      permitido: false,
      motivo: "Comentários e anexos na solicitação inicial só são permitidos enquanto a primeira etapa de aprovação estiver prevista (não aprovada).",
      etapa_id: primeiraEtapaAprovacao?.id,
      status_nome: primeiraEtapaAprovacao?.status_nome,
    };
  }

  return { permitido: true };
}

/**
 * Sincroniza o status do chamado mãe com o andamento das etapas filhas do fluxo.
 * O chamado mãe não é encerrado até que todo o fluxo seja concluído.
 * Caso alguma etapa seja reprovada, o chamado mãe passa para Cancelado.
 */
export async function sincronizarProgressoChamadoMae(db, chamadoId, hoje = null) {
  const dataHoje = hoje || hojeISO();
  const chamado = await first(db, "SELECT id, chamado_mae_id, resultado FROM chamados WHERE id = ?", chamadoId);
  if (!chamado) return;

  const raizId = chamado.chamado_mae_id || chamado.id;

  // Verifica subchamados do chamado mãe
  const filhos = await all(
    db,
    `SELECT c.id, c.status_id, c.resultado, c.data_finalizacao, st.nome AS status_nome
     FROM chamados c
     LEFT JOIN status st ON st.id = c.status_id
     WHERE chamado_mae_id = ?`,
    raizId
  );

  // Se não existem subchamados gerados, o chamado mãe é o único
  if (filhos.length === 0) {
    if (chamado.resultado === "reprovado") {
      const statusCancelado = await statusIdPorNome(db, "cancelado").catch(() => statusIdPorNome(db, "finalizado"));
      await run(
        db,
        "UPDATE chamados SET status_id = ?, data_finalizacao = COALESCE(data_finalizacao, ?), resultado = 'reprovado' WHERE id = ?",
        statusCancelado,
        dataHoje,
        raizId
      );
    }
    return;
  }

  // Verifica se alguma etapa foi reprovada ou cancelada
  const temReprovacao = filhos.some(
    (f) => f.resultado === "reprovado" ||
      String(f.status_nome || "").toLowerCase() === "cancelado" ||
      String(f.status_nome || "").toLowerCase() === "cancelada"
  );

  if (temReprovacao) {
    const statusCancelado = await statusIdPorNome(db, "cancelado").catch(() => statusIdPorNome(db, "finalizado"));
    // Cancela subchamados ainda pendentes para não ficarem órfãos em aberto
    await run(
      db,
      "UPDATE chamados SET status_id = ?, data_finalizacao = COALESCE(data_finalizacao, ?), resultado = COALESCE(resultado, 'cancelado') WHERE chamado_mae_id = ? AND data_finalizacao IS NULL",
      statusCancelado,
      dataHoje,
      raizId
    );
    // Marca o chamado mãe como Cancelado
    await run(
      db,
      "UPDATE chamados SET status_id = ?, data_finalizacao = COALESCE(data_finalizacao, ?), resultado = 'reprovado' WHERE id = ?",
      statusCancelado,
      dataHoje,
      raizId
    );
    return;
  }

  const pendentes = filhos.filter((f) => !f.data_finalizacao);

  if (pendentes.length === 0) {
    // Todos os subchamados foram finalizados com sucesso -> finaliza o chamado mãe
    const statusFinalizado = await statusIdPorNome(db, "finalizado");
    await run(
      db,
      "UPDATE chamados SET status_id = ?, data_finalizacao = COALESCE(data_finalizacao, ?) WHERE id = ?",
      statusFinalizado,
      dataHoje,
      raizId
    );
  } else {
    // Ainda existem etapas pendentes -> mantém o chamado mãe em andamento (não finalizado)
    const statusEmAndamento = await statusIdPorNome(db, "em desenvolvimento").catch(() => statusIdPorNome(db, "previsto"));
    await run(
      db,
      "UPDATE chamados SET status_id = ?, data_finalizacao = NULL WHERE id = ?",
      statusEmAndamento,
      raizId
    );
  }
}
