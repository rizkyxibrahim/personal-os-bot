export type AccountType = "cash" | "bank" | "ewallet" | "asset";
export type CategoryType = "income" | "expense";
export type BudgetType = "needs" | "wants" | "savings";
export type TxType = "in" | "out" | "transfer";

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  initial_balance: number;
  is_default: number;
}
export interface AccountBalance extends Account {
  balance: number;
}
export interface Category {
  id: number;
  name: string;
  type: CategoryType;
  budget_type: BudgetType | null;
  icon: string | null;
}
export interface TxRow {
  id: number;
  type: TxType;
  amount: number;
  tx_date: string;
  note: string | null;
  account_name: string;
  to_account_name: string | null;
  category_name: string | null;
}
export interface TxBasic {
  id: number;
  type: TxType;
  deleted_at: string | null;
}
export interface NewTx {
  userId: number;
  type: TxType;
  amount: number;
  accountId: number;
  toAccountId: number | null;
  categoryId: number | null;
  note: string | null;
  txDate: string;
  subscriptionId?: number | null;
  debtId?: number | null;
  goalId?: number | null;
}
export interface TxPatch {
  amount?: number;
  categoryId?: number;
  note?: string;
  txDate?: string;
  accountId?: number;
}

const DEFAULT_CATEGORIES: {
  name: string;
  type: CategoryType;
  budget: BudgetType | null;
  icon: string;
}[] = [
  { name: "Makan", type: "expense", budget: "needs", icon: "🍽️" },
  { name: "Transport", type: "expense", budget: "needs", icon: "🚗" },
  { name: "Tagihan", type: "expense", budget: "needs", icon: "🧾" },
  { name: "Kesehatan", type: "expense", budget: "needs", icon: "💊" },
  { name: "Pendidikan", type: "expense", budget: "needs", icon: "📚" },
  { name: "Belanja", type: "expense", budget: "wants", icon: "🛍️" },
  { name: "Hiburan", type: "expense", budget: "wants", icon: "🎬" },
  { name: "Tabungan", type: "expense", budget: "savings", icon: "💰" },
  { name: "Lainnya", type: "expense", budget: "wants", icon: "📦" },
  { name: "Gaji", type: "income", budget: null, icon: "💼" },
  { name: "Bonus", type: "income", budget: null, icon: "🎁" },
  { name: "Freelance", type: "income", budget: null, icon: "💻" },
  { name: "Lain-lain", type: "income", budget: null, icon: "➕" },
];

// Pertama kali dipakai: buat akun Cash dan kategori bawaan
export async function ensureDefaults(
  db: D1Database,
  userId: number,
): Promise<void> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM accounts WHERE user_id = ?1")
    .bind(userId)
    .first<{ n: number }>();
  if (row && row.n > 0) return;

  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO accounts (user_id, name, type, is_default) VALUES (?1, 'Cash', 'cash', 1)",
      )
      .bind(userId),
    ...DEFAULT_CATEGORIES.map((c) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO categories (user_id, name, type, budget_type, icon) VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(userId, c.name, c.type, c.budget, c.icon),
    ),
  ]);
}

// ---------- Akun ----------

export async function listAccounts(
  db: D1Database,
  userId: number,
): Promise<AccountBalance[]> {
  const { results } = await db
    .prepare(
      `SELECT a.id, a.name, a.type, a.initial_balance, a.is_default,
              a.initial_balance
              + COALESCE((SELECT SUM(t.amount) FROM transactions t
                          WHERE t.user_id = a.user_id AND t.deleted_at IS NULL
                            AND ((t.type = 'in' AND t.account_id = a.id)
                              OR (t.type = 'transfer' AND t.to_account_id = a.id))), 0)
              - COALESCE((SELECT SUM(t.amount) FROM transactions t
                          WHERE t.user_id = a.user_id AND t.deleted_at IS NULL
                            AND t.type IN ('out', 'transfer') AND t.account_id = a.id), 0) AS balance
       FROM accounts a
       WHERE a.user_id = ?1
       ORDER BY a.is_default DESC, a.name`,
    )
    .bind(userId)
    .all<AccountBalance>();
  return results;
}

export async function findAccount(
  db: D1Database,
  userId: number,
  name: string,
): Promise<Account | null> {
  return db
    .prepare(
      "SELECT id, name, type, initial_balance, is_default FROM accounts WHERE user_id = ?1 AND name = ?2",
    )
    .bind(userId, name)
    .first<Account>();
}

export async function getDefaultAccount(
  db: D1Database,
  userId: number,
): Promise<Account | null> {
  return db
    .prepare(
      "SELECT id, name, type, initial_balance, is_default FROM accounts WHERE user_id = ?1 ORDER BY is_default DESC, id LIMIT 1",
    )
    .bind(userId)
    .first<Account>();
}

export async function addAccount(
  db: D1Database,
  userId: number,
  name: string,
  type: AccountType,
  initialBalance: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      "INSERT OR IGNORE INTO accounts (user_id, name, type, initial_balance) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(userId, name, type, initialBalance)
    .run();
  return res.meta.changes > 0;
}

