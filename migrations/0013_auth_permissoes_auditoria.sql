-- Migracao 0013: Autenticacao, Permissoes e Auditoria do Sistema

-- 1. Suporte a revogacao de sessao em usuarios
ALTER TABLE usuarios ADD COLUMN token_valido_apos INTEGER DEFAULT 0;

-- 2. Suporte a hierarquia de grupos
ALTER TABLE grupos_permissao ADD COLUMN grupo_pai_id INTEGER REFERENCES grupos_permissao(id);

-- 3. Tabela de controle de tentativas de login (rate limiting)
CREATE TABLE IF NOT EXISTS tentativas_login (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT NOT NULL UNIQUE,
  tentativas INTEGER NOT NULL DEFAULT 1,
  bloqueado_ate INTEGER NOT NULL DEFAULT 0,
  atualizado_em TEXT NOT NULL
);

-- 4. Tabela de auditoria unificada do sistema (cadastros e mutacoes administrativas)
CREATE TABLE IF NOT EXISTS auditoria_sistema (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  usuario_nome TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id INTEGER,
  acao TEXT NOT NULL,
  detalhes TEXT,
  dados_antigos TEXT,
  dados_novos TEXT,
  criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auditoria_sistema_entidade ON auditoria_sistema(entidade);
CREATE INDEX IF NOT EXISTS idx_auditoria_sistema_usuario ON auditoria_sistema(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_sistema_criado ON auditoria_sistema(criado_em);
