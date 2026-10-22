-- Migration number: 0012 	 2026-10-22T05:00:30.501Z
CREATE TABLE users (
  user_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  consent_at TEXT
);

CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  created_by INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  used_by INTEGER,
  used_at TEXT
);