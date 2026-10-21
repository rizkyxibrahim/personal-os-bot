import { InputFile, type Context } from "grammy";
import type { Env } from "../env";
import { buildBackup, countData, resetData } from "../services/backup";
import { startFlow } from "./engine";
import type { Flow } from "./types";

const CODE_TTL_MS = 5 * 60 * 1000;

function randomCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from(
    crypto.getRandomValues(new Uint8Array(5)),
    (b) => letters[b % letters.length],
  ).join("");
}

export async function sendBackup(
  ctx: Context,
  env: Env,
  caption: string,
): Promise<void> {
  const userId = ctx.from?.id;
  if (userId === undefined) return;

  const backup = await buildBackup(env.DB, userId);
  await ctx.replyWithDocument(
    new InputFile(new TextEncoder().encode(backup.json), backup.filename),
    { caption },
  );
}

// Kirim cadangan dulu, baru mulai tanya-jawab
export async function startReset(ctx: Context, env: Env): Promise<void> {
  await sendBackup(
    ctx,
    env,
    "📦 Cadangan data sebelum reset (JSON). Simpan baik-baik, ini satu-satunya salinan setelah dihapus.",
  );
  await startFlow(ctx, env, "reset", { code: randomCode(), t: Date.now() });
}

export function resetFlow(): Flow {
  return {
    id: "reset",
    title: "🧹 Reset data",
    question: "Hapus sekarang?",
    saveLabel: "🗑️ Ya, hapus",

    steps: [
      {
        key: "scope",
        ask: () =>
          "Apa yang mau dihapus?\n(Cadangan JSON sudah dikirim di atas.)",
        options: () => [
          { label: "🧾 Hanya transaksi", value: "transactions" },
          { label: "💣 Semua data", value: "all" },
        ],
        parse: (input) => {
          const t = input.trim();
          return t === "transactions" || t === "all"
            ? { ok: true, value: t }
            : { ok: false, error: "Pilih salah satu dari tombol." };
        },
      },
      {
        key: "confirm",
        ask: (_fc, d) =>
          `Ketik kode ini untuk konfirmasi (berlaku 5 menit):\n\n${d.code as string}`,
        parse: (input, _fc, d) => {
          if (Date.now() - (d.t as number) > CODE_TTL_MS)
            return {
              ok: false,
              error: "Kode kedaluwarsa. Mulai lagi dengan /reset.",
            };
          return input.trim().toUpperCase() === d.code
            ? { ok: true, value: true }
            : { ok: false, error: "Kode tidak cocok." };
        },
      },
    ],

    summary: async (fc, d) => {
      const c = await countData(fc.db, fc.userId);
      if (d.scope === "all") {
        return [
          "💣 SEMUA data akan dihapus:",
          `• Transaksi: ${c.transactions}`,
          `• Akun: ${c.accounts}`,
          `• Kategori: ${c.categories}`,
          `• Budget: ${c.budgets}`,
          `• Template: ${c.templates}`,
          `• Langganan: ${c.subscriptions}`,
          `• Hutang/piutang: ${c.debts}`,
          `• Goals: ${c.goals}`,
          `• Tugas: ${c.tasks}`,
          "",
          "Tidak bisa dibatalkan. Bot akan mulai dari nol (akun Cash dan kategori bawaan dibuat ulang).",
        ].join("\n");
      }
      return [
        `🧾 ${c.transactions} transaksi akan dihapus.`,
        "Akun, kategori, budget, goals, hutang, dan lainnya tetap ada.",
        "Saldo setiap akun kembali ke saldo awalnya.",
        "",
        "Tidak bisa dibatalkan.",
      ].join("\n");
    },

    finish: async (fc, d) => {
      if (Date.now() - (d.t as number) > CODE_TTL_MS)
        return "⚠️ Kode kedaluwarsa. Mulai lagi dengan /reset.";
      await resetData(fc.db, fc.userId, d.scope as "transactions" | "all");
      return d.scope === "all"
        ? "🧹 Selesai. Semua data dihapus. Ketik /start untuk mulai dari awal."
        : "🧹 Selesai. Semua transaksi dihapus; akun dan pengaturan lain tetap.";
    },
  };
}
