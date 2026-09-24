-- Migracao 0017: Campos padrao de chamados (titulo, prioridade, observacao)

ALTER TABLE chamados ADD COLUMN titulo TEXT;
ALTER TABLE chamados ADD COLUMN prioridade TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE chamados ADD COLUMN observacao TEXT;
