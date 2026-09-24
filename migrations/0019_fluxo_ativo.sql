-- Migração 0019: Adiciona coluna ativo na tabela fluxo_templates
ALTER TABLE fluxo_templates ADD COLUMN ativo INTEGER DEFAULT 1;
UPDATE fluxo_templates SET ativo = 1 WHERE ativo IS NULL;
