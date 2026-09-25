-- Migration 0022: Criação das tabelas de consultas personalizadas salvas e consulta padrão por usuário

CREATE TABLE IF NOT EXISTS consultas_salvas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tela TEXT NOT NULL DEFAULT 'chamados',
  nome TEXT NOT NULL,
  filtros_json TEXT NOT NULL,
  eh_publica INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT
);

CREATE TABLE IF NOT EXISTS consultas_padrao_usuario (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tela TEXT NOT NULL DEFAULT 'chamados',
  consulta_id INTEGER NOT NULL REFERENCES consultas_salvas(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, tela)
);

CREATE INDEX IF NOT EXISTS idx_consultas_salvas_tela_usr ON consultas_salvas(tela, usuario_id, eh_publica);
