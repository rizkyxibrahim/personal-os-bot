import { Bot } from "grammy";
import type { Env } from "./env";
import { ownerOnly } from "./middleware/auth";
import { registerFinance, handleQuickEntry } from "./handlers/finance";
import { registerHelp } from "./handlers/help";
import { registerStart } from "./handlers/start";
import { registerBudget } from "./handlers/budget";
import { registerReports } from "./handlers/reports";
import { registerSubscriptions } from "./handlers/subscriptions";
import { registerTemplates } from "./handlers/templates";
import { registerDebts } from "./handlers/debts";
import { registerGoals } from "./handlers/goals";
import { registerOverview } from "./handlers/overview";
import { registerTasks } from "./handlers/tasks";

export function createBot(env: Env): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  bot.use(ownerOnly(env.OWNER_ID));

  registerStart(bot, env);
  registerHelp(bot);
  registerFinance(bot, env);
  registerBudget(bot, env);
  registerReports(bot, env);
  registerSubscriptions(bot, env);
  registerTemplates(bot, env);
  registerDebts(bot, env);
  registerGoals(bot, env);
  registerOverview(bot, env);
  registerTasks(bot, env);

  // Harus paling akhir: pesan biasa seperti "out 25k makan siang"
  bot.on("message:text", async (ctx) => {
    const handled = await handleQuickEntry(ctx, env);
    if (!handled)
      await ctx.reply("Perintah tidak dikenal. Ketik /help untuk bantuan.");
  });

  return bot;
}
