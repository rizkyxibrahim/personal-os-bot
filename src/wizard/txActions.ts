import type { Context, InlineKeyboard } from "grammy";
import { InlineKeyboard as Keyboard } from "grammy";
import type { Env } from "../env";
import * as q from "../finance/queries";
import { startFlow } from "./engine";
import { txActionKeyboard } from "./keyboards";

const NO_KEYBOARD = { inline_keyboard: [] };
const DELETED_MARK = "\n\n🗑️";

async function safeEdit(
  ctx: Context,
  text: string,
  kb: InlineKeyboard | null,
): Promise<void> {
  try {
    await ctx.editMessageText(text, { reply_markup: kb ?? NO_KEYBOARD });
  } catch {
    // pesan tidak berubah atau sudah hilang
  }
}

// Tombol di bawah konfirmasi transaksi: t:<aksi>:<id>
export async function handleTxCallback(ctx: Context, env: Env): Promise<void> {
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

  const original =
    (ctx.callbackQuery?.message as { text?: string } | undefined)?.text ?? "";
  const base = original.split(DELETED_MARK)[0];

  if (action === "del") {
    const ok = await q.softDelete(env.DB, userId, id);
    await safeEdit(
      ctx,
      `${base}${DELETED_MARK} Transaksi #${id} dihapus. Saldo dan laporan sudah disesuaikan.`,
      ok ? new Keyboard().text("↩️ Pulihkan", `t:res:${id}`) : null,
    );
    return;
  }

  if (action === "res") {
    const ok = await q.restore(env.DB, userId, id);
    if (ok) await safeEdit(ctx, base, txActionKeyboard(id));
    else
      await safeEdit(
        ctx,
        `${base}${DELETED_MARK} Transaksi #${id} tidak bisa dipulihkan.`,
        null,
      );
    return;
  }

  if (action === "edit") {
    if (!(await q.getTxRow(env.DB, userId, id))) {
      await ctx.reply(`Transaksi #${id} sudah tidak aktif.`);
      return;
    }
    await startFlow(ctx, env, "txedit", { txId: id });
  }
}
