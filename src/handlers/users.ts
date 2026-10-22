import { Keyboard, type Bot, type Context } from "grammy";
import type { Env } from "../env";
import * as users from "../users/store";

export function registerUsers(bot: Bot, env: Env): void {
  const db = env.DB;
  const isOwner = (ctx: Context) => String(ctx.from?.id) === env.OWNER_ID;

  bot.command("lokasi", (ctx) =>
    ctx.reply("Kirim lokasimu supaya cuaca di dashboard sesuai tempatmu.", {
      reply_markup: new Keyboard()
        .requestLocation("📍 Kirim lokasi saya")
        .oneTime()
        .resized(),
    }),
  );

  bot.on("message:location", async (ctx) => {
    const id = ctx.from?.id;
    if (id === undefined) return;

    const { latitude, longitude } = ctx.message.location;
    await users.setLocation(db, id, latitude, longitude);
    return ctx.reply(
      "✅ Lokasi tersimpan. Cuaca di dashboard dan brief pagi akan mengikuti lokasi ini.",
      {
        reply_markup: { remove_keyboard: true },
      },
    );
  });

  bot.command("pengguna", async (ctx) => {
    if (!isOwner(ctx))
      return ctx.reply("Perintah ini hanya untuk pemilik bot.");
    const list = await users.listUsers(db);
    return ctx.reply(
      [
        "👥 Pengguna",
        "",
        ...list.map(
          (u) => `${u.user_id} · ${u.name} · ${u.role} · ${u.status}`,
        ),
      ].join("\n"),
    );
  });

  bot.command(["suspend", "aktifkan"], async (ctx) => {
    if (!isOwner(ctx))
      return ctx.reply("Perintah ini hanya untuk pemilik bot.");

    // ctx.command tidak ada di grammY, jadi kata pertama dibaca langsung dari teks pesan
    const command = ctx.message?.text?.split(/\s/, 1)[0]?.split("@", 1)[0];
    const suspend = command === "/suspend";

    const id = parseInt(ctx.match.trim(), 10);
    if (!Number.isInteger(id))
      return ctx.reply(
        "Format: /suspend ID atau /aktifkan ID\nLihat ID: /pengguna",
      );

    const ok = await users.setStatus(db, id, suspend ? "suspended" : "active");
    return ctx.reply(
      ok
        ? `${suspend ? "⏸️ Dinonaktifkan" : "▶️ Diaktifkan"}: ID ${id}`
        : "ID tidak ditemukan, atau itu pemilik bot (pemilik tidak bisa dinonaktifkan).",
    );
  });

  bot.command("hapuspengguna", async (ctx) => {
    if (!isOwner(ctx))
      return ctx.reply("Perintah ini hanya untuk pemilik bot.");
    const [idRaw = "", confirm = ""] = ctx.match.trim().split(/\s+/);
    const id = parseInt(idRaw, 10);
    if (!Number.isInteger(id) || confirm !== "ya") {
      return ctx.reply(
        "Ini menghapus SEMUA data pengguna tersebut dan tidak bisa dibatalkan.\nFormat: /hapuspengguna ID ya",
      );
    }

    const target = (await users.listUsers(db)).find((u) => u.user_id === id);
    if (!target || target.role === "owner")
      return ctx.reply("Pengguna tidak ditemukan, atau itu pemilik.");

    await users.deleteUserData(db, id);
    return ctx.reply(`🗑️ Semua data ${target.name} (ID ${id}) sudah dihapus.`);
  });
}
