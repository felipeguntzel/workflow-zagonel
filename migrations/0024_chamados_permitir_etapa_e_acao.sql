-- Migração 0024: Permitir que chamados tenham simultaneamente etapa_id e acao_origem_id.
-- A migração 0007 impunha CHECK ((etapa_id IS NOT NULL) != (acao_origem_id IS NOT NULL))
-- que impedia uma ação de apontar para uma etapa de destino (etapa_destino_id)
-- ao avançar o fluxo em etapas de aprovação ou tarefas.

PRAGMA foreign_keys = OFF;
PRAGMA defer_foreign_keys = ON;

ALTER TABLE chamados RENAME TO _chamados_antigo_0024;

CREATE TABLE chamados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fluxo_template_id INTEGER NOT NULL REFERENCES fluxo_templates(id),
  etapa_id INTEGER REFERENCES etapas(id),
  acao_origem_id INTEGER REFERENCES acoes(id),
  chamado_mae_id INTEGER REFERENCES chamados(id),
  chamado_pai_id INTEGER REFERENCES chamados(id),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  status_id INTEGER NOT NULL REFERENCES status(id),
  resultado TEXT CHECK (resultado IN ('aprovado','reprovado')),
  solicitante_id INTEGER NOT NULL REFERENCES usuarios(id),
  responsavel_id INTEGER REFERENCES usuarios(id),
  data_abertura TEXT NOT NULL,
  prazo TEXT NOT NULL,
  data_finalizacao TEXT,
  titulo TEXT,
  prioridade TEXT NOT NULL DEFAULT 'normal',
  observacao TEXT,
  CHECK (etapa_id IS NOT NULL OR acao_origem_id IS NOT NULL)
);

INSERT INTO chamados (
  id, fluxo_template_id, etapa_id, acao_origem_id, chamado_mae_id, chamado_pai_id,
  empresa_id, status_id, resultado, solicitante_id, responsavel_id, data_abertura,
  prazo, data_finalizacao, titulo, prioridade, observacao
)
SELECT
  id, fluxo_template_id, etapa_id, acao_origem_id, chamado_mae_id, chamado_pai_id,
  empresa_id, status_id, resultado, solicitante_id, responsavel_id, data_abertura,
  prazo, data_finalizacao,
  COALESCE(titulo, NULL),
  COALESCE(prioridade, 'normal'),
  COALESCE(observacao, NULL)
FROM _chamados_antigo_0024
ORDER BY id;

DROP TABLE _chamados_antigo_0024;

PRAGMA foreign_keys = ON;
