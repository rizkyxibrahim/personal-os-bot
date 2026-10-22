import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { Env } from "../env";
import { ago } from "../news/format";
import {
  clip,
  INBOX_QUERY,
  listMail,
  UNREAD_QUERY,
  type MailSummary,
} from "../gmail/api";
import { createConnectUrl, revokeToken } from "../gmail/oauth";
import { deleteAccount, getAccount } from "../gmail/store";

const NO_PREVIEW = { is_disabled: true };

function mailLines(mails: MailSummary[]): string[] {
  return mails.flatMap((m, i) => [
    `${i + 1}. ${clip(m.subject, 110)}${m.unread ? " 🔵" : ""}`,
    `   ${clip(m.from, 40)} · ${ago(m.date)}`,
    `   ${clip(m.snippet, 110)}`,
    `   https://mail.google.com/mail/u/0/#inbox/${m.id}`,
    "",
  ]);
}

async function showList(
  ctx: Context,
  env: Env,
  query: string,
  title: string,
): Promise<void> {
  const userId = ctx.from?.id;
  if (userId === undefined) return;

  const account = await getAccount(env, userId);
  if (!account) {
    await ctx.reply("Gmail belum terhubung. Ketik /gmail dulu.");
    return;
  }

  try {
    const mails = await listMail(env, account.refreshToken, query, 10);
    if (mails.length === 0) {
      await ctx.reply(`${title}\n\nTidak ada.`);
      return;
    }
    await ctx.reply(
      [
        title,
        "",
        ...mailLines(mails),
        "Bot hanya menampilkan ringkasan. Isi lengkapnya dibuka di Gmail.",
      ].join("\n"),
      {
        link_preview_options: NO_PREVIEW,
      },
    );
  } catch (err) {
    console.error("[gmail] list gagal", err);
    await ctx.reply(
      "⚠️ Gagal membaca Gmail. Coba /gmail untuk menghubungkan ulang.",
    );
  }
}

export function registerEmail(bot: Bot, env: Env): void {
  bot.command("gmail", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const account = await getAccount(env, userId);
    const url = await createConnectUrl(env, userId);
    const kb = new InlineKeyboard().url(
      account ? "🔄 Hubungkan ulang" : "🔗 Hubungkan Gmail",
      url,
    );

    const text = account
      ? `📧 Terhubung: ${account.email}\nAkses hanya baca. Bot tidak bisa mengirim, menghapus, atau mengubah email.\nPutuskan: /gmailputus`
      : "📧 Gmail belum terhubung.\nAkses hanya baca. Bot tidak bisa mengirim, menghapus, atau mengubah email.";
    return ctx.reply(text, { reply_markup: kb });
  });

  bot.command(["inbox", "email"], (ctx) =>
    showList(ctx, env, INBOX_QUERY, "📥 10 email terakhir"),
  );
  bot.command("unread", (ctx) =>
    showList(ctx, env, UNREAD_QUERY, "📬 Email belum dibaca"),
  );

  bot.command("gmailputus", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const account = await getAccount(env, userId);
    if (!account) return ctx.reply("Gmail memang belum terhubung.");

    await revokeToken(account.refreshToken);
    await deleteAccount(env, userId);
    return ctx.reply(
      `✅ Akses ${account.email} diputus. Token sudah dihapus dari bot.`,
    );
  });
}
