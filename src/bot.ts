import { Bot } from "grammy";
import type { Env } from "./env";
import { ownerOnly } from "./middleware/auth";
import { registerStart } from "./handlers/start";
import { registerFinance } from "./handlers/finance";

export function createBot(env: Env): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  bot.use(ownerOnly(env.OWNER_ID));

  registerStart(bot, env);
  registerFinance(bot, env);

  // Harus paling akhir: menangkap pesan yang bukan perintah dikenal
  bot.on("message:text", (ctx) =>
    ctx.reply("Perintah tidak dikenal. Ketik /help untuk bantuan."),
  );

  return bot;
}
