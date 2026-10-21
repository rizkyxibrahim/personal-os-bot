import { InlineKeyboard, type Context } from "grammy";
import type { Env } from "../env";
import * as acc from "../finance/accounts";
import * as q from "../finance/queries";
import { rupiah } from "../format";
import { startFlow } from "./engine";

const ICON = { cash: "💵", bank: "🏦", ewallet: "📱", asset: "🏠" } as const;
const NEEDS_ACCOUNT = [
  "open",
  "ren",
  "init",
  "def",
  "arc",
  "arcok",
  "del",
  "delok",
  "unarc",
];

interface View {
  text: string;
  kb: InlineKeyboard;
}

async function listView(
  env: Env,
  userId: number,
  note?: string,
): Promise<View> {
  const accounts = await q.listAccounts(env.DB, userId);
  const kb = new InlineKeyboard();
  for (const a of accounts) {
    kb.text(
      `${ICON[a.type]} ${a.name}${a.is_default ? " ⭐" : ""} · ${rupiah(a.balance)}`,
      `a:open:${a.id}`,
    ).row();
  }
  kb.text("➕ Akun baru", "a:new").text("🗄️ Diarsipkan", "a:arclist");

  const lines = [
    "🏦 Kelola akun",
    "Pilih akun untuk ganti nama, ubah saldo awal, arsipkan, atau hapus.",
  ];
  if (note) lines.push("", note);
  return { text: lines.join("\n"), kb };
}

async function archivedView(env: Env, userId: number): Promise<View> {
  const list = await acc.listArchivedAccounts(env.DB, userId);
  const kb = new InlineKeyboard();
  for (const a of list)
    kb.text(`♻️ Aktifkan ${a.name}`, `a:unarc:${a.id}`).row();
  kb.text("⬅️ Daftar akun", "a:list");
  return {
    text:
      list.length === 0
        ? "🗄️ Tidak ada akun yang diarsipkan."
        : "🗄️ Akun diarsipkan\nTekan untuk mengaktifkan lagi.",
    kb,
  };
}

function detailView(a: acc.AccountInfo, note?: string): View {
  const kb = new InlineKeyboard()
    .text("✏️ Ganti nama", `a:ren:${a.id}`)
    .text("💰 Saldo awal", `a:init:${a.id}`)
    .row();
  if (!a.is_default) kb.text("⭐ Jadikan utama", `a:def:${a.id}`).row();
  kb.text("🗄️ Arsipkan", `a:arc:${a.id}`)
    .text("🗑️ Hapus", `a:del:${a.id}`)
    .row()
    .text("⬅️ Daftar akun", "a:list");

  const lines = [
    `${ICON[a.type]} ${a.name}${a.is_default ? " ⭐ (akun utama)" : ""}`,
    `💰 Saldo: ${rupiah(a.balance)}`,
    `🏁 Saldo awal: ${rupiah(a.initial_balance)}`,
    `🧾 ${a.tx_count} transaksi`,
  ];
  if (note) lines.push("", note);
  return { text: lines.join("\n"), kb };
}

function confirmView(text: string, yes: string, back: string): View {
  return {
    text,
    kb: new InlineKeyboard().text("✅ Ya", yes).text("❌ Batal", back),
  };
}

function archiveBlocker(a: acc.AccountInfo): string | null {
  if (a.is_default)
    return "Ini akun utama. Jadikan akun lain sebagai akun utama dulu.";
  if (a.balance !== 0) {
    return `Saldo masih ${rupiah(a.balance)}. Pindahkan dulu lewat /transfer atau /koreksi sampai Rp 0.`;
  }
  if (a.sub_active > 0 || a.tpl_count > 0)
    return "Masih dipakai oleh langganan atau template. Ubah atau hapus itu dulu.";
  return null;
}

function deleteBlocker(a: acc.AccountInfo): string | null {
  if (a.is_default)
    return "Ini akun utama. Jadikan akun lain sebagai akun utama dulu.";
  if (a.tx_count > 0)
    return `Sudah punya ${a.tx_count} transaksi. Pakai Arsipkan supaya riwayat tetap utuh.`;
  if (a.sub_total > 0 || a.tpl_count > 0)
    return "Masih terhubung dengan langganan atau template. Pakai Arsipkan.";
  return null;
}

