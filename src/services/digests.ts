import type { Env } from "../env";
import { addDays, formatDate } from "../dates";
import { rupiah } from "../format";
import { budgetState } from "../finance/budget";
import * as q from "../finance/queries";
import * as rep from "../finance/reports";
import { countDoneOn, listOpenTasks } from "../tasksDb";
import { formatTask, groupTasks, section } from "./taskView";

// 20:30 - review tugas
export async function buildTaskReview(
  env: Env,
  userId: number,
  today: string,
): Promise<string> {
  const [tasks, done] = await Promise.all([
    listOpenTasks(env.DB, userId),
    countDoneOn(env.DB, userId, today),
  ]);
  const g = groupTasks(tasks, today);
  const tomorrow = addDays(today, 1);
  const tomorrowTasks = tasks.filter((t) => t.due_date === tomorrow);
  const pending = g.overdue.length + g.today.length;

  const lines = ["🌙 Review tugas", "", `✅ Selesai hari ini: ${done}`, ""];

  if (pending === 0) lines.push("🎉 Tidak ada tugas yang tertunda hari ini.");
  else
    lines.push(
      ...section("⏰ Terlewat", g.overdue),
      ...section("📅 Belum selesai hari ini", g.today),
    );

  if (tomorrowTasks.length > 0)
    lines.push(
      "",
      `🗓️ Besok (${tomorrowTasks.length})`,
      ...tomorrowTasks.map(formatTask),
    );
  if (pending > 0) lines.push("", "Selesai: /done ID · Tunda: /tunda ID besok");

  return lines.join("\n").trim();
}

// 21:00 - ringkasan keuangan hari ini
export async function buildDailyFinance(
  env: Env,
  userId: number,
  today: string,
): Promise<string> {
  await q.ensureDefaults(env.DB, userId);

  const [rows, accounts, budgets] = await Promise.all([
    q.listByDate(env.DB, userId, today),
    q.listAccounts(env.DB, userId),
    rep.listBudgetsWithSpent(env.DB, userId, today.slice(0, 7)),
  ]);

  const sum = (type: q.TxType) =>
    rows.filter((r) => r.type === type).reduce((s, r) => s + r.amount, 0);
  const income = sum("in");
  const expense = sum("out");
  const liquid = accounts
    .filter((a) => a.type !== "asset")
    .reduce((s, a) => s + a.balance, 0);

  const lines = [`🌙 Ringkasan keuangan ${formatDate(today)}`, ""];

  if (rows.length === 0) {
    lines.push(
      "Belum ada transaksi hari ini. Lupa mencatat? Ketik: out 25k makan siang",
    );
  } else {
    lines.push(
      `📈 Masuk: ${rupiah(income)}`,
      `📉 Keluar: ${rupiah(expense)}`,
      `💵 Net: ${rupiah(income - expense)}`,
      `🧾 ${rows.length} transaksi`,
    );
  }
  lines.push("", `💰 Total kas & bank: ${rupiah(liquid)}`);

  const alerts = budgets
    .map((b) => ({
      b,
      state: budgetState(b.spent, b.monthly_limit, b.alert_pct),
    }))
    .filter((x) => x.state !== "ok")
    .map(({ b, state }) => {
      const pct = Math.round((b.spent / b.monthly_limit) * 100);
      return `${state === "over" ? "🔴" : "🟡"} Budget ${b.category_name} ${pct}% (${rupiah(b.spent)} / ${rupiah(b.monthly_limit)})`;
    });
  if (alerts.length > 0) lines.push("", ...alerts);

  return lines.join("\n");
}
