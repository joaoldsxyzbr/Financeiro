-- Banco D1 exclusivo financeiro: 66379719-dc22-4e1f-9645-ae5a52ff43af
-- Exatamente cinco colunas. SQLite oferece rowid implícito para editar/excluir.
-- Mes/ano: YYYY-MM. Valor em centavos com sinal: receita +, despesa -.
CREATE TABLE IF NOT EXISTS registros (
  data TEXT NOT NULL CHECK (length(data)=7 AND data GLOB '[12][0-9][0-9][0-9]-[01][0-9]' AND CAST(substr(data,6,2) AS INTEGER) BETWEEN 1 AND 12),
  descricao TEXT NOT NULL CHECK (length(trim(descricao)) BETWEEN 1 AND 100),
  valor INTEGER NOT NULL CHECK (valor BETWEEN -100000000000 AND 100000000000 AND valor != 0),
  categoria TEXT NOT NULL CHECK (length(trim(categoria)) BETWEEN 1 AND 40),
  status TEXT NOT NULL CHECK (status IN ('pendente','pago'))
);
CREATE INDEX IF NOT EXISTS idx_registros_data ON registros(data);
CREATE INDEX IF NOT EXISTS idx_registros_status_data ON registros(status,data);
