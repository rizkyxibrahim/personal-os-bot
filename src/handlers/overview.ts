import type { Bot } from "grammy";
import type { Env } from "../env";
import { formatMonth, prevMonth, todayJakarta } from "../dates";
import { rupiah } from "../format";
import { budgetState } from "../finance/budget";
import * as debts from "../finance/debts";
import { computeHealth } from "../finance/health";
import * as q from "../finance/queries";
import * as rep from "../finance/reports";

export function registerOverview(bot: Bot, env: Env): void {
  const db = env.DB;

  bot.command("overview", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    await q.ensureDefaults(db, userId);

    const month = todayJakarta().slice(0, 7);
    const m1 = prevMonth(month);
    const m2 = prevMonth(m1);
    const m3 = prevMonth(m2);

    const [accounts, debtList, summary, budgets, s1, s2, s3] =
      await Promise.all([
        q.listAccounts(db, userId),
        debts.listDebts(db, userId),
        rep.monthSummary(db, userId, month),
        rep.listBudgetsWithSpent(db, userId, month),
        rep.monthSummary(db, userId, m1),
        rep.monthSummary(db, userId, m2),
        rep.monthSummary(db, userId, m3),
      ]);

    // Kekayaan bersih = kas & bank + aset + piutang - hutang
    const sumBalance = (list: q.AccountBalance[]) =>
      list.reduce((s, a) => s + a.balance, 0);
    const liquid = sumBalance(accounts.filter((a) => a.type !== "asset"));
    const assets = sumBalance(accounts.filter((a) => a.type === "asset"));

    const remaining = (d: debts.Debt) => Math.max(0, d.principal - d.paid);
    const receivable = debtList
      .filter((d) => d.direction === "receivable")
      .reduce((s, d) => s + remaining(d), 0);
    const payable = debtList
      .filter((d) => d.direction === "payable")
      .reduce((s, d) => s + remaining(d), 0);
    const netWorth = liquid + assets + receivable - payable;

    // Rata-rata pengeluaran dari maksimal 3 bulan sebelumnya yang punya pengeluaran
    const past = [s1, s2, s3].filter((s) => s.expense > 0);
    const avgMonthlyExpense =
      past.length > 0
        ? Math.round(past.reduce((s, x) => s + x.expense, 0) / past.length)
        : summary.expense;

    const budgetsWithin = budgets.filter(
      (b) => budgetState(b.spent, b.monthly_limit, b.alert_pct) !== "over",
    ).length;

    const health = computeHealth({
      income: summary.income,
      expense: summary.expense,
      budgetsTotal: budgets.length,
      budgetsWithin,
      liquid,
      avgMonthlyExpense,
      debt: payable,
    });

    const net = summary.income - summary.expense;
    const lines = [
      `📊 Overview ${formatMonth(month)}`,
      "",
      `💎 Kekayaan bersih: ${rupiah(netWorth)}`,
      `   Kas & bank: ${rupiah(liquid)}`,
      `   Aset: ${rupiah(assets)}`,
      `   Piutang: ${rupiah(receivable)}`,
      `   Hutang: ${rupiah(-payable)}`,
      "",
      "🗓️ Bulan ini",
      `Masuk ${rupiah(summary.income)} · Keluar ${rupiah(summary.expense)} · Net ${rupiah(net)}`,
      "",
    ];

    if (health) {
      lines.push(
        `🩺 Skor kesehatan: ${health.score}/100 (${health.grade})`,
        ...health.components.map(
          (c) => ` • ${c.label}: ${c.detail} → ${c.points}/${c.max}`,
        ),
        `💡 ${health.tip}`,
      );
    } else {
      lines.push(
        "🩺 Skor kesehatan: belum cukup data (butuh pemasukan, pengeluaran, atau budget bulan ini).",
      );
    }

    lines.push(
      "",
      "Skor ini indikator sederhana, bukan nasihat keuangan. Rumus: /help laporan",
    );
    return ctx.reply(lines.join("\n"));
  });
}
