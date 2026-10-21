import type { Bot } from "grammy";
import type { Env } from "../env";
import { formatDue, todayJakarta } from "../dates";
import { parseTaskInput } from "../taskParse";
import {
  addTask,
  completeTask,
  deleteTask,
  listOpenTasks,
  updateTask,
  type Task,
} from "../tasksDb";

const PRIORITY_ICON = { high: "🔴", normal: "🟡", low: "🟢" } as const;

export function formatTask(t: Task): string {
  const parts = [`#${t.id} ${PRIORITY_ICON[t.priority]} ${t.title}`];
  if (t.category) parts.push(`#${t.category}`);
  if (t.due_date) parts.push(`(${formatDue(t.due_date)})`);
  return parts.join(" ");
}

export function groupTasks(tasks: Task[], today: string) {
  return {
    overdue: tasks.filter((t) => t.due_date !== null && t.due_date < today),
    today: tasks.filter((t) => t.due_date === today),
    upcoming: tasks.filter((t) => t.due_date !== null && t.due_date > today),
    noDate: tasks.filter((t) => t.due_date === null),
  };
}

function section(title: string, tasks: Task[]): string[] {
  return tasks.length > 0 ? [title, ...tasks.map(formatTask), ""] : [];
}

function clip(text: string): string {
  return text.length > 3900 ? text.slice(0, 3900) + "\n…(dipotong)" : text;
}

const USAGE_ADD = [
  "Format: /addtask judul @tanggal !prioritas #kategori",
  "Contoh: /addtask Bayar listrik @besok !tinggi #rumah",
  "Tanggal: @hariini, @besok, @lusa, @25/10, @2026-10-25",
  "Prioritas: !tinggi, !sedang, !rendah",
].join("\n");

export function registerTasks(bot: Bot, env: Env): void {
  bot.command(["addtask", "tambah"], async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const parsed = parseTaskInput(ctx.match);
    if (!parsed.ok) return ctx.reply(`⚠️ ${parsed.error}`);

    const v = parsed.value;
    if (!v.title) return ctx.reply(USAGE_ADD);
    if (v.title.length > 200)
      return ctx.reply("Judul terlalu panjang (maksimal 200 karakter).");

    const id = await addTask(env.DB, userId, {
      title: v.title,
      priority: v.priority ?? "normal",
      category: v.category ?? null,
      dueDate: v.dueDate ?? null,
    });

    const saved: Task = {
      id,
      title: v.title,
      status: "open",
      priority: v.priority ?? "normal",
      category: v.category ?? null,
      due_date: v.dueDate ?? null,
    };
    return ctx.reply(`✅ Tugas ditambahkan\n${formatTask(saved)}`);
  });

  bot.command(["todo", "tugas"], async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const tasks = await listOpenTasks(env.DB, userId);
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

    const g = groupTasks(await listOpenTasks(env.DB, userId), todayJakarta());
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

    const id = parseInt(ctx.match.trim().replace(/^#/, ""), 10);
    if (!Number.isInteger(id))
      return ctx.reply("Format: /done ID\nContoh: /done 3");

    const ok = await completeTask(env.DB, userId, id);
    return ctx.reply(
      ok ? `🎉 Tugas #${id} selesai!` : `Tugas aktif #${id} tidak ditemukan.`,
    );
  });

  bot.command(["deltask", "hapustugas"], async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const id = parseInt(ctx.match.trim().replace(/^#/, ""), 10);
    if (!Number.isInteger(id))
      return ctx.reply("Format: /deltask ID\nContoh: /deltask 3");

    const ok = await deleteTask(env.DB, userId, id);
    return ctx.reply(
      ok ? `🗑️ Tugas #${id} dihapus.` : `Tugas #${id} tidak ditemukan.`,
    );
  });

  bot.command("edittask", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const [idRaw = "", ...rest] = ctx.match.trim().split(/\s+/);
    const id = parseInt(idRaw.replace(/^#/, ""), 10);
    if (!Number.isInteger(id)) {
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

    const ok = await updateTask(env.DB, userId, id, patch);
    return ctx.reply(
      ok
        ? `✏️ Tugas #${id} diperbarui. Cek dengan /todo.`
        : `Tugas aktif #${id} tidak ditemukan.`,
    );
  });
}
