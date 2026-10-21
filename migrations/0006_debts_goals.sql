-- Migration number: 0006 	 2026-10-21T12:22:02.714Z
CREATE TABLE debts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('payable', 'receivable')),
  counterparty TEXT NOT NULL COLLATE NOCASE,
  principal INTEGER NOT NULL CHECK (principal > 0),
  note TEXT,
  due_date TEXT,                  -- YYYY-MM-DD
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  target INTEGER NOT NULL CHECK (target > 0),
  start_amount INTEGER NOT NULL DEFAULT 0 CHECK (start_amount >= 0),
  deadline TEXT,                  -- YYYY-MM-DD
  icon TEXT,
  priority TEXT NOT NULL DEFAULT 'med' CHECK (priority IN ('high', 'med', 'low')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name)
);

ALTER TABLE transactions ADD COLUMN debt_id INTEGER REFERENCES debts (id);
ALTER TABLE transactions ADD COLUMN goal_id INTEGER REFERENCES goals (id);
CREATE INDEX idx_tx_debt ON transactions (debt_id);
CREATE INDEX idx_tx_goal ON transactions (goal_id);