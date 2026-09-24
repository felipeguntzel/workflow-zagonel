-- Migração 0016: Adicionar campo ativo para usuários e garantir padrão ativo = 1

ALTER TABLE usuarios ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;

UPDATE usuarios SET ativo = 1 WHERE ativo IS NULL;
