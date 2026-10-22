import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { Env } from "../env";
import { ago, newsLines } from "../news/format";
import { CATEGORIES, type Category } from "../news/feeds";
import { checkFeeds, getNews } from "../news/news";

const NO_PREVIEW = { is_disabled: true };

function findCategory(arg: string): Category | undefined {
  const a = arg.trim().toLowerCase();
  return CATEGORIES.find((c) => c.id === a || c.aliases.includes(a));
}

function keyboard(activeId: string): InlineKeyboard {
  const kb = new InlineKeyboard();

  CATEGORIES.forEach((category, index) => {
    const active = category.id === activeId;
    const label = `${active ? "✓ " : ""}${category.icon} ${category.label}`;

    kb.text(label, `n:${category.id}`);

    if (index % 2 === 1 && index < CATEGORIES.length - 1) {
      kb.row();
    }
  });

  return kb.row().text("🏠 Menu Utama", "m:menu");
}

async function buildNewsMessage(env: Env, category: Category): Promise<string> {
  const { items, stale } = await getNews(env.DB, category, 8);
  if (items.length === 0) {
    return `📰 ${category.icon} ${category.label}\n\nBerita belum bisa dimuat. Coba lagi nanti, atau cek /beritastatus.`;
  }

  const lines = [
    `📰 ${category.icon} Berita ${category.label}`,
    "",
    ...newsLines(items, true),
  ];
  if (stale)
    lines.push("⚠️ Sebagian sumber gagal dimuat, menampilkan data tersimpan.");
  lines.push(
    "Sumber: RSS media terkait. Buka tautan untuk membaca selengkapnya.",
  );
  return lines.join("\n").trim();
}

export async function sendNews(
  ctx: Context,
  env: Env,
  category: Category,
): Promise<void> {
  await ctx.reply(await buildNewsMessage(env, category), {
    reply_markup: keyboard(category.id),
    link_preview_options: NO_PREVIEW,
  });
}

// Tombol kategori: n:<id>
export async function handleNewsCallback(
  ctx: Context,
  env: Env,
): Promise<void> {
  try {
    await ctx.answerCallbackQuery();
  } catch {
    // tombol sudah terlalu lama
  }

  const category = findCategory((ctx.callbackQuery?.data ?? "").slice(2));
  if (!category) return;

  const text = await buildNewsMessage(env, category);
  try {
    await ctx.editMessageText(text, {
      reply_markup: keyboard(category.id),
      link_preview_options: NO_PREVIEW,
    });
  } catch {
    await ctx.reply(text, {
      reply_markup: keyboard(category.id),
      link_preview_options: NO_PREVIEW,
    });
  }
}

export function registerNews(bot: Bot, env: Env): void {
  bot.command(["berita", "news"], async (ctx) => {
    const arg = ctx.match.trim();
    if (!arg) return sendNews(ctx, env, CATEGORIES[0]);

    const category = findCategory(arg);
    if (!category) {
      return ctx.reply(
        `Kategori "${arg}" tidak ada.\nPilih: ${CATEGORIES.map((c) => c.aliases[0]).join(", ")}`,
      );
    }
    return sendNews(ctx, env, category);
  });

  // Diagnosa: sumber RSS mana yang berhasil dimuat dari Worker
  bot.command("beritastatus", async (ctx) => {
    await ctx.reply("Memeriksa sumber berita…");
    const results = await checkFeeds(env.DB);

    const lines = ["📰 Status sumber berita", ""];
    for (const r of results) {
      lines.push(
        r.ok
          ? `✅ ${r.feed.id} · ${r.count} item${r.newest ? ` · terbaru ${ago(r.newest)}` : ""}`
          : `❌ ${r.feed.id} · ${r.error}`,
      );
    }
    lines.push("", "Yang ❌ bisa diperbaiki alamatnya di src/news/feeds.ts.");
    return ctx.reply(lines.join("\n"));
  });
}
