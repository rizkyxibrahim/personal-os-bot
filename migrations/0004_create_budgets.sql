-- Migration number: 0004 	 2026-10-21T12:08:29.263Z
CREATE TABLE budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories (id),
  monthly_limit INTEGER NOT NULL CHECK (monthly_limit > 0),
  alert_pct INTEGER NOT NULL DEFAULT 80 CHECK (alert_pct BETWEEN 1 AND 100),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, category_id)
);

CREATE INDEX idx_tx_category ON transactions (user_id, category_id, tx_date);