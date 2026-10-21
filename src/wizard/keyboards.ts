import { InlineKeyboard, type Context } from "grammy";

export function txActionKeyboard(id: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("✏️ Ubah", `t:edit:${id}`)
    .text("🗑️ Hapus", `t:del:${id}`);
}

// Pesan konfirmasi yang memuat "(#12)" otomatis diberi tombol Ubah/Hapus
export function undoKeyboard(text: string): InlineKeyboard | null {
  const m = text.match(/\(#(\d+)\)/);
  return m ? txActionKeyboard(Number(m[1])) : null;
}

export async function replyWithUndo(ctx: Context, text: string): Promise<void> {
  const kb = undoKeyboard(text);
  if (kb) await ctx.reply(text, { reply_markup: kb });
  else await ctx.reply(text);
}
