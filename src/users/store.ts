export interface User {
  user_id: number;
  name: string;
  role: "owner" | "member";
  status: "active" | "suspended";
}

export async function getUser(
  db: D1Database,
  id: number,
): Promise<User | null> {
  return db
    .prepare("SELECT user_id, name, role, status FROM users WHERE user_id = ?1")
    .bind(id)
    .first<User>();
}

// Baris pemilik dibuat sekali, saat pertama kali dipakai
export async function ensureOwner(
  db: D1Database,
  id: number,
  name: string,
): Promise<void> {
  if (await getUser(db, id)) return;
  await db
    .prepare(
      "INSERT INTO users (user_id, name, role, status, consent_at) VALUES (?1, ?2, 'owner', 'active', datetime('now'))",
    )
    .bind(id, name)
    .run();
}

export async function listUsers(db: D1Database): Promise<User[]> {
  const { results } = await db
    .prepare(
      "SELECT user_id, name, role, status FROM users ORDER BY role, joined_at",
    )
    .all<User>();
  return results;
}

export async function listActiveUsers(db: D1Database): Promise<User[]> {
  const { results } = await db
    .prepare(
      "SELECT user_id, name, role, status FROM users WHERE status = 'active' ORDER BY user_id",
    )
    .all<User>();
  return results;
}

// Pemilik tidak bisa dinonaktifkan
export async function setStatus(
  db: D1Database,
  id: number,
  status: "active" | "suspended",
): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE users SET status = ?1 WHERE user_id = ?2 AND role = 'member'",
    )
    .bind(status, id)
    .run();
  return res.meta.changes > 0;
}

export async function createInvite(
  db: D1Database,
  code: string,
  createdBy: number,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO invites (code, created_by, expires_at) VALUES (?1, ?2, datetime('now', '+7 days'))",
    )
    .bind(code, createdBy)
    .run();
}

export type RedeemResult = "ok" | "invalid" | "expired" | "used" | "member";

export async function redeemInvite(
  db: D1Database,
  code: string,
  userId: number,
  name: string,
): Promise<RedeemResult> {
  if (await getUser(db, userId)) return "member";

  const inv = await db
    .prepare(
      "SELECT used_by, expires_at > datetime('now') AS valid FROM invites WHERE code = ?1",
    )
    .bind(code)
    .first<{ used_by: number | null; valid: number }>();
  if (!inv) return "invalid";
  if (inv.used_by !== null) return "used";
  if (inv.valid !== 1) return "expired";

  // Klaim kode dulu. Kalau dua orang mencoba bersamaan, hanya satu yang berhasil
  const claimed = await db
    .prepare(
      "UPDATE invites SET used_by = ?2, used_at = datetime('now') WHERE code = ?1 AND used_by IS NULL",
    )
    .bind(code, userId)
    .run();
  if (claimed.meta.changes === 0) return "used";

  await db
    .prepare(
      "INSERT INTO users (user_id, name, role, status, consent_at) VALUES (?1, ?2, 'member', 'active', datetime('now'))",
    )
    .bind(userId, name)
    .run();
  return "ok";
}

// Menghapus semua data satu pengguna. Urutannya mengikuti ketergantungan antar tabel
export async function deleteUserData(
  db: D1Database,
  id: number,
): Promise<void> {
  const tables = [
    "transactions",
    "budgets",
    "templates",
    "subscriptions",
    "debts",
    "goals",
    "tasks",
    "categories",
    "accounts",
    "scheduled_notifications",
    "conversation_state",
    "gmail_accounts",
    "oauth_states",
  ];
  await db.batch([
    ...tables.map((t) =>
      db.prepare(`DELETE FROM ${t} WHERE user_id = ?1`).bind(id),
    ),
    db
      .prepare("DELETE FROM users WHERE user_id = ?1 AND role = 'member'")
      .bind(id),
  ]);
}
