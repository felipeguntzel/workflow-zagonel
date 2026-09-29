-- Migration 0028: Encadeamento de Engenharia de Produto e Engenharia de Processos
-- 1. Cria a etapa para a Engenharia de Produto no fluxo Produto Derivado (fluxo_template_id = 1)
INSERT OR IGNORE INTO etapas (id, fluxo_template_id, nome, setor_id, tipo, eh_inicial, etapa_proxima_id, etapa_proxima_vinculo)
SELECT 6, 1, 'Criar Produto / Ficha Técnica', 1, 'aprovacao', 0, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM etapas WHERE id = 6);

-- 2. Atualiza a ação 'Criar Produto/ Ficha' da etapa de Desenvolvimento (etapa 3) para criar a tarefa da Engenharia de Produto (etapa 6)
UPDATE acoes
SET setor_destino_id = 1,
    etapa_destino_id = 6,
    etapas_destino_ids = '[6]'
WHERE id = 1;

-- 3. Move as ações de criação de Roteiro de Produção e IT para a etapa da Engenharia de Produto (etapa 6),
-- permitindo que a Engenharia de Produto decida se deseja abrir tarefas para a Engenharia de Processos (setor 3)
UPDATE acoes
SET etapa_id = 6,
    rotulo = 'Desenvolver/Atualizar Roteiro de Produção',
    setor_destino_id = 3,
    etapa_destino_id = 4,
    etapas_destino_ids = '[4]',
    prerequisito_acao_id = NULL
WHERE id = 4;

UPDATE acoes
SET etapa_id = 6,
    rotulo = 'Desenvolver/Atualizar IT',
    setor_destino_id = 3,
    etapa_destino_id = 5,
    etapas_destino_ids = '[5]',
    prerequisito_acao_id = NULL
WHERE id = 5;

-- Caso não existam os registros com id 4 e 5, insere na etapa 6
INSERT OR IGNORE INTO acoes (id, etapa_id, rotulo, setor_destino_id, vinculo, etapa_destino_id, etapas_destino_ids)
SELECT 4, 6, 'Desenvolver/Atualizar Roteiro de Produção', 3, 'mae', 4, '[4]'
WHERE NOT EXISTS (SELECT 1 FROM acoes WHERE id = 4);

INSERT OR IGNORE INTO acoes (id, etapa_id, rotulo, setor_destino_id, vinculo, etapa_destino_id, etapas_destino_ids)
SELECT 5, 6, 'Desenvolver/Atualizar IT', 3, 'mae', 5, '[5]'
WHERE NOT EXISTS (SELECT 1 FROM acoes WHERE id = 5);
