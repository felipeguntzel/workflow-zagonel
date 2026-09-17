-- Migração 0012: Tabela de tokens de recuperação de senha por e-mail
CREATE TABLE IF NOT EXISTS recuperacao_senha (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expira_em TEXT NOT NULL,
  usado INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_recuperacao_token ON recuperacao_senha(token);
CREATE INDEX IF NOT EXISTS idx_recuperacao_usuario ON recuperacao_senha(usuario_id);
