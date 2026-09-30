export function resolverProximosChamados(etapa, triggering, decisoesAcoes = {}) {
  const raizId = triggering.chamado_mae_id ?? triggering.id;

  if (etapa.acoes && etapa.acoes.length > 0) {
    return etapa.acoes
      .filter((acao) => {
        const val = decisoesAcoes[acao.id];
        return val === true || (val && typeof val === "object" && (val.marcado === true || val.selecionado === true));
      })
      .flatMap((acao) => {
        let etapasDestino = [];
        if (Array.isArray(acao.etapas_destino_ids) && acao.etapas_destino_ids.length > 0) {
          etapasDestino = acao.etapas_destino_ids.map(Number).filter(Boolean);
        } else if (typeof acao.etapas_destino_ids === "string" && acao.etapas_destino_ids.trim()) {
          try {
            const parsed = JSON.parse(acao.etapas_destino_ids);
            if (Array.isArray(parsed) && parsed.length > 0) {
              etapasDestino = parsed.map(Number).filter(Boolean);
            }
          } catch (_) {
            etapasDestino = acao.etapas_destino_ids.split(",").map(Number).filter(Boolean);
          }
        }
        if (etapasDestino.length === 0 && acao.etapa_destino_id) {
          etapasDestino = [Number(acao.etapa_destino_id)];
        }

        const temMultiplasEtapas = Array.isArray(acao.etapas_destino_ids) && acao.etapas_destino_ids.length > 0;
        const modoExecucao = acao.modo_execucao || (temMultiplasEtapas ? "encadeado" : "direto");

        // Se modo_execucao for 'direto' e houver etapas de destino, dispara os chamados diretamente para elas
        if (modoExecucao === "direto" && etapasDestino.length > 0) {
          return etapasDestino.map((etapaId) => ({
            etapa_id: etapaId,
            acao_origem_id: acao.id,
            setor_id: acao.setor_destino_id,
            chamado_pai_id: acao.vinculo === "mae" ? raizId : triggering.id,
            chamado_mae_id: raizId,
          }));
        }

        // Modo 'encadeado' (padrão quando há etapas de destino vinculadas ou explícito):
        // Cria um chamado para o setor vinculado (setor_destino_id), permitindo que aquele setor
        // decida e marque quais etapas de destino acionar.
        return [
          {
            etapa_id: null,
            acao_origem_id: acao.id,
            setor_id: acao.setor_destino_id,
            chamado_pai_id: acao.vinculo === "mae" ? raizId : triggering.id,
            chamado_mae_id: raizId,
          },
        ];
      });
  }

  if (etapa.etapa_proxima_id) {
    return [
      {
        etapa_id: etapa.etapa_proxima_id,
        acao_origem_id: null,
        setor_id: null,
        chamado_pai_id: etapa.etapa_proxima_vinculo === "mae" ? raizId : triggering.id,
        chamado_mae_id: raizId,
      },
    ];
  }

  return [];
}

export function estaBloqueado(acaoOrigem, chamadosIrmaos) {
  if (!acaoOrigem || !acaoOrigem.prerequisito_acao_id) return false;
  const irmaos = chamadosIrmaos.filter(
    (c) => c.acao_origem_id === acaoOrigem.prerequisito_acao_id
  );
  if (irmaos.length === 0) return false;
  return irmaos.some((c) => c.data_finalizacao == null);
}
