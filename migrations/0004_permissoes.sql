ALTER TABLE usuarios ADD COLUMN admin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN deve_trocar_senha INTEGER NOT NULL DEFAULT 0;

CREATE TABLE grupos_permissao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL
);

CREATE TABLE permissoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grupo_id INTEGER NOT NULL REFERENCES grupos_permissao(id),
  tela TEXT NOT NULL CHECK (tela IN ('empresas','setores','usuarios','status','fluxos','chamados')),
  visualizar INTEGER NOT NULL DEFAULT 0,
  inserir INTEGER NOT NULL DEFAULT 0,
  editar INTEGER NOT NULL DEFAULT 0,
  excluir INTEGER NOT NULL DEFAULT 0,
  ver_todos_setores INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX idx_permissoes_grupo_tela ON permissoes(grupo_id, tela);

CREATE TABLE usuario_grupos (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  grupo_id INTEGER NOT NULL REFERENCES grupos_permissao(id),
  PRIMARY KEY (usuario_id, grupo_id)
);
