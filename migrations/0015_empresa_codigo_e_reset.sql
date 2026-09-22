-- Migração 0015: Adicionar coluna codigo em empresas e resetar cadastros
-- para início oficial de uso em produção.

PRAGMA defer_foreign_keys = ON;

-- 1. Adicionar coluna codigo na tabela empresas
ALTER TABLE empresas ADD COLUMN codigo TEXT;

-- 2. Limpar chamados e dependências relacionadas
DELETE FROM apontamentos_horas;
DELETE FROM comentarios;
UPDATE chamados SET chamado_mae_id = NULL, chamado_pai_id = NULL;
DELETE FROM chamados;

-- Limpar fluxos e ações (usuário criará os modelos manualmente pelo app)
DELETE FROM acoes;
DELETE FROM etapas;
DELETE FROM fluxo_templates;

-- Limpar permissões e grupos
DELETE FROM usuario_grupos;
DELETE FROM permissoes;
DELETE FROM grupos_permissao;

-- Limpar histórico de segurança e auditoria
DELETE FROM recuperacao_senha;
DELETE FROM tentativas_login;
DELETE FROM auditoria_sistema;

-- Limpar vínculos de setores com empresas
DELETE FROM setor_empresas;

-- Limpar usuários, setores e empresas anteriores
DELETE FROM usuarios;
DELETE FROM setores;
DELETE FROM empresas;

-- 3. Inserir as 3 empresas solicitadas
INSERT INTO empresas (id, codigo, nome) VALUES (1, '001', 'Zagonel S.A');
INSERT INTO empresas (id, codigo, nome) VALUES (2, '004', 'Zagonel Iluminação');
INSERT INTO empresas (id, codigo, nome) VALUES (3, '008', 'Zagonel Nordeste');

-- 4. Inserir o setor solicitado (Engenharia de Produto, centro de custo 1033)
INSERT INTO setores (id, nome, empresa_id, centro_custo, prazo_padrao_dias)
VALUES (1, 'Engenharia de Produto', 1, '1033', 5);

-- Vincular o setor às 3 empresas
INSERT INTO setor_empresas (setor_id, empresa_id) VALUES (1, 1);
INSERT INTO setor_empresas (setor_id, empresa_id) VALUES (1, 2);
INSERT INTO setor_empresas (setor_id, empresa_id) VALUES (1, 3);

-- 5. Inserir o primeiro usuário: Felipe Guntzel (login: felipe, admin)
-- Senha inicial '1234felipe' (SHA-256 legado aceito e convertido no 1º login)
-- Telefone: 49 999151894
-- Email: engenharia18@zagonel.com.br
INSERT INTO usuarios (id, nome, setor_id, login, email, telefone, senha_hash, admin, deve_trocar_senha)
VALUES (
  1,
  'Felipe Guntzel',
  1,
  'felipe',
  'engenharia18@zagonel.com.br',
  '49 999151894',
  '0c60f131d742c3aa3da17c0d065ad49121a9f00c4eeeaf87e48598d85f20e846',
  1,
  0
);

-- 6. Ajustar sequências de IDs
DELETE FROM sqlite_sequence WHERE name IN (
  'empresas', 'setores', 'usuarios', 'grupos_permissao', 'permissoes',
  'fluxo_templates', 'etapas', 'acoes', 'chamados', 'comentarios',
  'apontamentos_horas', 'auditoria_sistema', 'recuperacao_senha', 'tentativas_login'
);
INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('empresas', 3);
INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('setores', 1);
INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('usuarios', 1);
