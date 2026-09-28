-- Adiciona suporte para vincular múltiplas etapas de destino por ação de aprovação
ALTER TABLE acoes ADD COLUMN etapas_destino_ids TEXT;
