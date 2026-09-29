-- Migration 0027: Adiciona status cancelado se não existir
INSERT OR IGNORE INTO status (id, nome, cor)
SELECT 7, 'cancelado', '#dc2626'
WHERE NOT EXISTS (SELECT 1 FROM status WHERE LOWER(nome) IN ('cancelado', 'cancelada'));
