import { InlineKeyboard, type Context } from "grammy";
import type { Env } from "../env";
import { formatDue } from "../dates";
import { rupiah } from "../format";
import * as q from "../finance/queries";
import { PRIORITY_ICON } from "../services/taskView";
import { completeTask, listOpenTasks } from "../tasksDb";

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
}
