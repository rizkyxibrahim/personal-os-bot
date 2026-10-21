-- Pencegah pesan terjadwal terkirim dua kali
CREATE TABLE scheduled_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  job TEXT NOT NULL,
  period TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, job, period)
);