-- Migration 0020: Adiciona coluna observacao na tabela acoes
ALTER TABLE acoes ADD COLUMN observacao TEXT;
