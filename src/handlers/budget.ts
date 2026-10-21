import type { Bot } from "grammy";
import type { Env } from "../env";
import {
  daysInMonth,
  formatMonth,
  parseMonthArg,
  todayJakarta,
} from "../dates";
import { rupiah } from "../format";
import { parseAmount } from "../parse";
import { budgetState, forecast } from "../finance/budget";
import * as q from "../finance/queries";
import * as rep from "../finance/reports";

const STATE_ICON = { ok: "🟢", warn: "🟡", over: "🔴" } as const;
const LABEL = { needs: "Needs", wants: "Wants", savings: "Savings" } as const;
const TARGET = { needs: "≤50%", wants: "≤30%", savings: "≥20%" } as const;

const USAGE_BUDGET =
  "Format: /budget Kategori Limit [Alert%]\nContoh: /budget Makan 3jt 80\n(Alert% = batas peringatan, default 80)";

export function registerBudget(bot: Bot, env: Env): void {
  const db = env.DB;

  bot.command("budget", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    await q.ensureDefaults(db, userId);

    const [name, limitRaw, alertRaw] = ctx.match
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const limit = limitRaw ? parseAmount(limitRaw) : null;
    const alertPct = alertRaw === undefined ? 80 : Number(alertRaw);
    if (
      !name ||
      limit === null ||
      !Number.isInteger(alertPct) ||
      alertPct < 1 ||
      alertPct > 100
    ) {
      return ctx.reply(USAGE_BUDGET);
    }

    const category = await q.findCategory(db, userId, name, "expense");
    if (!category)
      return ctx.reply(
        `Kategori pengeluaran "${name}" tidak ada. Lihat /kategori`,
      );

    await rep.setBudget(db, userId, category.id, limit, alertPct);
    return ctx.reply(
      `✅ Budget ${category.name}: ${rupiah(limit)}/bulan, peringatan di ${alertPct}%.\nPantau dengan /cekbudget`,
    );
  });

  bot.command("delbudget", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const name = ctx.match.trim();
    if (!name)
      return ctx.reply("Format: /delbudget Kategori\nContoh: /delbudget Makan");

    const category = await q.findCategory(db, userId, name, "expense");
    if (!category)
      return ctx.reply(
        `Kategori pengeluaran "${name}" tidak ada. Lihat /kategori`,
      );

    const ok = await rep.deleteBudget(db, userId, category.id);
    return ctx.reply(
      ok
        ? `🗑️ Budget ${category.name} dihapus. Transaksinya tetap tercatat.`
        : `Budget ${category.name} belum diatur.`,
    );
  });

  bot.command(["cekbudget", "budgetstatus"], async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    await q.ensureDefaults(db, userId);

    const today = todayJakarta();
    const month = parseMonthArg(ctx.match, today);
    if (!month)
      return ctx.reply(
        "Bulan tidak valid. Contoh: /cekbudget lalu atau /cekbudget 09/26",
      );

    const isCurrent = month === today.slice(0, 7);
    const dayOfMonth = Number(today.slice(8, 10));
    const days = daysInMonth(month);

    const [budgets, summary, byCat] = await Promise.all([
      rep.listBudgetsWithSpent(db, userId, month),
      rep.monthSummary(db, userId, month),
      rep.expenseByCategory(db, userId, month),
    ]);

    const lines = [`💰 Budget ${formatMonth(month)}`, ""];

    if (budgets.length === 0)
      lines.push("Belum ada budget. Atur dengan: /budget Makan 3jt 80");

    for (const b of budgets) {
      const state = budgetState(b.spent, b.monthly_limit, b.alert_pct);
      const pct = Math.round((b.spent / b.monthly_limit) * 100);
      const remaining = b.monthly_limit - b.spent;

      lines.push(
        `${STATE_ICON[state]} ${b.category_name}: ${rupiah(b.spent)} / ${rupiah(b.monthly_limit)} (${pct}%)`,
      );

      let detail =
        remaining >= 0
          ? `   sisa ${rupiah(remaining)}`
          : `   lebih ${rupiah(-remaining)}`;
      if (isCurrent) {
        const f = forecast(b.spent, dayOfMonth, days);
        detail += ` · proyeksi ${rupiah(f)}${f > b.monthly_limit ? " ⚠️" : ""}`;
      }
      lines.push(detail);
    }

    // Ringkasan 50/30/20 dari pengeluaran per jenis budget
    const spentBy = { needs: 0, wants: 0, savings: 0, other: 0 };
    for (const c of byCat) spentBy[c.budget_type ?? "other"] += c.total;

    lines.push("", "📊 Aturan 50/30/20");
    if (summary.income > 0)
      lines.push(`(dari pemasukan ${rupiah(summary.income)})`);
    else
      lines.push(
        "Belum ada pemasukan bulan ini, jadi persentase belum bisa dihitung.",
      );

    for (const key of ["needs", "wants", "savings"] as const) {
      const pct =
        summary.income > 0
          ? ` — ${Math.round((spentBy[key] * 100) / summary.income)}% (target ${TARGET[key]})`
          : "";
      lines.push(`${LABEL[key]}: ${rupiah(spentBy[key])}${pct}`);
    }
    if (spentBy.other > 0) lines.push(`Tanpa jenis: ${rupiah(spentBy.other)}`);
    if (isCurrent)
      lines.push(
        "",
        "Proyeksi = rata-rata per hari × jumlah hari (perkiraan kasar).",
      );

    return ctx.reply(lines.join("\n"));
  });
}
