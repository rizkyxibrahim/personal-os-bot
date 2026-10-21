import type { Bot } from "grammy";
import type { Env } from "../env";
import { todayJakarta } from "../dates";
import { rupiah } from "../format";
import * as q from "../finance/queries";

function todayLabel(): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

async function balanceSection(env: Env, userId: number): Promise<string> {
  await q.ensureDefaults(env.DB, userId);
  const [accounts, todayTx] = await Promise.all([
    q.listAccounts(env.DB, userId),
    q.listByDate(env.DB, userId, todayJakarta()),
  ]);

  const liquid = accounts
    .filter((a) => a.type !== "asset")
    .reduce((s, a) => s + a.balance, 0);
  const sum = (type: q.TxType) =>
    todayTx.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);

  return [
    `💰 Saldo: ${rupiah(liquid)}`,
    `Hari ini: masuk ${rupiah(sum("in"))}, keluar ${rupiah(sum("out"))}`,
  ].join("\n");
}

// Placeholder: diganti dengan data asli di phase berikutnya
async function newsSection(): Promise<string> {
  return "📰 Berita penting\nBelum diaktifkan.";
}

async function emailSection(): Promise<string> {
  return "📧 Email penting\nBelum diaktifkan.";
}

async function tasksSection(): Promise<string> {
  return "✅ Tugas yang belum selesai\nBelum diaktifkan.";
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
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    const name = ctx.from?.first_name ?? "kamu";

    const sections = await Promise.all([
      safe("balance", () => balanceSection(env, userId), "💰 Saldo"),
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
}