export async function setInitialBalance(
  db: D1Database,
  userId: number,
  accountId: number,
  amount: number,
): Promise<void> {
  await db
    .prepare(
      "UPDATE accounts SET initial_balance = ?1 WHERE id = ?2 AND user_id = ?3",
    )
    .bind(amount, accountId, userId)
    .run();
}

// ---------- Kategori ----------

export async function listCategories(
  db: D1Database,
  userId: number,
): Promise<Category[]> {
  const { results } = await db
    .prepare(
      "SELECT id, name, type, budget_type, icon FROM categories WHERE user_id = ?1 ORDER BY type, name",
    )
    .bind(userId)
    .all<Category>();
  return results;
}

export async function findCategory(
  db: D1Database,
  userId: number,
  name: string,
  type: CategoryType,
): Promise<Category | null> {
  return db
    .prepare(
      "SELECT id, name, type, budget_type, icon FROM categories WHERE user_id = ?1 AND name = ?2 AND type = ?3",
    )
    .bind(userId, name, type)
    .first<Category>();
}

export async function addCategory(
  db: D1Database,
  userId: number,
  c: { name: string; type: CategoryType; budgetType: BudgetType | null },
): Promise<boolean> {
  const res = await db
    .prepare(
      "INSERT OR IGNORE INTO categories (user_id, name, type, budget_type) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(userId, c.name, c.type, c.budgetType)
    .run();
  return res.meta.changes > 0;
}

// ---------- Transaksi ----------

export const TX_SELECT = `
  SELECT t.id, t.type, t.amount, t.tx_date, t.note,
         a.name AS account_name, a2.name AS to_account_name, c.name AS category_name
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN accounts a2 ON a2.id = t.to_account_id
  LEFT JOIN categories c ON c.id = t.category_id`;

export async function addTransaction(
  db: D1Database,
  t: NewTx,
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO transactions (user_id, type, amount, account_id, to_account_id, category_id, note, tx_date, subscription_id, debt_id, goal_id)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) RETURNING id`,
    )
    .bind(
      t.userId,
      t.type,
      t.amount,
      t.accountId,
      t.toAccountId,
      t.categoryId,
      t.note,
      t.txDate,
      t.subscriptionId ?? null,
      t.debtId ?? null,
      t.goalId ?? null,
    )
    .first<{ id: number }>();
  return row!.id;
}

export async function listByDate(
  db: D1Database,
  userId: number,
  date: string,
): Promise<TxRow[]> {
  const { results } = await db
    .prepare(
      `${TX_SELECT} WHERE t.user_id = ?1 AND t.tx_date = ?2 AND t.deleted_at IS NULL ORDER BY t.id`,
    )
    .bind(userId, date)
    .all<TxRow>();
  return results;
}

export async function listDeleted(
  db: D1Database,
  userId: number,
): Promise<TxRow[]> {
  const { results } = await db
    .prepare(
      `${TX_SELECT} WHERE t.user_id = ?1 AND t.deleted_at IS NOT NULL ORDER BY t.deleted_at DESC LIMIT 10`,
    )
    .bind(userId)
    .all<TxRow>();
  return results;
}

export async function getTransaction(
  db: D1Database,
  userId: number,
  id: number,
): Promise<TxBasic | null> {
  return db
    .prepare(
      "SELECT id, type, deleted_at FROM transactions WHERE id = ?1 AND user_id = ?2",
    )
    .bind(id, userId)
    .first<TxBasic>();
}

export async function softDelete(
  db: D1Database,
  userId: number,
  id: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE transactions SET deleted_at = datetime('now') WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL",
    )
    .bind(id, userId)
    .run();
  return res.meta.changes > 0;
}

export async function restore(
  db: D1Database,
  userId: number,
  id: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE transactions SET deleted_at = NULL WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NOT NULL",
    )
    .bind(id, userId)
    .run();
  return res.meta.changes > 0;
}

export async function updateTransaction(
  db: D1Database,
  userId: number,
  id: number,
  patch: TxPatch,
): Promise<boolean> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.amount !== undefined) {
    sets.push("amount = ?");
    values.push(patch.amount);
  }
  if (patch.categoryId !== undefined) {
    sets.push("category_id = ?");
    values.push(patch.categoryId);
  }
  if (patch.note !== undefined) {
    sets.push("note = ?");
    values.push(patch.note);
  }
  if (patch.txDate !== undefined) {
    sets.push("tx_date = ?");
    values.push(patch.txDate);
  }
  if (patch.accountId !== undefined) {
    sets.push("account_id = ?");
    values.push(patch.accountId);
  }

  if (sets.length === 0) return false;
  sets.push("updated_at = datetime('now')");

  const res = await db
    .prepare(
      `UPDATE transactions SET ${sets.join(", ")} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    )
    .bind(...values, id, userId)
    .run();
  return res.meta.changes > 0;
}
