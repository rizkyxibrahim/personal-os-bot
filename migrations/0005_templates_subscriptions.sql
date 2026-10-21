-- Migration number: 0005 	 2026-10-21T12:15:19.259Z
CREATE TABLE templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  shortcut TEXT NOT NULL COLLATE NOCASE,
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  account_id INTEGER NOT NULL REFERENCES accounts (id),
  category_id INTEGER REFERENCES categories (id),
  note TEXT,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, shortcut)
);

CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  bill_day INTEGER NOT NULL CHECK (bill_day BETWEEN 1 AND 31),
  category_id INTEGER REFERENCES categories (id),
  account_id INTEGER NOT NULL REFERENCES accounts (id),
  remind_days INTEGER NOT NULL DEFAULT 3 CHECK (remind_days BETWEEN 0 AND 30),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name)
);

-- Transaksi pembayaran langganan menunjuk ke langganannya
ALTER TABLE transactions ADD COLUMN subscription_id INTEGER REFERENCES subscriptions (id);
CREATE INDEX idx_tx_subscription ON transactions (subscription_id);