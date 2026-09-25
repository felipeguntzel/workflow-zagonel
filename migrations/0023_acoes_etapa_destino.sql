-- Adiciona suporte para vincular ações a etapas de fluxo subsequentes
ALTER TABLE acoes ADD COLUMN etapa_destino_id INTEGER REFERENCES etapas(id);
