-- Migration 0021: Remove restricao CHECK de tela em permissoes para suportar telas como dashboards, apontamentos, etc
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS permissoes_nova (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grupo_id INTEGER NOT NULL REFERENCES grupos_permissao(id),
  tela TEXT NOT NULL,
  visualizar INTEGER NOT NULL DEFAULT 0,
  inserir INTEGER NOT NULL DEFAULT 0,
  editar INTEGER NOT NULL DEFAULT 0,
  excluir INTEGER NOT NULL DEFAULT 0,
  ver_todos_setores INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO permissoes_nova (id, grupo_id, tela, visualizar, inserir, editar, excluir, ver_todos_setores)
  SELECT id, grupo_id, tela, visualizar, inserir, editar, excluir, ver_todos_setores FROM permissoes;

DROP TABLE permissoes;

ALTER TABLE permissoes_nova RENAME TO permissoes;

CREATE UNIQUE INDEX IF NOT EXISTS idx_permissoes_grupo_tela ON permissoes(grupo_id, tela);

PRAGMA foreign_keys = ON;
