-- D1 financeiro, schema já aplicado ao banco remoto.
-- Seis colunas em ordem: data, tipo, descricao, valor, categoria, status.
-- Valor em centavos inteiros positivos. O rowid é implícito.
CREATE TABLE IF NOT EXISTS registros (
  data TEXT NOT NULL CHECK (length(data)=7 AND data GLOB '[12][0-9][0-9][0-9]-[01][0-9]' AND CAST(substr(data,6,2) AS INTEGER) BETWEEN 1 AND 12),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
  descricao TEXT NOT NULL CHECK (length(trim(descricao)) BETWEEN 1 AND 100),
  valor INTEGER NOT NULL CHECK (valor BETWEEN 1 AND 100000000000),
  categoria TEXT NOT NULL CHECK (length(trim(categoria)) BETWEEN 1 AND 40),
  status TEXT NOT NULL CHECK (status IN ('pendente','pago'))
);
CREATE INDEX IF NOT EXISTS idx_registros_data ON registros(data);
CREATE INDEX IF NOT EXISTS idx_registros_status_data ON registros(status,data);
