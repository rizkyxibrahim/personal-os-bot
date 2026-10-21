import type { Bot, CommandContext, Context } from "grammy";
import type { Env } from "../env";
import { daysBetween, formatDate, todayJakarta } from "../dates";
import { rupiah } from "../format";
import { parseAmount } from "../parse";
import { parseFutureDate } from "../finance/entry";
import * as debts from "../finance/debts";
import * as q from "../finance/queries";
import { startFlow } from "../wizard/engine";
import { showDebtPicker } from "../wizard/pickers";
import { payDebt, saveDebt } from "../services/debtOps";

const NAME_RE = /^[\p{L}\p{N}_-]{1,30}$/u;

const USAGE: Record<debts.Direction, string> = {
  payable: [
    "Format: /hutang Nama Nominal [keterangan] [tempo] [Akun]",
    "Contoh: /hutang TemenA 5jt pinjaman motor 31/12 [BCA]",
    "Uang masuk ke akun (saldo bertambah). Untuk utang lama tanpa pergerakan kas: /sethutangawal Nama Nominal ...",
    "Nama satu kata (pakai - untuk spasi).",
  ].join("\n"),
  receivable: [
    "Format: /piutang Nama Nominal [keterangan] [tempo] [Akun]",
    "Contoh: /piutang Budi 1jt dipinjam [Cash]",
    "Uang keluar dari akun (saldo berkurang). Untuk piutang lama tanpa pergerakan kas: /setpiutangawal Nama Nominal ...",
    "Nama satu kata (pakai - untuk spasi).",
  ].join("\n"),
};

const CREATE_COMMANDS: {
  names: string[];
  direction: debts.Direction;
  cashflow: boolean;
}[] = [
  { names: ["hutang"], direction: "payable", cashflow: true },
  {
    names: ["sethutangawal", "hutangawal"],
    direction: "payable",
    cashflow: false,
  },
  { names: ["piutang"], direction: "receivable", cashflow: true },
  {
    names: ["setpiutangawal", "piutangawal"],
    direction: "receivable",
    cashflow: false,
  },
];

