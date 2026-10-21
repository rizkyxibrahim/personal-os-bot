import type { Bot } from "grammy";
import type { Env } from "../env";
import * as q from "../finance/queries";
import { showAccountList } from "../wizard/accounts";
import { startFlow } from "../wizard/engine";
import { sendBackup, startReset } from "../wizard/resetFlow";

export function registerSettings(bot: Bot, env: Env): void {
  bot.command("akun", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    await q.ensureDefaults(env.DB, userId);
    await showAccountList(ctx, env, userId);
  });

  bot.command("koreksi", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    await q.ensureDefaults(env.DB, userId);
    await startFlow(ctx, env, "adjust");
  });

  bot.command("backup", (ctx) =>
    sendBackup(
      ctx,
      env,
      "📦 Cadangan lengkap (JSON). File ini berisi data keuanganmu, simpan di tempat aman.",
    ),
  );

  bot.command("reset", (ctx) => startReset(ctx, env));
}
