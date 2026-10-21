-- Migration number: 0001 	 2026-10-21T11:44:42.753Z
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  category TEXT,
  note TEXT,
  transacted_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
