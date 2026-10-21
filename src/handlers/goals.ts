import type { Bot } from "grammy";
import type { Env } from "../env";
import { daysBetween, formatDate, todayJakarta } from "../dates";
import { rupiah } from "../format";
import { parseAmount } from "../parse";
import { parseFutureDate } from "../finance/entry";
import * as goals from "../finance/goals";
import * as q from "../finance/queries";
import { saveEntry } from "./finance";

const NAME_RE = /^[\p{L}\p{N}_-]{1,30}$/u;
const PRIORITY_ICON = { high: "🔴", med: "🟡", low: "🟢" } as const;
const PRIORITY_ALIASES: Record<string, goals.Priority> = {
  high: "high",
  med: "med",
  low: "low",
  tinggi: "high",
  sedang: "med",
  rendah: "low",
};

const USAGE_ADDGOAL = [
  "Format: /addgoal Nama Target [deadline] [start:N] [icon:X] [priority:high|med|low]",
  "Contoh: /addgoal Laptop 25jt 30/06/2027 start:2jt icon:💻 priority:high",
  "start = dana yang sudah terkumpul di luar bot. Nama satu kata (pakai - untuk spasi).",
  "Nama yang sama = memperbarui (sertakan start: lagi kalau ada).",
].join("\n");

// "G3", "g3", "#3", "3" -> 3
function parseGoalId(raw: string): number | null {
  const m = raw.match(/^[gG#]?(\d+)$/);
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

function goalBlock(g: goals.Goal, today: string): string[] {
  const pct = Math.round((g.saved * 100) / g.target);
  const remaining = Math.max(0, g.target - g.saved);

  const lines = [
    `${g.icon ?? "🎯"} G${g.id} ${g.name} ${PRIORITY_ICON[g.priority]}`,
    `   ${goals.progressBar(pct)} ${pct}% — ${rupiah(g.saved)} / ${rupiah(g.target)}`,
  ];

  if (remaining === 0) {
    lines.push("   🎉 Target tercapai!");
  } else if (g.deadline) {
    const days = daysBetween(today, g.deadline);
    lines.push(
      days < 0
        ? `   🔴 lewat deadline ${formatDate(g.deadline)}, sisa ${rupiah(remaining)}`
        : `   ⏳ deadline ${formatDate(g.deadline)} (${days} hari lagi) · butuh ±${rupiah(goals.neededPerMonth(remaining, days))}/bulan`,
    );
  } else {
    lines.push(`   sisa ${rupiah(remaining)}`);
  }
  return lines;
}

export function registerGoals(bot: Bot, env: Env): void {
  const db = env.DB;

  bot.command("addgoal", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    await q.ensureDefaults(db, userId);

    const today = todayJakarta();
    const [name, targetRaw, ...rest] = ctx.match
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const target = targetRaw ? parseAmount(targetRaw) : null;
    if (!name || !NAME_RE.test(name) || target === null)
      return ctx.reply(USAGE_ADDGOAL);

    let deadline: string | null = null;
    let start = 0;
    let icon: string | null = null;
    let priority: goals.Priority = "med";

    for (const tok of rest) {
      const lower = tok.toLowerCase();
      if (lower.startsWith("start:")) {
        const v = lower.slice(6);
        const n = v === "0" ? 0 : parseAmount(v);
        if (n === null) return ctx.reply(USAGE_ADDGOAL);
        start = n;
      } else if (lower.startsWith("icon:")) {
        icon = tok.slice(5);
        if (!icon || icon.length > 8) return ctx.reply(USAGE_ADDGOAL);
      } else if (lower.startsWith("priority:")) {
        const p = PRIORITY_ALIASES[lower.slice(9)];
        if (!p) return ctx.reply(USAGE_ADDGOAL);
        priority = p;
      } else if (/^\d/.test(tok)) {
        const d = parseFutureDate(tok, today);
        if (!d) return ctx.reply(USAGE_ADDGOAL);
        deadline = d;
      } else {
        return ctx.reply(USAGE_ADDGOAL);
      }
    }

    if (deadline !== null && deadline < today)
      return ctx.reply("Deadline sudah lewat. Pakai tanggal yang akan datang.");

    const id = await goals.upsertGoal(db, userId, {
      name,
      target,
      startAmount: start,
      deadline,
      icon,
      priority,
    });
    const goal = await goals.getGoal(db, userId, id);
    if (!goal) return ctx.reply("Gagal menyimpan target.");

    return ctx.reply(
      [
        `🎯 Target tersimpan`,
        ...goalBlock(goal, today),
        `Nabung: /save G${id} jumlah [Akun]`,
      ].join("\n"),
    );
  });

  bot.command(["save", "nabung"], async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    await q.ensureDefaults(db, userId);

    const [idRaw = "", amountRaw = "", ...rest] = ctx.match.trim().split(/\s+/);
    const id = parseGoalId(idRaw);
    const amount = amountRaw ? parseAmount(amountRaw) : null;
    if (id === null || amount === null) {
      return ctx.reply(
        "Format: /save ID Nominal [Akun]\nContoh: /save G1 500k [BCA]\nLihat ID: /cekgoal",
      );
    }

    const goal = await goals.getGoal(db, userId, id);
    if (!goal)
      return ctx.reply(`Goal aktif G${id} tidak ditemukan. Lihat /cekgoal`);

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

    const category = await q.findCategory(db, userId, "Tabungan", "expense");
    const today = todayJakarta();

    const text = await saveEntry(db, {
      userId,
      type: "out",
      amount,
      date: today,
      account: { id: account.id, name: account.name },
      category: category ? { id: category.id, name: category.name } : null,
      note: `Tabungan ${goal.name}`,
      autoCategory: false,
      goalId: goal.id,
    });

    const after = await goals.getGoal(db, userId, id);
    return ctx.reply(
      [text, "", ...(after ? goalBlock(after, today) : [])].join("\n"),
    );
  });

  bot.command("cekgoal", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const list = await goals.listGoals(db, userId);
    if (list.length === 0)
      return ctx.reply("Belum ada goal.\n\n" + USAGE_ADDGOAL);

    const today = todayJakarta();
    const lines = ["🎯 Goals", ""];
    for (const g of list) lines.push(...goalBlock(g, today), "");
    return ctx.reply(lines.join("\n").trim());
  });

  bot.command("detailgoal", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const id = parseGoalId(ctx.match.trim());
    if (id === null)
      return ctx.reply("Format: /detailgoal ID\nContoh: /detailgoal G1");

    const goal = await goals.getGoal(db, userId, id);
    if (!goal)
      return ctx.reply(`Goal aktif G${id} tidak ditemukan. Lihat /cekgoal`);

    const today = todayJakarta();
    const contributions = await goals.recentContributions(db, userId, id, 5);

    const lines = [...goalBlock(goal, today)];
    if (goal.start_amount > 0)
      lines.push(`   Dana awal: ${rupiah(goal.start_amount)}`);
    lines.push("", "💰 Setoran terakhir");
    if (contributions.length === 0)
      lines.push("Belum ada setoran. Mulai dengan /save G" + id + " jumlah");
    else
      lines.push(
        ...contributions.map(
          (c) =>
            `#${c.id} · ${formatDate(c.tx_date)} · ${rupiah(c.amount)} · ${c.account_name}`,
        ),
      );

    return ctx.reply(lines.join("\n"));
  });

  bot.command("delgoal", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const id = parseGoalId(ctx.match.trim());
    if (id === null)
      return ctx.reply("Format: /delgoal ID\nContoh: /delgoal G1");

    const ok = await goals.deactivateGoal(db, userId, id);
    return ctx.reply(
      ok
        ? `⏹️ Goal G${id} dihentikan. Setoran yang sudah dicatat tetap ada sebagai pengeluaran kategori Tabungan.\nAktifkan lagi dengan /addgoal nama yang sama.`
        : `Goal aktif G${id} tidak ditemukan.`,
    );
  });
}
