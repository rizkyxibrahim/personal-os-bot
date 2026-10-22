-- Migration number: 0011 	 2026-10-21T21:11:02.528Z
CREATE TABLE gmail_accounts (
  user_id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  connected_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);