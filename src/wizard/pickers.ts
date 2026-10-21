import { InlineKeyboard, type Context } from "grammy";
import type { Env } from "../env";
import { rupiah } from "../format";
import * as q from "../finance/queries";
import { todayJakarta, daysBetween, formatDue } from "../dates";
import { PRIORITY_ICON } from "../services/taskView";
import { completeTask, listOpenTasks } from "../tasksDb";
import * as debts from "../finance/debts";
import * as goals from "../finance/goals";
import * as subs from "../finance/subscriptions";
import { startFlow } from "./engine";

const MAX_TASKS = 10;
const MAX_TX = 8;
const NO_KEYBOARD = { inline_keyboard: [] };

const truncate = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1) + "…" : s;

interface View {
  text: string;
  kb: InlineKeyboard | null;
}

async function doneView(
  env: Env,
  userId: number,
  header: string | null,
): Promise<View> {
  const tasks = await listOpenTasks(env.DB, userId);
  const top = [header];

  if (tasks.length === 0) {
    top.push("Tidak ada tugas aktif lagi. 🎉");
    return { text: top.filter(Boolean).join("\n\n"), kb: null };
  }

  const kb = new InlineKeyboard();
  tasks.slice(0, MAX_TASKS).forEach((t, i) => {
    if (i > 0) kb.row();
    const due = t.due_date ? ` · ${formatDue(t.due_date)}` : "";
    kb.text(
      truncate(`${PRIORITY_ICON[t.priority]} ${t.title}${due}`, 45),
      `p:done:${t.id}`,
    );
  });

  const more =
    tasks.length > MAX_TASKS
      ? `\n(menampilkan ${MAX_TASKS} dari ${tasks.length}; sisanya: /done ID)`
      : "";
  top.push(`Pilih tugas yang sudah selesai:${more}`);
  return { text: top.filter(Boolean).join("\n\n"), kb };
}

async function deleteView(env: Env, userId: number): Promise<View> {
  const rows = await q.listRecent(env.DB, userId, MAX_TX);
  if (rows.length === 0) return { text: "Belum ada transaksi.", kb: null };

  const kb = new InlineKeyboard();
  rows.forEach((r, i) => {
    if (i > 0) kb.row();
    const icon = r.type === "in" ? "📈" : r.type === "out" ? "📉" : "🔁";
    const what =
      r.note ??
      r.category_name ??
      (r.type === "transfer"
        ? `${r.account_name}→${r.to_account_name}`
        : r.account_name);
    kb.text(
      truncate(`#${r.id} ${icon} ${rupiah(r.amount)} · ${what}`, 48),
      `p:del:${r.id}`,
    );
  });

  return {
    text: "Pilih transaksi yang mau dihapus.\n(Bisa dipulihkan dengan /restore ID)",
    kb,
  };
}

async function send(ctx: Context, view: View): Promise<void> {
  if (view.kb) await ctx.reply(view.text, { reply_markup: view.kb });
  else await ctx.reply(view.text);
}

async function edit(ctx: Context, view: View): Promise<void> {
  try {
    await ctx.editMessageText(view.text, {
      reply_markup: view.kb ?? NO_KEYBOARD,
    });
  } catch {
    await send(ctx, view);
  }
}

async function dropKeyboard(ctx: Context): Promise<void> {
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: NO_KEYBOARD });
  } catch {
    // sudah hilang
  }
}

async function debtView(env: Env, userId: number): Promise<View> {
  const list = (await debts.listDebts(env.DB, userId)).filter(
    (d) => d.principal - d.paid > 0,
  );
  if (list.length === 0)
    return {
      text: "Tidak ada hutang atau piutang yang masih berjalan.",
      kb: null,
    };

  const kb = new InlineKeyboard();
  list.slice(0, MAX_TASKS).forEach((d, i) => {
    if (i > 0) kb.row();
    const icon = d.direction === "payable" ? "🔻" : "🔺";
    kb.text(
      truncate(
        `${icon} D${d.id} ${d.counterparty} · sisa ${rupiah(d.principal - d.paid)}`,
        48,
      ),
      `p:debt:${d.id}`,
    );
  });
  return { text: "Pilih hutang (🔻) atau piutang (🔺):", kb };
}

