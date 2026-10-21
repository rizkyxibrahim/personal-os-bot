export type TxType = "in" | "out";

export interface Transaction {
  id: number;
  type: TxType;
  amount: number;
  category: string | null;
  note: string | null;
}

export async function addTransaction(
  db: D1Database,
  t: {
    type: TxType;
    amount: number;
    category: string | null;
    note: string | null;
  },
): Promise<number> {
  const row = await db
    .prepare(
      "INSERT INTO transactions (type, amount, category, note) VALUES (?1, ?2, ?3, ?4) RETURNING id",
    )
    .bind(t.type, t.amount, t.category, t.note)
    .first<{ id: number }>();
  return row!.id;
}

export async function getBalance(
  db: D1Database,
): Promise<{ totalIn: number; totalOut: number }> {
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'in'  THEN amount END), 0) AS total_in,
         COALESCE(SUM(CASE WHEN type = 'out' THEN amount END), 0) AS total_out
       FROM transactions`,
    )
    .first<{ total_in: number; total_out: number }>();
  return { totalIn: row!.total_in, totalOut: row!.total_out };
}

export async function getToday(db: D1Database): Promise<Transaction[]> {
  const { results } = await db
    .prepare(
      `SELECT id, type, amount, category, note
       FROM transactions
       WHERE date(transacted_at, '+7 hours') = date('now', '+7 hours')
       ORDER BY id`,
    )
    .all<Transaction>();
  return results;
}

export async function deleteTransaction(
  db: D1Database,
  id: number,
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM transactions WHERE id = ?1")
    .bind(id)
    .run();
  return res.meta.changes > 0;
}
