ALTER TABLE usuarios ADD COLUMN login TEXT;
ALTER TABLE usuarios ADD COLUMN senha_hash TEXT;

UPDATE usuarios SET login = 'ana', senha_hash = '4176647594e2a5ba663e60d7240a308d6562755d22c70d717a704b48448648b3' WHERE id = 1;
UPDATE usuarios SET login = 'bruno', senha_hash = '98981011393a27881e7ffa36c1f5e3d47696b7e42e60f6396eac64f48844ecf3' WHERE id = 2;
UPDATE usuarios SET login = 'carla', senha_hash = 'de61e66d40f4603da5287ce97aea2e24c68de99b7e0ed203529187d855d620b8' WHERE id = 3;
UPDATE usuarios SET login = 'diego', senha_hash = '68d5be8de9b4ea88805927a1f7514680184e54199b7154a3914481c36d780355' WHERE id = 4;
UPDATE usuarios SET login = 'elisa', senha_hash = '85cc0d1ce6356679ca75f5013d7c4c0cb6b17e4a6d5150470f9616a5d1f382c1' WHERE id = 5;

CREATE UNIQUE INDEX idx_usuarios_login ON usuarios(login);
