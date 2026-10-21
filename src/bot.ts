import { Bot } from "grammy";
import type { Env } from "./env";
import { ownerOnly } from "./middleware/auth";
import { registerBudget } from "./handlers/budget";
import { handleQuickEntry, registerFinance } from "./handlers/finance";
import { registerDebts } from "./handlers/debts";
import { registerGoals } from "./handlers/goals";
import { registerHelp } from "./handlers/help";
import { registerOverview } from "./handlers/overview";
import { registerReports } from "./handlers/reports";
import { registerStart } from "./handlers/start";
import { registerSubscriptions } from "./handlers/subscriptions";
import { registerTasks } from "./handlers/tasks";
import { registerTemplates } from "./handlers/templates";
import { entryFlow } from "./wizard/entryFlow";
import { handleFlowCallback, handleFlowText } from "./wizard/engine";
import { handleMenuCallback, showMenu } from "./wizard/menu";
import { handlePickerCallback } from "./wizard/pickers";
import { registerFlow } from "./wizard/registry";
import { clearState, getState } from "./wizard/state";
import { taskFlow } from "./wizard/taskFlow";

import { debtFlow } from "./wizard/debtFlow";
import { debtPayFlow } from "./wizard/debtPayFlow";
import { goalFlow } from "./wizard/goalFlow";
import { goalSaveFlow } from "./wizard/goalSaveFlow";
import { subFlow } from "./wizard/subFlow";
import { subPayFlow } from "./wizard/subPayFlow";

export function createBot(env: Env): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  registerFlow(entryFlow("out"));
  registerFlow(entryFlow("in"));
  registerFlow(taskFlow());
  registerFlow(goalFlow());
  registerFlow(debtFlow("payable"));
  registerFlow(debtFlow("receivable"));
  registerFlow(debtPayFlow());
  registerFlow(goalSaveFlow());
  registerFlow(subFlow());
  registerFlow(subPayFlow());

  // Error apa pun jangan sampai membuat Telegram mengirim ulang pesan yang sama berulang-ulang
  bot.catch(async (err) => {
    console.error("[bot] error:", err.error);
    try {
      await err.ctx.reply("⚠️ Terjadi kesalahan. Coba lagi, atau /batal.");
    } catch {
      // abaikan
    }
  });

  bot.use(ownerOnly(env.OWNER_ID));

  // Perintah baru membatalkan proses tanya-jawab yang sedang berjalan (kecuali /batal sendiri)
  bot.use(async (ctx, next) => {
    const text = ctx.message?.text;
    if (ctx.from && text?.startsWith("/") && !/^\/batal(\s|@|$)/i.test(text)) {
      await clearState(env.DB, ctx.from.id);
    }
    await next();
  });

  bot.command("menu", (ctx) => showMenu(ctx));

  bot.command("batal", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const active = await getState(env.DB, userId);
    await clearState(env.DB, userId);
    return ctx.reply(
      active ? "❌ Dibatalkan." : "Tidak ada proses yang sedang berjalan.",
    );
  });

  registerStart(bot, env);
  registerHelp(bot);
  registerFinance(bot, env);
  registerBudget(bot, env);
  registerReports(bot, env);
  registerTemplates(bot, env);
  registerSubscriptions(bot, env);
  registerDebts(bot, env);
  registerGoals(bot, env);
  registerOverview(bot, env);
  registerTasks(bot, env);

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith("w:")) return handleFlowCallback(ctx, env);
    if (data.startsWith("p:")) return handlePickerCallback(ctx, env);
    if (data.startsWith("m:")) return handleMenuCallback(ctx, env);
    await ctx.answerCallbackQuery();
  });

  // Harus paling akhir: jawaban wizard, lalu catat cepat ("out 25k kopi"), lalu pesan tak dikenal
  bot.on("message:text", async (ctx) => {
    if (await handleFlowText(ctx, env)) return;
    if (await handleQuickEntry(ctx, env)) return;
    await ctx.reply("Perintah tidak dikenal. Ketik /menu atau /help.");
  });

  return bot;
}