// "D3", "d3", "#3", "3" -> 3
function parseDebtId(raw: string): number | null {
  const m = raw.match(/^[dD#]?(\d+)$/);
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

function dueText(d: debts.Debt, today: string): string {
  if (!d.due_date) return "";
  const diff = daysBetween(today, d.due_date);
  if (diff < 0)
    return `🔴 lewat tempo ${-diff} hari (${formatDate(d.due_date)})`;
  if (diff === 0) return "⚠️ jatuh tempo hari ini";
  return `⏳ tempo ${formatDate(d.due_date)} (${diff} hari lagi)`;
}

function debtLine(d: debts.Debt, today: string): string {
  const remaining = d.principal - d.paid;
  const head = `D${d.id} ${d.counterparty} — `;
  if (remaining <= 0) return `${head}✅ lunas (${rupiah(d.principal)})`;

  const pct = Math.round((d.paid * 100) / d.principal);
  const extra = [dueText(d, today), d.note ?? ""].filter(Boolean).join(" · ");
  return `${head}sisa ${rupiah(remaining)} dari ${rupiah(d.principal)} (${pct}% terbayar)${extra ? `\n   ${extra}` : ""}`;
}

async function createDebt(
  ctx: CommandContext<Context>,
  db: D1Database,
  userId: number,
  direction: debts.Direction,
  cashflow: boolean,
) {
  const today = todayJakarta();
  const [name, amountRaw, ...restTokens] = ctx.match
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const principal = amountRaw ? parseAmount(amountRaw) : null;
  if (!name || !NAME_RE.test(name) || principal === null)
    return ctx.reply(USAGE[direction]);

  let rest = restTokens.join(" ");
  let accountName: string | null = null;
  const acc = rest.match(/\[([^\]]+)\]/);
  if (acc) {
    accountName = acc[1].trim();
    rest = rest.replace(acc[0], " ");
  }

  // Token pertama yang berupa tanggal dianggap tempo, sisanya keterangan
  let dueDate: string | null = null;
  const words: string[] = [];
  for (const w of rest.split(/\s+/).filter(Boolean)) {
    const d: string | null =
      dueDate === null && /^\d/.test(w) ? parseFutureDate(w, today) : null;
    if (d) dueDate = d;
    else words.push(w);
  }
  const note = words.join(" ") || null;
  if (note && note.length > 200)
    return ctx.reply("Keterangan terlalu panjang (maksimal 200 karakter).");

  const account = cashflow
    ? accountName
      ? await q.findAccount(db, userId, accountName)
      : await q.getDefaultAccount(db, userId)
    : null;
  if (cashflow && !account)
    return ctx.reply(`⚠️ Akun "${accountName}" tidak ditemukan. Lihat /saldo`);

  return ctx.reply(
    await saveDebt(db, userId, {
      direction,
      counterparty: name,
      principal,
      note,
      dueDate,
      account,
    }),
  );
}

export async function buildDebtList(
  db: D1Database,
  userId: number,
  showAll: boolean,
): Promise<string> {
  const today = todayJakarta();
  const all = await debts.listDebts(db, userId);
  const list = all.filter((d) => showAll || d.principal - d.paid > 0);

  if (list.length === 0) {
    return "Belum ada hutang atau piutang aktif.\nCatat dengan /hutang atau /piutang (tanpa isi, bot akan bertanya).";
  }

  const remainingSum = (items: debts.Debt[]) =>
    items.reduce((s, d) => s + Math.max(0, d.principal - d.paid), 0);
  const payable = list.filter((d) => d.direction === "payable");
  const receivable = list.filter((d) => d.direction === "receivable");

  const lines = ["⚖️ Hutang & piutang"];
  if (payable.length > 0) {
    lines.push(
      "",
      "🔻 Hutang (kamu berutang)",
      ...payable.map((d) => debtLine(d, today)),
      `Total sisa hutang: ${rupiah(remainingSum(payable))}`,
    );
  }
  if (receivable.length > 0) {
    lines.push(
      "",
      "🔺 Piutang (orang berutang padamu)",
      ...receivable.map((d) => debtLine(d, today)),
      `Total sisa piutang: ${rupiah(remainingSum(receivable))}`,
    );
  }
  lines.push(
    "",
    `Posisi bersih (piutang − hutang): ${rupiah(remainingSum(receivable) - remainingSum(payable))}`,
  );
  if (!showAll)
    lines.push("Yang sudah lunas disembunyikan. Lihat semua: /cekhutang semua");

  return lines.join("\n");
}

export function registerDebts(bot: Bot, env: Env): void {
  const db = env.DB;

  for (const c of CREATE_COMMANDS) {
    bot.command(c.names, async (ctx) => {
      const userId = ctx.from?.id;
      if (userId === undefined) return;
      await q.ensureDefaults(db, userId);

      if (c.cashflow && !ctx.match.trim())
        return startFlow(ctx, env, c.direction === "payable" ? "debt" : "recv");
      return createDebt(ctx, db, userId, c.direction, c.cashflow);
    });
  }

  bot.command("cekhutang", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    return ctx.reply(
      await buildDebtList(
        db,
        userId,
        ctx.match.trim().toLowerCase() === "semua",
      ),
    );
  });

  // /bayar untuk hutang, /terima untuk piutang (arah ditentukan oleh jenis catatannya)
  bot.command(["bayar", "terima"], async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    await q.ensureDefaults(db, userId);

    if (!ctx.match.trim()) return showDebtPicker(ctx, env, userId);

    const [idRaw = "", amountRaw = "", ...rest] = ctx.match.trim().split(/\s+/);
    const id = parseDebtId(idRaw);
    if (id === null || !amountRaw) {
      return ctx.reply(
        "Format: /bayar ID Nominal [Akun]\nContoh: /bayar D1 2jt [BCA]\nMelunasi sisa: /bayar D1 lunas\nTanpa isi: pilih dari daftar tombol.",
      );
    }

    const debt = await debts.getDebt(db, userId, id);
    if (!debt)
      return ctx.reply(
        `Catatan aktif D${id} tidak ditemukan. Lihat /cekhutang`,
      );

    const remaining = debt.principal - debt.paid;
    if (remaining <= 0)
      return ctx.reply(`D${id} ${debt.counterparty} sudah lunas.`);

    const amount =
      amountRaw.toLowerCase() === "lunas" ? remaining : parseAmount(amountRaw);
    if (amount === null)
      return ctx.reply(
        "Nominal tidak valid. Contoh: /bayar D1 2jt atau /bayar D1 lunas",
      );
    if (amount > remaining) {
      return ctx.reply(
        `Nominal melebihi sisa (${rupiah(remaining)}). Pakai "lunas" untuk melunasi.`,
      );
    }

    const accountName =
      rest
        .join(" ")
        .replace(/^\[|\]$/g, "")
        .trim() || null;
    const account = accountName
      ? await q.findAccount(db, userId, accountName)
      : await q.getDefaultAccount(db, userId);
    if (!account)
      return ctx.reply(
        `⚠️ Akun "${accountName}" tidak ditemukan. Lihat /saldo`,
      );

    return ctx.reply(await payDebt(db, userId, debt, amount, account));
  });
  bot.command(["deldebt", "hapushutang"], async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const id = parseDebtId(ctx.match.trim());
    if (id === null)
      return ctx.reply("Format: /deldebt ID\nContoh: /deldebt D1");

    const debt = await debts.getDebt(db, userId, id);
    if (!debt) return ctx.reply(`Catatan aktif D${id} tidak ditemukan.`);
    if (debt.paid > 0) {
      return ctx.reply(
        `D${id} sudah punya pembayaran (${rupiah(debt.paid)}). Hapus dulu pembayarannya dengan /hapus ID transaksi, atau biarkan sampai lunas.`,
      );
    }

    await debts.deactivateDebt(db, userId, id);
    return ctx.reply(
      `🗑️ D${id} ${debt.counterparty} dihapus. Transaksi uang awalnya (kalau ada) ikut dibatalkan, saldo sudah disesuaikan.`,
    );
  });
}
