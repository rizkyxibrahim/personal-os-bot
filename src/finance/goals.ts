export type Priority = "high" | "med" | "low";

export interface Goal {
  id: number;
  name: string;
  target: number;
  start_amount: number;
  deadline: string | null;
  icon: string | null;
  priority: Priority;
  saved: number; // start_amount + setoran aktif
}

export interface Contribution {
  id: number;
  tx_date: string;
  amount: number;
  account_name: string;
}

const BASE = `
  SELECT g.id, g.name, g.target, g.start_amount, g.deadline, g.icon, g.priority,
         g.start_amount + COALESCE((SELECT SUM(t.amount) FROM transactions t
                                    WHERE t.goal_id = g.id AND t.user_id = g.user_id
                                      AND t.type = 'out' AND t.deleted_at IS NULL), 0) AS saved
  FROM goals g
  WHERE g.user_id = ?1 AND g.active = 1`;

export async function listGoals(
  db: D1Database,
  userId: number,
): Promise<Goal[]> {
  const { results } = await db
    .prepare(
      `${BASE} ORDER BY CASE g.priority WHEN 'high' THEN 0 WHEN 'med' THEN 1 ELSE 2 END, g.name`,
    )
    .bind(userId)
    .all<Goal>();
  return results;
}

export async function getGoal(
  db: D1Database,
  userId: number,
  id: number,
): Promise<Goal | null> {
  return db.prepare(`${BASE} AND g.id = ?2`).bind(userId, id).first<Goal>();
}

// Nama yang sama = memperbarui (sekaligus mengaktifkan lagi)
export async function upsertGoal(
  db: D1Database,
  userId: number,
  g: {
    name: string;
    target: number;
    startAmount: number;
    deadline: string | null;
    icon: string | null;
    priority: Priority;
  },
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO goals (user_id, name, target, start_amount, deadline, icon, priority, active)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)
       ON CONFLICT (user_id, name)
       DO UPDATE SET target = excluded.target, start_amount = excluded.start_amount, deadline = excluded.deadline,
                     icon = excluded.icon, priority = excluded.priority, active = 1
       RETURNING id`,
    )
    .bind(
      userId,
      g.name,
      g.target,
      g.startAmount,
      g.deadline,
      g.icon,
      g.priority,
    )
    .first<{ id: number }>();
  return row!.id;
}

export async function deactivateGoal(
  db: D1Database,
  userId: number,
  id: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE goals SET active = 0 WHERE id = ?1 AND user_id = ?2 AND active = 1",
    )
    .bind(id, userId)
    .run();
  return res.meta.changes > 0;
}

export async function recentContributions(
  db: D1Database,
  userId: number,
  goalId: number,
  limit: number,
): Promise<Contribution[]> {
  const { results } = await db
    .prepare(
      `SELECT t.id, t.tx_date, t.amount, a.name AS account_name
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       WHERE t.goal_id = ?1 AND t.user_id = ?2 AND t.deleted_at IS NULL
       ORDER BY t.tx_date DESC, t.id DESC LIMIT ?3`,
    )
    .bind(goalId, userId, limit)
    .all<Contribution>();
  return results;
}

// ---------- Hitungan murni ----------

export function progressBar(pct: number): string {
  const filled = Math.max(0, Math.min(10, Math.floor(pct / 10)));
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

// Sisa target dibagi jumlah bulan menuju deadline (30 hari = 1 bulan, dibulatkan ke atas)
export function neededPerMonth(remaining: number, daysLeft: number): number {
  const months = Math.max(1, Math.ceil(daysLeft / 30));
  return Math.ceil(remaining / months);
}
