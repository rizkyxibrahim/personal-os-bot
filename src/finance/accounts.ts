import type { AccountBalance } from "./queries";

export interface AccountInfo extends AccountBalance {
  archived: number;
  tx_count: number;
  sub_active: number;
  sub_total: number;
  tpl_count: number;
}

const INFO = `
  SELECT a.id, a.name, a.type, a.initial_balance, a.is_default, a.archived,
         a.initial_balance
         + COALESCE((SELECT SUM(t.amount) FROM transactions t
                     WHERE t.user_id = a.user_id AND t.deleted_at IS NULL
                       AND ((t.type = 'in' AND t.account_id = a.id)
                         OR (t.type = 'transfer' AND t.to_account_id = a.id))), 0)
         - COALESCE((SELECT SUM(t.amount) FROM transactions t
                     WHERE t.user_id = a.user_id AND t.deleted_at IS NULL
                       AND t.type IN ('out', 'transfer') AND t.account_id = a.id), 0) AS balance,
         (SELECT COUNT(*) FROM transactions t
          WHERE t.user_id = a.user_id AND (t.account_id = a.id OR t.to_account_id = a.id)) AS tx_count,
         (SELECT COUNT(*) FROM subscriptions s
          WHERE s.user_id = a.user_id AND s.account_id = a.id AND s.active = 1) AS sub_active,
         (SELECT COUNT(*) FROM subscriptions s
          WHERE s.user_id = a.user_id AND s.account_id = a.id) AS sub_total,
         (SELECT COUNT(*) FROM templates tp
          WHERE tp.user_id = a.user_id AND tp.account_id = a.id) AS tpl_count
  FROM accounts a
  WHERE a.user_id = ?1`;

export async function getAccountInfo(
  db: D1Database,
  userId: number,
  id: number,
): Promise<AccountInfo | null> {
  return db
    .prepare(`${INFO} AND a.id = ?2`)
    .bind(userId, id)
    .first<AccountInfo>();
}

export async function listArchivedAccounts(
  db: D1Database,
  userId: number,
): Promise<AccountInfo[]> {
  const { results } = await db
    .prepare(`${INFO} AND a.archived = 1 ORDER BY a.name`)
    .bind(userId)
    .all<AccountInfo>();
  return results;
}

export async function isNameTaken(
  db: D1Database,
  userId: number,
  name: string,
  exceptId = 0,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS x FROM accounts WHERE user_id = ?1 AND name = ?2 AND id <> ?3",
    )
    .bind(userId, name, exceptId)
    .first();
  return row !== null;
}

export async function renameAccount(
  db: D1Database,
  userId: number,
  id: number,
  name: string,
): Promise<void> {
  await db
    .prepare("UPDATE accounts SET name = ?1 WHERE id = ?2 AND user_id = ?3")
    .bind(name, id, userId)
    .run();
}

export async function setArchived(
  db: D1Database,
  userId: number,
  id: number,
  archived: boolean,
): Promise<void> {
  await db
    .prepare("UPDATE accounts SET archived = ?1 WHERE id = ?2 AND user_id = ?3")
    .bind(archived ? 1 : 0, id, userId)
    .run();
}

export async function setDefaultAccount(
  db: D1Database,
  userId: number,
  id: number,
): Promise<void> {
  await db
    .prepare(
      "UPDATE accounts SET is_default = CASE WHEN id = ?2 THEN 1 ELSE 0 END WHERE user_id = ?1",
    )
    .bind(userId, id)
    .run();
}

export async function deleteAccount(
  db: D1Database,
  userId: number,
  id: number,
): Promise<void> {
  await db
    .prepare("DELETE FROM accounts WHERE id = ?1 AND user_id = ?2")
    .bind(id, userId)
    .run();
}