async function goalView(env: Env, userId: number): Promise<View> {
  const list = await goals.listGoals(env.DB, userId);
  if (list.length === 0)
    return { text: "Belum ada goal. Buat dengan /addgoal.", kb: null };

  const kb = new InlineKeyboard();
  list.slice(0, MAX_TASKS).forEach((g, i) => {
    if (i > 0) kb.row();
    const pct = Math.round((g.saved * 100) / g.target);
    kb.text(
      truncate(`${g.icon ?? "🎯"} ${g.name} · ${pct}%`, 48),
      `p:goal:${g.id}`,
    );
  });
  return { text: "Pilih goal yang mau ditabung:", kb };
}

async function subView(env: Env, userId: number): Promise<View> {
  const all = await subs.listSubscriptions(
    env.DB,
    userId,
    todayJakarta().slice(0, 7),
  );
  if (all.length === 0)
    return { text: "Belum ada langganan. Tambah dengan /addsub.", kb: null };

  const unpaid = all.filter((s) => !s.paid);
  if (unpaid.length === 0)
    return { text: "Semua langganan bulan ini sudah dibayar. ✅", kb: null };

  const kb = new InlineKeyboard();
  unpaid.slice(0, MAX_TASKS).forEach((s, i) => {
    if (i > 0) kb.row();
    kb.text(
      truncate(`📺 ${s.name} · ${rupiah(s.amount)} (tgl ${s.bill_day})`, 48),
      `p:sub:${s.id}`,
    );
  });
  return { text: "Pilih langganan yang mau dibayar:", kb };
}

export async function showDebtPicker(
  ctx: Context,
  env: Env,
  userId: number,
): Promise<void> {
  await send(ctx, await debtView(env, userId));
}

export async function showGoalPicker(
  ctx: Context,
  env: Env,
  userId: number,
): Promise<void> {
  await send(ctx, await goalView(env, userId));
}

export async function showSubPicker(
  ctx: Context,
  env: Env,
  userId: number,
): Promise<void> {
  await send(ctx, await subView(env, userId));
}

export async function showDonePicker(
  ctx: Context,
  env: Env,
  userId: number,
): Promise<void> {
  await send(ctx, await doneView(env, userId, null));
}

export async function showDeletePicker(
  ctx: Context,
  env: Env,
  userId: number,
): Promise<void> {
  await send(ctx, await deleteView(env, userId));
}

// Tombol: p:<aksi>:<id>
export async function handlePickerCallback(
  ctx: Context,
  env: Env,
): Promise<void> {
  try {
    await ctx.answerCallbackQuery();
  } catch {
    // tombol sudah terlalu lama
  }

  const userId = ctx.from?.id;
  const [, action = "", idRaw = ""] = (ctx.callbackQuery?.data ?? "").split(
    ":",
  );
  const id = Number(idRaw);
  if (userId === undefined || !Number.isInteger(id) || id <= 0) return;

  if (action === "done") {
    const ok = await completeTask(env.DB, userId, id);
    await edit(
      ctx,
      await doneView(
        env,
        userId,
        ok ? `🎉 Tugas #${id} selesai!` : `Tugas #${id} sudah tidak aktif.`,
      ),
    );
    return;
  }

  if (action === "del") {
    const ok = await q.softDelete(env.DB, userId, id);
    await edit(ctx, {
      text: ok
        ? `🗑️ Transaksi #${id} dipindah ke recycle bin. Saldo sudah disesuaikan.\nPulihkan dengan /restore ${id}`
        : `Transaksi #${id} sudah tidak aktif.`,
      kb: null,
    });
  }

  if (action === "debt") {
    if (!(await debts.getDebt(env.DB, userId, id))) {
      await edit(ctx, { text: `Catatan D${id} sudah tidak aktif.`, kb: null });
      return;
    }
    await dropKeyboard(ctx);
    await startFlow(ctx, env, "debtpay", { debtId: id });
    return;
  }

  if (action === "goal") {
    if (!(await goals.getGoal(env.DB, userId, id))) {
      await edit(ctx, { text: `Goal G${id} sudah tidak aktif.`, kb: null });
      return;
    }
    await dropKeyboard(ctx);
    await startFlow(ctx, env, "goalsave", { goalId: id });
    return;
  }

  if (action === "sub") {
    const sub = await subs.getSubscription(
      env.DB,
      userId,
      id,
      todayJakarta().slice(0, 7),
    );
    if (!sub || sub.paid) {
      await edit(ctx, {
        text: "Langganan itu sudah dibayar atau tidak aktif.",
        kb: null,
      });
      return;
    }
    await dropKeyboard(ctx);
    await startFlow(ctx, env, "subpay", { subId: id });
  }
}
