import type { Bot } from "grammy";
import type { Env } from "../env";
import { getBalance, getToday } from "../db";
import { rupiah } from "../format";

export const HELP_TEXT = [
  "📖 Perintah yang tersedia",
  "",
  "Keuangan:",
  "/in 5jt gaji — catat pemasukan",
  "/out 25000 makan siang #makan — catat pengeluaran",
  "/saldo — lihat saldo",
  "/hariini — transaksi hari ini",
  "/hapus 12 — hapus transaksi nomor 12",
  "",
  "Umum:",
  "/start — dashboard hari ini",
  "/help — daftar perintah ini",
  "",
  "Segera hadir: tugas, berita, saham, email, laporan bulanan, struk.",
].join("\n");

function todayLabel(): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

async function balanceSection(env: Env): Promise<string> {
  const [balance, today] = await Promise.all([
    getBalance(env.DB),
    getToday(env.DB),
  ]);

  const sum = (type: "in" | "out") =>
    today.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);

  return [
    `💰 Saldo: ${rupiah(balance.totalIn - balance.totalOut)}`,
    `Hari ini: masuk ${rupiah(sum("in"))}, keluar ${rupiah(sum("out"))}`,
  ].join("\n");
}

// Placeholder: diganti dengan data asli di phase berikutnya
async function newsSection(): Promise<string> {
  return "📰 Berita penting\nBelum diaktifkan (Phase 5).";
}

async function emailSection(): Promise<string> {
  return "📧 Email penting\nBelum diaktifkan (Phase 6).";
}

async function tasksSection(): Promise<string> {
  return "✅ Tugas yang belum selesai\nBelum diaktifkan (Phase 2).";
}

// Satu bagian gagal tidak boleh merusak seluruh dashboard
async function safe(
  label: string,
  fn: () => Promise<string>,
  title: string,
): Promise<string> {
  try {
    return await fn();
  } catch (err) {
    console.error(`Dashboard section failed: ${label}`, err);
    return `${title}\nGagal memuat data.`;
  }
}

export function registerStart(bot: Bot, env: Env): void {
  bot.command("start", async (ctx) => {
    const name = ctx.from?.first_name ?? "kamu";

    const sections = await Promise.all([
      safe("balance", () => balanceSection(env), "💰 Saldo"),
      safe("news", newsSection, "📰 Berita penting"),
      safe("email", emailSection, "📧 Email penting"),
      safe("tasks", tasksSection, "✅ Tugas yang belum selesai"),
    ]);

    const text = [
      `Hi ${name}! 👋`,
      `Sekarang hari ${todayLabel()}.`,
      "",
      sections.join("\n\n"),
      "",
      "Ketik /help untuk melihat semua perintah.",
    ].join("\n");

    return ctx.reply(text);
  });

  bot.command("help", (ctx) => ctx.reply(HELP_TEXT));
}
