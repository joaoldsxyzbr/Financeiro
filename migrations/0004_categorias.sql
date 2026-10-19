-- Financeiro: categorias privadas de cada usuário, sem alterar lançamentos.
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL COLLATE NOCASE CHECK(length(trim(nome)) BETWEEN 1 AND 40 AND nome=trim(nome)),
  tipo TEXT NOT NULL CHECK(tipo IN ('entrada','saida')),
  UNIQUE(usuario_id, tipo, nome)
);
CREATE INDEX IF NOT EXISTS idx_categorias_usuario_tipo ON categorias(usuario_id,tipo,nome);
-- Preserva todos os nomes já usados por usuário e tipo, sem reescrever registros.
INSERT OR IGNORE INTO categorias(usuario_id,tipo,nome)
SELECT usuario_id,tipo,trim(categoria) FROM registros
GROUP BY usuario_id,tipo,lower(trim(categoria));
-- Catálogo inicial equivalente aos modelos existentes no formulário.
WITH defaults(tipo,nome) AS (VALUES
('saida','Moradia'),('saida','Alimentação'),('saida','Transporte'),('saida','Saúde'),
('saida','Educação'),('saida','Cartão'),('saida','Assinaturas'),('saida','Lazer'),
('saida','Compras'),('saida','Outros'),('entrada','Salário'),('entrada','Renda extra'),
('entrada','Reembolso'),('entrada','Investimentos'),('entrada','Presentes'),
('entrada','Outros'))
INSERT OR IGNORE INTO categorias(usuario_id,tipo,nome)
SELECT usuarios.id,defaults.tipo,defaults.nome FROM usuarios CROSS JOIN defaults;
