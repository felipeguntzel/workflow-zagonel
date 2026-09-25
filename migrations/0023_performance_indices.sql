-- Migration 0023: Índices de performance para otimização extrema de consultas, filtros e dashboard
CREATE INDEX IF NOT EXISTS idx_chamados_mae_fin_id ON chamados(chamado_mae_id, data_finalizacao, id DESC);
CREATE INDEX IF NOT EXISTS idx_chamados_status_id ON chamados(status_id);
CREATE INDEX IF NOT EXISTS idx_chamados_responsavel_id ON chamados(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_chamados_solicitante_id ON chamados(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_chamados_etapa_id ON chamados(etapa_id);
CREATE INDEX IF NOT EXISTS idx_chamados_empresa_id ON chamados(empresa_id);
CREATE INDEX IF NOT EXISTS idx_chamados_prazo ON chamados(prazo);
CREATE INDEX IF NOT EXISTS idx_chamados_data_fin ON chamados(data_finalizacao);
CREATE INDEX IF NOT EXISTS idx_etapas_template ON etapas(fluxo_template_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_chamado ON comentarios(chamado_id);
CREATE INDEX IF NOT EXISTS idx_apontamentos_chamado_data ON apontamentos_horas(chamado_id, data);
