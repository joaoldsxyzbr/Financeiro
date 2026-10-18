-- Executada no D1 remoto em 2026-10-18 SOMENTE após confirmar registros vazio.
-- O novo usuario_id obrigatório relaciona cada lançamento ao usuário proprietário.
-- Esta migração de recriação requer tabela registros vazia. Para bancos com
-- lançamentos existentes, migrar associando cada linha a um usuário antes da troca.
DROP TABLE registros;
CREATE TABLE registros (
  data TEXT NOT NULL CHECK (length(data)=7 AND data GLOB '[12][0-9][0-9][0-9]-[01][0-9]' AND CAST(substr(data,6,2) AS INTEGER) BETWEEN 1 AND 12),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
  descricao TEXT NOT NULL CHECK (length(trim(descricao)) BETWEEN 1 AND 100),
  valor INTEGER NOT NULL CHECK (valor BETWEEN 1 AND 100000000000),
  categoria TEXT NOT NULL CHECK (length(trim(categoria)) BETWEEN 1 AND 40),
  status TEXT NOT NULL CHECK (status IN ('pendente','pago')),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT
);
CREATE INDEX idx_registros_data ON registros(data);
CREATE INDEX idx_registros_status_data ON registros(status,data);
CREATE INDEX idx_registros_usuario_data ON registros(usuario_id,data);
