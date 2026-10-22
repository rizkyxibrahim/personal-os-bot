import type { Context, MiddlewareFn } from "grammy";
import type { Env } from "../env";
import * as users from "../users/store";
import { sendRegistration } from "../handlers/registration";

const fullName = (ctx: Context) =>
  [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") ||
  "Pemilik";

export function authorize(env: Env): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const id = ctx.from?.id;
    if (id === undefined) return;

    let user: users.User | null = null;
    try {
      if (String(id) === env.OWNER_ID) {
        await users.ensureOwner(env.DB, id, fullName(ctx));
        return next();
      }
      user = await users.getUser(env.DB, id);
    } catch (err) {
      console.error("[auth] database belum siap", err);
      return ctx.reply("⚠️ Bot sedang bermasalah. Coba lagi nanti.");
    }

    if (user?.status === "active") return next();

    // Tombol pendaftaran dan persetujuan ditangani handler registration
    if ((ctx.callbackQuery?.data ?? "").startsWith("r:")) return next();

    if (/^\/start(\s|@|$)/i.test(ctx.message?.text ?? "")) {
      return sendRegistration(ctx, env, user);
    }

    if (ctx.callbackQuery) {
      try {
        await ctx.answerCallbackQuery();
      } catch {
        // tombol sudah kedaluwarsa
      }
      return;
    }

    return ctx.reply("Bot ini pribadi. Ketik /start untuk mendaftar.");
  };
}
