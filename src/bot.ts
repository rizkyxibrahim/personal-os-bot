import { Bot } from "grammy";
import type { Env } from "./env";
import { parseAmount, splitNote } from "./parse";
import { rupiah } from "./format";
import {
  addTransaction,
  deleteTransaction,
  getBalance,
  getToday,
  type TxType,
} from "./db";

const HELP = [
  "Perintah:",
  "/in 5jt gaji",
  "/out 25000 makan siang #makan",
  "/saldo",
  "/hariini",
  "/hapus 12",
].join("\n");

export function createBot(env: Env): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  // Hanya pemilik yang boleh memakai bot
  bot.use(async (ctx, next) => {
    if (String(ctx.from?.id) !== env.OWNER_ID) return;
    await next();
  });

  bot.command("start", (ctx) => ctx.reply(HELP));

  for (const type of ["in", "out"] as const satisfies readonly TxType[]) {
    bot.command(type, async (ctx) => {
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

  bot.command("saldo", async (ctx) => {
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
      const desc = r.note ?? "(tanpa keterangan)";
      return `#${r.id} ${sign}${rupiah(r.amount)} ${desc}`;
    });
    const total = rows.reduce(
      (sum, r) => sum + (r.type === "in" ? r.amount : -r.amount),
      0,
    );
    return ctx.reply(lines.join("\n") + `\n\nNet hari ini: ${rupiah(total)}`);
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

  bot.on("message:text", (ctx) =>
    ctx.reply("Perintah tidak dikenal. Ketik /start untuk bantuan."),
  );

  return bot;
}
