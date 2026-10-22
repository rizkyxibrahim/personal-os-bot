import type { Bot } from "grammy";
import type { Env } from "../env";
import { buildDashboard } from "../services/dashboard";

export function registerStart(bot: Bot, env: Env): void {
  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    return ctx.reply(await buildDashboard(env, userId));
  });
}
