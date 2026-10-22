import { InlineKeyboard, type Context } from "grammy";
import type { Env } from "../env";
import * as q from "../finance/queries";
import * as users from "../users/store";

const PRIVACY = [
  "Halo! Bot ini pribadi, tapi kamu bisa mendaftar.",
  "",
  "Sebelum mulai, ini yang perlu kamu tahu:",
  "• Data keuanganmu hanya bisa kamu lihat lewat bot ini.",
  "• Pemilik bot tetap punya akses teknis ke database (untuk perawatan dan cadangan). Jangan catat data yang sangat rahasia, seperti nomor kartu atau kata sandi.",
  "• Gmail (kalau dihubungkan) hanya dibaca, dan token disimpan terenkripsi.",
  "• /reset menghapus datamu. Untuk menghapus akunmu sepenuhnya, minta pemilik.",
  "",
  "Dengan menekan Saya setuju, kamu menyetujui hal di atas. Pendaftaranmu lalu menunggu persetujuan pemilik.",
].join("\n");

const fullName = (ctx: Context) =>
  [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") ||
  "Pengguna";

export async function sendRegistration(
  ctx: Context,
  env: Env,
  user: users.User | null,
): Promise<unknown> {
  if (user?.status === "suspended")
    return ctx.reply("Akses kamu sedang dinonaktifkan oleh pemilik bot.");
  if (user?.status === "pending") {
    return ctx.reply(
      "⏳ Pendaftaranmu sedang menunggu persetujuan pemilik. Kamu akan diberi kabar.",
    );
  }
  return ctx.reply(PRIVACY, {
    reply_markup: new InlineKeyboard()
      .text("✅ Saya setuju", "r:agree")
      .text("❌ Batal", "r:cancel"),
  });
}

async function edit(ctx: Context, text: string): Promise<void> {
  try {
    await ctx.editMessageText(text);
  } catch {
    await ctx.reply(text);
  }
}

// Tombol: r:<aksi>[:<id>]
export async function handleRegistrationCallback(
  ctx: Context,
  env: Env,
): Promise<void> {
  try {
    await ctx.answerCallbackQuery();
  } catch {
    // tombol sudah kedaluwarsa
  }

  const from = ctx.from;
  if (!from) return;
  const [, action = "", idRaw = ""] = (ctx.callbackQuery?.data ?? "").split(
    ":",
  );
  const isOwner = String(from.id) === env.OWNER_ID;

  if (action === "cancel") {
    return edit(
      ctx,
      "Pendaftaran dibatalkan. Ketik /start kapan saja untuk mulai lagi.",
    );
  }

  if (action === "agree") {
    if (await users.getUser(env.DB, from.id))
      return edit(ctx, "Kamu sudah terdaftar. Ketik /menu.");

    await users.registerPending(env.DB, from.id, fullName(ctx));

    if (env.AUTO_APPROVE === "true") {
      await users.approve(env.DB, from.id);
      await q.ensureDefaults(env.DB, from.id);
      await ctx.api
        .sendMessage(
          Number(env.OWNER_ID),
          `👤 ${fullName(ctx)} (ID ${from.id}) bergabung otomatis.`,
        )
        .catch(() => {});
      return edit(ctx, "✅ Terdaftar! Ketik /menu untuk mulai.");
    }

    await edit(
      ctx,
      "✅ Terima kasih. Permintaanmu sudah dikirim ke pemilik. Kamu akan diberi kabar setelah disetujui.",
    );
    const kb = new InlineKeyboard()
      .text("✅ Setujui", `r:ok:${from.id}`)
      .text("⛔ Tolak", `r:no:${from.id}`);
    const handle = from.username ? ` (@${from.username})` : "";
    await ctx.api.sendMessage(
      Number(env.OWNER_ID),
      `🆕 Permintaan daftar:\n${fullName(ctx)}${handle}\nID ${from.id}`,
      { reply_markup: kb },
    );
    return;
  }

  // Hanya pemilik yang boleh menyetujui atau menolak
  if (action === "ok" || action === "no") {
    if (!isOwner) return;
    const target = parseInt(idRaw, 10);
    if (!Number.isInteger(target)) return;

    if (action === "ok") {
      const approved = await users.approve(env.DB, target);
      if (!approved)
        return edit(ctx, "Permintaan ini sudah diproses sebelumnya.");
      await q.ensureDefaults(env.DB, target);
      await ctx.api
        .sendMessage(
          target,
          "✅ Pendaftaranmu disetujui! Ketik /menu untuk mulai.",
        )
        .catch(() => {});
      return edit(ctx, `✅ Disetujui: ID ${target}`);
    }

    await users.reject(env.DB, target);
    await ctx.api
      .sendMessage(target, "Maaf, pendaftaranmu belum bisa disetujui.")
      .catch(() => {});
    return edit(ctx, `⛔ Ditolak: ID ${target}`);
  }
}
