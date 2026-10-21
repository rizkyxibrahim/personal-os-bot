import { todayJakarta } from "../dates";
import { rupiah } from "../format";
import * as q from "../finance/queries";
import { listOpenTasks } from "../tasksDb";
import { groupTasks, section } from "./taskView";

const ICON_ACCOUNT = {
  cash: "💵",
  bank: "🏦",
  ewallet: "📱",
  asset: "🏠",
} as const;

function clip(text: string): string {
  return text.length > 3900 ? text.slice(0, 3900) + "\n…(dipotong)" : text;
}

export async function buildSaldo(
  db: D1Database,
  userId: number,
): Promise<string> {
  await q.ensureDefaults(db, userId);
  const accounts = await q.listAccounts(db, userId);

  const sum = (list: q.AccountBalance[]) =>
    list.reduce((s, a) => s + a.balance, 0);
  const liquid = accounts.filter((a) => a.type !== "asset");
  const assets = accounts.filter((a) => a.type === "asset");

  const lines = [
    "💰 Saldo akun",
    "",
    ...accounts.map(
      (a) => `${ICON_ACCOUNT[a.type]} ${a.name}: ${rupiah(a.balance)}`,
    ),
    "",
    `Total kas & bank: ${rupiah(sum(liquid))}`,
  ];
  if (assets.length > 0) lines.push(`Total aset: ${rupiah(sum(assets))}`);
  return lines.join("\n");
}

export async function buildTodo(
  db: D1Database,
  userId: number,
): Promise<string> {
  const tasks = await listOpenTasks(db, userId);
  if (tasks.length === 0)
    return "Belum ada tugas aktif. Tambah dengan /addtask.";

  const g = groupTasks(tasks, todayJakarta());
  const lines = [
    `📋 Tugas aktif (${tasks.length})`,
    "",
    ...section("⏰ Terlewat", g.overdue),
    ...section("📅 Hari ini", g.today),
    ...section("🗓️ Mendatang", g.upcoming),
    ...section("📌 Tanpa tanggal", g.noDate),
  ];
  return clip(lines.join("\n").trim());
}

export async function buildToday(
  db: D1Database,
  userId: number,
): Promise<string> {
  const g = groupTasks(await listOpenTasks(db, userId), todayJakarta());
  if (g.overdue.length + g.today.length === 0) {
    return "Tidak ada tugas yang jatuh tempo hari ini. 🎉\nLihat semua tugas dengan /todo.";
  }

  const lines = [
    "🗒️ Rencana hari ini",
    "",
    ...section("⏰ Terlewat", g.overdue),
    ...section("📅 Hari ini", g.today),
  ];
  return clip(lines.join("\n").trim());
}
