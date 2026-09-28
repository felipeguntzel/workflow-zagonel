-- Migração 0025: Restaurar foreign keys de tabelas dependentes de chamados
-- A migração 0024 fez RENAME de chamados para _chamados_antigo_0024 antes de recriar chamados,
-- o que fez o SQLite reescrever as FKs de comentarios, apontamentos_horas, chamado_campos_valores,
-- chamado_anexos e historico_auditoria apontando para _chamados_antigo_0024.
-- Como _chamados_antigo_0024 foi excluído, essas tabelas ficaram com referências órfãs.

PRAGMA foreign_keys = OFF;
PRAGMA defer_foreign_keys = ON;

-- 1. comentarios
CREATE TABLE IF NOT EXISTS _comentarios_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chamado_id INTEGER NOT NULL REFERENCES chamados(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  data TEXT NOT NULL,
  texto TEXT NOT NULL,
  eh_justificativa INTEGER NOT NULL DEFAULT 0,
  eh_privado INTEGER NOT NULL DEFAULT 0
);
INSERT INTO _comentarios_new (id, chamado_id, usuario_id, data, texto, eh_justificativa, eh_privado)
  SELECT id, chamado_id, usuario_id, data, texto, COALESCE(eh_justificativa, 0), COALESCE(eh_privado, 0)
  FROM comentarios;
DROP TABLE comentarios;
ALTER TABLE _comentarios_new RENAME TO comentarios;
CREATE INDEX IF NOT EXISTS idx_comentarios_chamado ON comentarios(chamado_id);

-- 2. apontamentos_horas
CREATE TABLE IF NOT EXISTS _apontamentos_horas_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chamado_id INTEGER NOT NULL REFERENCES chamados(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  data TEXT NOT NULL,
  horas REAL NOT NULL,
  observacao TEXT
);
INSERT INTO _apontamentos_horas_new (id, chamado_id, usuario_id, data, horas, observacao)
  SELECT id, chamado_id, usuario_id, data, horas, observacao
  FROM apontamentos_horas;
DROP TABLE apontamentos_horas;
ALTER TABLE _apontamentos_horas_new RENAME TO apontamentos_horas;
CREATE INDEX IF NOT EXISTS idx_apontamentos_chamado_data ON apontamentos_horas(chamado_id, data);

-- 3. chamado_campos_valores
CREATE TABLE IF NOT EXISTS _chamado_campos_valores_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chamado_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  campo_id INTEGER NOT NULL REFERENCES campos_etapa(id) ON DELETE CASCADE,
  valor TEXT,
  UNIQUE(chamado_id, campo_id)
);
INSERT INTO _chamado_campos_valores_new (id, chamado_id, campo_id, valor)
  SELECT id, chamado_id, campo_id, valor
  FROM chamado_campos_valores;
DROP TABLE chamado_campos_valores;
ALTER TABLE _chamado_campos_valores_new RENAME TO chamado_campos_valores;
CREATE INDEX IF NOT EXISTS idx_chamado_campos_chamado ON chamado_campos_valores(chamado_id);

-- 4. chamado_anexos
CREATE TABLE IF NOT EXISTS _chamado_anexos_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chamado_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  nome_arquivo TEXT NOT NULL,
  tipo_mime TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  conteudo_base64 TEXT NOT NULL,
  eh_privado INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);
INSERT INTO _chamado_anexos_new (id, chamado_id, usuario_id, nome_arquivo, tipo_mime, tamanho_bytes, conteudo_base64, eh_privado, criado_em)
  SELECT id, chamado_id, usuario_id, nome_arquivo, tipo_mime, tamanho_bytes, conteudo_base64, COALESCE(eh_privado, 0), criado_em
  FROM chamado_anexos;
DROP TABLE chamado_anexos;
ALTER TABLE _chamado_anexos_new RENAME TO chamado_anexos;
CREATE INDEX IF NOT EXISTS idx_chamado_anexos_chamado ON chamado_anexos(chamado_id);

-- 5. historico_auditoria
CREATE TABLE IF NOT EXISTS _historico_auditoria_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chamado_mae_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  chamado_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id),
  usuario_nome TEXT NOT NULL,
  acao TEXT NOT NULL,
  detalhes TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
INSERT INTO _historico_auditoria_new (id, chamado_mae_id, chamado_id, usuario_id, usuario_nome, acao, detalhes, criado_em)
  SELECT id, chamado_mae_id, chamado_id, usuario_id, usuario_nome, acao, detalhes, criado_em
  FROM historico_auditoria;
DROP TABLE historico_auditoria;
ALTER TABLE _historico_auditoria_new RENAME TO historico_auditoria;
CREATE INDEX IF NOT EXISTS idx_historico_chamado_mae ON historico_auditoria(chamado_mae_id);

PRAGMA foreign_keys = ON;
