import type { Bot } from "grammy";
import type { Env } from "../env";
import { parseAmount, splitNote } from "../parse";
import { rupiah } from "../format";
import { addTransaction, deleteTransaction, getBalance, getToday } from "../db";

const TX_COMMANDS = {
  in: ["in", "income", "masuk"],
  out: ["out", "expense", "keluar"],
} as const;

export function registerFinance(bot: Bot, env: Env): void {
  for (const type of ["in", "out"] as const) {
    bot.command([...TX_COMMANDS[type]], async (ctx) => {
      const [amountRaw = "", ...rest] = ctx.match.trim().split(/\s+/);
      const amount = parseAmount(amountRaw);

      if (amount === null) {
        return ctx.reply(
          `Format: /${type} jumlah keterangan #kategori\nContoh: /${type} 25000 makan siang #makan`,
        );
      }

      const { note, category } = splitNote(rest.join(" "));
      const id = await addTransaction(env.DB, { type, amount, category, note });

      const label = type === "in" ? "Pemasukan" : "Pengeluaran";
      const lines = [`✅ ${label} ${rupiah(amount)} dicatat (#${id})`];
      if (note) lines.push(`Ket: ${note}`);
      if (category) lines.push(`Kategori: ${category}`);
      return ctx.reply(lines.join("\n"));
    });
  }

  bot.command(["saldo", "balance"], async (ctx) => {
    const { totalIn, totalOut } = await getBalance(env.DB);
    return ctx.reply(
      `Pemasukan: ${rupiah(totalIn)}\nPengeluaran: ${rupiah(totalOut)}\nSaldo: ${rupiah(totalIn - totalOut)}`,
    );
  });

  bot.command("hariini", async (ctx) => {
    const rows = await getToday(env.DB);
    if (rows.length === 0) return ctx.reply("Belum ada transaksi hari ini.");

    const lines = rows.map((r) => {
      const sign = r.type === "in" ? "+" : "-";
      return `#${r.id} ${sign}${rupiah(r.amount)} ${r.note ?? "(tanpa keterangan)"}`;
    });
    const net = rows.reduce(
      (s, r) => s + (r.type === "in" ? r.amount : -r.amount),
      0,
    );
    return ctx.reply(lines.join("\n") + `\n\nNet hari ini: ${rupiah(net)}`);
  });

  bot.command("hapus", async (ctx) => {
    const id = parseInt(ctx.match.trim(), 10);
    if (!Number.isInteger(id))
      return ctx.reply("Format: /hapus ID\nContoh: /hapus 12");

    const ok = await deleteTransaction(env.DB, id);
    return ctx.reply(
      ok ? `🗑️ Transaksi #${id} dihapus.` : `Transaksi #${id} tidak ditemukan.`,
    );
  });
}
