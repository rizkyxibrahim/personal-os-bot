import { Bot, webhookCallback } from "grammy";
import type { Env } from "./env";
import { createBot } from "./bot";

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
};
