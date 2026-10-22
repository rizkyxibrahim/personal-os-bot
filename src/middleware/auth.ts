import type { Context, MiddlewareFn } from "grammy";
import type { Env } from "../env";
import * as users from "../users/store";

// Pemilik dan pengguna aktif boleh lanjut. Yang lain hanya boleh memakai /join.
export function authorize(env: Env): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const id = ctx.from?.id;
    if (id === undefined) return;

    if (String(id) === env.OWNER_ID) {
      await users.ensureOwner(env.DB, id, ctx.from?.first_name ?? "Pemilik");
      return next();
    }

    const user = await users.getUser(env.DB, id);
    if (user?.status === "active") return next();

    if (/^\/join(\s|@|$)/i.test(ctx.message?.text ?? "")) return next();

    if (ctx.callbackQuery) {
      try {
        await ctx.answerCallbackQuery();
      } catch {
        // tombol sudah kedaluwarsa
      }
      return;
    }

    if (user?.status === "suspended") {
      return ctx.reply("Akses kamu sedang dinonaktifkan oleh pemilik bot.");
    }
    return ctx.reply(
      "Bot ini pribadi. Kalau kamu punya kode undangan, kirim: /join KODE",
    );
  };
}
