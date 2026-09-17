-- Migração 0011: Adição de e-mail e telefone aos usuários para comunicação e recuperação de senha
ALTER TABLE usuarios ADD COLUMN email TEXT;
ALTER TABLE usuarios ADD COLUMN telefone TEXT;
