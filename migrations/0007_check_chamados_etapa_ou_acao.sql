-- Garante no schema que todo chamado tem exatamente um de etapa_id/
-- acao_origem_id preenchido — antes disso era só uma convenção do código
-- (functions/_lib/chamados.js), sem garantia no banco. SQLite não suporta
-- ALTER TABLE ADD CONSTRAINT, então a tabela precisa ser recriada; seguro
-- fazer isso agora porque ainda não há uso real em produção (nenhum
-- chamado real a preservar, só dados de teste).
--
-- D1 aplica foreign keys sempre (PRAGMA foreign_keys=OFF não teve efeito
-- em teste local), então a ordem abaixo evita qualquer violação em vez de
-- tentar desligar a checagem: renomeia a tabela antiga (o RENAME do
-- SQLite atualiza sozinho os REFERENCES de quem aponta pra ela, inclusive
-- o auto-relacionamento chamado_mae_id/chamado_pai_id e as FKs de
-- comentarios/apontamentos_horas), recria "chamados" já com o CHECK,
-- copia os dados em ordem de id (pai sempre tem id menor que filho neste
-- domínio, então a FK auto-referenciada nunca aponta pra frente), e por
-- fim reaponta comentarios/apontamentos_horas pra a tabela nova.

ALTER TABLE chamados RENAME TO chamados_antigo;

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
  CHECK ((etapa_id IS NOT NULL) != (acao_origem_id IS NOT NULL))
);

INSERT INTO chamados
  SELECT id, fluxo_template_id, etapa_id, acao_origem_id, chamado_mae_id,
         chamado_pai_id, empresa_id, status_id, resultado, solicitante_id,
         responsavel_id, data_abertura, prazo, data_finalizacao
  FROM chamados_antigo
  ORDER BY id;

ALTER TABLE comentarios RENAME TO comentarios_antigo;

CREATE TABLE comentarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chamado_id INTEGER NOT NULL REFERENCES chamados(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  data TEXT NOT NULL,
  texto TEXT NOT NULL,
  eh_justificativa INTEGER NOT NULL DEFAULT 0
);

INSERT INTO comentarios SELECT * FROM comentarios_antigo;

DROP TABLE comentarios_antigo;

ALTER TABLE apontamentos_horas RENAME TO apontamentos_horas_antigo;

CREATE TABLE apontamentos_horas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chamado_id INTEGER NOT NULL REFERENCES chamados(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  data TEXT NOT NULL,
  horas REAL NOT NULL,
  observacao TEXT
);

INSERT INTO apontamentos_horas SELECT * FROM apontamentos_horas_antigo;

DROP TABLE apontamentos_horas_antigo;

DROP TABLE chamados_antigo;
