-- Migration number: 0002 	 2026-10-21T12:00:54.046Z
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
  category TEXT,
  due_date TEXT,        -- YYYY-MM-DD, tanggal WIB
  completed_at TEXT,    -- UTC
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tasks_user_status_due ON tasks (user_id, status, due_date);