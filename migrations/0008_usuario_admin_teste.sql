-- Usuário admin para testes no ambiente do Google AI Studio / staging.
-- login: 'admin', senha: 'admin' (PBKDF2 com 100k iterações)
-- deve_trocar_senha = 0 para permitir login imediato sem exigir troca de senha prévia.
INSERT INTO usuarios (nome, login, senha_hash, setor_id, admin, deve_trocar_senha)
VALUES (
  'Administrador',
  'admin',
  'pbkdf2$100000$2fb559ffd99d135603ccbb59855d823d$3ca62301419b3627f26a35f4575dfc604a21af83bad8926aea462890cbb0fe33',
  1,
  1,
  0
)
ON CONFLICT(login) DO UPDATE SET
  senha_hash = excluded.senha_hash,
  admin = 1,
  deve_trocar_senha = 0;
