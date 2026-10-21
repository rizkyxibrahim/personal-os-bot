-- Migration number: 0008 	 2026-10-21T12:42:59.306Z
CREATE TABLE conversation_state (
  user_id INTEGER PRIMARY KEY,
  flow TEXT NOT NULL,
  step INTEGER NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  prompt_id INTEGER,                 -- id pesan pertanyaan terakhir (untuk menghapus tombol lamanya)
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);