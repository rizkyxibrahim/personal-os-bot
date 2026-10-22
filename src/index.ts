import { Bot, webhookCallback } from "grammy";
import type { Env } from "./env";
import { createBot } from "./bot";
import { handleGmailCallback } from "./gmail/callback";
import { runScheduled } from "./scheduled";

let bot: Bot | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/gmail/callback")
      return handleGmailCallback(request, env);
    if (url.pathname !== "/telegram/webhook") return new Response("OK");

    bot ??= createBot(env);
    const handler = webhookCallback(bot, "cloudflare-mod", {
      secretToken: env.WEBHOOK_SECRET,
      timeoutMilliseconds: 45_000, // cukup untuk OCR dengan percobaan ulang dan model cadangan
    });
    return handler(request);
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const force = controller.cron.startsWith("job:")
      ? controller.cron.slice(4)
      : undefined;
    ctx.waitUntil(runScheduled(env, force));
  },
};
