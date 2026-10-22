-- Migration number: 0013 	 2026-10-22T06:28:20.858Z
CREATE TABLE users_new (
  user_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  consent_at TEXT,
  lat REAL,
  lon REAL
);

INSERT INTO users_new (user_id, name, role, status, joined_at, consent_at)
  SELECT user_id, name, role, status, joined_at, consent_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
DROP TABLE IF EXISTS invites;