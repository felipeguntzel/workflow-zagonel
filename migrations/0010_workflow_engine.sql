-- Migração 0010: Motor de Workflows, Campos Dinâmicos, Atribuição e Auditoria Unificada

-- 1. Status adicionais
INSERT OR IGNORE INTO status (id, nome) VALUES (6, 'não iniciado');

-- 2. Tabela de campos personalizados / dinâmicos por etapa
CREATE TABLE IF NOT EXISTS campos_etapa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etapa_id INTEGER NOT NULL REFERENCES etapas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  rotulo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('texto', 'numero', 'data', 'select', 'textarea')),
  obrigatorio INTEGER NOT NULL DEFAULT 0,
  opcoes TEXT, -- JSON array de strings para tipo 'select'
  ordem INTEGER NOT NULL DEFAULT 0,
  somente_leitura INTEGER NOT NULL DEFAULT 0,
  bloqueio_regra TEXT -- ex: 'bloquear_apos_etapa_1', 'bloquear_no_pcp', etc.
);

-- 3. Valores dos campos preenchidos nos chamados
CREATE TABLE IF NOT EXISTS chamado_campos_valores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chamado_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  campo_id INTEGER NOT NULL REFERENCES campos_etapa(id) ON DELETE CASCADE,
  valor TEXT,
  UNIQUE(chamado_id, campo_id)
);

-- 4. Anexos por chamado (limite 2MB por arquivo, até 10MB por chamado mãe)
CREATE TABLE IF NOT EXISTS chamado_anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chamado_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  nome_arquivo TEXT NOT NULL,
  tipo_mime TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  conteudo_base64 TEXT NOT NULL, -- Dados codificados do anexo
  eh_privado INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);

-- 5. Atualização da tabela de comentários para suportar 'eh_privado'
-- No SQLite / D1, adicionamos coluna se não existir
ALTER TABLE comentarios ADD COLUMN eh_privado INTEGER NOT NULL DEFAULT 0;

-- 6. Histórico / Auditoria Unificada de Ações por Chamado Mãe
CREATE TABLE IF NOT EXISTS historico_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chamado_mae_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  chamado_id INTEGER NOT NULL REFERENCES chamados(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id),
  usuario_nome TEXT NOT NULL,
  acao TEXT NOT NULL, -- ex: 'criacao', 'atribuicao', 'mudanca_status', 'edicao_campo', 'anexo', 'comentario', 'decisao'
  detalhes TEXT NOT NULL, -- Descrição humana do que mudou ("Alterou status de X para Y", "Atribuiu para Usuário Z")
  criado_em TEXT NOT NULL
);

-- Índices para otimização de consultas
CREATE INDEX IF NOT EXISTS idx_campos_etapa_etapa ON campos_etapa(etapa_id);
CREATE INDEX IF NOT EXISTS idx_chamado_campos_chamado ON chamado_campos_valores(chamado_id);
CREATE INDEX IF NOT EXISTS idx_chamado_anexos_chamado ON chamado_anexos(chamado_id);
CREATE INDEX IF NOT EXISTS idx_historico_chamado_mae ON historico_auditoria(chamado_mae_id);
