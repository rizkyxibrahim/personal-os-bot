import { monthRange } from "../dates";
import { TX_SELECT, type BudgetType, type TxRow } from "./queries";

export interface BudgetStatus {
  category_id: number;
  category_name: string;
  icon: string | null;
  monthly_limit: number;
  alert_pct: number;
  spent: number;
}
export interface MonthSummary {
  income: number;
  expense: number;
  n: number;
}
export interface CategoryTotal {
  name: string;
  budget_type: BudgetType | null;
  total: number;
}

// ---------- Budget ----------

export async function setBudget(
  db: D1Database,
  userId: number,
  categoryId: number,
  limit: number,
  alertPct: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO budgets (user_id, category_id, monthly_limit, alert_pct)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (user_id, category_id)
       DO UPDATE SET monthly_limit = excluded.monthly_limit, alert_pct = excluded.alert_pct`,
    )
    .bind(userId, categoryId, limit, alertPct)
    .run();
}

export async function deleteBudget(
  db: D1Database,
  userId: number,
  categoryId: number,
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM budgets WHERE user_id = ?1 AND category_id = ?2")
    .bind(userId, categoryId)
    .run();
  return res.meta.changes > 0;
}

export async function listBudgetsWithSpent(
  db: D1Database,
  userId: number,
  month: string,
): Promise<BudgetStatus[]> {
  const { start, end } = monthRange(month);
  const { results } = await db
    .prepare(
      `SELECT b.category_id, c.name AS category_name, c.icon, b.monthly_limit, b.alert_pct,
              COALESCE((SELECT SUM(t.amount) FROM transactions t
                        WHERE t.user_id = b.user_id AND t.category_id = b.category_id
                          AND t.type = 'out' AND t.deleted_at IS NULL
                          AND t.tx_date >= ?2 AND t.tx_date < ?3), 0) AS spent
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
       WHERE b.user_id = ?1
       ORDER BY c.name`,
    )
    .bind(userId, start, end)
    .all<BudgetStatus>();
  return results;
}

// ---------- Laporan ----------

export async function monthSummary(
  db: D1Database,
  userId: number,
  month: string,
): Promise<MonthSummary> {
  const { start, end } = monthRange(month);
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN type = 'in'  THEN amount END), 0) AS income,
              COALESCE(SUM(CASE WHEN type = 'out' THEN amount END), 0) AS expense,
              COUNT(*) AS n
       FROM transactions
       WHERE user_id = ?1 AND deleted_at IS NULL AND type IN ('in', 'out')
         AND tx_date >= ?2 AND tx_date < ?3`,
    )
    .bind(userId, start, end)
    .first<MonthSummary>();
  return row ?? { income: 0, expense: 0, n: 0 };
}

export async function expenseByCategory(
  db: D1Database,
  userId: number,
  month: string,
): Promise<CategoryTotal[]> {
  const { start, end } = monthRange(month);
  const { results } = await db
    .prepare(
      `SELECT COALESCE(c.name, '(tanpa kategori)') AS name, c.budget_type, SUM(t.amount) AS total
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ?1 AND t.type = 'out' AND t.deleted_at IS NULL
         AND t.tx_date >= ?2 AND t.tx_date < ?3
       GROUP BY t.category_id
       ORDER BY total DESC`,
    )
    .bind(userId, start, end)
    .all<CategoryTotal>();
  return results;
}

export async function topExpenses(
  db: D1Database,
  userId: number,
  month: string,
  limit: number,
): Promise<TxRow[]> {
  const { start, end } = monthRange(month);
  const { results } = await db
    .prepare(
      `${TX_SELECT}
       WHERE t.user_id = ?1 AND t.type = 'out' AND t.deleted_at IS NULL
         AND t.tx_date >= ?2 AND t.tx_date < ?3
       ORDER BY t.amount DESC, t.id LIMIT ?4`,
    )
    .bind(userId, start, end, limit)
    .all<TxRow>();
  return results;
}

export async function searchTransactions(
  db: D1Database,
  userId: number,
  keyword: string,
  limit: number,
): Promise<TxRow[]> {
  const pattern = `%${keyword.replace(/[\\%_]/g, "\\$&")}%`;
  const { results } = await db
    .prepare(
      `${TX_SELECT}
       WHERE t.user_id = ?1 AND t.deleted_at IS NULL
         AND (t.note LIKE ?2 ESCAPE '\\' OR c.name LIKE ?2 ESCAPE '\\'
              OR a.name LIKE ?2 ESCAPE '\\' OR CAST(t.amount AS TEXT) LIKE ?2 ESCAPE '\\')
       ORDER BY t.tx_date DESC, t.id DESC LIMIT ?3`,
    )
    .bind(userId, pattern, limit)
    .all<TxRow>();
  return results;
}

export async function listForExport(
  db: D1Database,
  userId: number,
  month: string,
): Promise<TxRow[]> {
  const { start, end } = monthRange(month);
  const { results } = await db
    .prepare(
      `${TX_SELECT}
       WHERE t.user_id = ?1 AND t.deleted_at IS NULL AND t.tx_date >= ?2 AND t.tx_date < ?3
       ORDER BY t.tx_date, t.id`,
    )
    .bind(userId, start, end)
    .all<TxRow>();
  return results;
}
