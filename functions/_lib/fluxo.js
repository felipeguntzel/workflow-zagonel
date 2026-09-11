export function resolverProximosChamados(etapa, triggering, decisoesAcoes = {}) {
  const raizId = triggering.chamado_mae_id ?? triggering.id;

  if (etapa.acoes && etapa.acoes.length > 0) {
    return etapa.acoes
      .filter((acao) => decisoesAcoes[acao.id] === true)
      .map((acao) => ({
        etapa_id: null,
        acao_origem_id: acao.id,
        setor_id: acao.setor_destino_id,
        chamado_pai_id: acao.vinculo === "mae" ? raizId : triggering.id,
        chamado_mae_id: raizId,
      }));
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
  const irmao = chamadosIrmaos.find(
    (c) => c.acao_origem_id === acaoOrigem.prerequisito_acao_id
  );
  if (!irmao) return false;
  return irmao.data_finalizacao == null;
}
