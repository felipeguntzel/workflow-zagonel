-- Reset de dados para iniciar o uso real em produção. Aplicar SOMENTE
-- com --remote - nunca no D1 local, que mantém os usuários semeados para
-- as demais tarefas deste plano.

DELETE FROM apontamentos_horas;
DELETE FROM comentarios;
UPDATE chamados SET chamado_mae_id = NULL, chamado_pai_id = NULL;
DELETE FROM chamados;

DELETE FROM usuario_grupos WHERE usuario_id IN (
  SELECT id FROM usuarios WHERE login IN ('ana', 'bruno', 'carla', 'diego', 'elisa')
);
DELETE FROM usuarios WHERE login IN ('ana', 'bruno', 'carla', 'diego', 'elisa');

-- login 'felipe', senha inicial '1234felipe' (troca obrigatória no 1º
-- login), admin, setor_id 1 ('Comercial' - irrelevante na prática já
-- que admin ignora o filtro por setor, mas o campo é obrigatório).
-- Hash = SHA-256("1234felipe"), no mesmo formato de functions/_lib/auth.js.
INSERT INTO usuarios (nome, setor_id, login, senha_hash, admin, deve_trocar_senha)
VALUES (
  'Felipe',
  1,
  'felipe',
  '0c60f131d742c3aa3da17c0d065ad49121a9f00c4eeeaf87e48598d85f20e846',
  1,
  1
);
