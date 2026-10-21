-- Migration number: 0010 	 2026-10-21T13:59:38.683Z
CREATE TABLE feed_cache (
  feed TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  items TEXT NOT NULL
);