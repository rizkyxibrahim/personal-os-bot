import { process } from "@cloudflare/workers-types";
import type { Context, MiddlewareFn } from "grammy";

export function ownerOnly(ownerId: string): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const id = String(ctx.from?.id);
    const admins = String(process.env.ADMINS_IDS ?? "")
      .split(",")
      .map(Number);
    const isAdmin = admins.includes(ctx.from?.id as number);

    if (String(ctx.from?.id) !== ownerId && !isAdmin) {
      ctx.reply("⚠️ Akses ditolak. Hubungi owner/Admin.");
      return;
    }
    await next();
  };
}

export function allowedChats(allowed: number[]): MiddlewareFn<Context> {
  return async (ctx, next) => {
    if (allowed.length === 0) return await next();
    if (!allowed.includes(ctx.chat?.id as number)) {
      ctx.reply("⚠️ Chat ini tidak diizinkan.");
      return;
    }
    await next();
  };
}
