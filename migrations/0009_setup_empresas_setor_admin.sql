PRAGMA defer_foreign_keys = ON;

-- Criação da tabela de vínculo N:N setor_empresas
CREATE TABLE IF NOT EXISTS setor_empresas (
  setor_id INTEGER NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  PRIMARY KEY (setor_id, empresa_id)
);

-- Garantir as 3 empresas solicitadas
INSERT INTO empresas (id, nome) VALUES (1, 'Zagonel S.A')
ON CONFLICT(id) DO UPDATE SET nome = 'Zagonel S.A';

INSERT INTO empresas (id, nome) VALUES (2, 'Zagonel Iluminação')
ON CONFLICT(id) DO UPDATE SET nome = 'Zagonel Iluminação';

INSERT INTO empresas (id, nome) VALUES (3, 'Zagonel Nordeste')
ON CONFLICT(id) DO UPDATE SET nome = 'Zagonel Nordeste';

-- Atualizar ou inserir setor 1 como Engenharia de Produto, CC 1033
INSERT INTO setores (id, nome, empresa_id, centro_custo, prazo_padrao_dias)
VALUES (1, 'Engenharia de Produto', 1, '1033', 5)
ON CONFLICT(id) DO UPDATE SET
  nome = 'Engenharia de Produto',
  empresa_id = 1,
  centro_custo = '1033',
  prazo_padrao_dias = 5;

-- Vincular usuarios existentes ao setor 1 antes de remover outros setores
UPDATE usuarios SET setor_id = 1;

-- Limpar outros setores residuais
DELETE FROM setores WHERE id > 1;

-- Vincular setor 1 às 3 empresas
DELETE FROM setor_empresas WHERE setor_id = 1;
INSERT OR IGNORE INTO setor_empresas (setor_id, empresa_id) VALUES (1, 1);
INSERT OR IGNORE INTO setor_empresas (setor_id, empresa_id) VALUES (1, 2);
INSERT OR IGNORE INTO setor_empresas (setor_id, empresa_id) VALUES (1, 3);

-- Garantir usuário administrador com ID = 1
DELETE FROM usuario_grupos WHERE usuario_id IN (SELECT id FROM usuarios WHERE id = 1 OR login = 'admin');
DELETE FROM usuarios WHERE id = 1 OR login = 'admin';

INSERT INTO usuarios (id, nome, login, senha_hash, setor_id, admin, deve_trocar_senha)
VALUES (
  1,
  'Administrador',
  'admin',
  'pbkdf2$100000$2fb559ffd99d135603ccbb59855d823d$3ca62301419b3627f26a35f4575dfc604a21af83bad8926aea462890cbb0fe33',
  1,
  1,
  0
);

-- Limpar quaisquer grupos e fluxos para criação manual pelo usuário
DELETE FROM usuario_grupos;
DELETE FROM permissoes;
DELETE FROM grupos_permissao;
DELETE FROM acoes;
DELETE FROM etapas;
DELETE FROM chamados;
DELETE FROM fluxo_templates;

-- Atualizar sequências em sqlite_sequence
UPDATE sqlite_sequence SET seq = 3 WHERE name = 'empresas';
UPDATE sqlite_sequence SET seq = 1 WHERE name = 'setores';
UPDATE sqlite_sequence SET seq = 1 WHERE name = 'usuarios';
UPDATE sqlite_sequence SET seq = 0 WHERE name = 'grupos_permissao';
UPDATE sqlite_sequence SET seq = 0 WHERE name = 'permissoes';
UPDATE sqlite_sequence SET seq = 0 WHERE name = 'fluxo_templates';
UPDATE sqlite_sequence SET seq = 0 WHERE name = 'etapas';
UPDATE sqlite_sequence SET seq = 0 WHERE name = 'acoes';
UPDATE sqlite_sequence SET seq = 0 WHERE name = 'chamados';
