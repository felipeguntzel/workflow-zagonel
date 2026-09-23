-- Migration 0018: Suporte a ordem, posicao e orientacao para campos personalizados
ALTER TABLE campos_etapa ADD COLUMN ordem INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campos_etapa ADD COLUMN posicao TEXT NOT NULL DEFAULT 'esquerda';
ALTER TABLE campos_etapa ADD COLUMN orientacao TEXT;
