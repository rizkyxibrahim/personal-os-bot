import type { Bot } from "grammy";
import type { Env } from "../env";
import { todayJakarta } from "../dates";
import { rupiah } from "../format";
import { parseEntry, parseEntryDate } from "../finance/entry";
import * as q from "../finance/queries";
import * as tpl from "../finance/templates";
import { resolveEntry, saveEntry } from "./finance";

const SHORTCUT_RE = /^[\p{L}\p{N}_-]{1,20}$/u;
const MAX_TEMPLATES = 50;

const USAGE = [
  "Template cepat:",
  "/template add kopi out 25k kopi susu gula aren [Cash]",
  "/template list",
  "/template delete kopi",
  "/qr kopi — catat dari template",
  "/qr kopi kemarin — catat dengan tanggal lain",
].join("\n");

export function registerTemplates(bot: Bot, env: Env): void {
  const db = env.DB;

  bot.command("template", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    await q.ensureDefaults(db, userId);

    const [action = "", shortcut = "", ...rest] = ctx.match.trim().split(/\s+/);

    switch (action.toLowerCase()) {
      case "add":
      case "create":
      case "tambah": {
        if (!SHORTCUT_RE.test(shortcut)) return ctx.reply(USAGE);

        const today = todayJakarta();
        const parsed = parseEntry(rest.join(" "), today);
        if (parsed.kind === "error") return ctx.reply(`⚠️ ${parsed.message}`);
        if (parsed.kind === "none") return ctx.reply(USAGE);

        const { entry } = parsed;
        if (entry.date !== today) {
          return ctx.reply(
            "Template tidak menyimpan tanggal. Pakai /qr kopi kemarin untuk tanggal lain.",
          );
        }

        const target = await resolveEntry(db, userId, entry);
        if (!target.ok) return ctx.reply(target.error);

        const note = entry.words.join(" ") || null;
        if (note && note.length > 200)
          return ctx.reply(
            "Keterangan terlalu panjang (maksimal 200 karakter).",
          );

        const existing = await tpl.findTemplate(db, userId, shortcut);
        if (
          !existing &&
          (await tpl.countTemplates(db, userId)) >= MAX_TEMPLATES
        ) {
          return ctx.reply(
            `Maksimal ${MAX_TEMPLATES} template. Hapus yang tidak dipakai dulu: /template delete nama`,
          );
        }

        await tpl.upsertTemplate(db, userId, {
          shortcut,
          type: entry.type,
          amount: entry.amount,
          accountId: target.account.id,
          categoryId: target.category?.id ?? null,
          note,
        });

        return ctx.reply(
          [
            `✅ Template "${shortcut}" ${existing ? "diperbarui" : "disimpan"}`,
            `${entry.type === "in" ? "📈" : "📉"} ${rupiah(entry.amount)} · ${target.category?.name ?? "-"} · ${target.account.name}`,
            note ? `📝 ${note}` : "",
            `Pakai: /qr ${shortcut}`,
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }

      case "list":
      case "daftar": {
        const list = await tpl.listTemplates(db, userId);
        if (list.length === 0)
          return ctx.reply("Belum ada template.\n\n" + USAGE);

        const lines = list.map((t) => {
          const parts = [
            `⚡ ${t.shortcut} — ${t.type === "in" ? "📈" : "📉"} ${rupiah(t.amount)}`,
          ];
          if (t.category_name) parts.push(t.category_name);
          if (t.note) parts.push(t.note);
          parts.push(t.account_name);
          return `${parts.join(" · ")} (dipakai ${t.use_count}×)`;
        });
        return ctx.reply(
          ["⚡ Template", "", ...lines, "", "Pakai: /qr nama"].join("\n"),
        );
      }

      case "delete":
      case "del":
      case "hapus": {
        if (!shortcut) return ctx.reply("Format: /template delete nama");
        const ok = await tpl.deleteTemplate(db, userId, shortcut);
        return ctx.reply(
          ok
            ? `🗑️ Template "${shortcut}" dihapus.`
            : `Template "${shortcut}" tidak ditemukan.`,
        );
      }

      default:
        return ctx.reply(USAGE);
    }
  });

  bot.command("qr", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    await q.ensureDefaults(db, userId);

    const [shortcut = "", dateArg] = ctx.match.trim().split(/\s+/);
    if (!shortcut)
      return ctx.reply(
        "Format: /qr nama [tanggal]\nLihat daftar: /template list",
      );

    const t = await tpl.findTemplate(db, userId, shortcut);
    if (!t)
      return ctx.reply(
        `Template "${shortcut}" tidak ditemukan. Lihat /template list`,
      );

    const today = todayJakarta();
    let date = today;
    if (dateArg) {
      const parsed = parseEntryDate(dateArg, today);
      if (!parsed)
        return ctx.reply(
          "Tanggal tidak valid. Contoh: /qr kopi kemarin atau /qr kopi 05/10",
        );
      if (parsed > today)
        return ctx.reply("Tanggal tidak boleh di masa depan.");
      date = parsed;
    }

    const text = await saveEntry(db, {
      userId,
      type: t.type,
      amount: t.amount,
      date,
      account: { id: t.account_id, name: t.account_name },
      category:
        t.category_id === null
          ? null
          : { id: t.category_id, name: t.category_name ?? "-" },
      note: t.note,
      autoCategory: false,
    });
    await tpl.markTemplateUsed(db, userId, t.id);

    return ctx.reply(`⚡ Template ${t.shortcut}\n${text}`);
  });
}
