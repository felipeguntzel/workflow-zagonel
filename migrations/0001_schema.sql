CREATE TABLE empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL
);

CREATE TABLE setores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  centro_custo TEXT,
  prazo_padrao_dias INTEGER NOT NULL DEFAULT 5
);

CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  setor_id INTEGER NOT NULL REFERENCES setores(id)
);

CREATE TABLE status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE
);

CREATE TABLE fluxo_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL
);

CREATE TABLE etapas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fluxo_template_id INTEGER NOT NULL REFERENCES fluxo_templates(id),
  nome TEXT NOT NULL,
  setor_id INTEGER NOT NULL REFERENCES setores(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('aprovacao','tarefa')),
  eh_inicial INTEGER NOT NULL DEFAULT 0,
  etapa_proxima_id INTEGER REFERENCES etapas(id),
  etapa_proxima_vinculo TEXT CHECK (etapa_proxima_vinculo IN ('mae','pai'))
);

CREATE TABLE acoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etapa_id INTEGER NOT NULL REFERENCES etapas(id),
  rotulo TEXT NOT NULL,
  setor_destino_id INTEGER NOT NULL REFERENCES setores(id),
  vinculo TEXT NOT NULL CHECK (vinculo IN ('mae','pai')),
  prerequisito_acao_id INTEGER REFERENCES acoes(id)
);

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
  data_finalizacao TEXT
);

CREATE TABLE comentarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chamado_id INTEGER NOT NULL REFERENCES chamados(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  data TEXT NOT NULL,
  texto TEXT NOT NULL,
  eh_justificativa INTEGER NOT NULL DEFAULT 0
);
-- usuario_id is NULL for system-generated comments (e.g. cascading deadline
-- adjustments) — the frontend renders a NULL author as "Sistema".

CREATE TABLE apontamentos_horas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chamado_id INTEGER NOT NULL REFERENCES chamados(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  data TEXT NOT NULL,
  horas REAL NOT NULL,
  observacao TEXT
);
