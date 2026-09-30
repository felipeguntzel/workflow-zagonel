-- Migration 0029: Suporte a modo_execucao nas acoes (encadeado ou direto)
ALTER TABLE acoes ADD COLUMN modo_execucao TEXT DEFAULT 'encadeado';
