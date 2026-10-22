import type { Bot, Context } from "grammy";
import type { Env } from "../env";
import * as q from "../finance/queries";
import * as users from "../users/store";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[A-Z2-9]{8}$/;

function newCode(): string {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(8)),
    (b) => CODE_ALPHABET[b % CODE_ALPHABET.length],
  ).join("");
}

const JOIN_ERRORS: Record<Exclude<users.RedeemResult, "ok">, string> = {
  invalid: "Kode tidak dikenal. Periksa lagi, atau minta kode baru ke pemilik.",
  expired: "Kode sudah kedaluwarsa. Minta kode baru ke pemilik.",
  used: "Kode ini sudah dipakai.",
  member: "Kamu sudah terdaftar. Ketik /menu untuk mulai.",
};

const WELCOME = [
  "Selamat datang! 👋",
  "",
  "Sebelum mulai, ini yang perlu kamu tahu:",
  "• Data keuanganmu hanya bisa kamu lihat lewat bot ini.",
  "• Pemilik bot tetap punya akses teknis ke database (untuk perawatan dan cadangan). Jangan catat data yang sangat rahasia, seperti nomor kartu atau kata sandi.",
  "• Kalau menghubungkan Gmail, bot hanya membaca dan token disimpan terenkripsi.",
  "• /reset menghapus datamu. Untuk menghapus akunmu sepenuhnya, minta pemilik.",
  "",
  "Dengan menggunakan bot ini, kamu menyetujui hal di atas.",
  "Mulai dari: /menu",
].join("\n");

export function registerUsers(bot: Bot, env: Env): void {
  const db = env.DB;
  const isOwner = (ctx: Context) => String(ctx.from?.id) === env.OWNER_ID;

  bot.command("join", async (ctx) => {
    const id = ctx.from?.id;
    if (id === undefined) return;

    const code = ctx.match.trim().toUpperCase();
    if (!CODE_RE.test(code))
      return ctx.reply(
        "Format: /join KODE\nKode terdiri dari 8 huruf dan angka.",
      );

    const name = ctx.from?.first_name ?? "Pengguna";
    const result = await users.redeemInvite(db, code, id, name);
    if (result !== "ok") return ctx.reply(JOIN_ERRORS[result]);

    await q.ensureDefaults(db, id);
    try {
      await ctx.api.sendMessage(
        Number(env.OWNER_ID),
        `👤 ${name} (ID ${id}) bergabung.`,
      );
    } catch (err) {
      console.error("[users] gagal memberi kabar ke pemilik", err);
    }
    return ctx.reply(WELCOME);
  });

  bot.command("undang", async (ctx) => {
    if (!isOwner(ctx))
      return ctx.reply("Perintah ini hanya untuk pemilik bot.");
    const code = newCode();
    await users.createInvite(db, code, Number(env.OWNER_ID));
    return ctx.reply(
      [
        `🎟️ Kode undangan: ${code}`,
        `Kirim ke orang yang kamu undang. Mereka cukup mengetik: /join ${code}`,
        "Berlaku 7 hari, sekali pakai.",
      ].join("\n"),
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
    const suspend = ctx.command === "suspend";
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
