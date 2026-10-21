import { formatDue } from "../dates";
import type { Task } from "../tasksDb";

const PRIORITY_ICON = { high: "🔴", normal: "🟡", low: "🟢" } as const;

export function formatTask(t: Task): string {
  const parts = [`#${t.id} ${PRIORITY_ICON[t.priority]} ${t.title}`];
  if (t.category) parts.push(`#${t.category}`);
  if (t.due_date) parts.push(`(${formatDue(t.due_date)})`);
  return parts.join(" ");
}

export function groupTasks(tasks: Task[], today: string) {
  return {
    overdue: tasks.filter((t) => t.due_date !== null && t.due_date < today),
    today: tasks.filter((t) => t.due_date === today),
    upcoming: tasks.filter((t) => t.due_date !== null && t.due_date > today),
    noDate: tasks.filter((t) => t.due_date === null),
  };
}

export function section(title: string, tasks: Task[]): string[] {
  return tasks.length > 0 ? [title, ...tasks.map(formatTask), ""] : [];
}
