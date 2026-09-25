import { all } from "../../_lib/db.js";
import { json } from "../../_lib/http.js";
import { exigirPermissao } from "../../_lib/permissoes.js";
import { situacaoPrazo } from "../../_lib/prazos.js";

const DIA_MS = 24 * 60 * 60 * 1000;

export async function onRequestGet(context) {
  const { usuario, permissoes, erro } = await exigirPermissao(context, "dashboards", "visualizar");
  if (erro) return erro;

  const url = new URL(context.request.url);
  const empresaId = url.searchParams.get("empresa_id") ? Number(url.searchParams.get("empresa_id")) : null;
  const setorId = url.searchParams.get("setor_id") ? Number(url.searchParams.get("setor_id")) : null;
  const diasFiltro = url.searchParams.get("dias") ? Number(url.searchParams.get("dias")) : null;

  const verTodos = usuario.admin === 1 || permissoes.chamados.ver_todos_setores;
  const hoje = new Date().toISOString().slice(0, 10);

  // Cláusulas dinâmicas
  const where = ["1 = 1"];
  const params = [];

  if (!verTodos) {
    where.push("COALESCE(e.setor_id, a.setor_destino_id) = ?");
    params.push(usuario.setor_id);
  } else if (setorId) {
    where.push("COALESCE(e.setor_id, a.setor_destino_id) = ?");
    params.push(setorId);
  }

  if (empresaId) {
    where.push("c.empresa_id = ?");
    params.push(empresaId);
  }

  if (diasFiltro && diasFiltro > 0) {
    const dataMin = new Date(Date.now() - diasFiltro * DIA_MS).toISOString().slice(0, 10);
    where.push("c.data_abertura >= ?");
    params.push(dataMin);
  }

  // Busca lista de setores
  const setores = await all(
    context.env.DB,
    `SELECT id, nome, empresa_id, prazo_padrao_dias FROM setores ORDER BY nome`
  );

  // Busca chamados detalhados
  const chamados = await all(
    context.env.DB,
    `SELECT
       c.id,
       c.chamado_mae_id,
       c.chamado_pai_id,
       c.empresa_id,
       c.status_id,
       st.nome AS status_nome,
       c.data_abertura,
       c.prazo,
       c.data_finalizacao,
       COALESCE(e.setor_id, a.setor_destino_id) AS setor_id,
       s.nome AS setor_nome
     FROM chamados c
     LEFT JOIN etapas e ON e.id = c.etapa_id
     LEFT JOIN acoes a ON a.id = c.acao_origem_id
     LEFT JOIN setores s ON s.id = COALESCE(e.setor_id, a.setor_destino_id)
     LEFT JOIN status st ON st.id = c.status_id
     WHERE ${where.join(" AND ")}
     ORDER BY c.id DESC`,
    ...params
  );

  // Agregações gerais
  let totalChamados = chamados.length;
  let totalTarefasMae = 0;
  let totalEmAndamento = 0;
  let totalFinalizados = 0;
  let totalAtrasados = 0;
  let totalAlerta = 0;
  let totalFinalizadosNoPrazo = 0;
  let somaDiasResolucaoGeral = 0;
  let contagemResolucaoGeral = 0;

  const distribuicaoStatus = {};
  const setoresMap = new Map();

  for (const s of setores) {
    if (setorId && s.id !== setorId) continue;
    if (verTodos || s.id === usuario.setor_id) {
      setoresMap.set(s.id, {
        setor_id: s.id,
        setor_nome: s.nome,
        total_chamados: 0,
        tarefas_mae: 0,
        ativos: 0,
        finalizados: 0,
        atrasados: 0,
        alerta: 0,
        finalizados_no_prazo: 0,
        soma_dias_resolucao: 0,
        contagem_resolucao: 0,
        tempo_medio_dias: 0,
        taxa_pontualidade: 100,
        eh_gargalo: false,
      });
    }
  }

  for (const c of chamados) {
    const ehFinalizado = c.status_nome === "finalizado" || c.data_finalizacao != null;
    const ehMae = c.chamado_mae_id == null;

    if (ehMae) totalTarefasMae++;
    if (ehFinalizado) totalFinalizados++;
    else totalEmAndamento++;

    const situacao = situacaoPrazo(c.prazo, hoje, ehFinalizado);
    if (!ehFinalizado) {
      if (situacao === "vencido") totalAtrasados++;
      else if (situacao === "alerta") totalAlerta++;
    }

    // Status
    const nomeStatus = c.status_nome || "Sem status";
    distribuicaoStatus[nomeStatus] = (distribuicaoStatus[nomeStatus] || 0) + 1;

    // Tempo de resolução
    if (ehFinalizado && c.data_finalizacao && c.data_abertura) {
      const dtFim = new Date(`${c.data_finalizacao}T00:00:00Z`).getTime();
      const dtInicio = new Date(`${c.data_abertura}T00:00:00Z`).getTime();
      const diff = Math.max(0, Math.round((dtFim - dtInicio) / DIA_MS));
      somaDiasResolucaoGeral += diff;
      contagemResolucaoGeral++;

      if (c.prazo && c.data_finalizacao <= c.prazo) {
        totalFinalizadosNoPrazo++;
      }
    }

    // Setor correspondente
    if (c.setor_id && setoresMap.has(c.setor_id)) {
      const setInfo = setoresMap.get(c.setor_id);
      setInfo.total_chamados++;
      if (ehMae) setInfo.tarefas_mae++;
      if (ehFinalizado) {
        setInfo.finalizados++;
        if (c.data_finalizacao && c.data_abertura) {
          const diff = Math.max(
            0,
            Math.round(
              (new Date(`${c.data_finalizacao}T00:00:00Z`).getTime() -
                new Date(`${c.data_abertura}T00:00:00Z`).getTime()) /
                DIA_MS
            )
          );
          setInfo.soma_dias_resolucao += diff;
          setInfo.contagem_resolucao++;
        }
        if (c.prazo && c.data_finalizacao <= c.prazo) {
          setInfo.finalizados_no_prazo++;
        }
      } else {
        setInfo.ativos++;
        if (situacao === "vencido") setInfo.atrasados++;
        else if (situacao === "alerta") setInfo.alerta++;
      }
    }
  }

  // Processa métricas por setor
  const relatorioSetores = [];
  const gargalos = [];

  for (const setInfo of setoresMap.values()) {
    if (setInfo.contagem_resolucao > 0) {
      setInfo.tempo_medio_dias = Number((setInfo.soma_dias_resolucao / setInfo.contagem_resolucao).toFixed(1));
    } else {
      setInfo.tempo_medio_dias = 0;
    }

    if (setInfo.finalizados > 0) {
      setInfo.taxa_pontualidade = Math.round((setInfo.finalizados_no_prazo / setInfo.finalizados) * 100);
    } else {
      setInfo.taxa_pontualidade = 100;
    }

    // Heurística de gargalo operacional:
    // 1) 2 ou mais chamados vencidos; OU
    // 2) 4 ou mais ativos com pontualidade abaixo de 75%; OU
    // 3) tempo médio de resolução elevado (> 7 dias) com chamados ativos
    if (
      setInfo.atrasados >= 2 ||
      (setInfo.ativos >= 4 && setInfo.taxa_pontualidade < 75) ||
      (setInfo.ativos >= 3 && setInfo.tempo_medio_dias >= 8)
    ) {
      setInfo.eh_gargalo = true;
      gargalos.push({
        setor_id: setInfo.setor_id,
        setor_nome: setInfo.setor_nome,
        atrasados: setInfo.atrasados,
        ativos: setInfo.ativos,
        tempo_medio_dias: setInfo.tempo_medio_dias,
        taxa_pontualidade: setInfo.taxa_pontualidade,
      });
    }

    relatorioSetores.push(setInfo);
  }

  // Ordena setores: gargalos primeiro, depois maior número de ativos
  relatorioSetores.sort((a, b) => {
    if (b.eh_gargalo !== a.eh_gargalo) return b.eh_gargalo ? 1 : -1;
    if (b.atrasados !== a.atrasados) return b.atrasados - a.atrasados;
    return b.ativos - a.ativos;
  });

  const tempoMedioGeralDias =
    contagemResolucaoGeral > 0 ? Number((somaDiasResolucaoGeral / contagemResolucaoGeral).toFixed(1)) : 0;
  const taxaPontualidadeGeral =
    totalFinalizados > 0 ? Math.round((totalFinalizadosNoPrazo / totalFinalizados) * 100) : 100;

  return json({
    metricas_gerais: {
      total_chamados: totalChamados,
      tarefas_mae: totalTarefasMae,
      em_andamento: totalEmAndamento,
      finalizados: totalFinalizados,
      atrasados: totalAtrasados,
      em_alerta: totalAlerta,
      tempo_medio_geral_dias: tempoMedioGeralDias,
      taxa_pontualidade_geral: taxaPontualidadeGeral,
    },
    setores: relatorioSetores,
    distribuicao_status: Object.entries(distribuicaoStatus).map(([status, quantidade]) => ({
      status,
      quantidade,
    })),
    gargalos,
    gerado_em: hoje,
  });
}
