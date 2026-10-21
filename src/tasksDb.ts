import type { Priority } from "./taskParse";

export interface Task {
  id: number;
  title: string;
  status: "open" | "done";
  priority: Priority;
  category: string | null;
  due_date: string | null;
}

export async function addTask(
  db: D1Database,
  userId: number,
  t: {
    title: string;
    priority: Priority;
    category: string | null;
    dueDate: string | null;
  },
): Promise<number> {
  const row = await db
    .prepare(
      "INSERT INTO tasks (user_id, title, priority, category, due_date) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id",
    )
    .bind(userId, t.title, t.priority, t.category, t.dueDate)
    .first<{ id: number }>();
  return row!.id;
}

export async function listOpenTasks(
  db: D1Database,
  userId: number,
): Promise<Task[]> {
  const { results } = await db
    .prepare(
      `SELECT id, title, status, priority, category, due_date
       FROM tasks
       WHERE user_id = ?1 AND status = 'open'
       ORDER BY due_date IS NULL, due_date,
                CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
                id`,
    )
    .bind(userId)
    .all<Task>();
  return results;
}

export async function completeTask(
  db: D1Database,
  userId: number,
  id: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE tasks
       SET status = 'done', completed_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?1 AND user_id = ?2 AND status = 'open'`,
    )
    .bind(id, userId)
    .run();
  return res.meta.changes > 0;
}

export async function deleteTask(
  db: D1Database,
  userId: number,
  id: number,
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM tasks WHERE id = ?1 AND user_id = ?2")
    .bind(id, userId)
    .run();
  return res.meta.changes > 0;
}

export async function updateTask(
  db: D1Database,
  userId: number,
  id: number,
  patch: {
    title?: string;
    priority?: Priority;
    category?: string;
    dueDate?: string;
  },
): Promise<boolean> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.title !== undefined) {
    sets.push("title = ?");
    values.push(patch.title);
  }
  if (patch.priority !== undefined) {
    sets.push("priority = ?");
    values.push(patch.priority);
  }
  if (patch.category !== undefined) {
    sets.push("category = ?");
    values.push(patch.category);
  }
  if (patch.dueDate !== undefined) {
    sets.push("due_date = ?");
    values.push(patch.dueDate);
  }

  if (sets.length === 0) return false;
  sets.push("updated_at = datetime('now')");

  const res = await db
    .prepare(
      `UPDATE tasks SET ${sets.join(", ")} WHERE id = ? AND user_id = ? AND status = 'open'`,
    )
    .bind(...values, id, userId)
    .run();
  return res.meta.changes > 0;
}
