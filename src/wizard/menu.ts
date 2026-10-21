import { InlineKeyboard, type Context } from "grammy";
import type { Env } from "../env";
import { todayJakarta } from "../dates";
import { buildDashboard } from "../services/dashboard";
import { buildRekap } from "../services/rekap";
import { buildSaldo, buildToday, buildTodo } from "../services/views";
import { startFlow } from "./engine";

function menuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ Pengeluaran", "m:out")
    .text("➕ Pemasukan", "m:in")
    .row()
    .text("✅ Tugas baru", "m:task")
    .text("📋 Daftar tugas", "m:todo")
    .row()
    .text("🗒️ Rencana hari ini", "m:today")
    .text("💰 Saldo", "m:saldo")
    .row()
    .text("📊 Rekap bulan ini", "m:rekap")
    .text("🏠 Dashboard", "m:start");
}

export async function showMenu(ctx: Context): Promise<void> {
  await ctx.reply("🧭 Menu\nMau ngapain?", { reply_markup: menuKeyboard() });
}

export async function handleMenuCallback(
  ctx: Context,
  env: Env,
): Promise<void> {
  try {
    await ctx.answerCallbackQuery();
  } catch {
    // tombol sudah terlalu lama
  }

  const userId = ctx.from?.id;
  if (userId === undefined) return;

  const action = (ctx.callbackQuery?.data ?? "").slice(2);

  switch (action) {
    case "out":
    case "in":
    case "task":
      await startFlow(ctx, env, action);
      return;
    case "todo":
      await ctx.reply(await buildTodo(env.DB, userId));
      return;
    case "today":
      await ctx.reply(await buildToday(env.DB, userId));
      return;
    case "saldo":
      await ctx.reply(await buildSaldo(env.DB, userId));
      return;
    case "rekap":
      await ctx.reply(
        await buildRekap(env.DB, userId, todayJakarta().slice(0, 7)),
      );
      return;
    case "start":
      await ctx.reply(
        await buildDashboard(env, userId, ctx.from?.first_name ?? "kamu"),
      );
      return;
  }
}
