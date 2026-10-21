import { monthRange } from "../dates";

export interface Subscription {
  id: number;
  name: string;
  amount: number;
  bill_day: number;
  remind_days: number;
  account_id: number;
  account_name: string;
  category_id: number | null;
  category_name: string | null;
  paid: number; // 1 = sudah ada transaksi pembayaran (aktif) di bulan itu
}

const BASE = `
  SELECT s.id, s.name, s.amount, s.bill_day, s.remind_days, s.account_id, a.name AS account_name,
         s.category_id, c.name AS category_name,
         EXISTS (SELECT 1 FROM transactions t
                 WHERE t.subscription_id = s.id AND t.user_id = s.user_id AND t.deleted_at IS NULL
                   AND t.tx_date >= ?2 AND t.tx_date < ?3) AS paid
  FROM subscriptions s
  JOIN accounts a ON a.id = s.account_id
  LEFT JOIN categories c ON c.id = s.category_id
  WHERE s.user_id = ?1 AND s.active = 1`;

export async function listSubscriptions(
  db: D1Database,
  userId: number,
  month: string,
): Promise<Subscription[]> {
  const { start, end } = monthRange(month);
  const { results } = await db
    .prepare(`${BASE} ORDER BY s.bill_day, s.name`)
    .bind(userId, start, end)
    .all<Subscription>();
  return results;
}

export async function getSubscription(
  db: D1Database,
  userId: number,
  id: number,
  month: string,
): Promise<Subscription | null> {
  const { start, end } = monthRange(month);
  return db
    .prepare(`${BASE} AND s.id = ?4`)
    .bind(userId, start, end, id)
    .first<Subscription>();
}

// Nama yang sama = memperbarui (sekaligus mengaktifkan lagi kalau pernah dihentikan)
export async function upsertSubscription(
  db: D1Database,
  userId: number,
  s: {
    name: string;
    amount: number;
    billDay: number;
    categoryId: number | null;
    accountId: number;
    remindDays: number;
  },
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO subscriptions (user_id, name, amount, bill_day, category_id, account_id, remind_days, active)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)
       ON CONFLICT (user_id, name)
       DO UPDATE SET amount = excluded.amount, bill_day = excluded.bill_day, category_id = excluded.category_id,
                     account_id = excluded.account_id, remind_days = excluded.remind_days, active = 1
       RETURNING id`,
    )
    .bind(
      userId,
      s.name,
      s.amount,
      s.billDay,
      s.categoryId,
      s.accountId,
      s.remindDays,
    )
    .first<{ id: number }>();
  return row!.id;
}

export async function deactivateSubscription(
  db: D1Database,
  userId: number,
  id: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE subscriptions SET active = 0 WHERE id = ?1 AND user_id = ?2 AND active = 1",
    )
    .bind(id, userId)
    .run();
  return res.meta.changes > 0;
}
