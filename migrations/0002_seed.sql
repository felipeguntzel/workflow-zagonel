INSERT INTO empresas (id, nome) VALUES
  (1, 'Zagonel S.A'),
  (2, 'Zagonel Iluminação');

INSERT INTO status (id, nome) VALUES
  (1, 'previsto'),
  (2, 'em desenvolvimento'),
  (3, 'finalizado'),
  (4, 'suspenso'),
  (5, 'aguardando terceiros');

INSERT INTO setores (id, nome, empresa_id, centro_custo, prazo_padrao_dias) VALUES
  (1, 'Comercial', 1, 'CC-COM', 3),
  (2, 'Projetos', 1, 'CC-PROJ', 5),
  (3, 'Desenvolvimento de Produto', 1, 'CC-DEV', 10),
  (4, 'Engenharia de Produto', 1, 'CC-ENG', 7),
  (5, 'Marketing', 1, 'CC-MKT', 5);

INSERT INTO usuarios (id, nome, setor_id) VALUES
  (1, 'Ana (Comercial)', 1),
  (2, 'Bruno (Projetos)', 2),
  (3, 'Carla (Desenvolvimento)', 3),
  (4, 'Diego (Engenharia)', 4),
  (5, 'Elisa (Marketing)', 5);

INSERT INTO fluxo_templates (id, nome) VALUES (1, 'Produto Derivado');

INSERT INTO etapas (id, fluxo_template_id, nome, setor_id, tipo, eh_inicial, etapa_proxima_id, etapa_proxima_vinculo) VALUES
  (1, 1, 'Solicitação', 1, 'tarefa', 1, 2, 'pai'),
  (2, 1, 'Avaliação Projetos', 2, 'aprovacao', 0, 3, 'mae'),
  (3, 1, 'Desenvolvimento de Produto', 3, 'aprovacao', 0, NULL, NULL);

INSERT INTO acoes (id, etapa_id, rotulo, setor_destino_id, vinculo, prerequisito_acao_id) VALUES
  (1, 3, 'Criar ficha técnica nova', 4, 'mae', NULL),
  (2, 3, 'Criar material gráfico novo', 4, 'mae', NULL),
  (3, 3, 'Criar embalagem nova (caixa/blister)', 5, 'mae', NULL);
