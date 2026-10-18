-- D1 exclusivo Financeiro: 66379719-dc22-4e1f-9645-ae5a52ff43af
-- Esquema atual da tabela usuarios, já aplicado no D1 remoto.
-- Login por nome de usuário, sem email, ativo ou criado_em.
-- senha_hash recebe APENAS hash de senha seguro com sal, gerado pelo backend.
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 100),
  usuario TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK (length(usuario) BETWEEN 3 AND 50 AND usuario = trim(usuario)),
  senha_hash TEXT NOT NULL CHECK (length(senha_hash) BETWEEN 50 AND 255)
);
