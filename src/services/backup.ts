import { nowJakarta } from "../dates";

const TABLES = [
  "accounts",
  "categories",
  "transactions",
  "budgets",
  "templates",
  "subscriptions",
  "debts",
  "goals",
  "tasks",
] as const;

export async function countData(
  db: D1Database,
  userId: number,
): Promise<Record<string, number>> {
  const res = await db.batch<{ n: number }>(
    TABLES.map((t) =>
      db
        .prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?1`)
        .bind(userId),
    ),
  );
  const counts: Record<string, number> = {};
  TABLES.forEach((t, i) => {
    counts[t] = res[i].results[0]?.n ?? 0;
  });
  return counts;
}

export async function buildBackup(
  db: D1Database,
  userId: number,
): Promise<{ filename: string; json: string }> {
  const res = await db.batch(
    TABLES.map((t) =>
      db.prepare(`SELECT * FROM ${t} WHERE user_id = ?1`).bind(userId),
    ),
  );
  const tables: Record<string, unknown[]> = {};
  TABLES.forEach((t, i) => {
    tables[t] = res[i].results;
  });

  return {
    filename: `backup-personal-os-${nowJakarta().date}.json`,
    json: JSON.stringify(
      { exportedAt: new Date().toISOString(), userId, tables },
      null,
      2,
    ),
  };
}

// Urutan hapus mengikuti ketergantungan antar tabel
export async function resetData(
  db: D1Database,
  userId: number,
  scope: "transactions" | "all",
): Promise<void> {
  const order =
    scope === "transactions"
      ? ["transactions"]
      : [
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
        ];

  await db.batch(
    order.map((t) =>
      db.prepare(`DELETE FROM ${t} WHERE user_id = ?1`).bind(userId),
    ),
  );
}
