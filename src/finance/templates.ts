export interface Template {
  id: number;
  shortcut: string;
  type: "in" | "out";
  amount: number;
  account_id: number;
  account_name: string;
  category_id: number | null;
  category_name: string | null;
  note: string | null;
  use_count: number;
}

const TPL_SELECT = `
  SELECT tp.id, tp.shortcut, tp.type, tp.amount, tp.account_id, a.name AS account_name,
         tp.category_id, c.name AS category_name, tp.note, tp.use_count
  FROM templates tp
  JOIN accounts a ON a.id = tp.account_id
  LEFT JOIN categories c ON c.id = tp.category_id`;

export async function listTemplates(
  db: D1Database,
  userId: number,
): Promise<Template[]> {
  const { results } = await db
    .prepare(
      `${TPL_SELECT} WHERE tp.user_id = ?1 ORDER BY tp.use_count DESC, tp.shortcut`,
    )
    .bind(userId)
    .all<Template>();
  return results;
}

export async function findTemplate(
  db: D1Database,
  userId: number,
  shortcut: string,
): Promise<Template | null> {
  return db
    .prepare(`${TPL_SELECT} WHERE tp.user_id = ?1 AND tp.shortcut = ?2`)
    .bind(userId, shortcut)
    .first<Template>();
}

export async function countTemplates(
  db: D1Database,
  userId: number,
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM templates WHERE user_id = ?1")
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function upsertTemplate(
  db: D1Database,
  userId: number,
  t: {
    shortcut: string;
    type: "in" | "out";
    amount: number;
    accountId: number;
    categoryId: number | null;
    note: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO templates (user_id, shortcut, type, amount, account_id, category_id, note)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (user_id, shortcut)
       DO UPDATE SET type = excluded.type, amount = excluded.amount, account_id = excluded.account_id,
                     category_id = excluded.category_id, note = excluded.note`,
    )
    .bind(
      userId,
      t.shortcut,
      t.type,
      t.amount,
      t.accountId,
      t.categoryId,
      t.note,
    )
    .run();
}

export async function deleteTemplate(
  db: D1Database,
  userId: number,
  shortcut: string,
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM templates WHERE user_id = ?1 AND shortcut = ?2")
    .bind(userId, shortcut)
    .run();
  return res.meta.changes > 0;
}

export async function markTemplateUsed(
  db: D1Database,
  userId: number,
  id: number,
): Promise<void> {
  await db
    .prepare(
      "UPDATE templates SET use_count = use_count + 1, last_used_at = datetime('now') WHERE id = ?1 AND user_id = ?2",
    )
    .bind(id, userId)
    .run();
}
