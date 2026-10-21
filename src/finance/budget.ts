import { rupiah } from "../format";
import { listBudgetsWithSpent } from "./reports";

export type BudgetState = "ok" | "warn" | "over";

export function budgetState(
  spent: number,
  limit: number,
  alertPct: number,
): BudgetState {
  if (spent > limit) return "over";
  if (spent * 100 >= limit * alertPct) return "warn";
  return "ok";
}

// Proyeksi sederhana: rata-rata per hari × jumlah hari dalam bulan
export function forecast(
  spent: number,
  dayOfMonth: number,
  daysInMonth: number,
): number {
  return dayOfMonth <= 0
    ? spent
    : Math.round((spent / dayOfMonth) * daysInMonth);
}

// Dipanggil setelah pengeluaran tersimpan. Mengembalikan teks peringatan, atau null
export async function budgetAlert(
  db: D1Database,
  userId: number,
  categoryId: number | null,
  txDate: string,
): Promise<string | null> {
  if (categoryId === null) return null;

  const budgets = await listBudgetsWithSpent(db, userId, txDate.slice(0, 7));
  const b = budgets.find((x) => x.category_id === categoryId);
  if (!b) return null;

  const state = budgetState(b.spent, b.monthly_limit, b.alert_pct);
  if (state === "ok") return null;

  const pct = Math.round((b.spent / b.monthly_limit) * 100);
  return state === "over"
    ? `🚨 Budget ${b.category_name} terlampaui: ${rupiah(b.spent)} dari ${rupiah(b.monthly_limit)} (${pct}%)`
    : `⚠️ Budget ${b.category_name} sudah ${pct}%: sisa ${rupiah(b.monthly_limit - b.spent)}`;
}
