import { Bot, webhookCallback } from "grammy";
import type { Env } from "./env";
import { createBot } from "./bot";
import { runScheduled } from "./scheduled";

let bot: Bot | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/telegram/webhook") {
      return new Response("OK");
    }

    bot ??= createBot(env);

    const handler = webhookCallback(bot, "cloudflare-mod", {
      secretToken: env.WEBHOOK_SECRET,
    });
    return handler(request);
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    // Hanya untuk pengujian lokal: /__scheduled?cron=job:morning_brief memaksa satu job.
    // Di produksi, nilai cron selalu berasal dari wrangler.jsonc.
    const force = controller.cron.startsWith("job:")
      ? controller.cron.slice(4)
      : undefined;
    ctx.waitUntil(runScheduled(env, force));
  },
};
