import type { Bot } from "grammy";
import type { Env } from "../env";
import { generate } from "../ai/gemini";

const MAX_INPUT = 1000;

const SYSTEM = [
  "Kamu asisten di dalam bot pribadi untuk mencatat keuangan dan tugas.",
  "Jawab singkat dan jelas dalam bahasa Indonesia.",
  "Kamu tidak bisa mengubah data, mencatat transaksi, atau mengakses akun pengguna.",
  "Kalau diminta melakukan hal itu, arahkan pengguna ke perintah bot yang sesuai, seperti /menu atau /help.",
  "Kamu tidak memiliki data keuangan pengguna, jadi jangan mengarang angka pribadi.",
  "Jawabanmu bukan nasihat keuangan atau investasi profesional.",
].join(" ");

export function registerAi(bot: Bot, env: Env): void {
  bot.command("ai", async (ctx) => {
    const question = ctx.match.trim();
    if (!question) {
      return ctx.reply(
        "Format: /ai pertanyaanmu\nContoh: /ai jelaskan bedanya reksa dana pasar uang dan obligasi\n\nJangan kirim data rahasia (nomor rekening, kata sandi) ke sini.",
      );
    }
    if (question.length > MAX_INPUT)
      return ctx.reply(
        `Pertanyaan terlalu panjang (maks ${MAX_INPUT} karakter).`,
      );

    await ctx.reply("🤖 Sedang berpikir…");
    try {
      const answer = await generate(env, [{ text: question }], {
        system: SYSTEM,
        temperature: 0.4,
      });
      return ctx.reply(answer.slice(0, 4000));
    } catch (err) {
      console.error("[ai] gagal", err);
      return ctx.reply(
        "⚠️ AI sedang sibuk atau tidak tersedia. Coba lagi beberapa menit lagi.",
      );
    }
  });
}
