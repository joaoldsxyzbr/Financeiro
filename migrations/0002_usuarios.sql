-- D1 exclusivo Financeiro: 66379719-dc22-4e1f-9645-ae5a52ff43af
-- Tabela usuarios já criada no banco remoto em 2026-10-18.
-- Senhas devem ser transformadas em hash seguro e salgado pelo backend,
-- nunca armazenadas como texto puro.
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 100),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK (length(email) BETWEEN 3 AND 254 AND instr(email, '@') > 1 AND email = trim(email)),
  senha_hash TEXT NOT NULL CHECK (length(senha_hash) BETWEEN 50 AND 255),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
