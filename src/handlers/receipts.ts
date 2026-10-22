import type { Bot, Context } from "grammy";
import type { Env } from "../env";
import { todayJakarta } from "../dates";
import { extractReceipt } from "../ai/receipts";
import { startFlow } from "../wizard/engine";

const MAX_BYTES = 4_000_000;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

async function download(
  ctx: Context,
  env: Env,
  fileId: string,
): Promise<Uint8Array> {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) throw new Error("file_path kosong");

  const res = await fetch(
    `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`,
    {
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// Transaksi struk dengan tanggal dan nominal yang sama
async function findDuplicate(
  env: Env,
  userId: number,
  amount: number,
  date: string,
): Promise<number | null> {
  const row = await env.DB.prepare(
    `SELECT id FROM transactions
     WHERE user_id = ?1 AND type = 'out' AND amount = ?2 AND tx_date = ?3
       AND deleted_at IS NULL AND note LIKE 'Struk%'
     LIMIT 1`,
  )
    .bind(userId, amount, date)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export function registerReceipts(bot: Bot, env: Env): void {
  bot.on(["message:photo", "message:document"], async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const msg = ctx.message;
    let fileId: string;
    let mime: string;
    let size: number | undefined;

    if (msg.photo) {
      const largest = msg.photo[msg.photo.length - 1];
      fileId = largest.file_id;
      mime = "image/jpeg"; // Telegram selalu mengirim foto sebagai JPEG
      size = largest.file_size;
    } else if (msg.document && ALLOWED.includes(msg.document.mime_type ?? "")) {
      fileId = msg.document.file_id;
      mime = msg.document.mime_type as string;
      size = msg.document.file_size;
    } else {
      return ctx.reply(
        "Kirim foto struk sebagai gambar (JPEG, PNG, atau WebP), bukan file lain.",
      );
    }

    if (size && size > MAX_BYTES) {
      return ctx.reply(
        "Foto terlalu besar (maks 4 MB). Kirim ulang sebagai foto biasa.",
      );
    }

    await ctx.reply("🧾 Membaca struk…");

    let result;
    try {
      const bytes = await download(ctx, env, fileId);
      if (bytes.byteLength > MAX_BYTES)
        return ctx.reply("Foto terlalu besar (maks 4 MB).");
      result = await extractReceipt(env, bytes, mime);
    } catch (err) {
      console.error("[receipt] gagal", err);
      return ctx.reply(
        "⚠️ Struk tidak bisa dibaca sekarang. Coba lagi nanti, atau catat manual: /out nominal keterangan",
      );
    }

    if (!result.ok)
      return ctx.reply(
        `⚠️ ${result.error}\nCatat manual: /out nominal keterangan`,
      );

    const { receipt, dateNote } = result;
    const date = receipt.date ?? todayJakarta();
    const duplicateOf = await findDuplicate(env, userId, receipt.total, date);

    return startFlow(ctx, env, "receipt", {
      merchant: receipt.merchant,
      total: receipt.total,
      date,
      dateNote,
      items: receipt.items.slice(0, 8),
      categoryHint: receipt.category,
      duplicateOf,
    });
  });
}
