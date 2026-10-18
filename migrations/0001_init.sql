-- D1 exclusivo do Financeiro. Não executar em outro banco.
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY NOT NULL,
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 100),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 40),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 100000000000),
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid', 'pending')),
  notes TEXT NOT NULL DEFAULT '',
  installment_group TEXT,
  installment_number INTEGER,
  installment_total INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (installment_group IS NULL AND installment_number IS NULL AND installment_total IS NULL)
    OR (installment_group IS NOT NULL AND installment_number BETWEEN 1 AND installment_total AND installment_total BETWEEN 2 AND 24)
  )
);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);
CREATE INDEX IF NOT EXISTS idx_transactions_status_date ON transactions (status, date);
CREATE INDEX IF NOT EXISTS idx_transactions_installment_group ON transactions (installment_group);
