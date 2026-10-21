import type { Bot } from "grammy";
import type { Env } from "../env";
import { daysBetween, dueDate, formatDue, todayJakarta } from "../dates";
import { rupiah } from "../format";
import { parseAmount } from "../parse";
import { resolveCategory } from "../finance/categorize";
import * as q from "../finance/queries";
import * as subs from "../finance/subscriptions";
import { saveEntry } from "./finance";

const NAME_RE = /^[\p{L}\p{N}_-]{1,30}$/u;

const USAGE_ADDSUB = [
  "Format: /addsub Nama Nominal TanggalTagih [#kategori] [Akun] [remind:N]",
  "Contoh: /addsub Netflix 186k 5 #hiburan [Cash] remind:3",
  "TanggalTagih = tanggal tiap bulan (1-31). Nama satu kata, pakai - untuk spasi.",
  "Nama yang sama = memperbarui langganan.",
].join("\n");

function statusText(
  s: subs.Subscription,
  month: string,
  today: string,
): string {
  if (s.paid) return "✅ lunas";
  const due = dueDate(month, s.bill_day);
  const diff = daysBetween(today, due);
  if (diff < 0)
    return `🔴 lewat jatuh tempo ${-diff} hari (sejak ${formatDue(due)})`;
  if (diff === 0) return "⏳ jatuh tempo hari ini";
  return `⏳ jatuh tempo ${formatDue(due)} (${diff} hari lagi)`;
}

export function registerSubscriptions(bot: Bot, env: Env): void {
  const db = env.DB;

  bot.command("addsub", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    await q.ensureDefaults(db, userId);

    const tokens = ctx.match.trim().split(/\s+/).filter(Boolean);
    const [name, amountRaw, dayRaw] = tokens;
    const amount = amountRaw ? parseAmount(amountRaw) : null;
    const day = Number(dayRaw);
    if (
      !name ||
      !NAME_RE.test(name) ||
      amount === null ||
      !Number.isInteger(day) ||
      day < 1 ||
      day > 31
    ) {
      return ctx.reply(USAGE_ADDSUB);
    }

    let rest = tokens.slice(3).join(" ");
    let accountName: string | null = null;
    let hashCategory: string | null = null;
    let remindDays = 3;

    const acc = rest.match(/\[([^\]]+)\]/);
    if (acc) {
      accountName = acc[1].trim();
      rest = rest.replace(acc[0], " ");
    }
    const tag = rest.match(/(?:^|\s)#(\S+)/);
    if (tag) {
      hashCategory = tag[1].toLowerCase();
      rest = rest.replace(tag[0], " ");
    }
    const rem = rest.match(/(?:^|\s)remind:(\d+)(?=\s|$)/i);
    if (rem) {
      remindDays = Number(rem[1]);
      rest = rest.replace(rem[0], " ");
    }
    if (rest.trim() || remindDays > 30) return ctx.reply(USAGE_ADDSUB);

    const account = accountName
      ? await q.findAccount(db, userId, accountName)
      : await q.getDefaultAccount(db, userId);
    if (!account)
      return ctx.reply(
        `⚠️ Akun "${accountName}" tidak ditemukan. Lihat /saldo`,
      );

    const categories = (await q.listCategories(db, userId)).filter(
      (c) => c.type === "expense",
    );
    const resolved = resolveCategory({
      words: [name],
      hashCategory,
      categories,
      type: "expense",
    });
    if (!resolved.ok)
      return ctx.reply(
        `⚠️ Kategori "${resolved.unknown}" belum ada. Lihat /kategori`,
      );

    const id = await subs.upsertSubscription(db, userId, {
      name,
      amount,
      billDay: day,
      categoryId: resolved.category?.id ?? null,
      accountId: account.id,
      remindDays,
    });

    return ctx.reply(
      [
        `✅ Langganan ${name} tersimpan (#${id})`,
        `📉 ${rupiah(amount)} · tiap tanggal ${day}`,
        `📂 ${resolved.category?.name ?? "-"} · 🏦 ${account.name} · ingatkan ${remindDays} hari sebelumnya`,
        `Bayar dengan /bayarsub ${id}`,
      ].join("\n"),
    );
  });

  bot.command("ceksub", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    await q.ensureDefaults(db, userId);

    const today = todayJakarta();
    const month = today.slice(0, 7);
    const list = await subs.listSubscriptions(db, userId, month);
    if (list.length === 0)
      return ctx.reply("Belum ada langganan.\n\n" + USAGE_ADDSUB);

    const total = list.reduce((s, x) => s + x.amount, 0);
    const paid = list.filter((x) => x.paid).reduce((s, x) => s + x.amount, 0);

    const lines = [
      "📺 Langganan bulan ini",
      "",
      ...list.map(
        (s) =>
          `#${s.id} ${s.name} — ${rupiah(s.amount)} (tgl ${s.bill_day})\n   ${statusText(s, month, today)}`,
      ),
      "",
      `Total bulanan: ${rupiah(total)}`,
      `Sudah dibayar: ${rupiah(paid)}`,
      `Belum dibayar: ${rupiah(total - paid)}`,
    ];
    return ctx.reply(lines.join("\n"));
  });

  bot.command("bayarsub", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    await q.ensureDefaults(db, userId);

    const id = parseInt(ctx.match.trim().replace(/^#/, ""), 10);
    if (!Number.isInteger(id) || id <= 0)
      return ctx.reply("Format: /bayarsub ID\nLihat ID: /ceksub");

    const today = todayJakarta();
    const sub = await subs.getSubscription(db, userId, id, today.slice(0, 7));
    if (!sub)
      return ctx.reply(`Langganan aktif #${id} tidak ditemukan. Lihat /ceksub`);
    if (sub.paid)
      return ctx.reply(`Langganan ${sub.name} sudah dibayar bulan ini.`);

    const text = await saveEntry(db, {
      userId,
      type: "out",
      amount: sub.amount,
      date: today,
      account: { id: sub.account_id, name: sub.account_name },
      category:
        sub.category_id === null
          ? null
          : { id: sub.category_id, name: sub.category_name ?? "-" },
      note: `Langganan ${sub.name}`,
      autoCategory: false,
      subscriptionId: sub.id,
    });

    return ctx.reply(`📺 ${sub.name} dibayar.\n${text}`);
  });

  bot.command("delsub", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const id = parseInt(ctx.match.trim().replace(/^#/, ""), 10);
    if (!Number.isInteger(id) || id <= 0)
      return ctx.reply("Format: /delsub ID\nLihat ID: /ceksub");

    const ok = await subs.deactivateSubscription(db, userId, id);
    return ctx.reply(
      ok
        ? `⏹️ Langganan #${id} dihentikan. Riwayat pembayarannya tetap tercatat.\nAktifkan lagi dengan /addsub nama yang sama.`
        : `Langganan aktif #${id} tidak ditemukan.`,
    );
  });
}
