import { InputFile, type Bot } from "grammy";
import type { Env } from "../env";
import { formatDate, formatMonth, parseMonthArg, todayJakarta } from "../dates";
import * as q from "../finance/queries";
import * as rep from "../finance/reports";
import { txLine } from "./finance";
import { buildRekap } from "../services/rekap";

const TYPE_LABEL = {
  in: "masuk",
  out: "keluar",
  transfer: "transfer",
} as const;
const USAGE_MONTH = "Bulan tidak valid. Contoh: lalu, 09/26, 09/2026, 2026-09";

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

    return ctx.reply(await buildRekap(db, userId, month));
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