async function edit(ctx: Context, view: View): Promise<void> {
  try {
    await ctx.editMessageText(view.text, { reply_markup: view.kb });
  } catch {
    await ctx.reply(view.text, { reply_markup: view.kb });
  }
}

export async function showAccountList(
  ctx: Context,
  env: Env,
  userId: number,
): Promise<void> {
  const v = await listView(env, userId);
  await ctx.reply(v.text, { reply_markup: v.kb });
}

// Tombol: a:<aksi>:<id>
export async function handleAccountCallback(
  ctx: Context,
  env: Env,
): Promise<void> {
  try {
    await ctx.answerCallbackQuery();
  } catch {
    // tombol sudah terlalu lama
  }

  const userId = ctx.from?.id;
  const [, action = "", idRaw = ""] = (ctx.callbackQuery?.data ?? "").split(
    ":",
  );
  const id = Number(idRaw);
  if (userId === undefined) return;

  if (action === "list") return edit(ctx, await listView(env, userId));
  if (action === "arclist") return edit(ctx, await archivedView(env, userId));
  if (action === "new") return startFlow(ctx, env, "acct");
  if (!NEEDS_ACCOUNT.includes(action)) return;

  const a =
    Number.isInteger(id) && id > 0
      ? await acc.getAccountInfo(env.DB, userId, id)
      : null;
  if (!a)
    return edit(ctx, await listView(env, userId, "Akun tidak ditemukan."));

  switch (action) {
    case "open":
      return edit(ctx, detailView(a));

    case "ren":
      return startFlow(ctx, env, "acctrename", { accountId: a.id });

    case "init":
      return startFlow(ctx, env, "acctinit", { accountId: a.id });

    case "def": {
      if (a.archived)
        return edit(
          ctx,
          detailView(a, "⚠️ Akun diarsipkan tidak bisa jadi akun utama."),
        );
      await acc.setDefaultAccount(env.DB, userId, a.id);
      const fresh = await acc.getAccountInfo(env.DB, userId, a.id);
      return edit(ctx, detailView(fresh ?? a, "⭐ Sekarang jadi akun utama."));
    }

    case "arc": {
      const why = archiveBlocker(a);
      if (why) return edit(ctx, detailView(a, `⚠️ ${why}`));
      return edit(
        ctx,
        confirmView(
          `Arsipkan akun ${a.name}?\nAkun disembunyikan dari daftar dan tombol, riwayat tetap utuh. Bisa diaktifkan lagi.`,
          `a:arcok:${a.id}`,
          `a:open:${a.id}`,
        ),
      );
    }

    case "arcok": {
      const why = archiveBlocker(a);
      if (why) return edit(ctx, detailView(a, `⚠️ ${why}`));
      await acc.setArchived(env.DB, userId, a.id, true);
      return edit(
        ctx,
        await listView(env, userId, `🗄️ Akun ${a.name} diarsipkan.`),
      );
    }

    case "del": {
      const why = deleteBlocker(a);
      if (why) return edit(ctx, detailView(a, `⚠️ ${why}`));
      return edit(
        ctx,
        confirmView(
          `Hapus permanen akun ${a.name}?\nTindakan ini tidak bisa dibatalkan.`,
          `a:delok:${a.id}`,
          `a:open:${a.id}`,
        ),
      );
    }

    case "delok": {
      const why = deleteBlocker(a);
      if (why) return edit(ctx, detailView(a, `⚠️ ${why}`));
      await acc.deleteAccount(env.DB, userId, a.id);
      return edit(
        ctx,
        await listView(env, userId, `🗑️ Akun ${a.name} dihapus.`),
      );
    }

    case "unarc": {
      await acc.setArchived(env.DB, userId, a.id, false);
      return edit(
        ctx,
        await listView(env, userId, `♻️ Akun ${a.name} aktif lagi.`),
      );
    }
  }
}
