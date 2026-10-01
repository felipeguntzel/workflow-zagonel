-- Migration 0030: Padronização de vínculo pai imediato e correção de encadeamento na árvore vertical
-- 1. Atualizar etapas para que o vínculo padrão da próxima etapa seja 'pai' (imediato) em vez de 'mae' (raiz)
UPDATE etapas
SET etapa_proxima_vinculo = 'pai'
WHERE etapa_proxima_vinculo = 'mae';

-- 2. Atualizar ações para que o vínculo padrão seja 'pai' (imediato) em vez de 'mae' (raiz)
UPDATE acoes
SET vinculo = 'pai'
WHERE vinculo = 'mae';

-- 3. Corrigir chamados sequenciais onde o chamado_pai_id foi gravado erroneamente como o chamado_mae_id
-- Casos de etapas subsequentes (etapa_proxima_id)
UPDATE chamados
SET chamado_pai_id = (
  SELECT a.id
  FROM chamados a
  JOIN etapas e ON e.id = a.etapa_id
  WHERE a.chamado_mae_id = chamados.chamado_mae_id
    AND e.etapa_proxima_id = chamados.etapa_id
  ORDER BY a.id DESC
  LIMIT 1
)
WHERE etapa_id IS NOT NULL
  AND chamado_mae_id IS NOT NULL
  AND (chamado_pai_id IS NULL OR chamado_pai_id = chamado_mae_id)
  AND EXISTS (
    SELECT 1
    FROM chamados a
    JOIN etapas e ON e.id = a.etapa_id
    WHERE a.chamado_mae_id = chamados.chamado_mae_id
      AND e.etapa_proxima_id = chamados.etapa_id
  );

-- Casos de ações disparadas a partir de uma etapa anterior
UPDATE chamados
SET chamado_pai_id = (
  SELECT a.id
  FROM chamados a
  JOIN acoes ac ON ac.etapa_id = a.etapa_id
  WHERE a.chamado_mae_id = chamados.chamado_mae_id
    AND ac.id = chamados.acao_origem_id
  ORDER BY a.id DESC
  LIMIT 1
)
WHERE acao_origem_id IS NOT NULL
  AND chamado_mae_id IS NOT NULL
  AND (chamado_pai_id IS NULL OR chamado_pai_id = chamado_mae_id)
  AND EXISTS (
    SELECT 1
    FROM chamados a
    JOIN acoes ac ON ac.etapa_id = a.etapa_id
    WHERE a.chamado_mae_id = chamados.chamado_mae_id
      AND ac.id = chamados.acao_origem_id
  );
