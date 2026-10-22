export interface User {
  user_id: number;
  name: string;
  role: "owner" | "member";
  status: "pending" | "active" | "suspended";
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

// Pemilik selalu aktif. Namanya diperbarui setiap kali, supaya sapaan ikut nama Telegram terbaru
export async function ensureOwner(
  db: D1Database,
  id: number,
  name: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (user_id, name, role, status, consent_at) VALUES (?1, ?2, 'owner', 'active', datetime('now'))
       ON CONFLICT (user_id) DO UPDATE SET name = excluded.name, role = 'owner', status = 'active'`,
    )
    .bind(id, name)
    .run();
}

export async function registerPending(
  db: D1Database,
  id: number,
  name: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO users (user_id, name, role, status, consent_at) VALUES (?1, ?2, 'member', 'pending', datetime('now')) ON CONFLICT (user_id) DO NOTHING",
    )
    .bind(id, name)
    .run();
}

// true kalau benar-benar disetujui sekarang (bukan sudah diproses sebelumnya)
export async function approve(db: D1Database, id: number): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE users SET status = 'active' WHERE user_id = ?1 AND status = 'pending'",
    )
    .bind(id)
    .run();
  return res.meta.changes > 0;
}

export async function reject(db: D1Database, id: number): Promise<void> {
  await db
    .prepare("DELETE FROM users WHERE user_id = ?1 AND status = 'pending'")
    .bind(id)
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

export async function setLocation(
  db: D1Database,
  id: number,
  lat: number,
  lon: number,
): Promise<void> {
  await db
    .prepare("UPDATE users SET lat = ?2, lon = ?3 WHERE user_id = ?1")
    .bind(id, lat, lon)
    .run();
}

export async function getLocation(
  db: D1Database,
  id: number,
): Promise<{ lat: number | null; lon: number | null } | null> {
  return db
    .prepare("SELECT lat, lon FROM users WHERE user_id = ?1")
    .bind(id)
    .first();
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
