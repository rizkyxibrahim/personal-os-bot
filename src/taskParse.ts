import { addDays, isValidDate, todayJakarta } from "./dates";

export type Priority = "high" | "normal" | "low";

export interface TaskInput {
  title: string;
  priority?: Priority;
  category?: string;
  dueDate?: string;
}

export type ParseResult =
  | { ok: true; value: TaskInput }
  | { ok: false; error: string };

const PRIORITIES: Record<string, Priority> = {
  tinggi: "high",
  high: "high",
  sedang: "normal",
  normal: "normal",
  rendah: "low",
  low: "low",
};

// "besok", "lusa", "hariini", "25/10", "25/10/2026", "2026-10-25" -> "YYYY-MM-DD"
export function parseDue(raw: string): string | null {
  const s = raw.toLowerCase();
  const today = todayJakarta();

  if (s === "hariini" || s === "hari-ini" || s === "today") return today;
  if (s === "besok") return addDays(today, 1);
  if (s === "lusa") return addDays(today, 2);

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isValidDate(s) ? s : null;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (m) {
    const year = m[3] ?? today.slice(0, 4);
    const date = `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isValidDate(date) ? date : null;
  }

  return null;
}

// "Bayar listrik @besok !tinggi #rumah" -> { title, dueDate, priority, category }
export function parseTaskInput(text: string): ParseResult {
  const words: string[] = [];
  const value: TaskInput = { title: "" };

  for (const token of text.trim().split(/\s+/).filter(Boolean)) {
    if (token.startsWith("@")) {
      const due = parseDue(token.slice(1));
      if (!due) return { ok: false, error: `Tanggal tidak dikenali: ${token}` };
      value.dueDate = due;
    } else if (token.startsWith("!")) {
      const priority = PRIORITIES[token.slice(1).toLowerCase()];
      if (!priority)
        return {
          ok: false,
          error: `Prioritas tidak dikenali: ${token} (pakai !tinggi, !sedang, !rendah)`,
        };
      value.priority = priority;
    } else if (token.startsWith("#") && token.length > 1) {
      value.category = token.slice(1).toLowerCase();
    } else {
      words.push(token);
    }
  }

  value.title = words.join(" ");
  return { ok: true, value };
}
