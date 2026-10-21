export type Direction = "payable" | "receivable";

export interface Debt {
  id: number;
  direction: Direction;
  counterparty: string;
  principal: number;
  note: string | null;
  due_date: string | null;
  paid: number; // total pembayaran/penerimaan yang masih aktif
}

// Pembayaran: hutang = pengeluaran (out), piutang = penerimaan (in)
const BASE = `
  SELECT d.id, d.direction, d.counterparty, d.principal, d.note, d.due_date,
         COALESCE((SELECT SUM(t.amount) FROM transactions t
                   WHERE t.debt_id = d.id AND t.user_id = d.user_id AND t.deleted_at IS NULL
                     AND t.type = CASE d.direction WHEN 'payable' THEN 'out' ELSE 'in' END), 0) AS paid
  FROM debts d
  WHERE d.user_id = ?1 AND d.active = 1`;

export async function listDebts(
  db: D1Database,
  userId: number,
): Promise<Debt[]> {
  const { results } = await db
    .prepare(`${BASE} ORDER BY d.due_date IS NULL, d.due_date, d.id`)
    .bind(userId)
    .all<Debt>();
  return results;
}

export async function getDebt(
  db: D1Database,
  userId: number,
  id: number,
): Promise<Debt | null> {
  return db.prepare(`${BASE} AND d.id = ?2`).bind(userId, id).first<Debt>();
}

export async function addDebt(
  db: D1Database,
  userId: number,
  d: {
    direction: Direction;
    counterparty: string;
    principal: number;
    note: string | null;
    dueDate: string | null;
  },
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO debts (user_id, direction, counterparty, principal, note, due_date)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING id`,
    )
    .bind(userId, d.direction, d.counterparty, d.principal, d.note, d.dueDate)
    .first<{ id: number }>();
  return row!.id;
}

// Menghentikan catatan sekaligus membatalkan transaksi uang awalnya (kalau ada)
export async function deactivateDebt(
  db: D1Database,
  userId: number,
  id: number,
): Promise<boolean> {
  const [res] = await db.batch([
    db
      .prepare(
        "UPDATE debts SET active = 0 WHERE id = ?1 AND user_id = ?2 AND active = 1",
      )
      .bind(id, userId),
    db
      .prepare(
        "UPDATE transactions SET deleted_at = datetime('now') WHERE debt_id = ?1 AND user_id = ?2 AND deleted_at IS NULL",
      )
      .bind(id, userId),
  ]);
  return res.meta.changes > 0;
}
