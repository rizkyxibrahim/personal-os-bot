import type { Bot } from "grammy";
import type { Env } from "../env";
import { formatDue, todayJakarta } from "../dates";
import { parseDue, parseTaskInput } from "../taskParse";
import { formatTask, groupTasks, section } from "../services/taskView";
import {
  addTask,
  completeTask,
  deleteTask,
  listOpenTasks,
  updateTask,
  type Task,
} from "../tasksDb";

const USAGE_ADD = [
  "Format: /addtask judul @tanggal !prioritas #kategori",
  "Contoh: /addtask Bayar listrik @besok !tinggi #rumah",
  "Tanggal: @hariini, @besok, @lusa, @25/10, @2026-10-25",
  "Prioritas: !tinggi, !sedang, !rendah",
].join("\n");

function clip(text: string): string {
  return text.length > 3900 ? text.slice(0, 3900) + "\n…(dipotong)" : text;
}

function parseId(raw: string): number | null {
  const n = parseInt(raw.replace(/^#/, ""), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function registerTasks(bot: Bot, env: Env): void {
  const db = env.DB;

  bot.command(["addtask", "tambah"], async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const parsed = parseTaskInput(ctx.match);
    if (!parsed.ok) return ctx.reply(`⚠️ ${parsed.error}`);

    const v = parsed.value;
    if (!v.title) return ctx.reply(USAGE_ADD);
    if (v.title.length > 200)
      return ctx.reply("Judul terlalu panjang (maksimal 200 karakter).");

    const saved: Omit<Task, "id"> = {
      title: v.title,
      status: "open",
      priority: v.priority ?? "normal",
      category: v.category ?? null,
      due_date: v.dueDate ?? null,
    };
    const id = await addTask(db, userId, {
      title: saved.title,
      priority: saved.priority,
      category: saved.category,
      dueDate: saved.due_date,
    });

    return ctx.reply(`✅ Tugas ditambahkan\n${formatTask({ id, ...saved })}`);
  });

  bot.command(["todo", "tugas"], async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const tasks = await listOpenTasks(db, userId);
    if (tasks.length === 0)
      return ctx.reply("Belum ada tugas aktif. Tambah dengan /addtask.");

    const g = groupTasks(tasks, todayJakarta());
    const lines = [
      `📋 Tugas aktif (${tasks.length})`,
      "",
      ...section("⏰ Terlewat", g.overdue),
      ...section("📅 Hari ini", g.today),
      ...section("🗓️ Mendatang", g.upcoming),
      ...section("📌 Tanpa tanggal", g.noDate),
    ];
    return ctx.reply(clip(lines.join("\n").trim()));
  });

  bot.command("today", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const g = groupTasks(await listOpenTasks(db, userId), todayJakarta());
    if (g.overdue.length + g.today.length === 0) {
      return ctx.reply(
        "Tidak ada tugas yang jatuh tempo hari ini. 🎉\nLihat semua tugas dengan /todo.",
      );
    }

    const lines = [
      "🗒️ Rencana hari ini",
      "",
      ...section("⏰ Terlewat", g.overdue),
      ...section("📅 Hari ini", g.today),
    ];
    return ctx.reply(clip(lines.join("\n").trim()));
  });

  bot.command("done", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const id = parseId(ctx.match.trim());
    if (id === null) return ctx.reply("Format: /done ID\nContoh: /done 3");

    const ok = await completeTask(db, userId, id);
    return ctx.reply(
      ok ? `🎉 Tugas #${id} selesai!` : `Tugas aktif #${id} tidak ditemukan.`,
    );
  });

  bot.command("tunda", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const [idRaw = "", dueRaw = ""] = ctx.match.trim().split(/\s+/);
    const id = parseId(idRaw);
    const due = parseDue(dueRaw.replace(/^@/, ""));
    if (id === null || !due)
      return ctx.reply(
        "Format: /tunda ID tanggal\nContoh: /tunda 3 besok atau /tunda 3 25/10",
      );

    const ok = await updateTask(db, userId, id, { dueDate: due });
    return ctx.reply(
      ok
        ? `⏭️ Tugas #${id} ditunda ke ${formatDue(due)}.`
        : `Tugas aktif #${id} tidak ditemukan.`,
    );
  });

  bot.command(["deltask", "hapustugas"], async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const id = parseId(ctx.match.trim());
    if (id === null)
      return ctx.reply("Format: /deltask ID\nContoh: /deltask 3");

    const ok = await deleteTask(db, userId, id);
    return ctx.reply(
      ok ? `🗑️ Tugas #${id} dihapus.` : `Tugas #${id} tidak ditemukan.`,
    );
  });

  bot.command("edittask", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const [idRaw = "", ...rest] = ctx.match.trim().split(/\s+/);
    const id = parseId(idRaw);
    if (id === null) {
      return ctx.reply(
        "Format: /edittask ID [judul baru] [@tanggal] [!prioritas] [#kategori]\nContoh: /edittask 3 @lusa !rendah",
      );
    }

    const parsed = parseTaskInput(rest.join(" "));
    if (!parsed.ok) return ctx.reply(`⚠️ ${parsed.error}`);

    const v = parsed.value;
    const patch = {
      title: v.title || undefined,
      priority: v.priority,
      category: v.category,
      dueDate: v.dueDate,
    };
    if (Object.values(patch).every((x) => x === undefined)) {
      return ctx.reply(
        "Tidak ada perubahan. Tulis judul baru, @tanggal, !prioritas, atau #kategori.",
      );
    }
    if (patch.title && patch.title.length > 200)
      return ctx.reply("Judul terlalu panjang (maksimal 200 karakter).");

    const ok = await updateTask(db, userId, id, patch);
    return ctx.reply(
      ok
        ? `✏️ Tugas #${id} diperbarui. Cek dengan /todo.`
        : `Tugas aktif #${id} tidak ditemukan.`,
    );
  });
}
