import { InputFile, type Bot } from "grammy";
import type { Env } from "../env";
import {
  formatDate,
  formatMonth,
  parseMonthArg,
  prevMonth,
  todayJakarta,
} from "../dates";
import { rupiah } from "../format";
import * as q from "../finance/queries";
import * as rep from "../finance/reports";
import { txLine } from "./finance";

const TYPE_LABEL = {
  in: "masuk",
  out: "keluar",
  transfer: "transfer",
} as const;
const USAGE_MONTH = "Bulan tidak valid. Contoh: lalu, 09/26, 09/2026, 2026-09";

function delta(cur: number, prev: number): string {
  if (prev === 0) return cur === 0 ? "sama" : "bulan sebelumnya kosong";
  const diff = cur - prev;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${rupiah(diff)} (${sign}${Math.round((diff / prev) * 100)}%)`;
}

// Cegah rumus spreadsheet (=, +, -, @) dan rapikan tanda kutip/koma
function csvText(v: string | null): string {
  if (v === null) return "";
  const s = /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function registerReports(bot: Bot, env: Env): void {
  const db = env.DB;

  bot.command("rekap", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    await q.ensureDefaults(db, userId);

    const month = parseMonthArg(ctx.match, todayJakarta());
    if (!month) return ctx.reply(USAGE_MONTH);
    const prev = prevMonth(month);

    const [s, p, byCat, top] = await Promise.all([
      rep.monthSummary(db, userId, month),
      rep.monthSummary(db, userId, prev),
      rep.expenseByCategory(db, userId, month),
      rep.topExpenses(db, userId, month, 5),
    ]);

    if (s.n === 0)
      return ctx.reply(
        `📊 Rekap ${formatMonth(month)}\n\nBelum ada transaksi.`,
      );

    const net = s.income - s.expense;
    const lines = [
      `📊 Rekap ${formatMonth(month)}`,
      "",
      `📈 Pemasukan: ${rupiah(s.income)}`,
      `📉 Pengeluaran: ${rupiah(s.expense)}`,
      `💵 Net: ${rupiah(net)}`,
    ];
    if (s.income > 0)
      lines.push(
        `🏦 Sisa dari pemasukan: ${Math.round((net * 100) / s.income)}%`,
      );

    if (byCat.length > 0) {
      lines.push("", "📂 Pengeluaran per kategori");
      for (const c of byCat.slice(0, 8)) {
        lines.push(
          `${c.name}: ${rupiah(c.total)} (${Math.round((c.total * 100) / s.expense)}%)`,
        );
      }
      if (byCat.length > 8) {
        const rest = byCat.slice(8).reduce((sum, c) => sum + c.total, 0);
        lines.push(`Lainnya (${byCat.length - 8} kategori): ${rupiah(rest)}`);
      }
    }

    if (top.length > 0) {
      lines.push("", "🔝 Pengeluaran terbesar");
      lines.push(...top.map((t) => `${txLine(t)} · ${formatDate(t.tx_date)}`));
    }

    lines.push("", `📆 Dibanding ${formatMonth(prev)}`);
    if (p.n === 0) {
      lines.push("Belum ada data bulan sebelumnya.");
    } else {
      lines.push(
        `Pemasukan: ${delta(s.income, p.income)}`,
        `Pengeluaran: ${delta(s.expense, p.expense)}`,
      );
    }

    return ctx.reply(lines.join("\n"));
  });

  bot.command(["cari", "search"], async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const keyword = ctx.match.trim();
    if (!keyword) return ctx.reply("Format: /cari kata\nContoh: /cari kopi");
    if (keyword.length > 50)
      return ctx.reply("Kata kunci terlalu panjang (maksimal 50 karakter).");

    const rows = await rep.searchTransactions(db, userId, keyword, 16);
    if (rows.length === 0)
      return ctx.reply(`Tidak ada transaksi yang cocok dengan "${keyword}".`);

    const lines = [
      `🔍 Hasil "${keyword}"`,
      "",
      ...rows
        .slice(0, 15)
        .map((t) => `${txLine(t)} · ${formatDate(t.tx_date)}`),
    ];
    if (rows.length > 15)
      lines.push(
        "",
        "Menampilkan 15 terbaru. Persempit kata kunci untuk hasil lebih spesifik.",
      );
    return ctx.reply(lines.join("\n"));
  });

  bot.command("export", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const month = parseMonthArg(ctx.match, todayJakarta());
    if (!month) return ctx.reply(USAGE_MONTH);

    const rows = await rep.listForExport(db, userId, month);
    if (rows.length === 0)
      return ctx.reply(`Tidak ada transaksi di ${formatMonth(month)}.`);

    const csv = [
      "id,tanggal,tipe,nominal,kategori,keterangan,akun,akun_tujuan",
      ...rows.map((r) =>
        [
          r.id,
          r.tx_date,
          TYPE_LABEL[r.type],
          r.amount,
          csvText(r.category_name),
          csvText(r.note),
          csvText(r.account_name),
          csvText(r.to_account_name),
        ].join(","),
      ),
    ].join("\n");

    // BOM supaya Excel membaca UTF-8 dengan benar
    const bytes = new TextEncoder().encode("\uFEFF" + csv);
    return ctx.replyWithDocument(
      new InputFile(bytes, `transaksi-${month}.csv`),
      {
        caption: `📤 ${rows.length} transaksi — ${formatMonth(month)}`,
      },
    );
  });
}
