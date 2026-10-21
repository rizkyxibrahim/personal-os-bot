-- Migration number: 0003 	 2026-10-21T12:03:56.590Z
ALTER TABLE transactions RENAME TO transactions_legacy;
DROP INDEX IF EXISTS idx_transactions_date;

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  type TEXT NOT NULL DEFAULT 'bank' CHECK (type IN ('cash', 'bank', 'ewallet', 'asset')),
  initial_balance INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name)
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  budget_type TEXT CHECK (budget_type IN ('needs', 'wants', 'savings')),
  icon TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name)
);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('in', 'out', 'transfer')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  account_id INTEGER NOT NULL REFERENCES accounts (id),
  to_account_id INTEGER REFERENCES accounts (id),
  category_id INTEGER REFERENCES categories (id),
  note TEXT,
  tx_date TEXT NOT NULL,          -- YYYY-MM-DD, tanggal WIB
  deleted_at TEXT,                -- NULL = aktif, terisi = di recycle bin (UTC)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((type = 'transfer') = (to_account_id IS NOT NULL)),
  CHECK (to_account_id IS NULL OR to_account_id <> account_id)
);

CREATE INDEX idx_tx_user_date ON transactions (user_id, deleted_at, tx_date);
CREATE INDEX idx_tx_account ON transactions (account_id);